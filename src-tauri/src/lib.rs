mod crypto;
mod error;
mod models;
mod store;

use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::Once;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine as _;
use bollard::query_parameters::{
    ListContainersOptionsBuilder, ListImagesOptionsBuilder, LogsOptionsBuilder,
    RemoveContainerOptionsBuilder, RemoveImageOptionsBuilder,
};
use bollard::{Docker, API_DEFAULT_VERSION};
use bollard::container::LogOutput;
use error::{AppError, AppResult, Cell, ColumnDef, QueryResult};
use futures_util::{StreamExt, TryStreamExt};
use models::{ConnKind, Connection, FileEntry, SshAuthMethod};
use oracle_rs::{Config as OracleConfig, Connection as OracleConnection, Value as OracleValue};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE};
use russh::keys::{HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::{client, ChannelMsg, Disconnect};
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use sqlx::any::{install_default_drivers, AnyPoolOptions};
use sqlx::{Any, Arguments, Column, QueryBuilder, Row, TypeInfo};
use store::{KnownHostVerdict, Store, VaultMode};
use suppaftp::tokio::{AsyncFtpStream, AsyncRustlsConnector, AsyncRustlsFtpStream};
use tauri::{
    ipc::Channel,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, State,
};
use tiberius::{AuthMethod, Client as MssqlClient, Config as MssqlConfig, EncryptionLevel};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, RwLock};
use tokio_util::compat::{Compat, TokioAsyncWriteCompatExt};
use url::Url;

struct AppState {
    store: Store,
    data_directory: PathBuf,
    config_directory: PathBuf,
    vault: RwLock<Option<crypto::VaultKey>>,
    terminals: RwLock<HashMap<String, mpsc::Sender<TerminalInput>>>,
}

fn build_tray_menu<R: Runtime>(app: &AppHandle<R>, locked: bool) -> tauri::Result<Menu<R>> {
    let tray_show = MenuItem::with_id(app, "tray-show", "打开", true, None::<&str>)?;
    let tray_unlock = MenuItem::with_id(app, "tray-unlock", "解锁", true, None::<&str>)?;
    let tray_new = MenuItem::with_id(app, "tray-new", "新建连接", true, None::<&str>)?;
    let tray_check = MenuItem::with_id(app, "tray-check", "检查更新", true, None::<&str>)?;
    let tray_lock = MenuItem::with_id(app, "tray-lock", "锁定", true, None::<&str>)?;
    let tray_separator = PredefinedMenuItem::separator(app)?;
    let tray_quit = MenuItem::with_id(app, "tray-quit", "退出", true, None::<&str>)?;
    if locked {
        Menu::with_items(app, &[&tray_show, &tray_unlock, &tray_quit])
    } else {
        Menu::with_items(app, &[&tray_show, &tray_new, &tray_check, &tray_lock, &tray_separator, &tray_quit])
    }
}

#[tauri::command]
fn set_tray_vault_state(app: AppHandle, locked: bool) -> AppResult<()> {
    let tray = app
        .tray_by_id("orangehub-tray")
        .ok_or_else(|| AppError::Msg("托盘图标尚未初始化".into()))?;
    let menu = build_tray_menu(&app, locked).map_err(|error| AppError::Msg(error.to_string()))?;
    tray.set_menu(Some(menu)).map_err(|error| AppError::Msg(error.to_string()))
}

#[tauri::command]
fn get_data_directory(state: State<'_, AppState>) -> String {
    state.data_directory.to_string_lossy().into_owned()
}

#[tauri::command]
fn restart_application(app: AppHandle) -> AppResult<()> {
    app.request_restart();
    Ok(())
}

#[tauri::command]
async fn configure_data_directory(
    state: State<'_, AppState>,
    data_directory: String,
) -> AppResult<bool> {
    let requested = PathBuf::from(data_directory.trim());
    if !requested.is_absolute() {
        return Err(AppError::Invalid("数据目录必须是绝对路径".into()));
    }
    std::fs::create_dir_all(&requested)?;
    let requested = std::fs::canonicalize(requested)?;
    let target_database = requested.join("orangehub.sqlite3");

    if requested != state.data_directory && target_database.exists() {
        return Err(AppError::Invalid(
            "所选目录中已存在 OrangeHub 数据库，请选择另一个目录".into(),
        ));
    }

    if requested != state.data_directory {
        let target = target_database.to_string_lossy().into_owned();
        sqlx::query("VACUUM INTO ?")
            .bind(target)
            .execute(&state.store.pool)
            .await
            .map_err(|error| AppError::Db(format!("复制初始数据库失败: {error}")))?;
    }

    let settings_path = state.config_directory.join("data-directory.json");
    std::fs::write(settings_path, serde_json::to_vec(&requested)?)?;
    Ok(requested != state.data_directory)
}

enum TerminalInput {
    Data(String),
    Resize { cols: u32, rows: u32 },
    Close,
}

#[derive(Serialize)]
struct SqlDatabase {
    name: String,
}

#[derive(Clone, Deserialize)]
struct SqlParameter {
    kind: String,
    value: String,
}

#[derive(Serialize)]
struct SqlTable {
    name: String,
    kind: String,
}

#[derive(Clone, Deserialize, Serialize)]
struct SqlColumn {
    #[serde(default)]
    original_name: Option<String>,
    name: String,
    data_type: String,
    nullable: bool,
    primary_key: bool,
    #[serde(default)]
    default_value: Option<String>,
    #[serde(default)]
    extra: String,
    #[serde(default)]
    comment: String,
    #[serde(default)]
    character_set: String,
    #[serde(default)]
    collation: String,
}

#[derive(Serialize)]
struct SqlTableData {
    columns: Vec<SqlColumn>,
    rows: Vec<Vec<Cell>>,
    primary_key: Vec<String>,
    total_rows: u64,
    page: u32,
    page_size: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RedisKeyInfo {
    key: String,
    key_token: String,
    kind: String,
    ttl: i64,
}

#[derive(Serialize)]
struct RedisKeyPage {
    cursor: u64,
    keys: Vec<RedisKeyInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RedisKeyDetail {
    key: String,
    key_token: String,
    kind: String,
    ttl: i64,
    value: String,
}

#[derive(Serialize)]
struct MongoDatabaseInfo {
    name: String,
}

#[derive(Serialize)]
struct MongoCollectionInfo {
    name: String,
}

#[derive(Serialize)]
struct MongoDocumentRow {
    id: String,
    document: String,
}

#[derive(Serialize)]
struct MongoDocumentPage {
    documents: Vec<MongoDocumentRow>,
    total: u64,
    page: u32,
    page_size: u32,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum TerminalEvent {
    Output {
        data: Vec<u8>,
    },
    Closed {
        #[serde(rename = "exitCode")]
        exit_code: Option<u32>,
    },
    Error {
        message: String,
    },
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum TransferProgress {
    Started {
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        total: Option<u64>,
    },
    Progress {
        transferred: u64,
        #[serde(skip_serializing_if = "Option::is_none")]
        total: Option<u64>,
    },
    Done {
        bytes: u64,
    },
    Failed {
        message: String,
    },
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum AiStreamEvent {
    Chunk { text: String },
    Done,
}

struct TransferReporter {
    channel: Option<Channel<TransferProgress>>,
    total: Option<u64>,
    transferred: u64,
    last_emit: Instant,
}

impl TransferReporter {
    fn start(channel: Channel<TransferProgress>, name: String, total: Option<u64>) -> Self {
        let reporter = Self {
            channel: Some(channel),
            total,
            transferred: 0,
            last_emit: Instant::now(),
        };
        reporter.emit(TransferProgress::Started { name, total });
        reporter
    }

    fn silent() -> Self {
        Self {
            channel: None,
            total: None,
            transferred: 0,
            last_emit: Instant::now(),
        }
    }

    fn emit(&self, event: TransferProgress) {
        if let Some(channel) = &self.channel {
            let _ = channel.send(event);
        }
    }

    fn set_total(&mut self, total: Option<u64>) {
        self.total = total;
    }

    fn merge_total(&mut self, bytes: Option<u64>) {
        match (self.total, bytes) {
            (Some(current), Some(extra)) => self.total = Some(current + extra),
            _ => self.total = None,
        }
    }

    fn advance(&mut self, bytes: u64) {
        self.transferred += bytes;
        if self.last_emit.elapsed() >= Duration::from_millis(120) {
            self.last_emit = Instant::now();
            self.emit(TransferProgress::Progress {
                transferred: self.transferred,
                total: self.total,
            });
        }
    }

    fn fail(&self, message: &str) {
        self.emit(TransferProgress::Failed {
            message: message.to_string(),
        });
    }

    fn finish(self, bytes: u64) {
        self.emit(TransferProgress::Done { bytes });
    }
}

const TRANSFER_CHUNK_SIZE: usize = 256 * 1024;

async fn copy_with_progress<R, W>(
    source: &mut R,
    destination: &mut W,
    reporter: &mut TransferReporter,
) -> AppResult<u64>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut buffer = vec![0_u8; TRANSFER_CHUNK_SIZE];
    let mut total = 0_u64;
    loop {
        let read = source.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        destination.write_all(&buffer[..read]).await?;
        total += read as u64;
        reporter.advance(read as u64);
    }
    destination.flush().await?;
    Ok(total)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultStatus {
    mode: VaultMode,
    locked: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionTest {
    latency_ms: u64,
    detail: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    needs_trust: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    key_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fingerprint: Option<String>,
}

#[derive(Clone)]
struct HostKeyObservation {
    key_type: String,
    fingerprint: String,
    verdict: KnownHostVerdict,
}

struct HostTrustHandler {
    store: Store,
    host: String,
    port: u16,
    observed: Arc<StdMutex<Option<HostKeyObservation>>>,
}

impl client::Handler for HostTrustHandler {
    type Error = russh::Error;

    fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> impl Future<Output = Result<bool, Self::Error>> + Send {
        let public_key = server_public_key.public_key();
        let key_type = format!("{:?}", public_key.algorithm());
        let fingerprint = public_key.fingerprint(HashAlg::Sha256).to_string();
        async move {
            match self
                .store
                .check_known_host(&self.host, self.port, &key_type, &fingerprint)
                .await
            {
                Ok(KnownHostVerdict::Trusted) => Ok(true),
                Ok(verdict) => {
                    *self.observed.lock().expect("host key state lock") =
                        Some(HostKeyObservation {
                            key_type,
                            fingerprint,
                            verdict,
                        });
                    Ok(false)
                }
                Err(_) => Ok(false),
            }
        }
    }
}

#[async_trait::async_trait]
trait FtpClient: Send {
    async fn list_entries(&mut self, path: &str) -> AppResult<Vec<FileEntry>>;
    async fn upload_file(
        &mut self,
        remote_path: &str,
        local_path: &str,
        reporter: &mut TransferReporter,
    ) -> AppResult<u64>;
    async fn download_file(
        &mut self,
        remote_path: &str,
        local_path: &str,
        reporter: &mut TransferReporter,
    ) -> AppResult<u64>;
    async fn read_text_file(&mut self, remote_path: &str) -> AppResult<String>;
    async fn delete_entry(&mut self, remote_path: &str, is_directory: bool) -> AppResult<()>;
    async fn rename_entry(&mut self, source_path: &str, target_path: &str) -> AppResult<()>;
    async fn size_of(&mut self, remote_path: &str) -> Option<u64>;
    async fn quit(&mut self) -> AppResult<()>;
}

#[async_trait::async_trait]
impl<T> FtpClient for suppaftp::tokio::ImplAsyncFtpStream<T>
where
    T: suppaftp::tokio::TokioTlsStream + Send + Sync + 'static,
{
    async fn list_entries(&mut self, path: &str) -> AppResult<Vec<FileEntry>> {
        let rows = match suppaftp::tokio::ImplAsyncFtpStream::mlsd(self, Some(path)).await {
            Ok(rows) => rows,
            Err(_) => suppaftp::tokio::ImplAsyncFtpStream::list(self, Some(path)).await?,
        };
        Ok(rows
            .iter()
            .filter_map(|row| parse_ftp_entry(row, path))
            .collect())
    }

    async fn upload_file(
        &mut self,
        remote_path: &str,
        local_path: &str,
        reporter: &mut TransferReporter,
    ) -> AppResult<u64> {
        self.transfer_type(suppaftp::types::FileType::Binary)
            .await?;
        let mut file = tokio::fs::File::open(local_path).await?;
        let mut remote = self.put_with_stream(remote_path).await?;
        let bytes = copy_with_progress(&mut file, &mut remote, reporter).await?;
        remote.finish().await?;
        Ok(bytes)
    }

    async fn download_file(
        &mut self,
        remote_path: &str,
        local_path: &str,
        reporter: &mut TransferReporter,
    ) -> AppResult<u64> {
        self.transfer_type(suppaftp::types::FileType::Binary)
            .await?;
        let mut remote = self.retr_as_stream(remote_path).await?;
        let mut local = tokio::fs::File::create(local_path).await?;
        let bytes = copy_with_progress(&mut remote, &mut local, reporter).await?;
        remote.finish().await?;
        Ok(bytes)
    }

    async fn read_text_file(&mut self, remote_path: &str) -> AppResult<String> {
        self.transfer_type(suppaftp::types::FileType::Binary)
            .await?;
        let mut remote = self.retr_as_stream(remote_path).await?;
        let contents = read_remote_text(&mut remote).await?;
        remote.finish().await?;
        Ok(contents)
    }

    async fn delete_entry(&mut self, remote_path: &str, is_directory: bool) -> AppResult<()> {
        if is_directory {
            self.rmdir(remote_path).await?;
        } else {
            self.rm(remote_path).await?;
        }
        Ok(())
    }

    async fn rename_entry(&mut self, source_path: &str, target_path: &str) -> AppResult<()> {
        self.rename(source_path, target_path).await?;
        Ok(())
    }

    async fn size_of(&mut self, remote_path: &str) -> Option<u64> {
        self.size(remote_path).await.ok().map(|size| size as u64)
    }

    async fn quit(&mut self) -> AppResult<()> {
        suppaftp::tokio::ImplAsyncFtpStream::quit(self).await?;
        Ok(())
    }
}

fn parse_ftp_entry(line: &str, directory: &str) -> Option<FileEntry> {
    let make_path = |name: &str| {
        let base = directory.trim_end_matches('/');
        if base.is_empty() {
            format!("/{name}")
        } else {
            format!("{base}/{name}")
        }
    };

    if let Some((facts, name)) = line.split_once(' ') {
        let name = name.trim();
        if name.is_empty() || name == "." || name == ".." {
            return None;
        }
        let facts: std::collections::HashMap<_, _> = facts
            .split(';')
            .filter_map(|part| part.split_once('='))
            .collect();
        if let Some(kind) = facts.get("type") {
            let kind = kind.to_ascii_lowercase();
            let is_dir = kind == "dir";
            let modified = facts.get("modify").and_then(|value| {
                chrono::NaiveDateTime::parse_from_str(value, "%Y%m%d%H%M%S")
                    .ok()
                    .map(|time| time.and_utc().timestamp())
            });
            return Some(FileEntry {
                name: name.to_string(),
                path: make_path(name),
                is_dir,
                is_symlink: kind == "slink" || kind == "symlink",
                size: facts
                    .get("size")
                    .and_then(|value| value.parse().ok())
                    .unwrap_or(0),
                modified,
                permissions: facts.get("unix.mode").map(|value| value.to_string()),
                owner: facts.get("unix.owner").map(|value| value.to_string()),
                group: facts.get("unix.group").map(|value| value.to_string()),
            });
        }
    }

    let fields: Vec<&str> = line.split_whitespace().collect();
    if fields.len() >= 9
        && (fields[0].starts_with('d') || fields[0].starts_with('-') || fields[0].starts_with('l'))
    {
        let name = fields[8..].join(" ");
        if name == "." || name == ".." {
            return None;
        }
        return Some(FileEntry {
            name: name.clone(),
            path: make_path(&name),
            is_dir: fields[0].starts_with('d'),
            is_symlink: fields[0].starts_with('l'),
            size: fields[4].parse().unwrap_or(0),
            modified: None,
            permissions: Some(fields[0].to_string()),
            owner: fields.get(2).map(|value| value.to_string()),
            group: fields.get(3).map(|value| value.to_string()),
        });
    }
    None
}

async fn open_ftp(connection: &Connection) -> AppResult<Box<dyn FtpClient>> {
    let address = format!("{}:{}", connection.host, connection.effective_port());
    let username = if connection.ftp_anonymous {
        "anonymous"
    } else {
        connection.username.as_str()
    };
    let password = connection.password.as_deref().unwrap_or("");
    if connection.ftp_secure {
        let ftp = AsyncRustlsFtpStream::connect(&address).await?;
        let mut roots = suppaftp::tokio_rustls::rustls::RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let provider = Arc::new(suppaftp::tokio_rustls::rustls::crypto::ring::default_provider());
        let tls = suppaftp::tokio_rustls::rustls::ClientConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .map_err(|error| AppError::Ftp(error.to_string()))?
            .with_root_certificates(roots)
            .with_no_client_auth();
        let connector = suppaftp::tokio_rustls::TlsConnector::from(Arc::new(tls));
        let mut ftp = ftp
            .into_secure(AsyncRustlsConnector::from(connector), &connection.host)
            .await?;
        ftp.login(username, password).await?;
        Ok(Box::new(ftp))
    } else {
        let mut ftp = AsyncFtpStream::connect(&address).await?;
        ftp.login(username, password).await?;
        Ok(Box::new(ftp))
    }
}

#[tauri::command]
async fn vault_status(state: State<'_, AppState>) -> AppResult<VaultStatus> {
    let mode = state.store.vault_mode().await?;
    let locked = state.vault.read().await.is_none();
    Ok(VaultStatus { mode, locked })
}

#[tauri::command]
async fn vault_initialize(state: State<'_, AppState>, master_password: String) -> AppResult<()> {
    if master_password.len() < 8 {
        return Err(AppError::Invalid("主密码至少需要 8 个字符".into()));
    }
    if state.store.vault_mode().await? != VaultMode::Unset {
        return Err(AppError::Invalid("保险库已经初始化".into()));
    }

    let salt = crypto::generate_salt()?;
    let key = crypto::derive_key(&master_password, &salt)?;
    let verifier = crypto::seal(
        &key,
        "orangehub-vault-verifier:v1",
        "orangehub:vault-verifier:v1",
    )?;
    state
        .store
        .set_vault_master(&B64.encode(salt), &verifier)
        .await?;
    *state.vault.write().await = Some(key);
    Ok(())
}

#[tauri::command]
async fn vault_unlock(state: State<'_, AppState>, master_password: String) -> AppResult<()> {
    let salt = state
        .store
        .vault_salt()
        .await?
        .ok_or_else(|| AppError::Invalid("保险库尚未初始化".into()))?;
    let verifier = state
        .store
        .vault_verifier()
        .await?
        .ok_or_else(|| AppError::Db("保险库校验数据缺失".into()))?;
    let salt = B64
        .decode(salt)
        .map_err(|_| AppError::Db("保险库盐值格式错误".into()))?;
    let key = crypto::derive_key(&master_password, &salt)?;
    let opened = crypto::open(&key, &verifier, "orangehub:vault-verifier:v1")?;
    if opened != "orangehub-vault-verifier:v1" {
        return Err(AppError::Crypto("主密码错误".into()));
    }
    *state.vault.write().await = Some(key);
    Ok(())
}

#[tauri::command]
async fn vault_lock(state: State<'_, AppState>) -> AppResult<()> {
    *state.vault.write().await = None;
    Ok(())
}

#[tauri::command]
async fn list_connections(state: State<'_, AppState>) -> AppResult<Vec<Connection>> {
    state.store.list_connections().await
}

const AI_PROVIDERS_AAD: &str = "orangehub:ai-providers:v1";

#[tauri::command]
async fn get_ai_providers(state: State<'_, AppState>) -> AppResult<String> {
    let Some(stored) = state.store.meta_get("ai.providers").await? else {
        return Ok("[]".into());
    };
    let Some(cipher) = stored.strip_prefix("enc:") else {
        return Err(AppError::Db("AI 服务配置格式无效，请重新保存配置".into()));
    };
    let vault = state.vault.read().await;
    let key = vault
        .as_ref()
        .ok_or_else(|| AppError::Crypto("请先解锁保险库".into()))?;
    Ok(crypto::open(key, cipher, AI_PROVIDERS_AAD)?)
}

#[tauri::command]
async fn save_ai_providers(state: State<'_, AppState>, payload: String) -> AppResult<()> {
    let parsed: serde_json::Value = serde_json::from_str(&payload)
        .map_err(|error| AppError::Invalid(format!("AI 服务配置格式无效: {error}")))?;
    if !parsed.is_array() {
        return Err(AppError::Invalid("AI 服务配置必须是数组".into()));
    }
    if payload.len() > 512 * 1024 {
        return Err(AppError::Invalid("AI 服务配置过大".into()));
    }
    let vault = state.vault.read().await;
    let key = vault
        .as_ref()
        .ok_or_else(|| AppError::Crypto("请先解锁保险库".into()))?;
    let cipher = crypto::seal(key, &payload, AI_PROVIDERS_AAD)?;
    state
        .store
        .meta_set("ai.providers", &format!("enc:{cipher}"))
        .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiProviderRequest {
    base_url: String,
    api_key: String,
    model: String,
    format: String,
    system_prompt: String,
    user_prompt: String,
}

fn ai_endpoint(base_url: &str, suffix: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    if base.ends_with(suffix.trim_start_matches('/')) {
        base.to_string()
    } else {
        format!("{base}/{}", suffix.trim_start_matches('/'))
    }
}

fn ai_openai_endpoint(base_url: &str, suffix: &str) -> String {
    let base = base_url.trim();
    let suffix = suffix.trim_start_matches('/');
    if let Ok(mut endpoint) = Url::parse(base) {
        let path = endpoint.path().trim_end_matches('/');
        if path.ends_with(suffix) {
            return endpoint.to_string();
        }
        let has_version_segment = endpoint.path_segments().is_some_and(|segments| {
            segments.into_iter().any(|segment| {
                segment.strip_prefix('v').is_some_and(|version| {
                    version
                        .chars()
                        .next()
                        .is_some_and(|character| character.is_ascii_digit())
                })
            })
        });
        let api_path = if has_version_segment {
            path.to_string()
        } else {
            format!("{path}/v1")
        };
        endpoint.set_path(&format!("{api_path}/{suffix}"));
        return endpoint.to_string();
    }
    ai_endpoint(base, &format!("v1/{suffix}"))
}

fn ai_content_text(value: &serde_json::Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("text").and_then(serde_json::Value::as_str))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .filter(|text| !text.is_empty())
}

fn ai_text_from_stream_event(format: &str, payload: &serde_json::Value) -> Option<String> {
    match format {
        "openai-chat-completions" => payload
            .pointer("/choices/0/delta/content")
            .and_then(ai_content_text),
        "openai-responses" => {
            let event_type = payload
                .get("type")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            event_type
                .ends_with("output_text.delta")
                .then(|| {
                    payload
                        .get("delta")
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_owned)
                })
                .flatten()
        }
        "anthropic-messages" => payload
            .pointer("/delta/text")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned),
        "google-gemini" => payload
            .pointer("/candidates/0/content/parts")
            .and_then(ai_content_text),
        _ => None,
    }
}

fn emit_ai_sse_data(
    data: &str,
    format: &str,
    on_event: &Channel<AiStreamEvent>,
    emitted_text: &mut bool,
) -> AppResult<()> {
    let data = data.trim();
    if data.is_empty() || data == "[DONE]" {
        return Ok(());
    }
    let Ok(payload) = serde_json::from_str::<serde_json::Value>(data) else {
        return Ok(());
    };
    if let Some(message) = payload
        .pointer("/error/message")
        .and_then(serde_json::Value::as_str)
        .or_else(|| {
            payload
                .pointer("/response/error/message")
                .and_then(serde_json::Value::as_str)
        })
    {
        return Err(AppError::Msg(format!("AI 流式响应错误：{message}")));
    }
    if let Some(text) = ai_text_from_stream_event(format, &payload).filter(|text| !text.is_empty())
    {
        *emitted_text = true;
        let _ = on_event.send(AiStreamEvent::Chunk { text });
    }
    Ok(())
}

#[tauri::command]
async fn invoke_ai(
    state: State<'_, AppState>,
    provider_id: String,
    system_prompt: String,
    user_prompt: String,
    on_event: Channel<AiStreamEvent>,
) -> AppResult<()> {
    let Some(stored) = state.store.meta_get("ai.providers").await? else {
        return Err(AppError::Invalid("请先在设置中配置并保存 AI 服务".into()));
    };
    let cipher = stored
        .strip_prefix("enc:")
        .ok_or_else(|| AppError::Db("AI 服务配置格式无效，请重新保存配置".into()))?;
    let vault = state.vault.read().await;
    let key = vault
        .as_ref()
        .ok_or_else(|| AppError::Crypto("请先解锁保险库".into()))?;
    let plaintext = crypto::open(key, cipher, AI_PROVIDERS_AAD)?;
    drop(vault);
    let providers: Vec<serde_json::Value> = serde_json::from_str(&plaintext)?;
    let provider = providers
        .iter()
        .find(|provider| {
            provider.get("id").and_then(serde_json::Value::as_str) == Some(provider_id.as_str())
                && provider.get("enabled").and_then(serde_json::Value::as_bool) == Some(true)
        })
        .ok_or_else(|| AppError::Invalid("所选 AI 服务不存在或已停用".into()))?;
    let request = AiProviderRequest {
        base_url: provider
            .get("baseUrl")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string(),
        api_key: provider
            .get("apiKey")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string(),
        model: provider
            .get("model")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string(),
        format: provider
            .get("format")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .to_string(),
        system_prompt,
        user_prompt,
    };
    if request.base_url.trim().is_empty()
        || request.api_key.trim().is_empty()
        || request.model.trim().is_empty()
    {
        return Err(AppError::Invalid(
            "请先配置 AI 服务 URL、API Key 和模型".into(),
        ));
    }
    if !matches!(
        request.format.as_str(),
        "openai-chat-completions" | "openai-responses" | "anthropic-messages" | "google-gemini"
    ) {
        return Err(AppError::Invalid("不支持的 AI 请求格式".into()));
    }
    if request.system_prompt.trim().is_empty() || request.user_prompt.trim().is_empty() {
        return Err(AppError::Invalid("AI 提示词和用户内容不能为空".into()));
    }
    if request.system_prompt.len() > 128 * 1024 || request.user_prompt.len() > 256 * 1024 {
        return Err(AppError::Invalid(
            "AI 提示词或对话内容过长，请精简后重试".into(),
        ));
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|error| AppError::Msg(format!("创建 AI 请求失败: {error}")))?;
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
    let (url, body, extra_headers) = match request.format.as_str() {
        "anthropic-messages" => {
            let mut headers = HeaderMap::new();
            headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
            headers.insert(
                "x-api-key",
                HeaderValue::from_str(request.api_key.trim())
                    .map_err(|_| AppError::Invalid("API Key 格式无效".into()))?,
            );
            headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
            let base = request.base_url.trim().trim_end_matches('/');
            let endpoint = if base.ends_with("/v1") {
                format!("{base}/messages")
            } else {
                ai_endpoint(base, "v1/messages")
            };
            (
                endpoint,
                serde_json::json!({
                    "model": request.model,
                    "max_tokens": 4096,
                    "system": request.system_prompt,
                    "messages": [{ "role": "user", "content": request.user_prompt }],
                    "stream": true
                }),
                headers,
            )
        }
        "google-gemini" => {
            let mut endpoint = Url::parse(request.base_url.trim())
                .map_err(|error| AppError::Invalid(format!("Gemini 服务 URL 无效: {error}")))?;
            endpoint.set_path(&format!(
                "{}/models/{}:streamGenerateContent",
                endpoint.path().trim_end_matches('/'),
                request.model.trim()
            ));
            endpoint.query_pairs_mut().append_pair("alt", "sse");
            let mut headers = HeaderMap::new();
            headers.insert(ACCEPT, HeaderValue::from_static("text/event-stream"));
            headers.insert(
                "x-goog-api-key",
                HeaderValue::from_str(request.api_key.trim())
                    .map_err(|_| AppError::Invalid("API Key 格式无效".into()))?,
            );
            (
                endpoint.to_string(),
                serde_json::json!({
                    "systemInstruction": { "parts": [{ "text": request.system_prompt }] },
                    "contents": [{ "role": "user", "parts": [{ "text": request.user_prompt }] }]
                }),
                headers,
            )
        }
        "openai-responses" => (
            ai_openai_endpoint(&request.base_url, "responses"),
            serde_json::json!({
                "model": request.model,
                "instructions": request.system_prompt,
                "input": request.user_prompt,
                "stream": true
            }),
            HeaderMap::new(),
        ),
        _ => (
            ai_openai_endpoint(&request.base_url, "chat/completions"),
            serde_json::json!({
                "model": request.model,
                "messages": [
                    { "role": "system", "content": request.system_prompt },
                    { "role": "user", "content": request.user_prompt }
                ],
                "temperature": 0.2,
                "stream": true
            }),
            HeaderMap::new(),
        ),
    };
    if matches!(
        request.format.as_str(),
        "openai-chat-completions" | "openai-responses"
    ) {
        headers.insert(
            "Authorization",
            HeaderValue::from_str(&format!("Bearer {}", request.api_key.trim()))
                .map_err(|_| AppError::Invalid("API Key 格式无效".into()))?,
        );
    }
    for (name, value) in extra_headers.iter() {
        headers.insert(name, value.clone());
    }
    let response = client
        .post(&url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|error| AppError::Msg(format!("AI 请求失败: {error}")))?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if response
        .content_length()
        .is_some_and(|length| length > 4 * 1024 * 1024)
    {
        return Err(AppError::Msg("AI 响应超过 4 MiB 限制".into()));
    }
    if !status.is_success() {
        let raw_body = response
            .text()
            .await
            .map_err(|error| AppError::Msg(format!("读取 AI 错误响应失败: {error}")))?;
        let response_body = serde_json::from_str::<serde_json::Value>(&raw_body).ok();
        let detail = response_body
            .as_ref()
            .and_then(|payload| {
                payload
                    .get("error")
                    .and_then(|error| error.get("message"))
                    .and_then(serde_json::Value::as_str)
                    .or_else(|| payload.get("message").and_then(serde_json::Value::as_str))
            })
            .map(str::to_owned)
            .unwrap_or_else(|| raw_body.chars().take(240).collect());
        return Err(AppError::Msg(format!(
            "AI 服务错误（{}）：{}",
            status.as_u16(),
            if detail.is_empty() {
                "服务返回错误".to_string()
            } else {
                detail
            }
        )));
    }
    if content_type.contains("text/html") {
        return Err(AppError::Msg(format!(
            "AI 服务返回了网页而不是流式数据（HTTP {}）。请检查服务 URL 是否填写为 API 基础地址；Sub2API 通常应填写服务域名并以 /v1 结尾，不要填写管理页面地址。当前请求格式：{}。",
            status.as_u16(), request.format
        )));
    }
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::<u8>::new();
    let mut data_lines = Vec::<String>::new();
    let mut total_bytes = 0usize;
    let mut emitted_text = false;
    let mut complete_body = Vec::<u8>::new();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|error| AppError::Msg(format!("读取 AI 流式响应失败: {error}")))?;
        total_bytes = total_bytes.saturating_add(chunk.len());
        if total_bytes > 4 * 1024 * 1024 {
            return Err(AppError::Msg("AI 响应超过 4 MiB 限制".into()));
        }
        complete_body.extend_from_slice(&chunk);
        buffer.extend_from_slice(&chunk);
        while let Some(newline) = buffer.iter().position(|byte| *byte == b'\n') {
            let mut line = buffer.drain(..=newline).collect::<Vec<_>>();
            line.pop();
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            let line = String::from_utf8_lossy(&line);
            if line.is_empty() {
                if !data_lines.is_empty() {
                    emit_ai_sse_data(
                        &data_lines.join("\n"),
                        &request.format,
                        &on_event,
                        &mut emitted_text,
                    )?;
                    data_lines.clear();
                }
            } else if let Some(data) = line.strip_prefix("data:") {
                data_lines.push(data.trim_start().to_string());
            }
        }
    }
    if !buffer.is_empty() {
        let line = String::from_utf8_lossy(&buffer);
        if let Some(data) = line.strip_prefix("data:") {
            data_lines.push(data.trim_start().to_string());
        }
    }
    if !data_lines.is_empty() {
        emit_ai_sse_data(
            &data_lines.join("\n"),
            &request.format,
            &on_event,
            &mut emitted_text,
        )?;
    }
    if !emitted_text {
        let raw_body = String::from_utf8_lossy(&complete_body);
        let body_prefix = raw_body.trim_start().to_ascii_lowercase();
        if body_prefix.starts_with("<!doctype html") || body_prefix.starts_with("<html") {
            return Err(AppError::Msg(format!(
                "AI 服务返回了网页而不是流式数据。请检查服务 URL 是否填写为 API 基础地址；Sub2API 通常应填写服务域名并以 /v1 结尾。当前请求格式：{}。",
                request.format
            )));
        }
        if let Ok(payload) = serde_json::from_slice::<serde_json::Value>(&complete_body) {
            if let Some(message) = payload
                .pointer("/error/message")
                .and_then(serde_json::Value::as_str)
                .or_else(|| payload.get("message").and_then(serde_json::Value::as_str))
            {
                return Err(AppError::Msg(format!("AI 服务错误：{message}")));
            }
        }
        return Err(AppError::Msg("AI 服务没有返回 SSE 流式数据，未显示非流式结果。请确认模型、服务商和所选传递格式支持流式输出。".into()));
    }
    let _ = on_event.send(AiStreamEvent::Done);
    Ok(())
}

#[tauri::command]
async fn save_connection(state: State<'_, AppState>, mut connection: Connection) -> AppResult<()> {
    if connection.name.trim().is_empty() {
        return Err(AppError::Invalid("连接名称不能为空".into()));
    }
    let has_secrets = connection
        .password
        .as_deref()
        .is_some_and(|value| !value.is_empty())
        || connection
            .key_passphrase
            .as_deref()
            .is_some_and(|value| !value.is_empty());
    if !has_secrets {
        connection.password = None;
        connection.key_passphrase = None;
        state.store.upsert_connection(&connection, None).await?;
    } else {
        let vault = state.vault.read().await;
        let key = vault
            .as_ref()
            .ok_or_else(|| AppError::Crypto("请先解锁保险库再保存密码".into()))?;
        state
            .store
            .upsert_connection(&connection, Some(key))
            .await?;
    }
    Ok(())
}

#[tauri::command]
async fn delete_connection(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.store.delete_connection(&id).await
}

#[tauri::command]
async fn list_history(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> AppResult<Vec<models::HistoryEntry>> {
    state
        .store
        .list_history(limit.unwrap_or(2000).clamp(1, 2000))
        .await
}

#[tauri::command]
async fn clear_history(state: State<'_, AppState>) -> AppResult<()> {
    state.store.clear_history().await
}

#[tauri::command]
async fn delete_history_entry(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    state.store.delete_history_entry(id).await
}

#[tauri::command]
async fn list_sql_snippets(state: State<'_, AppState>) -> AppResult<Vec<models::Snippet>> {
    state.store.list_snippets(None).await
}

#[tauri::command]
async fn save_sql_snippet(state: State<'_, AppState>, snippet: models::Snippet) -> AppResult<()> {
    if snippet.name.trim().is_empty() {
        return Err(AppError::Invalid("收藏名称不能为空".into()));
    }
    if snippet.sql_text.trim().is_empty() {
        return Err(AppError::Invalid("SQL 内容不能为空".into()));
    }
    state.store.upsert_snippet(&snippet).await
}

#[tauri::command]
async fn delete_sql_snippet(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.store.delete_snippet(&id).await
}

async fn load_connection(state: &AppState, id: &str) -> AppResult<Connection> {
    let connection = state.store.get_connection(id).await?;
    let has_secret = state.store.has_secret(id, "password").await?
        || state.store.has_secret(id, "key_passphrase").await?;
    let vault = state.vault.read().await;
    match (vault.as_ref(), has_secret) {
        (Some(key), _) => state.store.load_with_secrets(key, id).await,
        (None, true) => Err(AppError::Crypto("请先解锁保险库".into())),
        (None, false) => Ok(connection),
    }
}

#[tauri::command]
async fn test_connection(state: State<'_, AppState>, id: String) -> AppResult<ConnectionTest> {
    let connection = load_connection(&state, &id).await?;
    test_connection_with_config(&state, connection, Some(id)).await
}

#[tauri::command]
async fn test_connection_config(
    state: State<'_, AppState>,
    mut connection: Connection,
    use_saved_secrets: bool,
) -> AppResult<ConnectionTest> {
    if use_saved_secrets {
        let has_password = state.store.has_secret(&connection.id, "password").await?;
        let has_passphrase = state
            .store
            .has_secret(&connection.id, "key_passphrase")
            .await?;
        if (has_password && connection.password.as_deref().is_none_or(str::is_empty))
            || (has_passphrase
                && connection
                    .key_passphrase
                    .as_deref()
                    .is_none_or(str::is_empty))
        {
            let saved = load_connection(&state, &connection.id).await?;
            if connection.password.as_deref().is_none_or(str::is_empty) {
                connection.password = saved.password;
            }
            if connection
                .key_passphrase
                .as_deref()
                .is_none_or(str::is_empty)
            {
                connection.key_passphrase = saved.key_passphrase;
            }
        }
    }
    let history_id = if use_saved_secrets {
        Some(connection.id.clone())
    } else {
        None
    };
    test_connection_with_config(&state, connection, history_id).await
}

async fn test_connection_with_config(
    state: &AppState,
    connection: Connection,
    history_id: Option<String>,
) -> AppResult<ConnectionTest> {
    let id = history_id.as_deref().unwrap_or(&connection.id);
    let started = Instant::now();
    let result: AppResult<ConnectionTest> = async {
        let detail = match connection.kind {
            ConnKind::Sql => {
                match sql_driver(&connection) {
                    "mssql" => {
                        let mut client = open_mssql_connection(&connection, None).await?;
                        client
                            .simple_query("SELECT 1")
                            .await
                            .map_err(|error| {
                                AppError::Sql(format!("SQL Server 验证查询失败: {error}"))
                            })?
                            .into_results()
                            .await
                            .map_err(|error| {
                                AppError::Sql(format!("SQL Server 读取验证结果失败: {error}"))
                            })?;
                    }
                    "oracle" => {
                        let client = open_oracle_connection(&connection, None).await?;
                        client
                            .query("SELECT 1 FROM DUAL", &[])
                            .await
                            .map_err(|error| {
                                AppError::Sql(format!("Oracle 验证查询失败: {error}"))
                            })?;
                        client.close().await.map_err(|error| {
                            AppError::Sql(format!("Oracle 关闭连接失败: {error}"))
                        })?;
                    }
                    _ => {
                        let pool = open_sql_pool(&connection).await?;
                        sqlx::query("SELECT 1").execute(&pool).await?;
                        pool.close().await;
                    }
                }
                "数据库认证成功".to_string()
            }
            ConnKind::Redis => {
                let client = redis::Client::open(redis_uri(&connection)?.as_str())?;
                let mut connection = client.get_multiplexed_async_connection().await?;
                let _: String = redis::cmd("PING").query_async(&mut connection).await?;
                "Redis 认证成功".to_string()
            }
            ConnKind::Mongo => {
                let client = mongodb::Client::with_uri_str(mongo_uri(&connection)?).await?;
                client
                    .database("admin")
                    .run_command(mongodb::bson::doc! { "ping": 1 })
                    .await?;
                "MongoDB 认证成功".to_string()
            }
            ConnKind::Docker => {
                let docker = docker_client(&connection)?;
                docker.ping().await?;
                let version = docker.version().await?;
                format!("Docker Engine {} 连接成功", version.version.unwrap_or_else(|| "未知版本".into()))
            }
            ConnKind::Ssh | ConnKind::Sftp => match connect_ssh(&state, &connection).await? {
                Ok(session) => {
                    let detail = if connection.kind == ConnKind::Sftp {
                        let channel = session.channel_open_session().await?;
                        channel
                            .request_subsystem(true, "sftp")
                            .await
                            .map_err(|error| AppError::Sftp(error.to_string()))?;
                        let sftp = SftpSession::new(channel.into_stream())
                            .await
                            .map_err(|error| AppError::Sftp(error.to_string()))?;
                        sftp.canonicalize(".")
                            .await
                            .map_err(|error| AppError::Sftp(error.to_string()))?;
                        sftp.close()
                            .await
                            .map_err(|error| AppError::Sftp(error.to_string()))?;
                        "SFTP 身份认证与目录访问成功".to_string()
                    } else {
                        "SSH 身份认证成功".to_string()
                    };
                    session
                        .disconnect(Disconnect::ByApplication, "", "English")
                        .await?;
                    detail
                }
                Err(observation) => match observation.verdict {
                    KnownHostVerdict::Unknown => {
                        return Ok(ConnectionTest {
                            latency_ms: started.elapsed().as_millis() as u64,
                            detail: "需要确认 SSH 主机指纹".into(),
                            needs_trust: Some(true),
                            key_type: Some(observation.key_type),
                            fingerprint: Some(observation.fingerprint),
                        });
                    }
                    KnownHostVerdict::Changed { stored, presented } => {
                        return Err(AppError::Ssh(format!(
                            "SSH 主机密钥已变化。已保存: {stored}，当前: {presented}"
                        )));
                    }
                    KnownHostVerdict::Trusted => {
                        return Err(AppError::Ssh("SSH 主机验证状态异常".into()));
                    }
                },
            },
            ConnKind::Ftp => {
                let mut ftp = open_ftp(&connection).await?;
                ftp.quit().await?;
                if connection.ftp_secure {
                    "FTPS 登录成功".to_string()
                } else {
                    "FTP 登录成功".to_string()
                }
            }
        };

        Ok(ConnectionTest {
            latency_ms: started.elapsed().as_millis() as u64,
            detail,
            needs_trust: None,
            key_type: None,
            fingerprint: None,
        })
    }
    .await;

    let protocol = match &connection.kind {
        ConnKind::Sql => "SQL",
        ConnKind::Redis => "Redis",
        ConnKind::Mongo => "MongoDB",
        ConnKind::Docker => "Docker",
        ConnKind::Ssh => "SSH",
        ConnKind::Sftp => "SFTP",
        ConnKind::Ftp => "FTP",
    };
    let activity = format!("{protocol} · 连接测试");
    if history_id.is_some() {
        match &result {
            Ok(response) if response.needs_trust.is_none() => {
                record_activity(
                    &state.store,
                    id,
                    &activity,
                    true,
                    started.elapsed().as_millis() as u64,
                    None,
                )
                .await;
            }
            Err(error) => {
                let message = error.to_string();
                record_activity(
                    &state.store,
                    id,
                    &activity,
                    false,
                    started.elapsed().as_millis() as u64,
                    Some(&message),
                )
                .await;
            }
            _ => {}
        }
    }
    result
}

fn docker_client(connection: &Connection) -> AppResult<Docker> {
    if connection.use_tls {
        // Bollard's TLS transport uses rustls' process-wide crypto provider.
        // The FTP client already carries the ring provider, so install it once
        // before constructing a secure Docker client.
        let _ = suppaftp::tokio_rustls::rustls::crypto::ring::default_provider().install_default();
    }
    let host = connection.host.trim();
    let endpoint = if host.is_empty() {
        #[cfg(windows)]
        { "npipe:////./pipe/docker_engine".to_string() }
        #[cfg(not(windows))]
        { "unix:///var/run/docker.sock".to_string() }
    } else if host.starts_with("unix://") || host.starts_with("npipe://") || host.starts_with("ssh://") {
        host.to_string()
    } else if host.starts_with("https://") || host.starts_with("http://") || host.starts_with("tcp://") {
        if connection.use_tls && host.starts_with("tcp://") {
            host.replacen("tcp://", "https://", 1)
        } else if connection.use_tls && host.starts_with("http://") {
            host.replacen("http://", "https://", 1)
        } else {
            host.to_string()
        }
    } else {
        let scheme = if connection.use_tls { "https" } else { "tcp" };
        format!("{scheme}://{}:{}", host, connection.effective_port())
    };
    let tls_paths = [
        connection.docker_tls_ca.as_deref().unwrap_or_default().trim(),
        connection.docker_tls_cert.as_deref().unwrap_or_default().trim(),
        connection.docker_tls_key.as_deref().unwrap_or_default().trim(),
    ];
    let configured_tls_paths = tls_paths.iter().filter(|path| !path.is_empty()).count();
    if connection.use_tls && (endpoint.starts_with("unix://") || endpoint.starts_with("npipe://")) {
        return Err(AppError::Invalid("Docker 本地 Socket 连接不需要 TLS".into()));
    }
    if connection.use_tls && configured_tls_paths != 0 && configured_tls_paths != tls_paths.len() {
        return Err(AppError::Invalid("Docker TLS 需要同时选择 CA 证书、客户端证书和私钥".into()));
    }
    if connection.use_tls && configured_tls_paths == tls_paths.len() {
        let ca = Path::new(connection.docker_tls_ca.as_deref().unwrap_or_default());
        let cert = Path::new(connection.docker_tls_cert.as_deref().unwrap_or_default());
        let key = Path::new(connection.docker_tls_key.as_deref().unwrap_or_default());
        Docker::connect_with_ssl(&endpoint, key, cert, ca, connection.connect_timeout_secs.unwrap_or(15), API_DEFAULT_VERSION)
    } else {
        Docker::connect_with_host(&endpoint)
    }
    .map_err(|error| AppError::Docker(format!("无法初始化 Docker 连接（{endpoint}）：{error}")))
}

async fn load_docker_client(state: &AppState, id: &str) -> AppResult<Docker> {
    let connection = load_connection(state, id).await?;
    if connection.kind != ConnKind::Docker {
        return Err(AppError::Invalid("当前连接不是 Docker 连接".into()));
    }
    docker_client(&connection)
}

#[tauri::command]
async fn docker_dashboard(state: State<'_, AppState>, id: String) -> AppResult<serde_json::Value> {
    let docker = load_docker_client(&state, &id).await?;
    let version = docker.version().await?;
    let info = docker.info().await?;
    Ok(serde_json::json!({ "version": version, "info": info }))
}

#[tauri::command]
async fn docker_list_containers(state: State<'_, AppState>, id: String) -> AppResult<serde_json::Value> {
    let docker = load_docker_client(&state, &id).await?;
    let options = ListContainersOptionsBuilder::default().all(true).build();
    Ok(serde_json::to_value(docker.list_containers(Some(options)).await?)?)
}

#[tauri::command]
async fn docker_container_action(
    state: State<'_, AppState>, id: String, container_id: String, action: String,
) -> AppResult<()> {
    let docker = load_docker_client(&state, &id).await?;
    match action.as_str() {
        "start" => docker.start_container(&container_id, None).await?,
        "stop" => docker.stop_container(&container_id, None).await?,
        "restart" => docker.restart_container(&container_id, None).await?,
        "pause" => docker.pause_container(&container_id).await?,
        "unpause" => docker.unpause_container(&container_id).await?,
        "remove" => {
            let options = RemoveContainerOptionsBuilder::default().force(true).build();
            docker.remove_container(&container_id, Some(options)).await?;
        }
        _ => return Err(AppError::Invalid("不支持的容器操作".into())),
    }
    Ok(())
}

#[tauri::command]
async fn docker_container_logs(
    state: State<'_, AppState>, id: String, container_id: String, tail: Option<u64>,
) -> AppResult<String> {
    let docker = load_docker_client(&state, &id).await?;
    let tail = tail.unwrap_or(300).clamp(1, 2000).to_string();
    let options = LogsOptionsBuilder::default().stdout(true).stderr(true).timestamps(true).tail(&tail).build();
    let mut stream = docker.logs(&container_id, Some(options));
    let mut output = String::new();
    while let Some(item) = stream.next().await {
        let item: LogOutput = item?;
        output.push_str(&item.to_string());
    }
    Ok(output)
}

#[tauri::command]
async fn docker_inspect_container(state: State<'_, AppState>, id: String, container_id: String) -> AppResult<serde_json::Value> {
    let docker = load_docker_client(&state, &id).await?;
    Ok(serde_json::to_value(docker.inspect_container(&container_id, None).await?)?)
}

#[tauri::command]
async fn docker_create_container(
    state: State<'_, AppState>, id: String, name: String, image: String,
    ports: Vec<String>, env: Vec<String>, volumes: Vec<String>, restart_policy: Option<String>,
) -> AppResult<String> {
    let name = name.trim();
    let image = image.trim();
    if image.is_empty() { return Err(AppError::Invalid("请填写容器镜像".into())); }
    let docker = load_docker_client(&state, &id).await?;
    let options = if name.is_empty() {
        None
    } else {
        Some(bollard::query_parameters::CreateContainerOptionsBuilder::default().name(name).build())
    };
    let mut exposed_ports = serde_json::Map::new();
    let mut port_bindings = serde_json::Map::new();
    for binding in ports.iter().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        let (host, target) = binding.split_once(':').ok_or_else(|| AppError::Invalid(format!("端口映射格式错误：{binding}，请使用 主机端口:容器端口")))?;
        let (target_port, protocol) = target.split_once('/').unwrap_or((target, "tcp"));
        let host_port: u16 = host.parse().map_err(|_| AppError::Invalid(format!("无效的主机端口：{host}")))?;
        let target_port: u16 = target_port.parse().map_err(|_| AppError::Invalid(format!("无效的容器端口：{target_port}")))?;
        let key = format!("{target_port}/{protocol}");
        exposed_ports.insert(key.clone(), serde_json::json!({}));
        port_bindings.insert(key, serde_json::json!([{ "HostPort": host_port.to_string() }]));
    }
    let binds = volumes.iter().map(|value| value.trim()).filter(|value| !value.is_empty()).map(|binding| {
        let (source, target) = binding.rsplit_once(':').ok_or_else(|| AppError::Invalid(format!("卷挂载格式错误：{binding}，请使用 来源路径:/容器路径")))?;
        if source.is_empty() || !target.starts_with('/') {
            return Err(AppError::Invalid(format!("卷挂载格式错误：{binding}，容器路径必须以 / 开头")));
        }
        Ok(binding.to_string())
    }).collect::<AppResult<Vec<_>>>()?;
    let environment = env.iter().map(|value| value.trim()).filter(|value| !value.is_empty()).map(|value| {
        if !value.contains('=') { return Err(AppError::Invalid(format!("环境变量格式错误：{value}，请使用 KEY=VALUE"))); }
        Ok(value.to_string())
    }).collect::<AppResult<Vec<_>>>()?;
    let mut host_config = serde_json::Map::new();
    if !port_bindings.is_empty() { host_config.insert("PortBindings".into(), serde_json::Value::Object(port_bindings)); }
    if !binds.is_empty() { host_config.insert("Binds".into(), serde_json::to_value(binds)?); }
    let restart_policy = restart_policy.unwrap_or_else(|| "no".into());
    if !matches!(restart_policy.as_str(), "no" | "always" | "unless-stopped" | "on-failure") {
        return Err(AppError::Invalid(format!("不支持的重启策略：{restart_policy}")));
    }
    if restart_policy != "no" {
        host_config.insert("RestartPolicy".into(), serde_json::json!({ "Name": restart_policy }));
    }
    let mut config = serde_json::Map::new();
    config.insert("Image".into(), serde_json::Value::String(image.to_string()));
    if !environment.is_empty() { config.insert("Env".into(), serde_json::to_value(environment)?); }
    if !exposed_ports.is_empty() { config.insert("ExposedPorts".into(), serde_json::Value::Object(exposed_ports)); }
    if !host_config.is_empty() { config.insert("HostConfig".into(), serde_json::Value::Object(host_config)); }
    let config: bollard::models::ContainerCreateBody = serde_json::from_value(serde_json::Value::Object(config))?;
    Ok(docker.create_container(options, config).await?.id)
}

#[tauri::command]
async fn docker_list_images(state: State<'_, AppState>, id: String) -> AppResult<serde_json::Value> {
    let docker = load_docker_client(&state, &id).await?;
    let options = ListImagesOptionsBuilder::default().all(true).build();
    Ok(serde_json::to_value(docker.list_images(Some(options)).await?)?)
}

#[tauri::command]
async fn docker_pull_image(state: State<'_, AppState>, id: String, image: String) -> AppResult<String> {
    let image = image.trim();
    if image.is_empty() { return Err(AppError::Invalid("请填写镜像名称".into())); }
    let docker = load_docker_client(&state, &id).await?;
    let options = bollard::query_parameters::CreateImageOptionsBuilder::default().from_image(image).build();
    let mut stream = docker.create_image(Some(options), None, None);
    let mut statuses = Vec::new();
    while let Some(item) = stream.next().await {
        let item = item?;
        if let Some(status) = item.status { statuses.push(status); }
        if let Some(error) = item.error_detail.and_then(|detail| detail.message) {
            return Err(AppError::Docker(error));
        }
    }
    Ok(statuses.last().cloned().unwrap_or_else(|| format!("镜像 {image} 已拉取")))
}

#[tauri::command]
async fn docker_remove_image(state: State<'_, AppState>, id: String, image_id: String) -> AppResult<()> {
    let docker = load_docker_client(&state, &id).await?;
    let options = RemoveImageOptionsBuilder::default().force(false).build();
    docker.remove_image(&image_id, Some(options), None).await?;
    Ok(())
}

#[tauri::command]
async fn docker_list_networks(state: State<'_, AppState>, id: String) -> AppResult<serde_json::Value> {
    let docker = load_docker_client(&state, &id).await?;
    Ok(serde_json::to_value(docker.list_networks(None).await?)?)
}

#[tauri::command]
async fn docker_remove_network(state: State<'_, AppState>, id: String, network_id: String) -> AppResult<()> {
    let docker = load_docker_client(&state, &id).await?;
    docker.remove_network(&network_id).await?;
    Ok(())
}

#[tauri::command]
async fn docker_inspect_network(state: State<'_, AppState>, id: String, network_id: String) -> AppResult<serde_json::Value> {
    let docker = load_docker_client(&state, &id).await?;
    Ok(serde_json::to_value(docker.inspect_network(&network_id, None).await?)?)
}

#[tauri::command]
async fn docker_create_network(state: State<'_, AppState>, id: String, name: String, driver: Option<String>) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() { return Err(AppError::Invalid("请填写网络名称".into())); }
    let docker = load_docker_client(&state, &id).await?;
    let config = bollard::models::NetworkCreateRequest { name: name.to_string(), driver: Some(driver.unwrap_or_else(|| "bridge".into())), ..Default::default() };
    Ok(docker.create_network(config).await?.id)
}

#[tauri::command]
async fn docker_list_volumes(state: State<'_, AppState>, id: String) -> AppResult<serde_json::Value> {
    let docker = load_docker_client(&state, &id).await?;
    Ok(serde_json::to_value(docker.list_volumes(None::<bollard::query_parameters::ListVolumesOptions>).await?)?)
}

#[tauri::command]
async fn docker_remove_volume(state: State<'_, AppState>, id: String, volume_name: String) -> AppResult<()> {
    let docker = load_docker_client(&state, &id).await?;
    docker.remove_volume(&volume_name, None::<bollard::query_parameters::RemoveVolumeOptions>).await?;
    Ok(())
}

#[tauri::command]
async fn docker_inspect_volume(state: State<'_, AppState>, id: String, volume_name: String) -> AppResult<serde_json::Value> {
    let docker = load_docker_client(&state, &id).await?;
    Ok(serde_json::to_value(docker.inspect_volume(&volume_name).await?)?)
}

#[tauri::command]
async fn docker_create_volume(state: State<'_, AppState>, id: String, name: String, driver: Option<String>) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() { return Err(AppError::Invalid("请填写卷名称".into())); }
    let docker = load_docker_client(&state, &id).await?;
    let config = bollard::models::VolumeCreateRequest { name: Some(name.to_string()), driver: Some(driver.unwrap_or_else(|| "local".into())), ..Default::default() };
    Ok(docker.create_volume(config).await?.name)
}

#[tauri::command]
async fn trust_ssh_host(
    state: State<'_, AppState>,
    id: String,
    key_type: String,
    fingerprint: String,
) -> AppResult<()> {
    let connection = state.store.get_connection(&id).await?;
    trust_ssh_host_for_connection(&state, connection, key_type, fingerprint).await
}

#[tauri::command]
async fn trust_ssh_host_config(
    state: State<'_, AppState>,
    connection: Connection,
    key_type: String,
    fingerprint: String,
) -> AppResult<()> {
    trust_ssh_host_for_connection(&state, connection, key_type, fingerprint).await
}

async fn trust_ssh_host_for_connection(
    state: &AppState,
    connection: Connection,
    key_type: String,
    fingerprint: String,
) -> AppResult<()> {
    if !matches!(connection.kind, ConnKind::Ssh | ConnKind::Sftp) {
        return Err(AppError::Invalid("只有 SSH / SFTP 连接支持主机指纹".into()));
    }
    state
        .store
        .trust_host(
            &connection.host,
            connection.effective_port(),
            &key_type,
            &fingerprint,
        )
        .await
}

#[tauri::command]
async fn remote_list(
    state: State<'_, AppState>,
    id: String,
    path: String,
) -> AppResult<Vec<FileEntry>> {
    let connection = load_connection(&state, &id).await?;
    if !matches!(
        connection.kind,
        ConnKind::Ftp | ConnKind::Sftp | ConnKind::Ssh
    ) {
        return Err(AppError::Invalid("此连接不支持远程文件浏览".into()));
    }
    let started = Instant::now();
    let requested_path = if path.is_empty() { "/" } else { &path };
    let result: AppResult<Vec<FileEntry>> = async {
        if connection.kind == ConnKind::Ftp {
            let mut ftp = open_ftp(&connection).await?;
            let entries = ftp.list_entries(requested_path).await?;
            ftp.quit().await?;
            Ok(entries)
        } else {
            let (_session, sftp) = open_sftp(&state, &connection).await?;
            let directory = sftp
                .read_dir(requested_path)
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            let mut entries = Vec::new();
            for entry in directory {
                let name = entry.file_name();
                let entry_path = entry.path();
                let is_symlink = entry.file_type().is_symlink();
                let mut metadata = entry.metadata();
                if is_symlink {
                    if let Ok(target_metadata) = sftp.metadata(entry_path.clone()).await {
                        metadata = target_metadata;
                    }
                }
                let modified = metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| duration.as_secs() as i64);
                entries.push(FileEntry {
                    name,
                    path: entry_path,
                    is_dir: metadata.file_type().is_dir(),
                    is_symlink,
                    size: metadata.len(),
                    modified,
                    permissions: Some(metadata.permissions().to_string()),
                    owner: None,
                    group: None,
                });
            }
            sftp.close()
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            Ok(entries)
        }
    }
    .await;
    let protocol = match connection.kind {
        ConnKind::Ftp => "FTP",
        ConnKind::Sftp => "SFTP",
        ConnKind::Ssh => "SSH · SFTP",
        _ => "远程文件",
    };
    record_activity_outcome(
        &state.store,
        &id,
        &format!("{protocol} · 浏览目录 {requested_path}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn remote_upload(
    state: State<'_, AppState>,
    id: String,
    local_path: String,
    remote_path: String,
    on_event: Channel<TransferProgress>,
) -> AppResult<u64> {
    let connection = load_connection(&state, &id).await?;
    if !matches!(
        connection.kind,
        ConnKind::Ftp | ConnKind::Sftp | ConnKind::Ssh
    ) {
        return Err(AppError::Invalid("此连接不支持远程文件上传".into()));
    }
    let started = Instant::now();
    let file_name = remote_path
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or(remote_path.as_str())
        .to_string();
    let total = tokio::fs::metadata(&local_path)
        .await
        .ok()
        .map(|metadata| metadata.len());
    let mut reporter = TransferReporter::start(on_event, file_name, total);
    let result: AppResult<u64> = async {
        if connection.kind == ConnKind::Ftp {
            let mut ftp = open_ftp(&connection).await?;
            let bytes = ftp
                .upload_file(&remote_path, &local_path, &mut reporter)
                .await?;
            ftp.quit().await?;
            Ok(bytes)
        } else {
            let (_session, sftp) = open_sftp(&state, &connection).await?;
            let mut local = tokio::fs::File::open(&local_path).await?;
            let mut remote = sftp
                .create(remote_path.clone())
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            let bytes = copy_with_progress(&mut local, &mut remote, &mut reporter).await?;
            remote
                .close()
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            sftp.close()
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            Ok(bytes)
        }
    }
    .await;
    match &result {
        Ok(bytes) => reporter.finish(*bytes),
        Err(error) => reporter.fail(&error.to_string()),
    }
    let protocol = if connection.kind == ConnKind::Ftp {
        "FTP"
    } else {
        "SFTP"
    };
    record_activity_outcome(
        &state.store,
        &id,
        &format!("{protocol} · 上传 {remote_path}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn remote_download(
    state: State<'_, AppState>,
    id: String,
    remote_path: String,
    local_path: String,
    on_event: Channel<TransferProgress>,
) -> AppResult<u64> {
    let connection = load_connection(&state, &id).await?;
    if !matches!(
        connection.kind,
        ConnKind::Ftp | ConnKind::Sftp | ConnKind::Ssh
    ) {
        return Err(AppError::Invalid("此连接不支持远程文件下载".into()));
    }
    let started = Instant::now();
    let file_name = remote_path
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or(remote_path.as_str())
        .to_string();
    let mut reporter = TransferReporter::start(on_event, file_name, None);
    let result: AppResult<u64> = async {
        if connection.kind == ConnKind::Ftp {
            let mut ftp = open_ftp(&connection).await?;
            reporter.set_total(ftp.size_of(&remote_path).await);
            let bytes = ftp
                .download_file(&remote_path, &local_path, &mut reporter)
                .await?;
            ftp.quit().await?;
            Ok(bytes)
        } else {
            let (_session, sftp) = open_sftp(&state, &connection).await?;
            if let Ok(metadata) = sftp.metadata(remote_path.clone()).await {
                reporter.set_total(Some(metadata.len()));
            }
            let mut remote = sftp
                .open(remote_path.clone())
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            let mut local = tokio::fs::File::create(&local_path).await?;
            let bytes = copy_with_progress(&mut remote, &mut local, &mut reporter).await?;
            remote
                .close()
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            sftp.close()
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            Ok(bytes)
        }
    }
    .await;
    match &result {
        Ok(bytes) => reporter.finish(*bytes),
        Err(error) => reporter.fail(&error.to_string()),
    }
    let protocol = if connection.kind == ConnKind::Ftp {
        "FTP"
    } else {
        "SFTP"
    };
    record_activity_outcome(
        &state.store,
        &id,
        &format!("{protocol} · 下载 {remote_path}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

fn safe_local_child(base: &std::path::Path, name: &str) -> AppResult<PathBuf> {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\', '\0']) {
        return Err(AppError::Invalid(
            "远程目录包含不安全的文件名，已停止下载".into(),
        ));
    }
    Ok(base.join(name))
}

#[tauri::command]
async fn remote_download_directory(
    state: State<'_, AppState>,
    id: String,
    remote_path: String,
    local_parent_path: String,
    on_event: Channel<TransferProgress>,
) -> AppResult<u64> {
    let connection = load_connection(&state, &id).await?;
    if !matches!(
        connection.kind,
        ConnKind::Ftp | ConnKind::Sftp | ConnKind::Ssh
    ) {
        return Err(AppError::Invalid("此连接不支持远程目录下载".into()));
    }
    let parent = PathBuf::from(local_parent_path);
    let directory_name = remote_path
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("remote-directory");
    let local_root = safe_local_child(
        &parent,
        if directory_name.is_empty() || directory_name == "." {
            "remote-directory"
        } else {
            directory_name
        },
    )?;
    let started = Instant::now();
    let mut reporter = TransferReporter::start(on_event, directory_name.to_string(), None);
    let result: AppResult<u64> = async {
        tokio::fs::create_dir_all(&local_root).await?;
        let mut total_bytes = 0_u64;
        if connection.kind == ConnKind::Ftp {
            let mut ftp = open_ftp(&connection).await?;
            let mut pending = vec![(remote_path.clone(), local_root.clone())];
            while let Some((remote_directory, local_directory)) = pending.pop() {
                let entries = ftp.list_entries(&remote_directory).await?;
                for entry in entries {
                    let local_path = safe_local_child(&local_directory, &entry.name)?;
                    if entry.is_dir && !entry.is_symlink {
                        tokio::fs::create_dir_all(&local_path).await?;
                        pending.push((entry.path, local_path));
                    } else {
                        reporter.merge_total(if entry.size > 0 {
                            Some(entry.size)
                        } else {
                            None
                        });
                        total_bytes += ftp
                            .download_file(
                                &entry.path,
                                &local_path.to_string_lossy(),
                                &mut reporter,
                            )
                            .await?;
                    }
                }
            }
            ftp.quit().await?;
        } else {
            let (_session, sftp) = open_sftp(&state, &connection).await?;
            let mut pending = vec![(remote_path.clone(), local_root.clone())];
            while let Some((remote_directory, local_directory)) = pending.pop() {
                let entries = sftp
                    .read_dir(remote_directory)
                    .await
                    .map_err(|error| AppError::Sftp(error.to_string()))?;
                for entry in entries {
                    let name = entry.file_name();
                    if name == "." || name == ".." {
                        continue;
                    }
                    let metadata = entry.metadata();
                    if metadata.file_type().is_symlink() {
                        continue;
                    }
                    let local_path = safe_local_child(&local_directory, &name)?;
                    let remote_entry_path = entry.path();
                    if metadata.file_type().is_dir() {
                        tokio::fs::create_dir_all(&local_path).await?;
                        pending.push((remote_entry_path, local_path));
                    } else {
                        reporter.merge_total(Some(metadata.len()));
                        let mut remote = sftp
                            .open(remote_entry_path)
                            .await
                            .map_err(|error| AppError::Sftp(error.to_string()))?;
                        let mut local = tokio::fs::File::create(&local_path).await?;
                        total_bytes +=
                            copy_with_progress(&mut remote, &mut local, &mut reporter).await?;
                        remote
                            .close()
                            .await
                            .map_err(|error| AppError::Sftp(error.to_string()))?;
                    }
                }
            }
            sftp.close()
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
        }
        Ok(total_bytes)
    }
    .await;
    match &result {
        Ok(bytes) => reporter.finish(*bytes),
        Err(error) => reporter.fail(&error.to_string()),
    }
    let protocol = if connection.kind == ConnKind::Ftp {
        "FTP"
    } else {
        "SFTP"
    };
    record_activity_outcome(
        &state.store,
        &id,
        &format!("{protocol} · 下载目录 {remote_path}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

async fn delete_ftp_entry_tree(
    ftp: &mut dyn FtpClient,
    path: &str,
    is_directory: bool,
) -> AppResult<()> {
    let mut pending = vec![(path.to_string(), is_directory)];
    let mut directories = Vec::new();
    while let Some((entry_path, is_directory)) = pending.pop() {
        if is_directory {
            directories.push(entry_path.clone());
            for entry in ftp.list_entries(&entry_path).await? {
                pending.push((entry.path, entry.is_dir && !entry.is_symlink));
            }
        } else {
            ftp.delete_entry(&entry_path, false).await?;
        }
    }
    directories.sort_by_key(|directory| std::cmp::Reverse(directory.matches('/').count()));
    for directory in directories {
        ftp.delete_entry(&directory, true).await?;
    }
    Ok(())
}

async fn delete_sftp_entry_tree(
    sftp: &SftpSession,
    path: &str,
    is_directory: bool,
) -> AppResult<()> {
    let mut pending = vec![(path.to_string(), is_directory)];
    let mut directories = Vec::new();
    while let Some((entry_path, is_directory)) = pending.pop() {
        if is_directory {
            directories.push(entry_path.clone());
            let entries = sftp
                .read_dir(entry_path)
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            for entry in entries {
                let name = entry.file_name();
                if name == "." || name == ".." {
                    continue;
                }
                let metadata = entry.metadata();
                pending.push((
                    entry.path(),
                    metadata.file_type().is_dir() && !metadata.file_type().is_symlink(),
                ));
            }
        } else {
            sftp.remove_file(entry_path)
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
        }
    }
    directories.sort_by_key(|directory| std::cmp::Reverse(directory.matches('/').count()));
    for directory in directories {
        sftp.remove_dir(directory)
            .await
            .map_err(|error| AppError::Sftp(error.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
async fn remote_delete(
    state: State<'_, AppState>,
    id: String,
    remote_path: String,
    is_directory: bool,
) -> AppResult<()> {
    let connection = load_connection(&state, &id).await?;
    if !matches!(
        connection.kind,
        ConnKind::Ftp | ConnKind::Sftp | ConnKind::Ssh
    ) {
        return Err(AppError::Invalid("此连接不支持远程文件删除".into()));
    }
    let started = Instant::now();
    let result: AppResult<()> = async {
        if connection.kind == ConnKind::Ftp {
            let mut ftp = open_ftp(&connection).await?;
            delete_ftp_entry_tree(ftp.as_mut(), &remote_path, is_directory).await?;
            ftp.quit().await?;
        } else {
            let (_session, sftp) = open_sftp(&state, &connection).await?;
            delete_sftp_entry_tree(&sftp, &remote_path, is_directory).await?;
            sftp.close()
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
        }
        Ok(())
    }
    .await;
    let protocol = if connection.kind == ConnKind::Ftp {
        "FTP"
    } else {
        "SFTP"
    };
    record_activity_outcome(
        &state.store,
        &id,
        &format!("{protocol} · 删除 {remote_path}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn remote_rename(
    state: State<'_, AppState>,
    id: String,
    source_path: String,
    target_path: String,
) -> AppResult<()> {
    let connection = load_connection(&state, &id).await?;
    if !matches!(
        connection.kind,
        ConnKind::Ftp | ConnKind::Sftp | ConnKind::Ssh
    ) {
        return Err(AppError::Invalid("此连接不支持远程文件重命名".into()));
    }
    if source_path.trim().is_empty() || target_path.trim().is_empty() {
        return Err(AppError::Invalid("文件路径不能为空".into()));
    }
    let started = Instant::now();
    let result: AppResult<()> = async {
        if connection.kind == ConnKind::Ftp {
            let mut ftp = open_ftp(&connection).await?;
            ftp.rename_entry(&source_path, &target_path).await?;
            ftp.quit().await?;
        } else {
            let (_session, sftp) = open_sftp(&state, &connection).await?;
            sftp.rename(source_path.clone(), target_path.clone())
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            sftp.close()
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
        }
        Ok(())
    }
    .await;
    let protocol = if connection.kind == ConnKind::Ftp {
        "FTP"
    } else {
        "SFTP"
    };
    record_activity_outcome(
        &state.store,
        &id,
        &format!("{protocol} · 重命名 {source_path}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

const MAX_REMOTE_EDIT_BYTES: usize = 8 * 1024 * 1024;

async fn read_remote_text<R>(reader: &mut R) -> AppResult<String>
where
    R: AsyncRead + Unpin,
{
    let mut contents = Vec::new();
    let mut chunk = [0_u8; 8192];
    loop {
        let count = reader.read(&mut chunk).await?;
        if count == 0 {
            break;
        }
        if contents.len() + count > MAX_REMOTE_EDIT_BYTES {
            return Err(AppError::Invalid(
                "远程文件超过 8 MiB，无法在内置编辑器中打开".into(),
            ));
        }
        contents.extend_from_slice(&chunk[..count]);
    }
    String::from_utf8(contents)
        .map_err(|_| AppError::Invalid("文件不是 UTF-8 文本，无法在内置编辑器中打开".into()))
}

#[tauri::command]
async fn remote_read_text(
    state: State<'_, AppState>,
    id: String,
    remote_path: String,
) -> AppResult<String> {
    let connection = load_connection(&state, &id).await?;
    if !matches!(
        connection.kind,
        ConnKind::Ftp | ConnKind::Sftp | ConnKind::Ssh
    ) {
        return Err(AppError::Invalid("此连接不支持远程文件编辑".into()));
    }
    let started = Instant::now();
    let result: AppResult<String> = async {
        if connection.kind == ConnKind::Ftp {
            let mut ftp = open_ftp(&connection).await?;
            let contents = ftp.read_text_file(&remote_path).await?;
            ftp.quit().await?;
            Ok(contents)
        } else {
            let (_session, sftp) = open_sftp(&state, &connection).await?;
            let mut remote = sftp
                .open(remote_path.clone())
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            let contents = read_remote_text(&mut remote).await?;
            remote
                .close()
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            sftp.close()
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            Ok(contents)
        }
    }
    .await;
    let protocol = if connection.kind == ConnKind::Ftp {
        "FTP"
    } else {
        "SFTP"
    };
    record_activity_outcome(
        &state.store,
        &id,
        &format!("{protocol} · 编辑器读取 {remote_path}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn remote_write_text(
    state: State<'_, AppState>,
    id: String,
    remote_path: String,
    contents: String,
) -> AppResult<()> {
    let connection = load_connection(&state, &id).await?;
    if !matches!(
        connection.kind,
        ConnKind::Ftp | ConnKind::Sftp | ConnKind::Ssh
    ) {
        return Err(AppError::Invalid("此连接不支持远程文件编辑".into()));
    }
    if contents.len() > MAX_REMOTE_EDIT_BYTES {
        return Err(AppError::Invalid("编辑后的文件超过 8 MiB，无法保存".into()));
    }
    let started = Instant::now();
    let temp_path =
        std::env::temp_dir().join(format!("orangehub-edit-{}.tmp", uuid::Uuid::new_v4()));
    let temp_path_string = temp_path.to_string_lossy().into_owned();
    let result: AppResult<()> = async {
        if connection.kind == ConnKind::Ftp {
            tokio::fs::write(&temp_path, contents.as_bytes()).await?;
            let mut ftp = open_ftp(&connection).await?;
            ftp.upload_file(
                &remote_path,
                &temp_path_string,
                &mut TransferReporter::silent(),
            )
            .await?;
            ftp.quit().await?;
        } else {
            let (_session, sftp) = open_sftp(&state, &connection).await?;
            let mut remote = sftp
                .create(remote_path.clone())
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            remote.write_all(contents.as_bytes()).await?;
            remote.flush().await?;
            remote
                .close()
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
            sftp.close()
                .await
                .map_err(|error| AppError::Sftp(error.to_string()))?;
        }
        Ok(())
    }
    .await;
    let _ = tokio::fs::remove_file(&temp_path).await;
    let protocol = if connection.kind == ConnKind::Ftp {
        "FTP"
    } else {
        "SFTP"
    };
    record_activity_outcome(
        &state.store,
        &id,
        &format!("{protocol} · 编辑器保存 {remote_path}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn write_local_text_file(path: String, contents: String) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::Invalid("请选择导出文件位置".into()));
    }
    tokio::fs::write(PathBuf::from(path), contents).await?;
    Ok(())
}

async fn record_activity(
    store: &Store,
    connection_id: &str,
    description: &str,
    succeeded: bool,
    elapsed_ms: u64,
    error: Option<&str>,
) {
    if let Err(error) = store
        .push_activity(
            Some(connection_id),
            description,
            succeeded,
            elapsed_ms,
            error,
        )
        .await
    {
        log::warn!("保存会话历史失败: {error}");
    }
}

async fn record_activity_outcome<T>(
    store: &Store,
    connection_id: &str,
    description: &str,
    elapsed_ms: u64,
    outcome: &AppResult<T>,
) {
    match outcome {
        Ok(_) => record_activity(store, connection_id, description, true, elapsed_ms, None).await,
        Err(error) => {
            let message = error.to_string();
            record_activity(
                store,
                connection_id,
                description,
                false,
                elapsed_ms,
                Some(&message),
            )
            .await;
        }
    }
}

#[tauri::command]
async fn execute_ssh(
    state: State<'_, AppState>,
    id: String,
    command: String,
) -> AppResult<SshCommandResult> {
    if command.trim().is_empty() {
        return Err(AppError::Invalid("远程命令不能为空".into()));
    }
    let connection = load_connection(&state, &id).await?;
    if !matches!(connection.kind, ConnKind::Ssh | ConnKind::Sftp) {
        return Err(AppError::Invalid("此连接不是 SSH".into()));
    }
    let session = match connect_ssh(&state, &connection).await? {
        Ok(session) => session,
        Err(observation) => {
            return Err(AppError::Ssh(format!(
                "请先信任 SSH 主机指纹: {}",
                observation.fingerprint
            )))
        }
    };
    let mut channel = session.channel_open_session().await?;
    channel.exec(true, command).await?;
    let read_result = tokio::time::timeout(Duration::from_secs(60), async {
        let mut output = Vec::new();
        let mut exit_code = None;
        while let Some(message) = channel.wait().await {
            match message {
                ChannelMsg::Data { data } | ChannelMsg::ExtendedData { data, .. } => {
                    if output.len().saturating_add(data.len()) > 4 * 1024 * 1024 {
                        return Err(AppError::Ssh("远程命令输出超过 4 MiB 限制".into()));
                    }
                    output.extend_from_slice(&data);
                }
                ChannelMsg::ExitStatus { exit_status } => exit_code = Some(exit_status),
                _ => {}
            }
        }
        Ok::<_, AppError>((output, exit_code))
    })
    .await;
    let (output, exit_code) = match read_result {
        Ok(result) => result?,
        Err(_) => {
            let _ = session
                .disconnect(Disconnect::ByApplication, "command timeout", "English")
                .await;
            return Err(AppError::Ssh("远程命令执行超时（60 秒）".into()));
        }
    };
    session
        .disconnect(Disconnect::ByApplication, "", "English")
        .await?;
    Ok(SshCommandResult {
        output: String::from_utf8_lossy(&output).into_owned(),
        exit_code,
    })
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct SshMonitorSnapshot {
    cpu_total: Option<u64>,
    cpu_idle: Option<u64>,
    memory_total_bytes: Option<u64>,
    memory_available_bytes: Option<u64>,
    disk_read_bytes: Option<u64>,
    disk_write_bytes: Option<u64>,
    network_rx_bytes: Option<u64>,
    network_tx_bytes: Option<u64>,
    disk_total_bytes: Option<u64>,
    disk_used_bytes: Option<u64>,
    disk_devices: Vec<SshMonitorDiskCounter>,
    network_devices: Vec<SshMonitorNetworkCounter>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SshMonitorDiskCounter {
    name: String,
    read_bytes: u64,
    write_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SshMonitorNetworkCounter {
    name: String,
    rx_bytes: u64,
    tx_bytes: u64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SshMonitorDiskRate {
    name: String,
    read_bytes_per_second: Option<f64>,
    write_bytes_per_second: Option<f64>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SshMonitorNetworkRate {
    name: String,
    rx_bytes_per_second: Option<f64>,
    tx_bytes_per_second: Option<f64>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SshMonitorHistoryPoint {
    sampled_at: i64,
    cpu_percent: Option<f64>,
    memory_used_bytes: Option<u64>,
    memory_total_bytes: Option<u64>,
    #[serde(default)]
    disk_rates: Vec<SshMonitorDiskRate>,
    #[serde(default)]
    network_rates: Vec<SshMonitorNetworkRate>,
}

#[tauri::command]
async fn ssh_monitor(state: State<'_, AppState>, id: String) -> AppResult<SshMonitorSnapshot> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Ssh {
        return Err(AppError::Invalid("服务器监控仅支持 SSH 连接".into()));
    }
    let session = match connect_ssh(&state, &connection).await? {
        Ok(session) => session,
        Err(observation) => {
            return Err(AppError::Ssh(format!(
                "请先信任 SSH 主机指纹: {}",
                observation.fingerprint
            )))
        }
    };
    let mut channel = session.channel_open_session().await?;
    let command = r#"if [ -r /proc/stat ]; then awk '/^cpu / {total=0; for(i=2;i<=9 && i<=NF;i++) total+=$i; idle=$5+$6; printf "cpu %.0f %.0f\n", total, idle}' /proc/stat; fi; if [ -r /proc/meminfo ]; then awk '/^MemTotal:/ {total=$2} /^MemAvailable:/ {available=$2} /^MemFree:/ {free=$2} /^Buffers:/ {buffers=$2} /^Cached:/ {cached=$2} /^SReclaimable:/ {reclaim=$2} /^Shmem:/ {shared=$2} END {if (!available) available=free+buffers+cached+reclaim-shared; if (available<0) available=0; if (available>total) available=total; if (total>0) printf "memory %.0f %.0f\n", total*1024, available*1024}' /proc/meminfo; fi; if [ -r /proc/diskstats ]; then awk '{name=$3; if (name ~ /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme[0-9]+n[0-9]+|mmcblk[0-9]+)$/) printf "disk %s %.0f %.0f\n", name, $6*512, $10*512}' /proc/diskstats; fi; if [ -r /proc/net/dev ]; then awk 'NR>2 {name=$1; sub(/:$/, "", name); if (name!="lo") printf "network %s %.0f %.0f\n", name, $2, $10}' /proc/net/dev; fi; df -Pk / 2>/dev/null | awk 'NR==2 {printf "rootdisk %.0f %.0f\n", $2*1024, $3*1024}'"#;
    channel.exec(true, command).await?;
    let mut output = Vec::new();
    while let Some(message) = channel.wait().await {
        match message {
            ChannelMsg::Data { data } | ChannelMsg::ExtendedData { data, .. } => {
                output.extend_from_slice(&data)
            }
            ChannelMsg::Close => break,
            _ => {}
        }
    }
    session
        .disconnect(
            Disconnect::ByApplication,
            "monitor sample complete",
            "English",
        )
        .await?;

    let mut snapshot = SshMonitorSnapshot::default();
    for line in String::from_utf8_lossy(&output).lines() {
        let mut fields = line.split_whitespace();
        match fields.next() {
            Some("cpu") => {
                let total = fields.next().and_then(|value| value.parse::<u64>().ok());
                let idle = fields.next().and_then(|value| value.parse::<u64>().ok());
                if let (Some(total), Some(idle)) = (total, idle) {
                    snapshot.cpu_total = Some(total);
                    snapshot.cpu_idle = Some(idle);
                }
            }
            Some("memory") => {
                let total = fields.next().and_then(|value| value.parse::<u64>().ok());
                let available = fields.next().and_then(|value| value.parse::<u64>().ok());
                if let (Some(total), Some(available)) = (total, available) {
                    snapshot.memory_total_bytes = Some(total);
                    snapshot.memory_available_bytes = Some(available);
                }
            }
            Some("disk") => {
                let name = fields.next();
                let read = fields.next().and_then(|value| value.parse::<u64>().ok());
                let write = fields.next().and_then(|value| value.parse::<u64>().ok());
                if let (Some(name), Some(read), Some(write)) = (name, read, write) {
                    snapshot.disk_read_bytes =
                        Some(snapshot.disk_read_bytes.unwrap_or(0).saturating_add(read));
                    snapshot.disk_write_bytes =
                        Some(snapshot.disk_write_bytes.unwrap_or(0).saturating_add(write));
                    snapshot.disk_devices.push(SshMonitorDiskCounter {
                        name: name.to_string(),
                        read_bytes: read,
                        write_bytes: write,
                    });
                }
            }
            Some("network") => {
                let name = fields.next();
                let rx = fields.next().and_then(|value| value.parse::<u64>().ok());
                let tx = fields.next().and_then(|value| value.parse::<u64>().ok());
                if let (Some(name), Some(rx), Some(tx)) = (name, rx, tx) {
                    snapshot.network_rx_bytes =
                        Some(snapshot.network_rx_bytes.unwrap_or(0).saturating_add(rx));
                    snapshot.network_tx_bytes =
                        Some(snapshot.network_tx_bytes.unwrap_or(0).saturating_add(tx));
                    snapshot.network_devices.push(SshMonitorNetworkCounter {
                        name: name.to_string(),
                        rx_bytes: rx,
                        tx_bytes: tx,
                    });
                }
            }
            Some("rootdisk") => {
                let total = fields.next().and_then(|value| value.parse::<u64>().ok());
                let used = fields.next().and_then(|value| value.parse::<u64>().ok());
                if let (Some(total), Some(used)) = (total, used) {
                    snapshot.disk_total_bytes = Some(total);
                    snapshot.disk_used_bytes = Some(used);
                }
            }
            _ => {}
        }
    }
    if snapshot.cpu_total.is_none()
        && snapshot.memory_total_bytes.is_none()
        && snapshot.disk_read_bytes.is_none()
        && snapshot.network_rx_bytes.is_none()
        && snapshot.disk_total_bytes.is_none()
    {
        return Err(AppError::Ssh(
            "未能读取服务器监控数据，需要远端提供 Linux /proc 接口和 df 命令".into(),
        ));
    }
    Ok(snapshot)
}

#[tauri::command]
async fn save_ssh_monitor_history_point(
    state: State<'_, AppState>,
    id: String,
    point: SshMonitorHistoryPoint,
) -> AppResult<()> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Ssh {
        return Err(AppError::Invalid("服务器监控历史仅支持 SSH 连接".into()));
    }
    if point.sampled_at <= 0 || point.disk_rates.len() > 256 || point.network_rates.len() > 256 {
        return Err(AppError::Invalid("监控采样数据无效".into()));
    }
    let payload = serde_json::to_string(&point)?;
    state
        .store
        .save_ssh_monitor_sample(&id, point.sampled_at, &payload)
        .await
}

#[tauri::command]
async fn list_ssh_monitor_history(
    state: State<'_, AppState>,
    id: String,
    since: i64,
) -> AppResult<Vec<SshMonitorHistoryPoint>> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Ssh {
        return Err(AppError::Invalid("服务器监控历史仅支持 SSH 连接".into()));
    }
    const MAX_HISTORY_POINTS: usize = 1800;
    let retention_start = chrono::Utc::now().timestamp_millis() - 30 * 24 * 60 * 60 * 1000;
    let rows = state
        .store
        .list_ssh_monitor_samples(&id, since.max(retention_start))
        .await?;
    if rows.len() <= MAX_HISTORY_POINTS {
        return rows
            .into_iter()
            .map(|(_, payload)| serde_json::from_str(&payload).map_err(AppError::from))
            .collect();
    }

    let last_index = rows.len() - 1;
    (0..MAX_HISTORY_POINTS)
        .map(|index| {
            let row_index = index * last_index / (MAX_HISTORY_POINTS - 1);
            serde_json::from_str(&rows[row_index].1).map_err(AppError::from)
        })
        .collect()
}

#[tauri::command]
async fn open_ssh_terminal(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    cols: u32,
    rows: u32,
    on_event: Channel<TerminalEvent>,
) -> AppResult<String> {
    let connection = load_connection(&state, &id).await?;
    if !matches!(connection.kind, ConnKind::Ssh | ConnKind::Sftp) {
        return Err(AppError::Invalid("此连接不是 SSH".into()));
    }
    let setup_started = Instant::now();
    let activity = "SSH · 交互式终端";
    let session = match connect_ssh(&state, &connection).await {
        Ok(Ok(session)) => session,
        Ok(Err(observation)) => {
            let error = AppError::Ssh(format!(
                "请先信任 SSH 主机指纹: {}",
                observation.fingerprint
            ));
            let message = error.to_string();
            record_activity(
                &state.store,
                &id,
                activity,
                false,
                setup_started.elapsed().as_millis() as u64,
                Some(&message),
            )
            .await;
            return Err(error);
        }
        Err(error) => {
            let message = error.to_string();
            record_activity(
                &state.store,
                &id,
                activity,
                false,
                setup_started.elapsed().as_millis() as u64,
                Some(&message),
            )
            .await;
            return Err(error);
        }
    };
    let channel = match session.channel_open_session().await {
        Ok(channel) => channel,
        Err(error) => {
            let error = AppError::from(error);
            let message = error.to_string();
            record_activity(
                &state.store,
                &id,
                activity,
                false,
                setup_started.elapsed().as_millis() as u64,
                Some(&message),
            )
            .await;
            return Err(error);
        }
    };
    if let Err(error) = channel
        .request_pty(true, "xterm-256color", cols.max(2), rows.max(1), 0, 0, &[])
        .await
    {
        let error = AppError::from(error);
        let message = error.to_string();
        record_activity(
            &state.store,
            &id,
            activity,
            false,
            setup_started.elapsed().as_millis() as u64,
            Some(&message),
        )
        .await;
        return Err(error);
    }
    if let Err(error) = channel.request_shell(true).await {
        let error = AppError::from(error);
        let message = error.to_string();
        record_activity(
            &state.store,
            &id,
            activity,
            false,
            setup_started.elapsed().as_millis() as u64,
            Some(&message),
        )
        .await;
        return Err(error);
    }

    let terminal_id = uuid::Uuid::new_v4().to_string();
    let (input_tx, mut input_rx) = mpsc::channel(128);
    state
        .terminals
        .write()
        .await
        .insert(terminal_id.clone(), input_tx);
    let (mut read_half, write_half) = channel.split();
    let store = state.store.clone();
    let history_id = store
        .push_activity(Some(&id), activity, true, 0, None)
        .await
        .unwrap_or_else(|error| {
            log::warn!("保存 SSH 会话历史失败: {error}");
            0
        });
    let task_id = terminal_id.clone();

    tokio::spawn(async move {
        let started = Instant::now();
        let mut exit_code = None;
        let mut failure = None;
        loop {
            tokio::select! {
                message = read_half.wait() => match message {
                    Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                        let event = TerminalEvent::Output { data: data.to_vec() };
                        if on_event.send(event).is_err() { break; }
                    }
                    Some(ChannelMsg::ExitStatus { exit_status }) => {
                        exit_code = Some(exit_status);
                        break;
                    }
                    Some(ChannelMsg::Close) | None => break,
                    _ => {}
                },
                input = input_rx.recv() => match input {
                    Some(TerminalInput::Data(data)) => {
                        if let Err(error) = write_half.data_bytes(bytes::Bytes::from(data.into_bytes())).await {
                            failure = Some(error.to_string());
                            break;
                        }
                    }
                    Some(TerminalInput::Resize { cols, rows }) => {
                        if let Err(error) = write_half.window_change(cols.max(2), rows.max(1), 0, 0).await {
                            failure = Some(error.to_string());
                            break;
                        }
                    }
                    Some(TerminalInput::Close) | None => {
                        let _ = write_half.close().await;
                        break;
                    }
                }
            }
        }

        let _ = write_half.close().await;
        let _ = session
            .disconnect(Disconnect::ByApplication, "terminal closed", "English")
            .await;
        if history_id != 0 {
            if let Err(error) = store
                .finish_activity(
                    history_id,
                    started.elapsed().as_millis() as u64,
                    failure.is_none(),
                    failure.as_deref(),
                )
                .await
            {
                log::warn!("更新 SSH 会话历史失败: {error}");
            }
        }
        if let Some(message) = failure {
            let _ = on_event.send(TerminalEvent::Error { message });
        }
        let _ = on_event.send(TerminalEvent::Closed { exit_code });
        app.state::<AppState>()
            .terminals
            .write()
            .await
            .remove(&task_id);
    });

    Ok(terminal_id)
}

#[tauri::command]
async fn write_ssh_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
    data: String,
) -> AppResult<()> {
    let sender = state
        .terminals
        .read()
        .await
        .get(&terminal_id)
        .cloned()
        .ok_or_else(|| AppError::NotConnected(terminal_id.clone()))?;
    sender
        .send(TerminalInput::Data(data))
        .await
        .map_err(|_| AppError::NotConnected(terminal_id))
}

#[tauri::command]
async fn resize_ssh_terminal(
    state: State<'_, AppState>,
    terminal_id: String,
    cols: u32,
    rows: u32,
) -> AppResult<()> {
    let sender = state
        .terminals
        .read()
        .await
        .get(&terminal_id)
        .cloned()
        .ok_or_else(|| AppError::NotConnected(terminal_id.clone()))?;
    sender
        .send(TerminalInput::Resize { cols, rows })
        .await
        .map_err(|_| AppError::NotConnected(terminal_id))
}

#[tauri::command]
async fn close_ssh_terminal(state: State<'_, AppState>, terminal_id: String) -> AppResult<()> {
    let sender = state
        .terminals
        .write()
        .await
        .remove(&terminal_id)
        .ok_or_else(|| AppError::NotConnected(terminal_id.clone()))?;
    sender
        .send(TerminalInput::Close)
        .await
        .map_err(|_| AppError::NotConnected(terminal_id))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SshCommandResult {
    output: String,
    exit_code: Option<u32>,
}

async fn connect_ssh(
    state: &AppState,
    connection: &Connection,
) -> AppResult<Result<client::Handle<HostTrustHandler>, HostKeyObservation>> {
    let connect_timeout = Duration::from_secs(connection.connect_timeout_secs.unwrap_or(8));
    let observed = Arc::new(StdMutex::new(None));
    let handler = HostTrustHandler {
        store: state.store.clone(),
        host: connection.host.clone(),
        port: connection.effective_port(),
        observed: observed.clone(),
    };
    let config = client::Config {
        inactivity_timeout: None,
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        ..Default::default()
    };
    let address = (connection.host.as_str(), connection.effective_port());
    let mut session = match tokio::time::timeout(
        connect_timeout,
        client::connect(Arc::new(config), address, handler),
    )
    .await
    {
        Ok(Ok(session)) => session,
        Ok(Err(error)) => {
            if let Some(observation) = observed.lock().expect("host key state lock").clone() {
                return Ok(Err(observation));
            }
            return Err(AppError::Ssh(error.to_string()));
        }
        Err(_) => return Err(AppError::Ssh("SSH 连接超时".into())),
    };

    let auth = match tokio::time::timeout(connect_timeout, async {
        match connection.auth_method {
            SshAuthMethod::Password => {
                let password = connection
                    .password
                    .as_deref()
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| AppError::Ssh("请填写 SSH 密码".into()))?;
                session
                    .authenticate_password(&connection.username, password)
                    .await
                    .map_err(|error| AppError::Ssh(error.to_string()))
            }
            SshAuthMethod::PrivateKey => {
                let path = connection
                    .key_path
                    .as_deref()
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| AppError::Ssh("请配置私钥文件路径".into()))?;
                let key = russh::keys::load_secret_key(path, connection.key_passphrase.as_deref())
                    .map_err(|error| AppError::Ssh(error.to_string()))?;
                let hash = session
                    .best_supported_rsa_hash()
                    .await
                    .map_err(|error| AppError::Ssh(error.to_string()))?
                    .flatten();
                session
                    .authenticate_publickey(
                        &connection.username,
                        PrivateKeyWithHashAlg::new(Arc::new(key), hash),
                    )
                    .await
                    .map_err(|error| AppError::Ssh(error.to_string()))
            }
            SshAuthMethod::Agent => Err(AppError::Ssh("当前版本尚未接入 SSH Agent".into())),
            SshAuthMethod::KeyboardInteractive => {
                Err(AppError::Ssh("当前版本尚未接入交互式认证".into()))
            }
        }
    })
    .await
    {
        Ok(result) => result?,
        Err(_) => return Err(AppError::Ssh("SSH 身份认证超时".into())),
    };
    if !auth.success() {
        return Err(AppError::Ssh(
            "SSH 身份认证失败，请检查用户名、密码或私钥".into(),
        ));
    }
    Ok(Ok(session))
}

async fn open_sftp(
    state: &AppState,
    connection: &Connection,
) -> AppResult<(client::Handle<HostTrustHandler>, SftpSession)> {
    if !matches!(connection.kind, ConnKind::Ssh | ConnKind::Sftp) {
        return Err(AppError::Invalid("此连接不支持 SFTP".into()));
    }
    let session = match connect_ssh(state, connection).await? {
        Ok(session) => session,
        Err(observation) => {
            return Err(AppError::Ssh(format!(
                "请先信任 SSH 主机指纹: {}",
                observation.fingerprint
            )))
        }
    };
    let channel = session
        .channel_open_session()
        .await
        .map_err(|error| AppError::Sftp(error.to_string()))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|error| AppError::Sftp(error.to_string()))?;
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|error| AppError::Sftp(error.to_string()))?;
    sftp.set_timeout(30);
    Ok((session, sftp))
}

const SQL_EXECUTION_TIMEOUT: Duration = Duration::from_secs(30);

#[tauri::command]
async fn execute_sql(
    state: State<'_, AppState>,
    id: String,
    statement: String,
    database: Option<String>,
    parameters: Option<Vec<SqlParameter>>,
) -> AppResult<QueryResult> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Sql {
        return Err(AppError::Invalid("此连接不是 SQL 数据库".into()));
    }
    if statement.trim().is_empty() {
        return Err(AppError::Invalid("SQL 语句不能为空".into()));
    }
    let started = Instant::now();
    let driver = sql_driver(&connection);
    if driver == "mssql" || driver == "oracle" {
        let result = match tokio::time::timeout(SQL_EXECUTION_TIMEOUT, async {
            if driver == "mssql" {
                execute_mssql_statement(
                    &connection,
                    statement.as_str(),
                    database.as_deref(),
                    started,
                )
                .await
            } else {
                execute_oracle_statement(
                    &connection,
                    statement.as_str(),
                    database.as_deref(),
                    started,
                )
                .await
            }
        })
        .await
        {
            Ok(result) => result,
            Err(_) => Err(AppError::Sql(
                "SQL 执行超时（30 秒），请检查查询条件或服务器状态".into(),
            )),
        };
        let result = match result {
            Ok(result) => result,
            Err(error) => {
                let message = error.to_string();
                record_activity(
                    &state.store,
                    &id,
                    &statement,
                    false,
                    started.elapsed().as_millis() as u64,
                    Some(&message),
                )
                .await;
                return Err(error);
            }
        };
        if let Err(error) = state
            .store
            .push_history(Some(&id), &statement, Some(&result), None)
            .await
        {
            log::warn!("保存 SQL 历史失败: {error}");
        }
        return Ok(result);
    }
    if matches!(driver, "mysql" | "tidb") {
        let pool_result = match tokio::time::timeout(
            SQL_EXECUTION_TIMEOUT,
            open_mysql_pool_for_database(&connection, database),
        )
        .await
        {
            Ok(result) => result,
            Err(_) => Err(AppError::Sql(
                "连接数据库超时（30 秒），请检查网络、地址和端口".into(),
            )),
        };
        let pool = match pool_result {
            Ok(pool) => pool,
            Err(error) => {
                let message = error.to_string();
                record_activity(
                    &state.store,
                    &id,
                    &statement,
                    false,
                    started.elapsed().as_millis() as u64,
                    Some(&message),
                )
                .await;
                return Err(error);
            }
        };
        let result = match tokio::time::timeout(
            SQL_EXECUTION_TIMEOUT,
            execute_mysql_statement(
                &pool,
                &statement,
                parameters.as_deref().unwrap_or_default(),
                started,
            ),
        )
        .await
        {
            Ok(result) => result,
            Err(_) => Err(AppError::Sql(
                "SQL 执行超时（30 秒），请检查查询条件或服务器状态".into(),
            )),
        };
        pool.close().await;
        let result = match result {
            Ok(result) => result,
            Err(error) => {
                let message = error.to_string();
                record_activity(
                    &state.store,
                    &id,
                    &statement,
                    false,
                    started.elapsed().as_millis() as u64,
                    Some(&message),
                )
                .await;
                return Err(error);
            }
        };
        let history_result = state
            .store
            .push_history(Some(&id), &statement, Some(&result), None)
            .await;
        if let Err(error) = history_result {
            log::warn!("保存 SQL 历史失败: {error}");
        }
        return Ok(result);
    }
    let pool_result = match tokio::time::timeout(
        SQL_EXECUTION_TIMEOUT,
        open_sql_pool_for_database(&connection, database),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => Err(AppError::Sql(
            "连接数据库超时（30 秒），请检查网络、地址和端口".into(),
        )),
    };
    let pool = match pool_result {
        Ok(pool) => pool,
        Err(error) => {
            let message = error.to_string();
            record_activity(
                &state.store,
                &id,
                &statement,
                false,
                started.elapsed().as_millis() as u64,
                Some(&message),
            )
            .await;
            return Err(error);
        }
    };
    let first_word = statement
        .trim_start()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    let returns_rows = matches!(
        first_word.as_str(),
        "SELECT" | "WITH" | "SHOW" | "DESCRIBE" | "DESC" | "EXPLAIN" | "PRAGMA"
    );

    let result = if returns_rows {
        let mut rows = match tokio::time::timeout(
            SQL_EXECUTION_TIMEOUT,
            sqlx::query(sqlx::AssertSqlSafe(statement.as_str())).fetch_all(&pool),
        )
        .await
        {
            Ok(Ok(rows)) => rows,
            Ok(Err(error)) => {
                let message = error.to_string();
                record_activity(
                    &state.store,
                    &id,
                    &statement,
                    false,
                    started.elapsed().as_millis() as u64,
                    Some(&message),
                )
                .await;
                pool.close().await;
                return Err(AppError::from(error));
            }
            Err(_) => {
                let error =
                    AppError::Sql("SQL 执行超时（30 秒），请检查查询条件或服务器状态".into());
                let message = error.to_string();
                record_activity(
                    &state.store,
                    &id,
                    &statement,
                    false,
                    started.elapsed().as_millis() as u64,
                    Some(&message),
                )
                .await;
                pool.close().await;
                return Err(error);
            }
        };
        let truncated = rows.len() > 500;
        rows.truncate(500);
        let columns = rows
            .first()
            .map(|row| {
                row.columns()
                    .iter()
                    .map(|column| ColumnDef {
                        name: column.name().to_string(),
                        data_type: column.type_info().name().to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default();
        let data = rows
            .iter()
            .map(|row| {
                row.columns()
                    .iter()
                    .enumerate()
                    .map(|(index, column)| {
                        let type_name = column.type_info().name().to_ascii_uppercase();
                        let cell = if type_name.contains("BOOL") {
                            row.try_get::<bool, _>(index).map(Cell::Bool).ok()
                        } else if type_name.contains("INT") {
                            row.try_get::<i64, _>(index).map(Cell::Int).ok()
                        } else if ["REAL", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC"]
                            .iter()
                            .any(|name| type_name.contains(name))
                        {
                            row.try_get::<f64, _>(index).map(Cell::Float).ok()
                        } else {
                            row.try_get::<String, _>(index).map(Cell::Text).ok()
                        };
                        cell.unwrap_or_else(|| {
                            row.try_get::<Vec<u8>, _>(index)
                                .map(|bytes| Cell::Text(format!("blob:{}", B64.encode(bytes))))
                                .unwrap_or(Cell::Null)
                        })
                    })
                    .collect()
            })
            .collect();
        QueryResult {
            columns,
            rows: data,
            rows_affected: rows.len() as u64,
            elapsed_ms: started.elapsed().as_millis() as u64,
            is_exec: false,
            message: truncated.then(|| "结果超过 500 行，已截取前 500 行".to_string()),
        }
    } else {
        let command = match tokio::time::timeout(
            SQL_EXECUTION_TIMEOUT,
            sqlx::query(sqlx::AssertSqlSafe(statement.as_str())).execute(&pool),
        )
        .await
        {
            Ok(Ok(command)) => command,
            Ok(Err(error)) => {
                let message = error.to_string();
                record_activity(
                    &state.store,
                    &id,
                    &statement,
                    false,
                    started.elapsed().as_millis() as u64,
                    Some(&message),
                )
                .await;
                pool.close().await;
                return Err(AppError::from(error));
            }
            Err(_) => {
                let error =
                    AppError::Sql("SQL 执行超时（30 秒），请检查查询条件或服务器状态".into());
                let message = error.to_string();
                record_activity(
                    &state.store,
                    &id,
                    &statement,
                    false,
                    started.elapsed().as_millis() as u64,
                    Some(&message),
                )
                .await;
                pool.close().await;
                return Err(error);
            }
        };
        QueryResult::exec(
            command.rows_affected(),
            started.elapsed().as_millis() as u64,
            Some(format!(
                "Query OK, {} rows affected",
                command.rows_affected()
            )),
        )
    };
    pool.close().await;
    let history_result = state
        .store
        .push_history(Some(&id), &statement, Some(&result), None)
        .await;
    if let Err(error) = history_result {
        log::warn!("保存 SQL 历史失败: {error}");
    }
    Ok(result)
}

type MssqlConnection = MssqlClient<Compat<TcpStream>>;

async fn open_mssql_connection(
    connection: &Connection,
    database: Option<&str>,
) -> AppResult<MssqlConnection> {
    let mut config = MssqlConfig::new();
    config.host(connection.host.clone());
    config.port(connection.effective_port());
    config.authentication(AuthMethod::sql_server(
        &connection.username,
        connection.password.as_deref().unwrap_or(""),
    ));
    if let Some(database) = database
        .or(connection.database.as_deref())
        .filter(|value| !value.trim().is_empty())
    {
        config.database(database);
    }
    if connection.use_tls {
        config.encryption(EncryptionLevel::Required);
        if connection.unsafe_tls {
            config.trust_cert();
        } else {
            config.trust_webpki_roots();
        }
    } else {
        config.encryption(EncryptionLevel::NotSupported);
    }
    let tcp = TcpStream::connect(config.get_addr())
        .await
        .map_err(|error| AppError::Sql(format!("SQL Server 网络连接失败: {error}")))?;
    tcp.set_nodelay(true)
        .map_err(|error| AppError::Sql(format!("SQL Server 设置连接失败: {error}")))?;
    MssqlClient::connect(config, tcp.compat_write())
        .await
        .map_err(|error| AppError::Sql(format!("SQL Server 认证失败: {error}")))
}

fn cell_from_mssql_row(row: &tiberius::Row, index: usize) -> Cell {
    if let Ok(Some(value)) = row.try_get::<bool, _>(index) {
        return Cell::Bool(value);
    }
    if let Ok(Some(value)) = row.try_get::<i64, _>(index) {
        return Cell::Int(value);
    }
    if let Ok(Some(value)) = row.try_get::<f64, _>(index) {
        return Cell::Float(value);
    }
    if let Ok(Some(value)) = row.try_get::<&str, _>(index) {
        return Cell::Text(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<&[u8], _>(index) {
        return Cell::Text(format!("blob:{}", B64.encode(value)));
    }
    Cell::Null
}

async fn execute_mssql_statement(
    connection: &Connection,
    statement: &str,
    database: Option<&str>,
    started: Instant,
) -> AppResult<QueryResult> {
    let mut client = open_mssql_connection(connection, database).await?;
    let first_word = statement
        .trim_start()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    let returns_rows = matches!(
        first_word.as_str(),
        "SELECT" | "WITH" | "SHOW" | "DESCRIBE" | "DESC" | "EXEC" | "EXECUTE"
    );
    if returns_rows {
        let results = client
            .simple_query(statement)
            .await
            .map_err(|error| AppError::Sql(format!("SQL Server 查询失败: {error}")))?
            .into_results()
            .await
            .map_err(|error| AppError::Sql(format!("SQL Server 读取结果失败: {error}")))?;
        let rows = results.into_iter().next().unwrap_or_default();
        let columns = rows
            .first()
            .map(|row| {
                row.columns()
                    .iter()
                    .map(|column| ColumnDef {
                        name: column.name().to_string(),
                        data_type: format!("{:?}", column.column_type()),
                    })
                    .collect()
            })
            .unwrap_or_default();
        let data = rows
            .iter()
            .map(|row| {
                (0..row.columns().len())
                    .map(|index| cell_from_mssql_row(row, index))
                    .collect()
            })
            .collect();
        Ok(QueryResult {
            columns,
            rows: data,
            rows_affected: 0,
            elapsed_ms: started.elapsed().as_millis() as u64,
            is_exec: false,
            message: None,
        })
    } else {
        let result = client
            .execute(statement, &[])
            .await
            .map_err(|error| AppError::Sql(format!("SQL Server 执行失败: {error}")))?;
        let affected = result.total();
        Ok(QueryResult::exec(
            affected,
            started.elapsed().as_millis() as u64,
            Some(format!("Query OK, {affected} rows affected")),
        ))
    }
}

async fn open_oracle_connection(
    connection: &Connection,
    database: Option<&str>,
) -> AppResult<OracleConnection> {
    let service = database
        .or(connection.database.as_deref())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("FREEPDB1");
    let mut config = OracleConfig::new(
        connection.host.clone(),
        connection.effective_port(),
        service,
        connection.username.clone(),
        connection.password.as_deref().unwrap_or(""),
    );
    config.connect_timeout = Duration::from_secs(connection.connect_timeout_secs.unwrap_or(8));
    if connection.use_tls {
        config = config
            .with_tls()
            .map_err(|error| AppError::Sql(format!("Oracle TLS 配置失败: {error}")))?;
    }
    OracleConnection::connect_with_config(config)
        .await
        .map_err(|error| AppError::Sql(format!("Oracle 认证失败: {error}")))
}

fn cell_from_oracle_value(value: &OracleValue) -> Cell {
    if value.is_null() {
        return Cell::Null;
    }
    if let Some(value) = value.as_bool() {
        return Cell::Bool(value);
    }
    if let Some(value) = value.as_i64() {
        return Cell::Int(value);
    }
    if let Some(value) = value.as_f64() {
        return Cell::Float(value);
    }
    if let Some(value) = value.as_str() {
        return Cell::Text(value.to_string());
    }
    if let Some(value) = value.as_bytes() {
        return Cell::Text(format!("blob:{}", B64.encode(value)));
    }
    Cell::Text(format!("{value:?}"))
}

async fn execute_oracle_statement(
    connection: &Connection,
    statement: &str,
    database: Option<&str>,
    started: Instant,
) -> AppResult<QueryResult> {
    let client = open_oracle_connection(connection, database).await?;
    let first_word = statement
        .trim_start()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    let returns_rows = matches!(
        first_word.as_str(),
        "SELECT" | "WITH" | "SHOW" | "DESCRIBE" | "DESC"
    );
    if returns_rows {
        let result = client
            .query(statement, &[])
            .await
            .map_err(|error| AppError::Sql(format!("Oracle 查询失败: {error}")))?;
        let columns = result
            .columns
            .iter()
            .map(|column| ColumnDef {
                name: column.name.clone(),
                data_type: format!("{:?}", column.oracle_type),
            })
            .collect();
        let rows = result
            .rows
            .iter()
            .map(|row| row.values().iter().map(cell_from_oracle_value).collect())
            .collect();
        Ok(QueryResult {
            columns,
            rows,
            rows_affected: 0,
            elapsed_ms: started.elapsed().as_millis() as u64,
            is_exec: false,
            message: None,
        })
    } else {
        let result = client
            .execute(statement, &[])
            .await
            .map_err(|error| AppError::Sql(format!("Oracle 执行失败: {error}")))?;
        client
            .commit()
            .await
            .map_err(|error| AppError::Sql(format!("Oracle 提交失败: {error}")))?;
        Ok(QueryResult::exec(
            result.rows_affected,
            started.elapsed().as_millis() as u64,
            Some(format!("Query OK, {} rows affected", result.rows_affected)),
        ))
    }
}

fn cell_to_string(cell: &Cell) -> Option<String> {
    match cell {
        Cell::Text(value) => Some(value.clone()),
        Cell::Int(value) => Some(value.to_string()),
        Cell::Float(value) => Some(value.to_string()),
        Cell::Bool(value) => Some(value.to_string()),
        Cell::Null => None,
    }
}

fn sql_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn columns_from_metadata_rows(rows: Vec<Vec<Cell>>) -> Vec<SqlColumn> {
    rows.into_iter()
        .filter_map(|row| {
            let name = row.first().and_then(cell_to_string)?;
            let data_type = row
                .get(1)
                .and_then(cell_to_string)
                .unwrap_or_else(|| "TEXT".to_string());
            let nullable = row
                .get(2)
                .and_then(cell_to_string)
                .map(|value| {
                    value.eq_ignore_ascii_case("YES")
                        || value == "1"
                        || value.eq_ignore_ascii_case("Y")
                })
                .unwrap_or(true);
            let primary_key = row
                .get(3)
                .and_then(cell_to_string)
                .map(|value| {
                    value == "1"
                        || value.eq_ignore_ascii_case("YES")
                        || value.eq_ignore_ascii_case("Y")
                })
                .unwrap_or(false);
            Some(SqlColumn {
                original_name: Some(name.clone()),
                name,
                data_type,
                nullable,
                primary_key,
                default_value: None,
                extra: String::new(),
                comment: String::new(),
                character_set: String::new(),
                collation: String::new(),
            })
        })
        .collect::<Vec<_>>()
}

async fn get_mssql_table_data(
    connection: &Connection,
    database: &str,
    table: &str,
    page: u32,
    page_size: u32,
) -> AppResult<SqlTableData> {
    let metadata_sql = format!(
        "SELECT c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE, CASE WHEN EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND kcu.TABLE_NAME = c.TABLE_NAME AND kcu.COLUMN_NAME = c.COLUMN_NAME) THEN 1 ELSE 0 END FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_NAME = {} ORDER BY c.ORDINAL_POSITION",
        sql_literal(table),
    );
    let metadata =
        execute_mssql_statement(connection, &metadata_sql, Some(database), Instant::now()).await?;
    let columns = columns_from_metadata_rows(metadata.rows);
    if columns.is_empty() {
        return Err(AppError::Invalid(
            "数据表不存在，或当前账号无权读取其结构".into(),
        ));
    }
    let table_sql = quote_sql_identifier("mssql", table);
    let count_result = execute_mssql_statement(
        connection,
        &format!("SELECT COUNT_BIG(*) FROM {table_sql}"),
        Some(database),
        Instant::now(),
    )
    .await?;
    let total_rows = count_result
        .rows
        .first()
        .and_then(|row| row.first())
        .and_then(cell_to_string)
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let page = page.max(1);
    let page_size = page_size.clamp(10, 200);
    let offset = (page.saturating_sub(1) as u64).saturating_mul(page_size as u64);
    let statement = format!("SELECT * FROM {table_sql} ORDER BY (SELECT NULL) OFFSET {offset} ROWS FETCH NEXT {page_size} ROWS ONLY");
    let rows = execute_mssql_statement(connection, &statement, Some(database), Instant::now())
        .await?
        .rows;
    let primary_key = columns
        .iter()
        .filter(|column| column.primary_key)
        .map(|column| column.name.clone())
        .collect();
    Ok(SqlTableData {
        columns,
        rows,
        primary_key,
        total_rows,
        page,
        page_size,
    })
}

async fn get_oracle_table_data(
    connection: &Connection,
    database: &str,
    table: &str,
    page: u32,
    page_size: u32,
) -> AppResult<SqlTableData> {
    let metadata_sql = format!(
        "SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, 0 FROM USER_TAB_COLUMNS WHERE TABLE_NAME = {} ORDER BY COLUMN_ID",
        sql_literal(&table.to_ascii_uppercase()),
    );
    let metadata =
        execute_oracle_statement(connection, &metadata_sql, Some(database), Instant::now()).await?;
    let columns = columns_from_metadata_rows(metadata.rows);
    if columns.is_empty() {
        return Err(AppError::Invalid(
            "数据表不存在，或当前账号无权读取其结构".into(),
        ));
    }
    let table_sql = quote_sql_identifier("oracle", table);
    let count_result = execute_oracle_statement(
        connection,
        &format!("SELECT COUNT(*) FROM {table_sql}"),
        Some(database),
        Instant::now(),
    )
    .await?;
    let total_rows = count_result
        .rows
        .first()
        .and_then(|row| row.first())
        .and_then(cell_to_string)
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0);
    let page = page.max(1);
    let page_size = page_size.clamp(10, 200);
    let offset = (page.saturating_sub(1) as u64).saturating_mul(page_size as u64);
    let statement =
        format!("SELECT * FROM {table_sql} OFFSET {offset} ROWS FETCH NEXT {page_size} ROWS ONLY");
    let rows = execute_oracle_statement(connection, &statement, Some(database), Instant::now())
        .await?
        .rows;
    let primary_key = columns
        .iter()
        .filter(|column| column.primary_key)
        .map(|column| column.name.clone())
        .collect();
    Ok(SqlTableData {
        columns,
        rows,
        primary_key,
        total_rows,
        page,
        page_size,
    })
}

fn mysql_parameter_count(statement: &str) -> usize {
    let bytes = statement.as_bytes();
    let mut count = 0;
    let mut index = 0;
    let mut quote = None;
    while index < bytes.len() {
        let byte = bytes[index];
        if let Some(end) = quote {
            if byte == end {
                if index + 1 < bytes.len() && bytes[index + 1] == end {
                    index += 2;
                    continue;
                }
                quote = None;
            } else if byte == b'\\' && (end == b'\'' || end == b'"') {
                index += 1;
            }
            index += 1;
            continue;
        }
        if byte == b'\'' || byte == b'"' || byte == b'`' {
            quote = Some(byte);
            index += 1;
            continue;
        }
        if byte == b'-'
            && index + 2 < bytes.len()
            && bytes[index + 1] == b'-'
            && bytes[index + 2] <= b' '
        {
            while index < bytes.len() && bytes[index] != b'\n' {
                index += 1;
            }
            continue;
        }
        if byte == b'#' {
            while index < bytes.len() && bytes[index] != b'\n' {
                index += 1;
            }
            continue;
        }
        if byte == b'/' && index + 1 < bytes.len() && bytes[index + 1] == b'*' {
            index += 2;
            while index + 1 < bytes.len() && !(bytes[index] == b'*' && bytes[index + 1] == b'/') {
                index += 1;
            }
            index = (index + 2).min(bytes.len());
            continue;
        }
        if byte == b'?' {
            count += 1;
        }
        index += 1;
    }
    count
}

fn mysql_arguments(parameters: &[SqlParameter]) -> AppResult<sqlx::mysql::MySqlArguments> {
    let mut arguments = sqlx::mysql::MySqlArguments::default();
    for parameter in parameters {
        let result = match parameter.kind.as_str() {
            "null" => arguments.add(Option::<String>::None),
            "boolean" => {
                let value = parameter
                    .value
                    .parse::<bool>()
                    .map_err(|_| AppError::Invalid("布尔参数必须是 true 或 false".into()))?;
                arguments.add(value)
            }
            "number" => {
                if let Ok(value) = parameter.value.parse::<i64>() {
                    arguments.add(value)
                } else if let Ok(value) = parameter.value.parse::<u64>() {
                    arguments.add(value)
                } else {
                    let value = parameter
                        .value
                        .parse::<sqlx::types::BigDecimal>()
                        .map_err(|_| AppError::Invalid("数字参数格式不正确".into()))?;
                    arguments.add(value)
                }
            }
            _ => arguments.add(parameter.value.as_str()),
        };
        result.map_err(|error| AppError::Invalid(format!("SQL 参数无效: {error}")))?;
    }
    Ok(arguments)
}

async fn execute_mysql_statement(
    pool: &sqlx::MySqlPool,
    statement: &str,
    parameters: &[SqlParameter],
    started: Instant,
) -> AppResult<QueryResult> {
    let placeholder_count = mysql_parameter_count(statement);
    if placeholder_count != parameters.len() {
        if placeholder_count > 0 && parameters.is_empty() {
            return Err(AppError::Invalid(format!(
                "SQL 包含 {placeholder_count} 个 ? 参数，请在参数面板中填写对应值后再执行"
            )));
        }
        return Err(AppError::Invalid(format!(
            "SQL 占位符数量为 {placeholder_count}，但提供了 {} 个参数",
            parameters.len()
        )));
    }
    let has_parameters = !parameters.is_empty();
    let first_word = statement
        .trim_start()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    let returns_rows = matches!(
        first_word.as_str(),
        "SELECT" | "WITH" | "SHOW" | "DESCRIBE" | "DESC" | "EXPLAIN"
    );
    if returns_rows {
        let mut rows = if has_parameters {
            sqlx::query_with::<sqlx::MySql, _>(
                sqlx::AssertSqlSafe(statement),
                mysql_arguments(parameters)?,
            )
            .fetch_all(pool)
            .await?
        } else {
            sqlx::raw_sql(sqlx::AssertSqlSafe(statement))
                .fetch_all(pool)
                .await?
        };
        let truncated = rows.len() > 500;
        rows.truncate(500);
        let columns = rows
            .first()
            .map(|row| {
                row.columns()
                    .iter()
                    .map(|column| ColumnDef {
                        name: column.name().to_string(),
                        data_type: column.type_info().name().to_string(),
                    })
                    .collect()
            })
            .unwrap_or_default();
        let data = rows
            .iter()
            .map(|row| {
                row.columns()
                    .iter()
                    .enumerate()
                    .map(|(index, column)| {
                        cell_from_mysql_row(row, index, column.type_info().name())
                    })
                    .collect()
            })
            .collect();
        Ok(QueryResult {
            columns,
            rows: data,
            rows_affected: rows.len() as u64,
            elapsed_ms: started.elapsed().as_millis() as u64,
            is_exec: false,
            message: truncated.then(|| "结果超过 500 行，已截取前 500 行".to_string()),
        })
    } else {
        let command = if has_parameters {
            sqlx::query_with::<sqlx::MySql, _>(
                sqlx::AssertSqlSafe(statement),
                mysql_arguments(parameters)?,
            )
            .execute(pool)
            .await?
        } else {
            sqlx::raw_sql(sqlx::AssertSqlSafe(statement))
                .execute(pool)
                .await?
        };
        Ok(QueryResult::exec(
            command.rows_affected(),
            started.elapsed().as_millis() as u64,
            Some(format!(
                "Query OK, {} rows affected",
                command.rows_affected()
            )),
        ))
    }
}

#[tauri::command]
async fn list_sql_databases(state: State<'_, AppState>, id: String) -> AppResult<Vec<SqlDatabase>> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    let driver = sql_driver(&connection);
    if driver == "mssql" {
        let result = execute_mssql_statement(
            &connection,
            "SELECT name FROM sys.databases ORDER BY name",
            None,
            Instant::now(),
        )
        .await?;
        return Ok(result
            .rows
            .into_iter()
            .filter_map(|row| row.first().and_then(cell_to_string))
            .map(|name| SqlDatabase { name })
            .collect());
    }
    if driver == "oracle" {
        let service = connection
            .database
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "FREEPDB1".to_string());
        let _ = open_oracle_connection(&connection, Some(service.as_str()))
            .await?
            .close()
            .await;
        return Ok(vec![SqlDatabase { name: service }]);
    }
    let pool = if matches!(driver, "mysql" | "tidb") {
        open_sql_pool_for_database(&connection, Some(String::new())).await?
    } else {
        open_sql_pool(&connection).await?
    };
    let result = async {
        let names = match driver {
            "sqlite" => vec!["main".to_string()],
            "mysql" | "tidb" => sqlx::query(
                "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name",
            )
            .fetch_all(&pool)
            .await?
            .into_iter()
            .filter_map(|row| row.try_get::<String, _>(0).ok())
            .collect(),
            "postgres" => sqlx::query(
                "SELECT datname FROM pg_database WHERE datallowconn = TRUE ORDER BY datname",
            )
            .fetch_all(&pool)
            .await?
            .into_iter()
            .filter_map(|row| row.try_get::<String, _>(0).ok())
            .collect(),
            _ => return Err(AppError::Invalid("不支持的 SQL 驱动".into())),
        };
        Ok(names.into_iter().map(|name| SqlDatabase { name }).collect())
    }
    .await;
    pool.close().await;
    result
}

#[tauri::command]
async fn list_sql_tables(
    state: State<'_, AppState>,
    id: String,
    database: String,
) -> AppResult<Vec<SqlTable>> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    validate_sql_database(&connection, &database)?;
    let driver = sql_driver(&connection);
    if driver == "mssql" {
        let result = execute_mssql_statement(
            &connection,
            "SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_NAME",
            Some(database.as_str()),
            Instant::now(),
        )
        .await?;
        return Ok(result
            .rows
            .into_iter()
            .filter_map(|row| {
                Some(SqlTable {
                    name: row.first().and_then(cell_to_string)?,
                    kind: row
                        .get(1)
                        .and_then(cell_to_string)
                        .unwrap_or_else(|| "TABLE".to_string()),
                })
            })
            .collect());
    }
    if driver == "oracle" {
        let result = execute_oracle_statement(&connection, "SELECT TABLE_NAME, 'TABLE' AS TABLE_TYPE FROM USER_TABLES UNION ALL SELECT VIEW_NAME, 'VIEW' FROM USER_VIEWS ORDER BY 1", Some(database.as_str()), Instant::now()).await?;
        return Ok(result
            .rows
            .into_iter()
            .filter_map(|row| {
                Some(SqlTable {
                    name: row.first().and_then(cell_to_string)?,
                    kind: row
                        .get(1)
                        .and_then(cell_to_string)
                        .unwrap_or_else(|| "TABLE".to_string()),
                })
            })
            .collect());
    }
    let pool = open_sql_pool_for_database(&connection, Some(database.clone())).await?;
    let result = async {
        let rows = match driver {
            "sqlite" => sqlx::query("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
                .fetch_all(&pool).await?,
            "mysql" | "tidb" => sqlx::query("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name")
                .bind(database).fetch_all(&pool).await?,
            "postgres" => sqlx::query("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name")
                .fetch_all(&pool).await?,
            _ => return Err(AppError::Invalid("不支持的 SQL 驱动".into())),
        };
        Ok(rows.into_iter().filter_map(|row| {
            Some(SqlTable {
                name: row.try_get::<String, _>(0).ok()?,
                kind: row.try_get::<String, _>(1).unwrap_or_else(|_| "TABLE".into()),
            })
        }).collect())
    }.await;
    pool.close().await;
    result
}

fn validate_sql_database_name(driver: &str, name: &str) -> AppResult<()> {
    let name = name.trim();
    if name.is_empty() || name.contains('\0') {
        return Err(AppError::Invalid("数据库名称不能为空或包含无效字符".into()));
    }
    if driver == "postgres" && name.len() > 63 {
        return Err(AppError::Invalid(
            "PostgreSQL 数据库名称不能超过 63 字节".into(),
        ));
    }
    if matches!(driver, "mysql" | "tidb") && name.len() > 64 {
        return Err(AppError::Invalid(
            "MySQL/TiDB 数据库名称不能超过 64 字节".into(),
        ));
    }
    Ok(())
}

async fn open_sql_admin_pool(connection: &Connection, driver: &str) -> AppResult<sqlx::AnyPool> {
    match driver {
        "mysql" | "tidb" => open_sql_pool_for_database(connection, Some(String::new())).await,
        "postgres" => open_sql_pool_for_database(connection, Some("postgres".to_string())).await,
        _ => Err(AppError::Invalid("当前数据库不支持此管理操作".into())),
    }
}

#[tauri::command]
async fn create_sql_database(
    state: State<'_, AppState>,
    id: String,
    database: String,
) -> AppResult<()> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    let driver = sql_driver(&connection);
    validate_sql_database_name(driver, &database)?;
    let pool = open_sql_admin_pool(&connection, driver).await?;
    let statement = format!(
        "CREATE DATABASE {}",
        quote_sql_identifier(driver, database.trim())
    );
    let result = sqlx::query(sqlx::AssertSqlSafe(statement.as_str()))
        .execute(&pool)
        .await
        .map_err(AppError::from);
    pool.close().await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("SQL · 创建数据库 {}", database.trim()),
        0,
        &result,
    )
    .await;
    result.map(|_| ())
}

#[tauri::command]
async fn delete_sql_database(
    state: State<'_, AppState>,
    id: String,
    database: String,
) -> AppResult<()> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    let driver = sql_driver(&connection);
    validate_sql_database_name(driver, &database)?;
    let normalized = database.trim().to_ascii_lowercase();
    let protected = match driver {
        "mysql" | "tidb" => ["mysql", "information_schema", "performance_schema", "sys"]
            .contains(&normalized.as_str()),
        "postgres" => ["postgres", "template0", "template1"].contains(&normalized.as_str()),
        _ => true,
    };
    if protected {
        return Err(AppError::Invalid(
            "系统数据库或 SQLite 主数据库不能删除".into(),
        ));
    }
    let pool = open_sql_admin_pool(&connection, driver).await?;
    let statement = format!(
        "DROP DATABASE {}",
        quote_sql_identifier(driver, database.trim())
    );
    let result = sqlx::query(sqlx::AssertSqlSafe(statement.as_str()))
        .execute(&pool)
        .await
        .map_err(AppError::from);
    pool.close().await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("SQL · 删除数据库 {}", database.trim()),
        0,
        &result,
    )
    .await;
    result.map(|_| ())
}

#[tauri::command]
async fn delete_sql_table(
    state: State<'_, AppState>,
    id: String,
    database: String,
    table: String,
    is_view: bool,
) -> AppResult<()> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    validate_sql_database(&connection, &database)?;
    let driver = sql_driver(&connection);
    let pool = open_sql_pool_for_database(&connection, Some(database.clone())).await?;
    let result = async {
        let exists = sqlx::query_scalar::<_, i64>(match driver {
            "mysql" | "tidb" => "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_name = ?",
            "postgres" => "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1",
            "sqlite" => "SELECT COUNT(*) FROM sqlite_master WHERE name = ? AND type IN ('table', 'view')",
            _ => return Err(AppError::Invalid("不支持的 SQL 驱动".into())),
        });
        let exists = if matches!(driver, "mysql" | "tidb") {
            exists.bind(&database).bind(&table).fetch_one(&pool).await?
        } else {
            exists.bind(&table).fetch_one(&pool).await?
        };
        if exists == 0 { return Err(AppError::Invalid("数据表不存在，请刷新对象列表".into())); }
        let object = if is_view { "VIEW" } else { "TABLE" };
        let qualified = if matches!(driver, "mysql" | "tidb") {
            format!("{}.{}", quote_sql_identifier(driver, &database), quote_sql_identifier(driver, &table))
        } else {
            quote_sql_identifier(driver, &table)
        };
        let statement = format!("DROP {object} {qualified}");
        sqlx::query(sqlx::AssertSqlSafe(statement.as_str())).execute(&pool).await?;
        Ok(())
    }.await;
    pool.close().await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("SQL · 删除对象 {database}.{table}"),
        0,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn truncate_sql_table(
    state: State<'_, AppState>,
    id: String,
    database: String,
    table: String,
) -> AppResult<()> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    validate_sql_database(&connection, &database)?;
    let driver = sql_driver(&connection);
    let pool = open_sql_pool_for_database(&connection, Some(database.clone())).await?;
    let table_kind = match driver {
        "sqlite" => sqlx::query_scalar::<_, String>("SELECT type FROM sqlite_master WHERE name = ? AND type IN ('table', 'view')")
            .bind(&table).fetch_optional(&pool).await?,
        "mysql" | "tidb" => sqlx::query_scalar::<_, String>("SELECT table_type FROM information_schema.tables WHERE table_schema = ? AND table_name = ?")
            .bind(&database).bind(&table).fetch_optional(&pool).await?,
        "postgres" => sqlx::query_scalar::<_, String>("SELECT table_type FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1")
            .bind(&table).fetch_optional(&pool).await?,
        _ => None,
    };
    if !table_kind
        .as_deref()
        .is_some_and(|kind| kind.to_ascii_uppercase().contains("TABLE"))
    {
        pool.close().await;
        return Err(AppError::Invalid("数据表不存在或当前对象不可清空".into()));
    }
    let table_name = quote_sql_identifier(driver, &table);
    let statement = if driver == "sqlite" {
        format!("DELETE FROM {table_name}")
    } else {
        format!("TRUNCATE TABLE {table_name}")
    };
    let result = sqlx::query(sqlx::AssertSqlSafe(statement.as_str()))
        .execute(&pool)
        .await
        .map(|_| ())
        .map_err(AppError::from);
    pool.close().await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("SQL · 清空表 {database}.{table}"),
        0,
        &result,
    )
    .await;
    result
}

fn dump_sql_literal(value: &Cell, driver: &str) -> String {
    match value {
        Cell::Null => "NULL".into(),
        Cell::Bool(value) => {
            if *value {
                "TRUE".into()
            } else {
                "FALSE".into()
            }
        }
        Cell::Int(value) => value.to_string(),
        Cell::Float(value) if value.is_finite() => value.to_string(),
        Cell::Float(_) => "NULL".into(),
        Cell::Text(value) => {
            if let Some(encoded) = value.strip_prefix("blob:") {
                if let Ok(bytes) = B64.decode(encoded) {
                    let hex = bytes
                        .iter()
                        .map(|byte| format!("{byte:02x}"))
                        .collect::<String>();
                    return if driver == "postgres" {
                        format!("decode('{hex}', 'hex')")
                    } else {
                        format!("X'{hex}'")
                    };
                }
            }
            format!("'{}'", value.replace('\'', "''"))
        }
    }
}

async fn dump_sql_table_inner(
    connection: &Connection,
    driver: &str,
    database: &str,
    table: &str,
    include_data: bool,
) -> AppResult<String> {
    let pool = open_sql_pool_for_database(connection, Some(database.to_string())).await?;
    let result: AppResult<String> = async {
        let columns = load_sql_columns(&pool, driver, database, table).await?;
        if columns.is_empty() { return Err(AppError::Invalid("数据表不存在或无权读取其结构".into())); }
        let table_ident = quote_sql_identifier(driver, &table);
        let qualified = if matches!(driver, "mysql" | "tidb") {
            format!("{}.{}", quote_sql_identifier(driver, database), table_ident)
        } else { table_ident.clone() };
        let create_statement = match driver {
            "mysql" | "tidb" => {
                pool.close().await;
                let mysql_pool = open_mysql_pool_for_database(connection, Some(database.to_string())).await?;
                let show = format!("SHOW CREATE TABLE {table_ident}");
                let row = sqlx::query(sqlx::AssertSqlSafe(show.as_str())).fetch_one(&mysql_pool).await?;
                let create: String = row.try_get(1)?;
                mysql_pool.close().await;
                create
            }
            "sqlite" => {
                let row = sqlx::query("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
                    .bind(table).fetch_one(&pool).await?;
                row.try_get::<String, _>(0)?
            }
            "postgres" => {
                let definitions = columns.iter().map(|column| {
                    let mut definition = format!("  {} {}", quote_sql_identifier(driver, &column.name), column.data_type);
                    if !column.nullable { definition.push_str(" NOT NULL"); }
                    if let Some(default) = column.default_value.as_deref() { definition.push_str(&format!(" DEFAULT {default}")); }
                    definition
                }).collect::<Vec<_>>();
                let mut definitions = definitions;
                let primary: Vec<_> = columns.iter().filter(|column| column.primary_key).map(|column| quote_sql_identifier(driver, &column.name)).collect();
                if !primary.is_empty() { definitions.push(format!("  PRIMARY KEY ({})", primary.join(", "))); }
                format!("CREATE TABLE {table_ident} (\n{}\n);", definitions.join(",\n"))
            }
            _ => return Err(AppError::Invalid("不支持的 SQL 驱动".into())),
        };
        let rows: Vec<Vec<Cell>> = if include_data {
            let select = format!("SELECT * FROM {table_ident}");
            if matches!(driver, "mysql" | "tidb") {
                let mysql_pool = open_mysql_pool_for_database(connection, Some(database.to_string())).await?;
                let rows = sqlx::query(sqlx::AssertSqlSafe(select.as_str())).fetch_all(&mysql_pool).await?;
                mysql_pool.close().await;
                rows.into_iter().map(|row| row.columns().iter().enumerate()
                    .map(|(index, column)| cell_from_mysql_row(&row, index, column.type_info().name())).collect::<Vec<_>>()).collect::<Vec<_>>()
            } else {
                let rows = sqlx::query(sqlx::AssertSqlSafe(select.as_str())).fetch_all(&pool).await?;
                rows.iter().map(|row| row.columns().iter().enumerate()
                    .map(|(index, column)| cell_from_row(row, index, column.type_info().name())).collect::<Vec<_>>()).collect::<Vec<_>>()
            }
        } else {
            Vec::new()
        };
        let create_statement = create_statement.trim_end().trim_end_matches(';');
        let mut output = format!("-- OrangeHub SQL dump\n-- Database: {database}\n-- Table: {table}\n\n{create_statement};\n");
        if !rows.is_empty() {
            let names = columns.iter().map(|column| quote_sql_identifier(driver, &column.name)).collect::<Vec<_>>().join(", ");
            output.push_str("\n");
            for row in rows {
                let values = row.iter().map(|value| dump_sql_literal(value, driver)).collect::<Vec<_>>().join(", ");
                output.push_str(&format!("INSERT INTO {qualified} ({names}) VALUES ({values});\n"));
            }
        }
        Ok(output)
    }.await;
    pool.close().await;
    result
}

async fn list_sql_table_names(
    connection: &Connection,
    driver: &str,
    database: &str,
) -> AppResult<Vec<SqlTable>> {
    let pool = open_sql_pool_for_database(connection, Some(database.to_string())).await?;
    let result = async {
        let rows = match driver {
            "sqlite" => sqlx::query("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
                .fetch_all(&pool).await?,
            "mysql" | "tidb" => sqlx::query("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name")
                .bind(database).fetch_all(&pool).await?,
            "postgres" => sqlx::query("SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = current_schema() ORDER BY table_name")
                .fetch_all(&pool).await?,
            _ => return Err(AppError::Invalid("不支持的 SQL 驱动".into())),
        };
        Ok(rows.into_iter().filter_map(|row| {
            Some(SqlTable {
                name: row.try_get::<String, _>(0).ok()?,
                kind: row.try_get::<String, _>(1).unwrap_or_else(|_| "TABLE".into()),
            })
        }).collect::<Vec<_>>())
    }.await;
    pool.close().await;
    result
}

#[tauri::command]
async fn dump_sql_table(
    state: State<'_, AppState>,
    id: String,
    database: String,
    table: String,
    include_data: bool,
) -> AppResult<String> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    validate_sql_database(&connection, &database)?;
    let driver = sql_driver(&connection);
    let result = dump_sql_table_inner(&connection, driver, &database, &table, include_data).await;
    let dump_kind = if include_data {
        "结构和数据"
    } else {
        "仅结构"
    };
    record_activity_outcome(
        &state.store,
        &id,
        &format!("SQL · 转储表 {database}.{table}（{dump_kind}）"),
        0,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn dump_sql_database(
    state: State<'_, AppState>,
    id: String,
    database: String,
    include_data: bool,
) -> AppResult<String> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    validate_sql_database(&connection, &database)?;
    let driver = sql_driver(&connection);
    let result: AppResult<String> = async {
        let tables = list_sql_table_names(&connection, driver, &database).await?;
        let mut output = format!(
            "-- OrangeHub SQL dump\n-- Database: {database}\n-- Exported at: {}\n",
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
        );
        for table in tables {
            if !table.kind.to_ascii_uppercase().contains("TABLE") {
                continue;
            }
            let dump =
                dump_sql_table_inner(&connection, driver, &database, &table.name, include_data)
                    .await?;
            output.push_str("\n");
            output.push_str(&dump);
        }
        Ok(output)
    }
    .await;
    let dump_kind = if include_data {
        "结构和数据"
    } else {
        "仅结构"
    };
    record_activity_outcome(
        &state.store,
        &id,
        &format!("SQL · 转储数据库 {database}（{dump_kind}）"),
        0,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn rename_sql_database(
    state: State<'_, AppState>,
    id: String,
    database: String,
    target: String,
) -> AppResult<()> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    let driver = sql_driver(&connection);
    validate_sql_database_name(driver, &database)?;
    validate_sql_database_name(driver, &target)?;
    if database.trim() == target.trim() {
        return Err(AppError::Invalid("新数据库名称与原名称相同".into()));
    }
    if driver != "postgres" {
        return Err(AppError::Invalid("当前数据库类型不支持重命名数据库".into()));
    }
    let pool = open_sql_admin_pool(&connection, driver).await?;
    let statement = format!(
        "ALTER DATABASE {} RENAME TO {}",
        quote_sql_identifier(driver, database.trim()),
        quote_sql_identifier(driver, target.trim())
    );
    let result = sqlx::query(sqlx::AssertSqlSafe(statement.as_str()))
        .execute(&pool)
        .await
        .map(|_| ())
        .map_err(AppError::from);
    pool.close().await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("SQL · 重命名数据库 {database} → {target}"),
        0,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn run_sql_file(
    state: State<'_, AppState>,
    id: String,
    database: Option<String>,
    path: String,
) -> AppResult<QueryResult> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    if let Some(database) = database.as_deref() {
        validate_sql_database(&connection, database)?;
    }
    let started = Instant::now();
    let driver = sql_driver(&connection);
    let sql = tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| AppError::Invalid(format!("无法读取 SQL 文件: {error}")))?;
    if sql.trim().is_empty() {
        return Err(AppError::Invalid("SQL 文件内容为空".into()));
    }
    let result: AppResult<QueryResult> = async {
        if driver == "mssql" || driver == "oracle" {
            if driver == "mssql" {
                execute_mssql_statement(&connection, &sql, database.as_deref(), started).await
            } else {
                execute_oracle_statement(&connection, &sql, database.as_deref(), started).await
            }
        } else if matches!(driver, "mysql" | "tidb") {
            let pool = open_mysql_pool_for_database(&connection, database.clone()).await?;
            let outcome = sqlx::raw_sql(sqlx::AssertSqlSafe(sql.as_str()))
                .execute::<_, sqlx::MySql>(&pool)
                .await;
            pool.close().await;
            let outcome = outcome?;
            Ok(QueryResult::exec(
                outcome.rows_affected(),
                started.elapsed().as_millis() as u64,
                Some(format!("文件执行完成,{} 行受影响", outcome.rows_affected())),
            ))
        } else {
            let pool = open_sql_pool_for_database(&connection, database.clone()).await?;
            let outcome = sqlx::raw_sql(sqlx::AssertSqlSafe(sql.as_str()))
                .execute::<_, Any>(&pool)
                .await;
            pool.close().await;
            let outcome = outcome?;
            Ok(QueryResult::exec(
                outcome.rows_affected(),
                started.elapsed().as_millis() as u64,
                Some(format!("文件执行完成,{} 行受影响", outcome.rows_affected())),
            ))
        }
    }
    .await;
    let label = database
        .as_deref()
        .map(|database| format!("{database} · 运行 {path}"))
        .unwrap_or_else(|| format!("运行 {path}"));
    record_activity_outcome(
        &state.store,
        &id,
        &format!("SQL · {label}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn get_sql_table_data(
    state: State<'_, AppState>,
    id: String,
    database: String,
    table: String,
    page: u32,
    page_size: u32,
) -> AppResult<SqlTableData> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    validate_sql_database(&connection, &database)?;
    let driver = sql_driver(&connection);
    if driver == "mssql" {
        return get_mssql_table_data(&connection, &database, &table, page, page_size).await;
    }
    if driver == "oracle" {
        return get_oracle_table_data(&connection, &database, &table, page, page_size).await;
    }
    let pool = open_sql_pool_for_database(&connection, Some(database.clone())).await?;
    let result = async {
        let columns = load_sql_columns(&pool, driver, &database, &table).await?;
        if columns.is_empty() {
            return Err(AppError::Invalid(
                "数据表不存在，或当前账号无权读取其结构".into(),
            ));
        }
        let primary_key: Vec<String> = columns
            .iter()
            .filter(|column| column.primary_key)
            .map(|column| column.name.clone())
            .collect();
        let table_sql = quote_sql_identifier(driver, &table);
        let count_sql = format!("SELECT COUNT(*) FROM {table_sql}");
        let count_row = sqlx::query(sqlx::AssertSqlSafe(count_sql.as_str()))
            .fetch_one(&pool)
            .await?;
        let total_rows = count_row.try_get::<i64, _>(0).unwrap_or(0).max(0) as u64;
        let page = page.max(1);
        let page_size = page_size.clamp(10, 200);
        let offset = (page.saturating_sub(1) as u64).saturating_mul(page_size as u64);
        let statement = format!("SELECT * FROM {table_sql} LIMIT {page_size} OFFSET {offset}");
        let data = if matches!(driver, "mysql" | "tidb") {
            pool.close().await;
            let mysql_pool =
                open_mysql_pool_for_database(&connection, Some(database.clone())).await?;
            let rows_result = sqlx::query(sqlx::AssertSqlSafe(statement.as_str()))
                .fetch_all(&mysql_pool)
                .await;
            mysql_pool.close().await;
            let rows = rows_result?;
            rows.iter()
                .map(|row| {
                    row.columns()
                        .iter()
                        .enumerate()
                        .map(|(index, column)| {
                            cell_from_mysql_row(row, index, column.type_info().name())
                        })
                        .collect()
                })
                .collect()
        } else {
            let rows = sqlx::query(sqlx::AssertSqlSafe(statement.as_str()))
                .fetch_all(&pool)
                .await?;
            rows.iter()
                .map(|row| {
                    row.columns()
                        .iter()
                        .enumerate()
                        .map(|(index, column)| cell_from_row(row, index, column.type_info().name()))
                        .collect()
                })
                .collect()
        };
        Ok(SqlTableData {
            columns,
            rows: data,
            primary_key,
            total_rows,
            page,
            page_size,
        })
    }
    .await;
    pool.close().await;
    result
}

#[tauri::command]
async fn update_sql_table_structure(
    state: State<'_, AppState>,
    id: String,
    database: String,
    table: String,
    mut columns: Vec<SqlColumn>,
) -> AppResult<()> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    validate_sql_database(&connection, &database)?;
    if table.trim().is_empty() {
        return Err(AppError::Invalid("请选择数据表".into()));
    }
    let driver = sql_driver(&connection);
    let started = Instant::now();
    let pool = open_sql_pool_for_database(&connection, Some(database.clone())).await?;
    let result: AppResult<()> = async {
        let existing = load_sql_columns(&pool, driver, &database, &table).await?;
        if existing.is_empty() {
            return Err(AppError::Invalid(
                "数据表不存在，或当前账号无权读取其结构".into(),
            ));
        }
        validate_sql_table_structure(&existing, &mut columns, driver)?;
        apply_sql_table_structure(&pool, driver, &table, &existing, &columns).await
    }
    .await;
    pool.close().await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("SQL · 修改结构 {database}.{table}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn insert_sql_row(
    state: State<'_, AppState>,
    id: String,
    database: String,
    table: String,
    columns: Vec<String>,
    values: Vec<Cell>,
) -> AppResult<u64> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    validate_sql_database(&connection, &database)?;
    if columns.len() != values.len() {
        return Err(AppError::Invalid("新增行的列和值数量不一致".into()));
    }
    let driver = sql_driver(&connection);
    let started = Instant::now();
    let pool = open_sql_pool_for_database(&connection, Some(database.clone())).await?;
    let result = async {
        let metadata = load_sql_columns(&pool, driver, &database, &table).await?;
        validate_sql_columns(&metadata, &columns)?;
        let table_sql = quote_sql_identifier(driver, &table);
        let statement = if columns.is_empty() {
            match driver {
                "mysql" | "tidb" => format!("INSERT INTO {table_sql} () VALUES ()"),
                _ => format!("INSERT INTO {table_sql} DEFAULT VALUES"),
            }
        } else {
            let names = columns
                .iter()
                .map(|column| quote_sql_identifier(driver, column))
                .collect::<Vec<_>>()
                .join(", ");
            let mut query =
                QueryBuilder::<Any>::new(format!("INSERT INTO {table_sql} ({names}) VALUES ("));
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    query.push(", ");
                }
                let data_type = metadata
                    .iter()
                    .find(|column| column.name == columns[index])
                    .map(|column| column.data_type.as_str())
                    .unwrap_or("");
                push_typed_sql_bind(&mut query, value, driver, data_type);
            }
            query.push(")");
            return Ok(query.build().execute(&pool).await?.rows_affected());
        };
        Ok(sqlx::query(sqlx::AssertSqlSafe(statement.as_str()))
            .execute(&pool)
            .await?
            .rows_affected())
    }
    .await;
    pool.close().await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("SQL · 新增 {database}.{table}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn update_sql_cell(
    state: State<'_, AppState>,
    id: String,
    database: String,
    table: String,
    primary_key: Vec<String>,
    key_values: Vec<Cell>,
    column: String,
    value: Cell,
) -> AppResult<u64> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    validate_sql_database(&connection, &database)?;
    if primary_key.is_empty() || primary_key.len() != key_values.len() {
        return Err(AppError::Invalid("此表没有可用于安全编辑的主键".into()));
    }
    let driver = sql_driver(&connection);
    let started = Instant::now();
    let pool = open_sql_pool_for_database(&connection, Some(database.clone())).await?;
    let result = async {
        let metadata = load_sql_columns(&pool, driver, &database, &table).await?;
        validate_sql_columns(&metadata, std::slice::from_ref(&column))?;
        validate_sql_primary_key(&metadata, &primary_key)?;
        let table_sql = quote_sql_identifier(driver, &table);
        let mut query = QueryBuilder::<Any>::new(format!(
            "UPDATE {table_sql} SET {} = ",
            quote_sql_identifier(driver, &column)
        ));
        let data_type = metadata
            .iter()
            .find(|item| item.name == column)
            .map(|item| item.data_type.as_str())
            .unwrap_or("");
        push_typed_sql_bind(&mut query, &value, driver, data_type);
        query.push(" WHERE ");
        push_key_conditions(&mut query, driver, &metadata, &primary_key, &key_values);
        let affected = query.build().execute(&pool).await?.rows_affected();
        if affected > 1 {
            return Err(AppError::Sql("主键条件匹配了多行，已拒绝此修改".into()));
        }
        Ok(affected)
    }
    .await;
    pool.close().await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("SQL · 修改 {database}.{table}.{column}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn delete_sql_row(
    state: State<'_, AppState>,
    id: String,
    database: String,
    table: String,
    primary_key: Vec<String>,
    key_values: Vec<Cell>,
) -> AppResult<u64> {
    let connection = load_connection(&state, &id).await?;
    ensure_sql_connection(&connection)?;
    validate_sql_database(&connection, &database)?;
    if primary_key.is_empty() || primary_key.len() != key_values.len() {
        return Err(AppError::Invalid("此表没有可用于安全删除的主键".into()));
    }
    let driver = sql_driver(&connection);
    let started = Instant::now();
    let pool = open_sql_pool_for_database(&connection, Some(database.clone())).await?;
    let result = async {
        let metadata = load_sql_columns(&pool, driver, &database, &table).await?;
        validate_sql_primary_key(&metadata, &primary_key)?;
        let table_sql = quote_sql_identifier(driver, &table);
        let mut query = QueryBuilder::<Any>::new(format!("DELETE FROM {table_sql} WHERE "));
        push_key_conditions(&mut query, driver, &metadata, &primary_key, &key_values);
        let affected = query.build().execute(&pool).await?.rows_affected();
        if affected > 1 {
            return Err(AppError::Sql("主键条件匹配了多行，已拒绝此删除".into()));
        }
        Ok(affected)
    }
    .await;
    pool.close().await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("SQL · 删除 {database}.{table}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn execute_redis(
    state: State<'_, AppState>,
    id: String,
    command: String,
    database: Option<i64>,
) -> AppResult<String> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Redis {
        return Err(AppError::Invalid("此连接不是 Redis".into()));
    }
    let parts: Vec<String> = command.split_whitespace().map(str::to_string).collect();
    let name = parts
        .first()
        .ok_or_else(|| AppError::Invalid("Redis 命令不能为空".into()))?
        .to_ascii_uppercase();
    let started = Instant::now();
    let result: AppResult<String> = match tokio::time::timeout(SQL_EXECUTION_TIMEOUT, async {
        let client = redis::Client::open(redis_uri_for_db(&connection, database)?.as_str())?;
        let mut stream = client.get_multiplexed_async_connection().await?;
        let mut request = redis::cmd(&name);
        for part in parts.iter().skip(1) {
            request.arg(part);
        }
        let value: redis::Value = request.query_async(&mut stream).await?;
        Ok(format!("{value:#?}"))
    })
    .await
    {
        Ok(result) => result,
        Err(_) => Err(AppError::Redis(
            "Redis 命令执行超时（30 秒），请检查服务器状态".into(),
        )),
    };
    match result {
        Ok(output) => {
            record_activity(
                &state.store,
                &id,
                &format!("Redis · {name}"),
                true,
                started.elapsed().as_millis() as u64,
                None,
            )
            .await;
            Ok(output)
        }
        Err(error) => {
            let message = error.to_string();
            record_activity(
                &state.store,
                &id,
                &format!("Redis · {name}"),
                false,
                started.elapsed().as_millis() as u64,
                Some(&message),
            )
            .await;
            Err(error)
        }
    }
}

fn redis_display_bytes(bytes: Vec<u8>) -> String {
    String::from_utf8(bytes)
        .unwrap_or_else(|bytes| format!("[二进制数据] base64:{}", B64.encode(bytes.into_bytes())))
}

fn redis_value_bytes(value: redis::Value, label: &str) -> AppResult<Vec<u8>> {
    match value {
        redis::Value::BulkString(bytes) => Ok(bytes),
        redis::Value::SimpleString(value) => Ok(value.into_bytes()),
        redis::Value::Int(value) => Ok(value.to_string().into_bytes()),
        redis::Value::Attribute { data, .. } => redis_value_bytes(*data, label),
        _ => Err(AppError::Redis(format!(
            "Redis 返回了无法解析的 {label} 数据"
        ))),
    }
}

fn redis_key_bytes(key: &str, key_token: Option<&str>) -> Vec<u8> {
    key_token
        .and_then(|token| B64.decode(token).ok())
        .unwrap_or_else(|| key.as_bytes().to_vec())
}

#[tauri::command]
async fn list_redis_databases(state: State<'_, AppState>, id: String) -> AppResult<Vec<i64>> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Redis {
        return Err(AppError::Invalid("此连接不是 Redis".into()));
    }
    let client = redis::Client::open(redis_uri(&connection)?.as_str())?;
    let mut stream = client.get_multiplexed_async_connection().await?;
    let configured = redis::cmd("CONFIG")
        .arg("GET")
        .arg("databases")
        .query_async::<redis::Value>(&mut stream)
        .await
        .ok()
        .and_then(|value| match value {
            redis::Value::Array(values) => values.into_iter().nth(1),
            redis::Value::Map(values) => values.into_iter().find_map(|(key, value)| {
                (redis_value_bytes(key, "数据库配置键")
                    .ok()?
                    .eq_ignore_ascii_case(b"databases"))
                .then_some(value)
            }),
            _ => None,
        })
        .and_then(|value| redis_value_bytes(value, "数据库数量").ok())
        .and_then(|value| String::from_utf8_lossy(&value).parse::<i64>().ok());
    let count = configured.unwrap_or(16).clamp(1, 1024);
    Ok((0..count).collect())
}

#[tauri::command]
async fn scan_redis_keys(
    state: State<'_, AppState>,
    id: String,
    pattern: String,
    cursor: u64,
    count: u32,
    database: Option<i64>,
) -> AppResult<RedisKeyPage> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Redis {
        return Err(AppError::Invalid("此连接不是 Redis".into()));
    }
    let client = redis::Client::open(redis_uri_for_db(&connection, database)?.as_str())?;
    let mut stream = client.get_multiplexed_async_connection().await?;
    let pattern = if pattern.is_empty() {
        "*"
    } else {
        pattern.as_str()
    };
    let count = count.clamp(10, 200);
    // Decode SCAN as raw RESP values. Redis keys are arbitrary bytes and must
    // never pass through String/UTF-8 conversion while building the key list.
    let response: redis::Value = redis::cmd("SCAN")
        .arg(cursor)
        .arg("MATCH")
        .arg(pattern)
        .arg("COUNT")
        .arg(count)
        .query_async(&mut stream)
        .await?;
    let mut response = match response {
        redis::Value::Attribute { data, .. } => *data,
        value => value,
    };
    let values = match &mut response {
        redis::Value::Array(values) if values.len() >= 2 => values,
        _ => return Err(AppError::Redis("SCAN 返回的数据格式无效".into())),
    };
    let key_values = match values
        .pop()
        .ok_or_else(|| AppError::Redis("SCAN 缺少键列表".into()))?
    {
        redis::Value::Array(keys) | redis::Value::Set(keys) => keys,
        _ => return Err(AppError::Redis("SCAN 返回的键列表格式无效".into())),
    };
    let cursor_value = values
        .pop()
        .ok_or_else(|| AppError::Redis("SCAN 缺少游标".into()))?;
    let cursor_bytes = redis_value_bytes(cursor_value, "SCAN 游标")?;
    let next_cursor = String::from_utf8_lossy(&cursor_bytes)
        .parse::<u64>()
        .map_err(|_| AppError::Redis("SCAN 返回的游标无效".into()))?;
    let keys = key_values
        .into_iter()
        .map(|value| redis_value_bytes(value, "键名"))
        .collect::<AppResult<Vec<_>>>()?;
    let mut items = Vec::with_capacity(keys.len());
    for key in keys {
        let display_key = redis_display_bytes(key.clone());
        let kind_value: redis::Value = redis::cmd("TYPE")
            .arg(&key)
            .query_async(&mut stream)
            .await?;
        let kind = String::from_utf8_lossy(&redis_value_bytes(kind_value, "键类型")?).into_owned();
        let ttl_value: redis::Value = redis::cmd("TTL").arg(&key).query_async(&mut stream).await?;
        let ttl = String::from_utf8_lossy(&redis_value_bytes(ttl_value, "键过期时间")?)
            .parse::<i64>()
            .map_err(|_| AppError::Redis("Redis 返回的键过期时间无效".into()))?;
        items.push(RedisKeyInfo {
            key: display_key,
            key_token: B64.encode(key),
            kind,
            ttl,
        });
    }
    Ok(RedisKeyPage {
        cursor: next_cursor,
        keys: items,
    })
}

#[tauri::command]
async fn get_redis_key_detail(
    state: State<'_, AppState>,
    id: String,
    key: String,
    database: Option<i64>,
    key_token: Option<String>,
) -> AppResult<RedisKeyDetail> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Redis {
        return Err(AppError::Invalid("此连接不是 Redis".into()));
    }
    let client = redis::Client::open(redis_uri_for_db(&connection, database)?.as_str())?;
    let mut stream = client.get_multiplexed_async_connection().await?;
    let key_bytes = redis_key_bytes(&key, key_token.as_deref());
    let kind: String = redis::cmd("TYPE")
        .arg(&key_bytes)
        .query_async(&mut stream)
        .await?;
    let ttl: i64 = redis::cmd("TTL")
        .arg(&key_bytes)
        .query_async(&mut stream)
        .await?;
    let value = match kind.as_str() {
        "string" => redis::cmd("GET")
            .arg(&key_bytes)
            .query_async::<Option<Vec<u8>>>(&mut stream)
            .await?
            .map(redis_display_bytes)
            .unwrap_or_default(),
        "hash" => {
            let value: Vec<(Vec<u8>, Vec<u8>)> = redis::cmd("HGETALL")
                .arg(&key_bytes)
                .query_async(&mut stream)
                .await?;
            let value: Vec<(String, String)> = value
                .into_iter()
                .map(|(field, value)| (redis_display_bytes(field), redis_display_bytes(value)))
                .collect();
            serde_json::to_string_pretty(&value)?
        }
        "list" => {
            let value: Vec<Vec<u8>> = redis::cmd("LRANGE")
                .arg(&key_bytes)
                .arg(0)
                .arg(-1)
                .query_async(&mut stream)
                .await?;
            let value: Vec<String> = value.into_iter().map(redis_display_bytes).collect();
            serde_json::to_string_pretty(&value)?
        }
        "set" => {
            let value: Vec<Vec<u8>> = redis::cmd("SMEMBERS")
                .arg(&key_bytes)
                .query_async(&mut stream)
                .await?;
            let value: Vec<String> = value.into_iter().map(redis_display_bytes).collect();
            serde_json::to_string_pretty(&value)?
        }
        "zset" => {
            let value: Vec<(Vec<u8>, f64)> = redis::cmd("ZRANGE")
                .arg(&key_bytes)
                .arg(0)
                .arg(-1)
                .arg("WITHSCORES")
                .query_async(&mut stream)
                .await?;
            let value: Vec<(String, f64)> = value
                .into_iter()
                .map(|(member, score)| (redis_display_bytes(member), score))
                .collect();
            serde_json::to_string_pretty(&value)?
        }
        "none" => return Err(AppError::NotFound(key)),
        _ => format!("此键类型暂不支持可视化展示：{kind}"),
    };
    Ok(RedisKeyDetail {
        key,
        key_token: key_token.unwrap_or_else(|| B64.encode(key_bytes)),
        kind,
        ttl,
        value,
    })
}

#[tauri::command]
async fn set_redis_string(
    state: State<'_, AppState>,
    id: String,
    key: String,
    value: String,
    ttl_seconds: Option<u64>,
    database: Option<i64>,
    key_token: Option<String>,
) -> AppResult<()> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Redis {
        return Err(AppError::Invalid("此连接不是 Redis".into()));
    }
    if key.is_empty() {
        return Err(AppError::Invalid("Redis 键名不能为空".into()));
    }
    let started = Instant::now();
    let result: AppResult<()> = async {
        let client = redis::Client::open(redis_uri_for_db(&connection, database)?.as_str())?;
        let mut stream = client.get_multiplexed_async_connection().await?;
        let mut command = redis::cmd("SET");
        let key_bytes = redis_key_bytes(&key, key_token.as_deref());
        command.arg(&key_bytes).arg(&value);
        if let Some(ttl) = ttl_seconds.filter(|ttl| *ttl > 0) {
            command.arg("EX").arg(ttl);
        }
        let _: String = command.query_async(&mut stream).await?;
        Ok(())
    }
    .await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("Redis · 写入 {key}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn delete_redis_key(
    state: State<'_, AppState>,
    id: String,
    key: String,
    database: Option<i64>,
    key_token: Option<String>,
) -> AppResult<u64> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Redis {
        return Err(AppError::Invalid("此连接不是 Redis".into()));
    }
    let started = Instant::now();
    let result: AppResult<u64> = async {
        let client = redis::Client::open(redis_uri_for_db(&connection, database)?.as_str())?;
        let mut stream = client.get_multiplexed_async_connection().await?;
        let key_bytes = redis_key_bytes(&key, key_token.as_deref());
        let removed: u64 = redis::cmd("DEL")
            .arg(&key_bytes)
            .query_async(&mut stream)
            .await?;
        Ok(removed)
    }
    .await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("Redis · 删除 {key}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn execute_mongo(
    state: State<'_, AppState>,
    id: String,
    command: String,
) -> AppResult<serde_json::Value> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Mongo {
        return Err(AppError::Invalid("此连接不是 MongoDB".into()));
    }
    let value: serde_json::Value = serde_json::from_str(&command)
        .map_err(|error| AppError::Invalid(format!("JSON 命令格式错误: {error}")))?;
    let command_name = value
        .as_object()
        .and_then(|object| object.keys().next())
        .cloned()
        .unwrap_or_else(|| "command".into());
    let started = Instant::now();
    let result: AppResult<serde_json::Value> =
        match tokio::time::timeout(SQL_EXECUTION_TIMEOUT, async {
            let document = mongodb::bson::to_document(&value)
                .map_err(|error| AppError::Invalid(format!("MongoDB 命令格式错误: {error}")))?;
            let client = mongodb::Client::with_uri_str(mongo_uri(&connection)?).await?;
            let database = connection
                .database
                .as_deref()
                .filter(|name| !name.is_empty())
                .unwrap_or("admin");
            let result = client.database(database).run_command(document).await?;
            serde_json::to_value(result).map_err(AppError::from)
        })
        .await
        {
            Ok(result) => result,
            Err(_) => Err(AppError::Mongo(
                "MongoDB 命令执行超时（30 秒），请检查服务器状态".into(),
            )),
        };
    match result {
        Ok(value) => {
            record_activity(
                &state.store,
                &id,
                &format!("MongoDB · {command_name}"),
                true,
                started.elapsed().as_millis() as u64,
                None,
            )
            .await;
            Ok(value)
        }
        Err(error) => {
            let message = error.to_string();
            record_activity(
                &state.store,
                &id,
                &format!("MongoDB · {command_name}"),
                false,
                started.elapsed().as_millis() as u64,
                Some(&message),
            )
            .await;
            Err(error)
        }
    }
}

#[tauri::command]
async fn list_mongo_databases(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<MongoDatabaseInfo>> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Mongo {
        return Err(AppError::Invalid("此连接不是 MongoDB".into()));
    }
    let client = mongodb::Client::with_uri_str(mongo_uri(&connection)?).await?;
    Ok(client
        .list_database_names()
        .await?
        .into_iter()
        .map(|name| MongoDatabaseInfo { name })
        .collect())
}

#[tauri::command]
async fn list_mongo_collections(
    state: State<'_, AppState>,
    id: String,
    database: String,
) -> AppResult<Vec<MongoCollectionInfo>> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Mongo {
        return Err(AppError::Invalid("此连接不是 MongoDB".into()));
    }
    if database.trim().is_empty() {
        return Err(AppError::Invalid("请选择 MongoDB 数据库".into()));
    }
    let client = mongodb::Client::with_uri_str(mongo_uri(&connection)?).await?;
    Ok(client
        .database(&database)
        .list_collection_names()
        .await?
        .into_iter()
        .map(|name| MongoCollectionInfo { name })
        .collect())
}

#[tauri::command]
async fn get_mongo_documents(
    state: State<'_, AppState>,
    id: String,
    database: String,
    collection_name: String,
    page: u32,
    page_size: u32,
) -> AppResult<MongoDocumentPage> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Mongo {
        return Err(AppError::Invalid("此连接不是 MongoDB".into()));
    }
    if database.trim().is_empty() || collection_name.trim().is_empty() {
        return Err(AppError::Invalid("请选择数据库和集合".into()));
    }
    let client = mongodb::Client::with_uri_str(mongo_uri(&connection)?).await?;
    let collection = client
        .database(&database)
        .collection::<mongodb::bson::Document>(&collection_name);
    let page = page.max(1);
    let page_size = page_size.clamp(10, 200);
    let offset = (page.saturating_sub(1) as u64).saturating_mul(page_size as u64);
    let total = collection
        .count_documents(mongodb::bson::Document::new())
        .await?;
    let options = mongodb::options::FindOptions::builder()
        .skip(offset)
        .limit(page_size as i64)
        .build();
    let mut cursor = collection
        .find(mongodb::bson::Document::new())
        .with_options(options)
        .await?;
    let mut documents = Vec::with_capacity(page_size as usize);
    while let Some(document) = cursor.try_next().await? {
        let id_value = document
            .get("_id")
            .cloned()
            .unwrap_or(mongodb::bson::Bson::Null)
            .into_relaxed_extjson();
        let document_value = mongodb::bson::Bson::Document(document).into_relaxed_extjson();
        documents.push(MongoDocumentRow {
            id: serde_json::to_string(&id_value)?,
            document: serde_json::to_string_pretty(&document_value)?,
        });
    }
    Ok(MongoDocumentPage {
        documents,
        total,
        page,
        page_size,
    })
}

#[tauri::command]
async fn insert_mongo_document(
    state: State<'_, AppState>,
    id: String,
    database: String,
    collection_name: String,
    document: String,
) -> AppResult<()> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Mongo {
        return Err(AppError::Invalid("此连接不是 MongoDB".into()));
    }
    let started = Instant::now();
    let result: AppResult<()> = async {
        let value: serde_json::Value = serde_json::from_str(&document)
            .map_err(|error| AppError::Invalid(format!("JSON 文档格式错误: {error}")))?;
        let bson = mongodb::bson::Bson::try_from(value)
            .map_err(|error| AppError::Invalid(format!("Extended JSON 格式错误: {error}")))?;
        let document = bson
            .as_document()
            .cloned()
            .ok_or_else(|| AppError::Invalid("MongoDB 文档必须是 JSON 对象".into()))?;
        let client = mongodb::Client::with_uri_str(mongo_uri(&connection)?).await?;
        client
            .database(&database)
            .collection::<mongodb::bson::Document>(&collection_name)
            .insert_one(document)
            .await?;
        Ok(())
    }
    .await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("MongoDB · 新增 {database}.{collection_name}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn replace_mongo_document(
    state: State<'_, AppState>,
    id: String,
    database: String,
    collection_name: String,
    document_id: String,
    document: String,
) -> AppResult<u64> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Mongo {
        return Err(AppError::Invalid("此连接不是 MongoDB".into()));
    }
    let started = Instant::now();
    let result: AppResult<u64> = async {
        let id_value: serde_json::Value = serde_json::from_str(&document_id)
            .map_err(|error| AppError::Invalid(format!("文档 ID 格式错误: {error}")))?;
        let id_bson = mongodb::bson::Bson::try_from(id_value)
            .map_err(|error| AppError::Invalid(format!("文档 ID 格式错误: {error}")))?;
        let value: serde_json::Value = serde_json::from_str(&document)
            .map_err(|error| AppError::Invalid(format!("JSON 文档格式错误: {error}")))?;
        let bson = mongodb::bson::Bson::try_from(value)
            .map_err(|error| AppError::Invalid(format!("Extended JSON 格式错误: {error}")))?;
        let mut document = bson
            .as_document()
            .cloned()
            .ok_or_else(|| AppError::Invalid("MongoDB 文档必须是 JSON 对象".into()))?;
        if document
            .get("_id")
            .map(|value| value != &id_bson)
            .unwrap_or(false)
        {
            return Err(AppError::Invalid("编辑文档时不能修改 _id".into()));
        }
        document.insert("_id", id_bson.clone());
        let client = mongodb::Client::with_uri_str(mongo_uri(&connection)?).await?;
        let filter = mongodb::bson::doc! { "_id": id_bson };
        let result = client
            .database(&database)
            .collection::<mongodb::bson::Document>(&collection_name)
            .replace_one(filter, document)
            .await?;
        Ok(result.matched_count)
    }
    .await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("MongoDB · 修改 {database}.{collection_name}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

#[tauri::command]
async fn delete_mongo_document(
    state: State<'_, AppState>,
    id: String,
    database: String,
    collection_name: String,
    document_id: String,
) -> AppResult<u64> {
    let connection = load_connection(&state, &id).await?;
    if connection.kind != ConnKind::Mongo {
        return Err(AppError::Invalid("此连接不是 MongoDB".into()));
    }
    let started = Instant::now();
    let result: AppResult<u64> = async {
        let id_value: serde_json::Value = serde_json::from_str(&document_id)
            .map_err(|error| AppError::Invalid(format!("文档 ID 格式错误: {error}")))?;
        let id_bson = mongodb::bson::Bson::try_from(id_value)
            .map_err(|error| AppError::Invalid(format!("文档 ID 格式错误: {error}")))?;
        let client = mongodb::Client::with_uri_str(mongo_uri(&connection)?).await?;
        let filter = mongodb::bson::doc! { "_id": id_bson };
        let result = client
            .database(&database)
            .collection::<mongodb::bson::Document>(&collection_name)
            .delete_one(filter)
            .await?;
        Ok(result.deleted_count)
    }
    .await;
    record_activity_outcome(
        &state.store,
        &id,
        &format!("MongoDB · 删除 {database}.{collection_name}"),
        started.elapsed().as_millis() as u64,
        &result,
    )
    .await;
    result
}

fn ensure_sql_connection(connection: &Connection) -> AppResult<()> {
    if connection.kind != ConnKind::Sql {
        return Err(AppError::Invalid("此连接不是 SQL 数据库".into()));
    }
    Ok(())
}

fn sql_driver(connection: &Connection) -> &str {
    match connection.sql_driver.as_deref().unwrap_or("mysql") {
        // These products expose a MySQL-compatible wire protocol and use the
        // same SQL metadata and editing queries as the MySQL implementation.
        "mariadb" | "oceanbase" | "doris" | "starrocks" | "clickhouse" => "mysql",
        // These products expose the PostgreSQL protocol and catalog layout.
        "cockroachdb" | "neon" => "postgres",
        driver => driver,
    }
}

fn validate_sql_database(connection: &Connection, database: &str) -> AppResult<()> {
    if database.trim().is_empty() {
        return Err(AppError::Invalid("请选择数据库".into()));
    }
    if sql_driver(connection) == "sqlite" && database != "main" {
        return Err(AppError::Invalid("SQLite 当前仅支持 main 数据库".into()));
    }
    Ok(())
}

fn quote_sql_identifier(driver: &str, identifier: &str) -> String {
    if driver == "mssql" {
        format!("[{}]", identifier.replace(']', "]]"))
    } else if matches!(driver, "mysql" | "tidb") {
        format!("`{}`", identifier.replace('`', "``"))
    } else {
        format!("\"{}\"", identifier.replace('"', "\"\""))
    }
}

fn validate_sql_columns(columns: &[SqlColumn], requested: &[String]) -> AppResult<()> {
    if requested
        .iter()
        .any(|requested| !columns.iter().any(|column| &column.name == requested))
    {
        return Err(AppError::Invalid("列不存在，请刷新数据表后重试".into()));
    }
    Ok(())
}

fn validate_sql_primary_key(columns: &[SqlColumn], requested: &[String]) -> AppResult<()> {
    let actual: Vec<&str> = columns
        .iter()
        .filter(|column| column.primary_key)
        .map(|column| column.name.as_str())
        .collect();
    let requested: Vec<&str> = requested.iter().map(String::as_str).collect();
    if actual.is_empty() || actual != requested {
        return Err(AppError::Invalid("数据表主键已变化，请刷新后重试".into()));
    }
    Ok(())
}

async fn load_sql_columns(
    pool: &sqlx::AnyPool,
    driver: &str,
    database: &str,
    table: &str,
) -> AppResult<Vec<SqlColumn>> {
    let rows = match driver {
        "sqlite" => {
            let statement = format!("PRAGMA table_info({})", quote_sql_identifier(driver, table));
            sqlx::query(sqlx::AssertSqlSafe(statement.as_str())).fetch_all(pool).await?
        }
        "mysql" | "tidb" => sqlx::query(
            "SELECT column_name, column_type, is_nullable, column_key, column_default, extra, column_comment, character_set_name, collation_name FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position"
        ).bind(database).bind(table).fetch_all(pool).await?,
        "postgres" => {
            let placeholder = if driver == "postgres" { "$1" } else { "?" };
            let statement = format!(
                "SELECT c.column_name, CASE WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name WHEN c.character_maximum_length IS NOT NULL AND c.data_type IN ('character varying', 'character') THEN c.data_type || '(' || c.character_maximum_length || ')' WHEN c.data_type = 'numeric' AND c.numeric_precision IS NOT NULL THEN c.data_type || '(' || c.numeric_precision || ',' || COALESCE(c.numeric_scale, 0) || ')' ELSE c.data_type END AS data_type, c.is_nullable, c.column_default, COALESCE(col_description(format('%I.%I', c.table_schema, c.table_name)::regclass, c.ordinal_position), '') AS column_comment, EXISTS (SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND kcu.column_name = c.column_name) AS is_primary_key FROM information_schema.columns c WHERE c.table_schema = current_schema() AND c.table_name = {placeholder} ORDER BY c.ordinal_position"
            );
            sqlx::query(sqlx::AssertSqlSafe(statement.as_str())).bind(table).fetch_all(pool).await?
        }
        _ => return Err(AppError::Invalid("不支持的 SQL 驱动".into())),
    };
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let name = row
                .try_get::<String, _>("column_name")
                .or_else(|_| row.try_get::<String, _>("name"))
                .ok()?;
            let data_type = row
                .try_get::<String, _>("column_type")
                .or_else(|_| row.try_get::<String, _>("data_type"))
                .or_else(|_| row.try_get::<String, _>("type"))
                .unwrap_or_default();
            let nullable_text = row.try_get::<String, _>("is_nullable").unwrap_or_default();
            let primary_key = if driver == "sqlite" {
                row.try_get::<i64, _>("pk").unwrap_or(0) > 0
            } else if matches!(driver, "mysql" | "tidb") {
                row.try_get::<String, _>("column_key")
                    .map(|key| key == "PRI")
                    .unwrap_or(false)
            } else {
                row.try_get::<bool, _>("is_primary_key").unwrap_or(false)
            };
            let nullable = if driver == "sqlite" {
                row.try_get::<i64, _>("notnull").unwrap_or(0) == 0 && !primary_key
            } else if matches!(driver, "mysql" | "tidb") {
                nullable_text.eq_ignore_ascii_case("YES")
            } else {
                nullable_text.eq_ignore_ascii_case("YES")
            };
            let default_value = match driver {
                "sqlite" => row
                    .try_get::<Option<String>, _>("dflt_value")
                    .unwrap_or(None),
                "mysql" | "tidb" | "postgres" => row
                    .try_get::<Option<String>, _>("column_default")
                    .unwrap_or(None),
                _ => None,
            };
            let extra = if matches!(driver, "mysql" | "tidb") {
                row.try_get::<String, _>("extra").unwrap_or_default()
            } else {
                String::new()
            };
            let comment = if matches!(driver, "mysql" | "tidb" | "postgres") {
                row.try_get::<String, _>("column_comment")
                    .unwrap_or_default()
            } else {
                String::new()
            };
            let character_set = if matches!(driver, "mysql" | "tidb") {
                row.try_get::<String, _>("character_set_name")
                    .unwrap_or_default()
            } else {
                String::new()
            };
            let collation = if matches!(driver, "mysql" | "tidb") {
                row.try_get::<String, _>("collation_name")
                    .unwrap_or_default()
            } else {
                String::new()
            };
            Some(SqlColumn {
                original_name: Some(name.clone()),
                name,
                data_type,
                nullable,
                primary_key,
                default_value,
                extra,
                comment,
                character_set,
                collation,
            })
        })
        .collect())
}

fn validate_sql_table_structure(
    existing: &[SqlColumn],
    columns: &mut [SqlColumn],
    driver: &str,
) -> AppResult<()> {
    if columns.is_empty() {
        return Err(AppError::Invalid("数据表至少需要保留一列".into()));
    }
    let mut names = HashSet::new();
    let mut originals = HashSet::new();
    for column in columns.iter_mut() {
        column.name = column.name.trim().to_string();
        column.data_type = column.data_type.trim().to_string();
        if column.name.is_empty() {
            return Err(AppError::Invalid("列名不能为空".into()));
        }
        let normalized_name = if matches!(driver, "mysql" | "tidb" | "sqlite") {
            column.name.to_ascii_lowercase()
        } else {
            column.name.clone()
        };
        if !names.insert(normalized_name) {
            return Err(AppError::Invalid("列名不能重复".into()));
        }
        if column.data_type.is_empty() {
            return Err(AppError::Invalid(format!(
                "列 {} 的数据类型不能为空",
                column.name
            )));
        }
        let original_name = column
            .original_name
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty());
        if let Some(original_name) = original_name {
            let old = existing
                .iter()
                .find(|item| item.name == original_name)
                .ok_or_else(|| {
                    AppError::Invalid(format!("原列 {original_name} 已不存在，请刷新结构后重试"))
                })?;
            if !originals.insert(original_name.to_string()) {
                return Err(AppError::Invalid("同一原列不能被重复使用".into()));
            }
            if !old.data_type.eq_ignore_ascii_case(&column.data_type) {
                validate_sql_data_type(driver, &column.data_type)?;
            }
        } else {
            column.original_name = None;
            validate_sql_data_type(driver, &column.data_type)?;
        }
        if column.primary_key {
            column.nullable = false;
        }
    }
    if driver == "sqlite"
        && columns
            .iter()
            .any(|column| !column.comment.trim().is_empty())
    {
        return Err(AppError::Invalid("SQLite 不支持列注释".into()));
    }
    Ok(())
}

fn validate_sql_data_type(driver: &str, data_type: &str) -> AppResult<()> {
    if matches!(driver, "mysql" | "tidb") && valid_mysql_enum_or_set(data_type) {
        return Ok(());
    }
    if (driver == "sqlite" && valid_sqlite_type_spec(data_type))
        || (driver == "postgres" && valid_postgres_type_spec(data_type))
    {
        return Ok(());
    }
    const TYPES: &[&str] = &[
        "DOUBLE PRECISION",
        "CHARACTER VARYING",
        "BIT VARYING",
        "TIMESTAMP WITH TIME ZONE",
        "TIMESTAMP WITHOUT TIME ZONE",
        "TIME WITH TIME ZONE",
        "TIME WITHOUT TIME ZONE",
        "GEOMETRYCOLLECTION",
        "MULTILINESTRING",
        "MULTIPOLYGON",
        "MULTIPOINT",
        "LINESTRING",
        "GEOMETRY",
        "VECTOR",
        "SMALLSERIAL",
        "BIGSERIAL",
        "TINYINT",
        "SMALLINT",
        "MEDIUMINT",
        "INTEGER",
        "INT",
        "BIGINT",
        "DECIMAL",
        "NUMERIC",
        "FIXED",
        "FLOAT8",
        "FLOAT4",
        "FLOAT",
        "DOUBLE",
        "REAL",
        "BIT",
        "VARBIT",
        "BOOLEAN",
        "BOOL",
        "DATE",
        "DATETIME",
        "TIMESTAMP",
        "TIMESTAMPTZ",
        "TIMETZ",
        "TIME",
        "INTERVAL",
        "YEAR",
        "CHARACTER",
        "VARCHAR",
        "CHAR",
        "NCHAR",
        "NVARCHAR",
        "BPCHAR",
        "BINARY",
        "VARBINARY",
        "TINYBLOB",
        "BLOB",
        "MEDIUMBLOB",
        "LONGBLOB",
        "TINYTEXT",
        "TEXT",
        "MEDIUMTEXT",
        "LONGTEXT",
        "JSONB",
        "JSON",
        "UUID",
        "BYTEA",
        "SERIAL",
        "BOX",
        "CIDR",
        "CIRCLE",
        "INET",
        "LINE",
        "LSEG",
        "MACADDR",
        "MACADDR8",
        "MONEY",
        "OID",
        "PATH",
        "PG_LSN",
        "POINT",
        "POLYGON",
        "REGCLASS",
        "REGTYPE",
        "TID",
        "TSQUERY",
        "TSVECTOR",
        "TXID_SNAPSHOT",
        "XML",
    ];
    let value = data_type.trim().to_ascii_uppercase();
    let mut matched = None;
    for base in TYPES {
        if value == *base
            || value.starts_with(&format!("{base}("))
            || value.starts_with(&format!("{base} "))
        {
            if matched
                .map(|current: &str| base.len() > current.len())
                .unwrap_or(true)
            {
                matched = Some(*base);
            }
        }
    }
    let Some(base) = matched else {
        return Err(AppError::Invalid(format!(
            "不支持的数据类型格式: {data_type}"
        )));
    };
    let mut suffix = value[base.len()..].trim();
    let mut parameter_count = None;
    if suffix.starts_with('(') {
        let close = suffix
            .find(')')
            .ok_or_else(|| AppError::Invalid(format!("数据类型参数格式无效: {data_type}")))?;
        let parameters = &suffix[1..close];
        if parameters.is_empty()
            || !parameters
                .chars()
                .all(|character| character.is_ascii_digit() || character == ',' || character == ' ')
        {
            return Err(AppError::Invalid(format!(
                "数据类型参数格式无效: {data_type}"
            )));
        }
        let values = parameters.split(',').map(str::trim).collect::<Vec<_>>();
        if values
            .iter()
            .any(|value| value.is_empty() || value.parse::<u32>().is_err())
            || values.len() > 2
        {
            return Err(AppError::Invalid(format!(
                "数据类型参数格式无效: {data_type}"
            )));
        }
        parameter_count = Some(values.len());
        suffix = suffix[close + 1..].trim();
    }
    if matches!(driver, "mysql" | "tidb") {
        let max_parameters = match base {
            "DECIMAL" | "NUMERIC" | "DEC" | "FIXED" | "FLOAT" | "DOUBLE" | "REAL" => Some(2),
            "TINYINT" | "SMALLINT" | "MEDIUMINT" | "INTEGER" | "INT" | "BIGINT" | "BIT"
            | "VECTOR" | "CHAR" | "VARCHAR" | "NCHAR" | "NVARCHAR" | "BINARY" | "VARBINARY"
            | "TINYBLOB" | "BLOB" | "MEDIUMBLOB" | "LONGBLOB" | "TINYTEXT" | "TEXT"
            | "MEDIUMTEXT" | "LONGTEXT" | "TIME" | "DATETIME" | "TIMESTAMP" => Some(1),
            _ => None,
        };
        if parameter_count.is_some_and(|count| count > max_parameters.unwrap_or(0)) {
            return Err(AppError::Invalid(format!(
                "{base} 的长度或精度参数数量无效"
            )));
        }
        if matches!(base, "VARCHAR" | "NVARCHAR" | "VARBINARY") && parameter_count.is_none() {
            return Err(AppError::Invalid(format!("{base} 必须设置长度")));
        }
        if base == "VECTOR" && (driver != "mysql" || parameter_count.is_none()) {
            return Err(AppError::Invalid(
                "VECTOR 类型必须设置维度，且仅 MySQL 支持".into(),
            ));
        }
    }
    if driver == "postgres" {
        let max_parameters = match base {
            "DECIMAL" | "NUMERIC" => Some(2),
            "CHARACTER" | "CHAR" | "CHARACTER VARYING" | "VARCHAR" | "BIT" | "BIT VARYING"
            | "VARBIT" | "FLOAT" | "TIME" | "TIMESTAMP" | "INTERVAL" => Some(1),
            _ => None,
        };
        if parameter_count.is_some() && max_parameters.is_none() {
            return Err(AppError::Invalid(format!("{base} 不接受长度或精度参数")));
        }
        if parameter_count.is_some_and(|count| count > max_parameters.unwrap_or(0)) {
            return Err(AppError::Invalid(format!(
                "{base} 的长度或精度参数数量无效"
            )));
        }
    }
    let allowed_suffix = match driver {
        "mysql" | "tidb" => matches!(suffix, "" | "UNSIGNED" | "ZEROFILL" | "UNSIGNED ZEROFILL"),
        "postgres" => matches!(suffix, "" | "WITH TIME ZONE" | "WITHOUT TIME ZONE"),
        "sqlite" => suffix.is_empty(),
        _ => false,
    };
    if !allowed_suffix {
        return Err(AppError::Invalid(format!(
            "数据类型修饰符不受支持: {data_type}"
        )));
    }
    Ok(())
}

fn valid_sqlite_type_spec(data_type: &str) -> bool {
    let value = data_type.trim();
    let (base, parameters) = if let Some(open) = value.find('(') {
        if !value.ends_with(')')
            || value[open + 1..value.len() - 1]
                .chars()
                .any(|character| character == '(' || character == ')')
        {
            return false;
        }
        (&value[..open], Some(&value[open + 1..value.len() - 1]))
    } else {
        (value, None)
    };
    let words = base.split_whitespace().collect::<Vec<_>>();
    if words.is_empty() || words.iter().any(|word| !is_sql_type_word(word)) {
        return false;
    }
    parameters
        .map(|parameters| {
            !parameters.is_empty()
                && parameters
                    .split(',')
                    .all(|part| !part.trim().is_empty() && part.trim().parse::<u32>().is_ok())
        })
        .unwrap_or(true)
}

fn valid_postgres_type_spec(data_type: &str) -> bool {
    let mut value = data_type.trim();
    while let Some(array_type) = value.strip_suffix("[]") {
        value = array_type;
    }
    let parts = value.split('.').collect::<Vec<_>>();
    !parts.is_empty() && parts.iter().all(|part| is_sql_type_word(part))
}

fn is_sql_type_word(value: &str) -> bool {
    let mut characters = value.chars();
    characters
        .next()
        .map(|first| first.is_ascii_alphabetic() || first == '_')
        .unwrap_or(false)
        && characters.all(|character| character.is_ascii_alphanumeric() || character == '_')
}

fn valid_mysql_enum_or_set(data_type: &str) -> bool {
    let value = data_type.trim();
    let upper = value.to_ascii_uppercase();
    let prefix_len = if upper.starts_with("ENUM(") {
        5
    } else if upper.starts_with("SET(") {
        4
    } else {
        return false;
    };
    if !value.ends_with(')') {
        return false;
    }
    let characters: Vec<char> = value[prefix_len..value.len() - 1].chars().collect();
    let mut index = 0;
    let mut item_count = 0;
    loop {
        while characters
            .get(index)
            .is_some_and(|character| character.is_ascii_whitespace())
        {
            index += 1;
        }
        if index == characters.len() {
            break;
        }
        if characters.get(index) != Some(&'\'') {
            return false;
        }
        index += 1;
        let mut closed = false;
        while index < characters.len() {
            let character = characters[index];
            if character == '\\' || character.is_control() {
                return false;
            }
            if character == '\'' {
                if characters.get(index + 1) == Some(&'\'') {
                    index += 2;
                    continue;
                }
                index += 1;
                closed = true;
                break;
            }
            index += 1;
        }
        if !closed {
            return false;
        }
        item_count += 1;
        while characters
            .get(index)
            .is_some_and(|character| character.is_ascii_whitespace())
        {
            index += 1;
        }
        if index == characters.len() {
            break;
        }
        if characters.get(index) != Some(&',') {
            return false;
        }
        index += 1;
        if index == characters.len() {
            return false;
        }
    }
    item_count > 0
}

async fn apply_sql_table_structure(
    pool: &sqlx::AnyPool,
    driver: &str,
    table: &str,
    existing: &[SqlColumn],
    columns: &[SqlColumn],
) -> AppResult<()> {
    match driver {
        "mysql" | "tidb" => apply_mysql_table_structure(pool, table, existing, columns).await,
        "postgres" => apply_postgres_table_structure(pool, table, existing, columns).await,
        "sqlite" => apply_sqlite_table_structure(pool, table, existing, columns).await,
        _ => Err(AppError::Invalid("不支持的 SQL 驱动".into())),
    }
}

async fn apply_mysql_table_structure(
    pool: &sqlx::AnyPool,
    table: &str,
    existing: &[SqlColumn],
    columns: &[SqlColumn],
) -> AppResult<()> {
    let table_sql = quote_sql_identifier("mysql", table);
    let existing_primary: Vec<&str> = existing
        .iter()
        .filter(|column| column.primary_key)
        .map(|column| column.name.as_str())
        .collect();
    let desired_primary: Vec<&str> = columns
        .iter()
        .filter(|column| column.primary_key)
        .map(|column| column.name.as_str())
        .collect();
    let primary_changed = !same_names(existing_primary.as_slice(), desired_primary.as_slice());
    for column in existing
        .iter()
        .filter(|column| column.extra.to_ascii_uppercase().contains("AUTO_INCREMENT"))
    {
        let target = columns
            .iter()
            .find(|candidate| candidate.original_name.as_deref() == Some(column.name.as_str()));
        if let Some(target) = target {
            let target_primary: Vec<&str> = columns
                .iter()
                .filter(|candidate| candidate.primary_key)
                .map(|candidate| candidate.name.as_str())
                .collect();
            if !target.primary_key || target_primary.first().copied() != Some(target.name.as_str())
            {
                return Err(AppError::Invalid(format!(
                    "自增列 {} 必须保留为主键的第一列",
                    column.name
                )));
            }
        }
    }

    let retained: HashSet<&str> = columns
        .iter()
        .filter_map(|column| column.original_name.as_deref())
        .collect();
    let mut operations = Vec::new();
    if primary_changed && !existing_primary.is_empty() {
        operations.push("DROP PRIMARY KEY".to_string());
    }
    for old in existing
        .iter()
        .filter(|column| !retained.contains(column.name.as_str()))
    {
        operations.push(format!(
            "DROP COLUMN {}",
            quote_sql_identifier("mysql", &old.name)
        ));
    }
    for column in columns {
        if let Some(original_name) = column.original_name.as_deref() {
            let old = existing
                .iter()
                .find(|candidate| candidate.name == original_name)
                .ok_or_else(|| AppError::Invalid(format!("原列 {original_name} 已不存在")))?;
            let changed = old.name != column.name
                || !old.data_type.eq_ignore_ascii_case(&column.data_type)
                || old.nullable != column.nullable
                || old.comment != column.comment;
            if changed {
                let old_extra = old.extra.to_ascii_uppercase();
                if old_extra.contains("VIRTUAL GENERATED") || old_extra.contains("STORED GENERATED")
                {
                    return Err(AppError::Invalid(format!(
                        "生成列 {} 暂不支持修改",
                        old.name
                    )));
                }
                let default = mysql_default_clause(old)?;
                let extra = mysql_extra_clause(old)?;
                let comment = format!(" COMMENT '{}'", column.comment.replace('\'', "''"));
                let mut type_definition = column.data_type.clone();
                if !old.character_set.is_empty() {
                    if !is_sql_metadata_word(&old.character_set) {
                        return Err(AppError::Invalid(format!(
                            "列 {} 的字符集名称无效",
                            old.name
                        )));
                    }
                    type_definition.push_str(&format!(" CHARACTER SET {}", old.character_set));
                }
                if !old.collation.is_empty() {
                    if !is_sql_metadata_word(&old.collation) {
                        return Err(AppError::Invalid(format!(
                            "列 {} 的排序规则名称无效",
                            old.name
                        )));
                    }
                    type_definition.push_str(&format!(" COLLATE {}", old.collation));
                }
                let definition = format!(
                    "{} {type_definition} {}",
                    quote_sql_identifier("mysql", &column.name),
                    if column.nullable { "NULL" } else { "NOT NULL" }
                );
                operations.push(format!(
                    "CHANGE COLUMN {} {definition}{default}{extra}{comment}",
                    quote_sql_identifier("mysql", &old.name)
                ));
            }
        } else {
            let comment = format!(" COMMENT '{}'", column.comment.replace('\'', "''"));
            let definition = format!(
                "{} {} {}{comment}",
                quote_sql_identifier("mysql", &column.name),
                column.data_type,
                if column.nullable { "NULL" } else { "NOT NULL" }
            );
            operations.push(format!("ADD COLUMN {definition}"));
        }
    }
    if primary_changed && !desired_primary.is_empty() {
        let keys = desired_primary
            .iter()
            .map(|name| quote_sql_identifier("mysql", name))
            .collect::<Vec<_>>()
            .join(", ");
        operations.push(format!("ADD PRIMARY KEY ({keys})"));
    }
    if operations.is_empty() {
        return Ok(());
    }
    let statement = format!("ALTER TABLE {table_sql} {}", operations.join(", "));
    sqlx::query(sqlx::AssertSqlSafe(statement.as_str()))
        .execute(pool)
        .await?;
    Ok(())
}

fn mysql_default_clause(column: &SqlColumn) -> AppResult<String> {
    let Some(default) = column.default_value.as_deref() else {
        return Ok(String::new());
    };
    let default = default.trim();
    if default.eq_ignore_ascii_case("null") {
        return Ok(" DEFAULT NULL".into());
    }
    if column
        .extra
        .to_ascii_uppercase()
        .contains("DEFAULT_GENERATED")
    {
        let upper = default.to_ascii_uppercase();
        let safe_expression = upper.starts_with("CURRENT_TIMESTAMP")
            && upper
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "_()".contains(character));
        if !safe_expression {
            return Err(AppError::Invalid(format!(
                "列 {} 的默认表达式无法安全保留",
                column.name
            )));
        }
        return Ok(format!(" DEFAULT {default}"));
    }
    if default.parse::<f64>().is_ok() {
        Ok(format!(" DEFAULT {default}"))
    } else {
        Ok(format!(" DEFAULT '{}'", default.replace('\'', "''")))
    }
}

fn mysql_extra_clause(column: &SqlColumn) -> AppResult<String> {
    let upper = column.extra.to_ascii_uppercase();
    let mut clause = String::new();
    if upper.contains("AUTO_INCREMENT") {
        clause.push_str(" AUTO_INCREMENT");
    }
    let mut remaining = upper
        .replace("DEFAULT_GENERATED", "")
        .replace("AUTO_INCREMENT", "")
        .replace("INVISIBLE", "");
    if let Some((before, expression)) = remaining.split_once("ON UPDATE ") {
        let before = before.trim().to_string();
        let expression = expression.trim().to_string();
        if !expression.starts_with("CURRENT_TIMESTAMP")
            || !expression
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || "_()".contains(character))
        {
            return Err(AppError::Invalid(format!(
                "列 {} 的自动更新时间表达式无法安全保留",
                column.name
            )));
        }
        remaining = before;
        clause.push_str(" ON UPDATE ");
        clause.push_str(&expression);
    }
    if !remaining.trim().is_empty() {
        return Err(AppError::Invalid(format!(
            "列 {} 包含无法安全保留的 MySQL 属性: {}",
            column.name,
            remaining.trim()
        )));
    }
    if upper.contains("INVISIBLE") {
        clause.push_str(" INVISIBLE");
    }
    Ok(clause)
}

fn is_sql_metadata_word(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '_')
}

fn same_names(left: &[&str], right: &[&str]) -> bool {
    left.len() == right.len() && left.iter().all(|name| right.contains(name))
}

async fn apply_postgres_table_structure(
    pool: &sqlx::AnyPool,
    table: &str,
    existing: &[SqlColumn],
    columns: &[SqlColumn],
) -> AppResult<()> {
    let table_sql = quote_sql_identifier("postgres", table);
    let existing_primary: Vec<&str> = existing
        .iter()
        .filter(|column| column.primary_key)
        .map(|column| column.name.as_str())
        .collect();
    let desired_primary: Vec<&str> = columns
        .iter()
        .filter(|column| column.primary_key)
        .map(|column| column.name.as_str())
        .collect();
    let primary_changed = !same_names(existing_primary.as_slice(), desired_primary.as_slice());
    let mut statements = Vec::new();
    if primary_changed && !existing_primary.is_empty() {
        let row = sqlx::query("SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = current_schema() AND table_name = $1 AND constraint_type = 'PRIMARY KEY'")
            .bind(table).fetch_optional(pool).await?;
        let constraint = row
            .and_then(|row| row.try_get::<String, _>(0).ok())
            .ok_or_else(|| AppError::Sql("无法读取当前主键约束名称".into()))?;
        statements.push(format!(
            "ALTER TABLE {table_sql} DROP CONSTRAINT {}",
            quote_sql_identifier("postgres", &constraint)
        ));
    }
    let retained: HashSet<&str> = columns
        .iter()
        .filter_map(|column| column.original_name.as_deref())
        .collect();
    for old in existing
        .iter()
        .filter(|column| !retained.contains(column.name.as_str()))
    {
        statements.push(format!(
            "ALTER TABLE {table_sql} DROP COLUMN {}",
            quote_sql_identifier("postgres", &old.name)
        ));
    }
    for column in columns {
        let name_sql = quote_sql_identifier("postgres", &column.name);
        if let Some(original_name) = column.original_name.as_deref() {
            let old = existing
                .iter()
                .find(|candidate| candidate.name == original_name)
                .ok_or_else(|| AppError::Invalid(format!("原列 {original_name} 已不存在")))?;
            if old.name != column.name {
                statements.push(format!(
                    "ALTER TABLE {table_sql} RENAME COLUMN {} TO {name_sql}",
                    quote_sql_identifier("postgres", &old.name)
                ));
            }
            if !old.data_type.eq_ignore_ascii_case(&column.data_type) {
                statements.push(format!(
                    "ALTER TABLE {table_sql} ALTER COLUMN {name_sql} TYPE {} USING {name_sql}::{}",
                    column.data_type, column.data_type
                ));
            }
            if old.nullable != column.nullable {
                let action = if column.nullable {
                    "DROP NOT NULL"
                } else {
                    "SET NOT NULL"
                };
                statements.push(format!(
                    "ALTER TABLE {table_sql} ALTER COLUMN {name_sql} {action}"
                ));
            }
            if old.comment != column.comment {
                let comment = if column.comment.is_empty() {
                    "NULL".to_string()
                } else {
                    format!("'{}'", column.comment.replace('\'', "''"))
                };
                statements.push(format!(
                    "COMMENT ON COLUMN {table_sql}.{name_sql} IS {comment}"
                ));
            }
        } else {
            let nullability = if column.nullable { "" } else { " NOT NULL" };
            statements.push(format!(
                "ALTER TABLE {table_sql} ADD COLUMN {name_sql} {}{nullability}",
                column.data_type
            ));
            if !column.comment.is_empty() {
                statements.push(format!(
                    "COMMENT ON COLUMN {table_sql}.{name_sql} IS '{}'",
                    column.comment.replace('\'', "''")
                ));
            }
        }
    }
    if primary_changed && !desired_primary.is_empty() {
        let keys = desired_primary
            .iter()
            .map(|name| quote_sql_identifier("postgres", name))
            .collect::<Vec<_>>()
            .join(", ");
        statements.push(format!("ALTER TABLE {table_sql} ADD PRIMARY KEY ({keys})"));
    }
    execute_transactional_ddl(pool, &statements).await
}

async fn execute_transactional_ddl(pool: &sqlx::AnyPool, statements: &[String]) -> AppResult<()> {
    if statements.is_empty() {
        return Ok(());
    }
    let mut transaction = pool.begin().await?;
    for statement in statements {
        if let Err(error) = sqlx::query(sqlx::AssertSqlSafe(statement.as_str()))
            .execute(&mut *transaction)
            .await
        {
            transaction.rollback().await?;
            return Err(AppError::from(error));
        }
    }
    transaction.commit().await?;
    Ok(())
}

async fn apply_sqlite_table_structure(
    pool: &sqlx::AnyPool,
    table: &str,
    existing: &[SqlColumn],
    columns: &[SqlColumn],
) -> AppResult<()> {
    let table_sql = quote_sql_identifier("sqlite", table);
    let source = sqlx::query(
        "SELECT type, sql FROM sqlite_master WHERE name = ? AND type IN ('table', 'view')",
    )
    .bind(table)
    .fetch_optional(pool)
    .await?;
    let Some(source) = source else {
        return Err(AppError::Invalid("SQLite 数据表不存在".into()));
    };
    let object_type: String = source.try_get("type").unwrap_or_default();
    if object_type != "table" {
        return Err(AppError::Invalid("视图不能通过结构编辑器修改".into()));
    }
    let create_sql: String = source.try_get("sql").unwrap_or_default();
    let upper_create = create_sql.to_ascii_uppercase();
    for constraint in [
        "FOREIGN KEY",
        "REFERENCES",
        "CHECK",
        "UNIQUE",
        "COLLATE",
        "GENERATED",
        "VIRTUAL TABLE",
        "WITHOUT ROWID",
        "ON CONFLICT",
    ] {
        if upper_create.contains(constraint) {
            return Err(AppError::Invalid(format!(
                "SQLite 表包含 {constraint} 定义，当前无法在保留该约束的同时重建结构"
            )));
        }
    }
    if sqlite_has_external_foreign_keys(pool, table).await? {
        return Err(AppError::Invalid(
            "其他数据表通过外键引用了此表，暂不能重建其结构".into(),
        ));
    }
    let indexes = sqlx::query("SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index', 'trigger') AND sql IS NOT NULL ORDER BY type, name")
        .bind(table).fetch_all(pool).await?.into_iter()
        .filter_map(|row| row.try_get::<String, _>(0).ok()).collect::<Vec<_>>();
    let auto_increment_column = if upper_create.contains("AUTOINCREMENT") {
        existing
            .iter()
            .find(|column| column.primary_key)
            .map(|column| column.name.as_str())
    } else {
        None
    };
    if let Some(auto_column) = auto_increment_column {
        if let Some(target) = columns
            .iter()
            .find(|column| column.original_name.as_deref() == Some(auto_column))
        {
            if !target.primary_key || !target.data_type.eq_ignore_ascii_case("INTEGER") {
                return Err(AppError::Invalid(
                    "SQLite AUTOINCREMENT 列必须继续使用 INTEGER PRIMARY KEY".into(),
                ));
            }
        }
    }
    let primary_columns: Vec<&SqlColumn> =
        columns.iter().filter(|column| column.primary_key).collect();
    let mut definitions = Vec::new();
    let inline_auto = auto_increment_column.and_then(|name| {
        columns
            .iter()
            .find(|column| column.original_name.as_deref() == Some(name) && column.primary_key)
    });
    for column in columns {
        let name_sql = quote_sql_identifier("sqlite", &column.name);
        let mut definition = format!("{name_sql} {}", column.data_type);
        if inline_auto
            .map(|auto| auto.name == column.name)
            .unwrap_or(false)
        {
            definition.push_str(" PRIMARY KEY AUTOINCREMENT");
        } else if !column.nullable {
            definition.push_str(" NOT NULL");
        }
        if let Some(original_name) = column.original_name.as_deref() {
            if let Some(old) = existing
                .iter()
                .find(|candidate| candidate.name == original_name)
            {
                if let Some(default) = old.default_value.as_deref() {
                    definition.push_str(" DEFAULT ");
                    definition.push_str(default);
                }
            }
        }
        definitions.push(definition);
    }
    if !primary_columns.is_empty() && inline_auto.is_none() {
        let keys = primary_columns
            .iter()
            .map(|column| quote_sql_identifier("sqlite", &column.name))
            .collect::<Vec<_>>()
            .join(", ");
        definitions.push(format!("PRIMARY KEY ({keys})"));
    }
    let temp_table = format!(
        "__orangehub_migrate_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let temp_sql = quote_sql_identifier("sqlite", &temp_table);
    let strict_suffix = if upper_create.trim_end().ends_with("STRICT") {
        " STRICT"
    } else {
        ""
    };
    let create_temp = format!(
        "CREATE TABLE {temp_sql} ({}){strict_suffix}",
        definitions.join(", ")
    );
    let retained: Vec<(&SqlColumn, &str)> = columns
        .iter()
        .filter_map(|column| {
            let original = column.original_name.as_deref()?;
            existing
                .iter()
                .any(|item| item.name == original)
                .then_some((column, original))
        })
        .collect();
    let count_sql = format!("SELECT COUNT(*) FROM {table_sql}");
    let row_count: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(count_sql.as_str()))
        .fetch_one(pool)
        .await?;
    if row_count > 0 && retained.is_empty() {
        return Err(AppError::Invalid(
            "表中有数据，至少保留一个原列才能安全迁移".into(),
        ));
    }
    let mut statements = vec![create_temp];
    if !retained.is_empty() {
        let target_names = retained
            .iter()
            .map(|(column, _)| quote_sql_identifier("sqlite", &column.name))
            .collect::<Vec<_>>()
            .join(", ");
        let source_names = retained
            .iter()
            .map(|(_, name)| quote_sql_identifier("sqlite", name))
            .collect::<Vec<_>>()
            .join(", ");
        statements.push(format!(
            "INSERT INTO {temp_sql} ({target_names}) SELECT {source_names} FROM {table_sql}"
        ));
    }
    statements.push(format!("DROP TABLE {table_sql}"));
    statements.push(format!(
        "ALTER TABLE {temp_sql} RENAME TO {}",
        quote_sql_identifier("sqlite", table)
    ));
    statements.extend(indexes);
    execute_transactional_ddl(pool, &statements).await
}

async fn sqlite_has_external_foreign_keys(pool: &sqlx::AnyPool, table: &str) -> AppResult<bool> {
    let rows = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_all(pool)
    .await?;
    for row in rows {
        let name = row.try_get::<String, _>(0).unwrap_or_default();
        if name.eq_ignore_ascii_case(table) {
            continue;
        }
        let statement = format!(
            "PRAGMA foreign_key_list({})",
            quote_sql_identifier("sqlite", &name)
        );
        for foreign_key in sqlx::query(sqlx::AssertSqlSafe(statement.as_str()))
            .fetch_all(pool)
            .await?
        {
            if foreign_key
                .try_get::<String, _>("table")
                .map(|referenced| referenced.eq_ignore_ascii_case(table))
                .unwrap_or(false)
            {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

fn cell_from_row(row: &sqlx::any::AnyRow, index: usize, type_name: &str) -> Cell {
    let type_name = type_name.to_ascii_uppercase();
    let cell = if type_name.contains("BOOL") {
        row.try_get::<bool, _>(index).map(Cell::Bool).ok()
    } else if type_name.contains("INT") {
        row.try_get::<i64, _>(index).map(Cell::Int).ok()
    } else if ["REAL", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC"]
        .iter()
        .any(|name| type_name.contains(name))
    {
        row.try_get::<f64, _>(index).map(Cell::Float).ok()
    } else {
        row.try_get::<String, _>(index).map(Cell::Text).ok()
    };
    cell.unwrap_or_else(|| {
        row.try_get::<Vec<u8>, _>(index)
            .map(|bytes| Cell::Text(format!("blob:{}", B64.encode(bytes))))
            .unwrap_or(Cell::Null)
    })
}

fn cell_from_mysql_row(row: &sqlx::mysql::MySqlRow, index: usize, type_name: &str) -> Cell {
    let type_name = type_name.to_ascii_uppercase();
    let cell = if type_name.contains("TIMESTAMP") || type_name.contains("DATETIME") {
        row.try_get::<chrono::NaiveDateTime, _>(index)
            .map(|value| Cell::Text(value.format("%Y-%m-%d %H:%M:%S%.f").to_string()))
            .ok()
    } else if type_name == "DATE" {
        row.try_get::<chrono::NaiveDate, _>(index)
            .map(|value| Cell::Text(value.format("%Y-%m-%d").to_string()))
            .ok()
    } else if type_name == "TIME" {
        row.try_get::<chrono::NaiveTime, _>(index)
            .map(|value| Cell::Text(value.format("%H:%M:%S%.f").to_string()))
            .ok()
    } else if type_name.contains("BOOL") {
        row.try_get::<bool, _>(index).map(Cell::Bool).ok()
    } else if type_name.contains("INT") || type_name == "YEAR" {
        row.try_get::<i64, _>(index).map(Cell::Int).ok()
    } else if ["REAL", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC"]
        .iter()
        .any(|name| type_name.contains(name))
    {
        row.try_get::<f64, _>(index).map(Cell::Float).ok()
    } else {
        row.try_get::<String, _>(index).map(Cell::Text).ok()
    };
    cell.unwrap_or_else(|| {
        row.try_get::<Vec<u8>, _>(index)
            .map(|bytes| Cell::Text(format!("blob:{}", B64.encode(bytes))))
            .unwrap_or(Cell::Null)
    })
}

fn push_sql_bind(query: &mut QueryBuilder<Any>, value: &Cell) {
    match value {
        Cell::Null => {
            query.push_bind(Option::<String>::None);
        }
        Cell::Bool(value) => {
            query.push_bind(*value);
        }
        Cell::Int(value) => {
            query.push_bind(*value);
        }
        Cell::Float(value) => {
            query.push_bind(*value);
        }
        Cell::Text(value) => {
            query.push_bind(value.clone());
        }
    }
}

fn postgres_cast_type(data_type: &str) -> Option<&'static str> {
    match data_type.to_ascii_lowercase().as_str() {
        "smallint" => Some("SMALLINT"),
        "integer" => Some("INTEGER"),
        "bigint" => Some("BIGINT"),
        "real" => Some("REAL"),
        "double precision" => Some("DOUBLE PRECISION"),
        "numeric" => Some("NUMERIC"),
        "boolean" => Some("BOOLEAN"),
        "character" => Some("CHAR"),
        "character varying" => Some("VARCHAR"),
        "text" => Some("TEXT"),
        "date" => Some("DATE"),
        "time without time zone" => Some("TIME"),
        "time with time zone" => Some("TIMETZ"),
        "timestamp without time zone" => Some("TIMESTAMP"),
        "timestamp with time zone" => Some("TIMESTAMPTZ"),
        "uuid" => Some("UUID"),
        "json" => Some("JSON"),
        "jsonb" => Some("JSONB"),
        "bytea" => Some("BYTEA"),
        _ => None,
    }
}

fn push_typed_sql_bind(query: &mut QueryBuilder<Any>, value: &Cell, driver: &str, data_type: &str) {
    if driver == "postgres" {
        if let Some(cast_type) = postgres_cast_type(data_type) {
            query.push("CAST(");
            push_sql_bind(query, value);
            query.push(" AS ").push(cast_type).push(")");
            return;
        }
    }
    push_sql_bind(query, value);
}

fn push_key_conditions(
    query: &mut QueryBuilder<Any>,
    driver: &str,
    columns: &[SqlColumn],
    keys: &[String],
    values: &[Cell],
) {
    for (index, (key, value)) in keys.iter().zip(values).enumerate() {
        if index > 0 {
            query.push(" AND ");
        }
        query.push(quote_sql_identifier(driver, key)).push(" = ");
        let data_type = columns
            .iter()
            .find(|column| column.name == *key)
            .map(|column| column.data_type.as_str())
            .unwrap_or("");
        push_typed_sql_bind(query, value, driver, data_type);
    }
}

fn open_sql_pool(
    connection: &Connection,
) -> impl std::future::Future<Output = AppResult<sqlx::AnyPool>> + Send + '_ {
    open_sql_pool_for_database(connection, None)
}

fn open_sql_pool_for_database(
    connection: &Connection,
    database_override: Option<String>,
) -> impl std::future::Future<Output = AppResult<sqlx::AnyPool>> + Send + '_ {
    static DRIVERS: Once = Once::new();
    DRIVERS.call_once(install_default_drivers);
    async move {
        let uri = sql_uri_for_connection(connection, database_override.as_deref())?;
        AnyPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(Duration::from_secs(
                connection.connect_timeout_secs.unwrap_or(8),
            ))
            .connect(&uri)
            .await
            .map_err(|error| map_sql_connect_error(error, connection))
    }
}

async fn open_mysql_pool_for_database(
    connection: &Connection,
    database_override: Option<String>,
) -> AppResult<sqlx::MySqlPool> {
    let uri = sql_uri_for_connection(connection, database_override.as_deref())?;
    sqlx::mysql::MySqlPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(
            connection.connect_timeout_secs.unwrap_or(8),
        ))
        .connect(&uri)
        .await
        .map_err(|error| map_sql_connect_error(error, connection))
}

fn sql_uri_for_connection(
    connection: &Connection,
    database_override: Option<&str>,
) -> AppResult<String> {
    let driver = sql_driver(connection);
    if driver == "sqlite" {
        let path = connection
            .sqlite_path
            .as_deref()
            .filter(|path| !path.is_empty())
            .ok_or_else(|| AppError::Invalid("请配置 SQLite 文件路径".into()))?;
        let path = path.replace('\\', "/");
        return Ok(if path.starts_with('/') {
            format!("sqlite://{path}")
        } else {
            format!("sqlite:///{path}")
        });
    }
    let scheme = match driver {
        "mysql" | "tidb" => "mysql",
        "postgres" => "postgres",
        other => return Err(AppError::Invalid(format!("不支持的 SQL 驱动: {other}"))),
    };
    let mut url = Url::parse(&format!("{scheme}://localhost"))
        .map_err(|error| AppError::Invalid(error.to_string()))?;
    url.set_host(Some(&connection.host))
        .map_err(|_| AppError::Invalid("主机地址无效".into()))?;
    url.set_port(Some(connection.effective_port()))
        .map_err(|_| AppError::Invalid("端口无效".into()))?;
    if !connection.username.is_empty() {
        url.set_username(&connection.username)
            .map_err(|_| AppError::Invalid("用户名无效".into()))?;
    }
    if let Some(password) = connection.password.as_deref() {
        url.set_password(Some(password))
            .map_err(|_| AppError::Invalid("密码包含不支持的字符".into()))?;
    }
    if let Some(database) = database_override
        .or(connection.database.as_deref())
        .filter(|name| !name.is_empty())
    {
        url.set_path(&format!("/{database}"));
    }
    if connection.use_tls {
        let (key, value) = if scheme == "postgres" {
            ("sslmode", "require")
        } else {
            ("ssl-mode", "REQUIRED")
        };
        url.query_pairs_mut().append_pair(key, value);
    }
    Ok(url.to_string())
}

fn map_sql_connect_error(error: sqlx::Error, connection: &Connection) -> AppError {
    if matches!(sql_driver(connection), "mysql" | "tidb") {
        if let sqlx::Error::Database(database_error) = &error {
            if database_error.code().as_deref() == Some("1045") {
                return AppError::Sql(format!(
                    "MySQL/TiDB 拒绝登录：{}。连接目标是 {}:{}。错误中的主机地址是数据库识别到的客户端来源地址；请核对密码，并在数据库服务器为该来源地址授权此账号。建议使用权限受限的专用账号，不要直接开放 root 远程登录。",
                    database_error.message(),
                    connection.host,
                    connection.effective_port(),
                ));
            }
        }
    }
    AppError::from(error)
}

fn redis_uri(connection: &Connection) -> AppResult<Url> {
    redis_uri_for_db(connection, None)
}

fn redis_uri_for_db(connection: &Connection, database: Option<i64>) -> AppResult<Url> {
    let scheme = if connection.use_tls {
        "rediss"
    } else {
        "redis"
    };
    let mut url = Url::parse(&format!("{scheme}://localhost"))
        .map_err(|error| AppError::Invalid(error.to_string()))?;
    url.set_host(Some(&connection.host))
        .map_err(|_| AppError::Invalid("主机地址无效".into()))?;
    url.set_port(Some(connection.effective_port()))
        .map_err(|_| AppError::Invalid("端口无效".into()))?;
    if !connection.username.is_empty() {
        url.set_username(&connection.username)
            .map_err(|_| AppError::Invalid("用户名无效".into()))?;
    }
    if let Some(password) = connection.password.as_deref() {
        url.set_password(Some(password))
            .map_err(|_| AppError::Invalid("密码包含不支持的字符".into()))?;
    }
    url.set_path(&format!(
        "/{}",
        database.or(connection.redis_db).unwrap_or(0).max(0)
    ));
    Ok(url)
}

fn mongo_uri(connection: &Connection) -> AppResult<String> {
    let mut url =
        Url::parse("mongodb://localhost").map_err(|error| AppError::Invalid(error.to_string()))?;
    url.set_host(Some(&connection.host))
        .map_err(|_| AppError::Invalid("MongoDB 主机地址无效".into()))?;
    url.set_port(Some(connection.effective_port()))
        .map_err(|_| AppError::Invalid("MongoDB 端口无效".into()))?;
    if !connection.username.is_empty() {
        url.set_username(&connection.username)
            .map_err(|_| AppError::Invalid("MongoDB 用户名无效".into()))?;
    }
    if let Some(password) = connection.password.as_deref() {
        url.set_password(Some(password))
            .map_err(|_| AppError::Invalid("MongoDB 密码包含不支持的字符".into()))?;
    }
    let mut query = url.query_pairs_mut();
    query.append_pair(
        "authSource",
        connection.mongo_auth_db.as_deref().unwrap_or("admin"),
    );
    if connection.use_tls {
        query.append_pair("tls", "true");
    }
    drop(query);
    Ok(url.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let config_directory = app.path().app_config_dir()?;
            std::fs::create_dir_all(&config_directory)?;
            let configured_path = config_directory.join("data-directory.json");
            let default_data_dir: PathBuf = app.path().app_data_dir()?;
            let installer_data_dir = std::env::current_exe()
                .ok()
                .and_then(|path| {
                    path.parent()
                        .map(|parent| parent.join("orangehub-install-data-directory.txt"))
                })
                .and_then(|path| std::fs::read_to_string(path).ok())
                .map(|value| PathBuf::from(value.trim()))
                .filter(|path| path.is_absolute());
            let data_dir = if configured_path.is_file() {
                std::fs::read(&configured_path)
                    .ok()
                    .and_then(|contents| serde_json::from_slice::<PathBuf>(&contents).ok())
                    .filter(|path| path.is_absolute())
                    .unwrap_or(default_data_dir)
            } else if let Some(path) = installer_data_dir {
                path
            } else {
                default_data_dir
            };
            std::fs::create_dir_all(&data_dir)?;
            let store_path = data_dir.join("orangehub.sqlite3");
            let store = tauri::async_runtime::block_on(Store::open(&store_path))?;
            app.manage(AppState {
                store,
                data_directory: data_dir,
                config_directory,
                vault: RwLock::new(None),
                terminals: RwLock::new(HashMap::new()),
            });

            let tray_menu = build_tray_menu(&app.handle(), true)?;
            let tray_builder = TrayIconBuilder::with_id("orangehub-tray")
                .menu(&tray_menu)
                .tooltip("OrangeHub")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "tray-show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "tray-unlock" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "tray-new" => {
                        let _ = app.emit("tray-new-connection", ());
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "tray-check" => {
                        let _ = app.emit("tray-check-update", ());
                    }
                    "tray-lock" => {
                        let _ = app.emit("tray-lock-vault", ());
                    }
                    "tray-quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                });
            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder.icon(icon).build(app)?;
            } else {
                tray_builder.build(app)?;
            }
            if let Some(window) = app.get_webview_window("main") {
                let window_to_hide = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_to_hide.hide();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_data_directory,
            set_tray_vault_state,
            configure_data_directory,
            restart_application,
            vault_status,
            vault_initialize,
            vault_unlock,
            vault_lock,
            list_connections,
            get_ai_providers,
            save_ai_providers,
            invoke_ai,
            save_connection,
            delete_connection,
            list_history,
            clear_history,
            delete_history_entry,
            list_sql_snippets,
            save_sql_snippet,
            delete_sql_snippet,
            test_connection,
            test_connection_config,
            docker_list_containers,
            docker_dashboard,
            docker_container_action,
            docker_container_logs,
            docker_inspect_container,
            docker_create_container,
            docker_list_images,
            docker_pull_image,
            docker_remove_image,
            docker_list_networks,
            docker_remove_network,
            docker_inspect_network,
            docker_create_network,
            docker_list_volumes,
            docker_remove_volume,
            docker_inspect_volume,
            docker_create_volume,
            trust_ssh_host,
            trust_ssh_host_config,
            execute_ssh,
            ssh_monitor,
            save_ssh_monitor_history_point,
            list_ssh_monitor_history,
            open_ssh_terminal,
            write_ssh_terminal,
            resize_ssh_terminal,
            close_ssh_terminal,
            remote_list,
            remote_upload,
            remote_download,
            remote_download_directory,
            remote_delete,
            remote_rename,
            remote_read_text,
            remote_write_text,
            write_local_text_file,
            execute_sql,
            list_sql_databases,
            list_sql_tables,
            create_sql_database,
            delete_sql_database,
            delete_sql_table,
            truncate_sql_table,
            dump_sql_table,
            dump_sql_database,
            rename_sql_database,
            run_sql_file,
            get_sql_table_data,
            update_sql_table_structure,
            insert_sql_row,
            update_sql_cell,
            delete_sql_row,
            execute_redis,
            list_redis_databases,
            scan_redis_keys,
            get_redis_key_detail,
            set_redis_string,
            delete_redis_key,
            list_mongo_databases,
            list_mongo_collections,
            get_mongo_documents,
            insert_mongo_document,
            replace_mongo_document,
            delete_mongo_document,
            execute_mongo
        ])
        .run(tauri::generate_context!())
        .expect("OrangeHub 启动失败");
}
