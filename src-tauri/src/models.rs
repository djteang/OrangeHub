use serde::{Deserialize, Serialize};

/// The kind of remote endpoint a saved connection describes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnKind {
    /// SSH terminal (optionally with SFTP browsing).
    Ssh,
    /// Plain / TLS FTP.
    Ftp,
    /// SFTP standalone (reuses the SSH transport).
    Sftp,
    /// Relational SQL over the wire (MySQL, TiDB, PostgreSQL, SQLite file).
    Sql,
    /// Key-value store.
    Redis,
    /// Document store.
    Mongo,
    /// Docker Engine / compatible container runtime.
    Docker,
}

impl ConnKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ConnKind::Ssh => "ssh",
            ConnKind::Ftp => "ftp",
            ConnKind::Sftp => "sftp",
            ConnKind::Sql => "sql",
            ConnKind::Redis => "redis",
            ConnKind::Mongo => "mongo",
            ConnKind::Docker => "docker",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        Some(match s {
            "ssh" => ConnKind::Ssh,
            "ftp" => ConnKind::Ftp,
            "sftp" => ConnKind::Sftp,
            "sql" => ConnKind::Sql,
            "redis" => ConnKind::Redis,
            "mongo" => ConnKind::Mongo,
            "docker" => ConnKind::Docker,
            _ => return None,
        })
    }
}

/// SSH/SFTP authentication method.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SshAuthMethod {
    Password,
    /// Private key supplied inline or read from `key_path`.
    PrivateKey,
    /// Try the local ssh-agent first, then fall back to other methods.
    Agent,
    KeyboardInteractive,
}

impl Default for SshAuthMethod {
    fn default() -> Self {
        SshAuthMethod::Password
    }
}

/// A connection record as persisted in the built-in database.
///
/// Secrets (`password`, `key_passphrase`) are *not* stored here in plaintext;
/// they live in the `secrets` table encrypted with the vault key. This struct
/// carries them only transiently while building a live session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: String,
    pub name: String,
    pub kind: ConnKind,
    /// Optional group/folder id for the sidebar tree.
    #[serde(default)]
    pub group_id: Option<String>,
    pub host: String,
    #[serde(default)]
    pub port: u16,
    #[serde(default)]
    pub username: String,

    /* ---------- SSH / SFTP ---------- */
    #[serde(default)]
    pub auth_method: SshAuthMethod,
    /// Path to a private key file on the local machine (for `PrivateKey`).
    #[serde(default)]
    pub key_path: Option<String>,
    /// PEM/OpenSSH private key pasted directly, used when `key_path` is absent.
    #[serde(default)]
    pub private_key_inline: Option<String>,
    /// Terminal type requested on the remote PTY.
    #[serde(default)]
    pub term: Option<String>,

    /* ---------- FTP ---------- */
    #[serde(default)]
    pub ftp_secure: bool,
    #[serde(default)]
    pub ftp_passive: bool,
    #[serde(default)]
    pub ftp_anonymous: bool,

    /* ---------- SQL ---------- */
    /// `mysql` / `mariadb` / `tidb` / `oceanbase` / `doris` / `starrocks` /
    /// `clickhouse` /
    /// `postgres` / `cockroachdb` / `neon` / `sqlite` / `mssql` / `oracle`.
    /// Compatible products are normalized to the MySQL or PostgreSQL driver
    /// by the command layer while preserving the selected product for the UI.
    #[serde(default)]
    pub sql_driver: Option<String>,
    #[serde(default)]
    pub database: Option<String>,
    /// For SQLite: path to the local database file.
    #[serde(default)]
    pub sqlite_path: Option<String>,
    /// Extra DSN parameters appended to the generated URL.
    #[serde(default)]
    pub sql_params: Option<String>,
    /// SQL text run automatically right after connecting (e.g. `SET NAMES`).
    #[serde(default)]
    pub init_command: Option<String>,

    /* ---------- Redis / Mongo ---------- */
    /// Redis logical database index.
    #[serde(default)]
    pub redis_db: Option<i64>,
    /// Mongo auth database (defaults to `admin`).
    #[serde(default)]
    pub mongo_auth_db: Option<String>,
    #[serde(default)]
    pub mongo_uri: Option<String>,

    /* ---------- Docker TLS client certificates ---------- */
    #[serde(default)]
    pub docker_tls_ca: Option<String>,
    #[serde(default)]
    pub docker_tls_cert: Option<String>,
    #[serde(default)]
    pub docker_tls_key: Option<String>,

    /* ---------- shared ---------- */
    /// Connect through another saved connection's SSH tunnel.
    #[serde(default)]
    pub via_connection_id: Option<String>,
    /// Prefer TLS/SSL when the protocol supports it.
    #[serde(default)]
    pub use_tls: bool,
    /// Skip certificate validation (self-signed setups).
    #[serde(default)]
    pub unsafe_tls: bool,
    /// Seconds before giving up on the initial connect.
    #[serde(default)]
    pub connect_timeout_secs: Option<u64>,
    /// Free-form note shown in the connection editor.
    #[serde(default)]
    pub notes: Option<String>,

    /* ---------- transient secrets (never persisted in this table) ---------- */
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub key_passphrase: Option<String>,

    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

impl Connection {
    /// Port used when the user left it blank.
    pub fn effective_port(&self) -> u16 {
        if self.port != 0 {
            return self.port;
        }
        match self.kind {
            ConnKind::Ssh | ConnKind::Sftp => 22,
            ConnKind::Ftp => 21,
            ConnKind::Redis => 6379,
            ConnKind::Mongo => 27017,
            ConnKind::Docker => 2375,
            ConnKind::Sql => match self.sql_driver.as_deref() {
                Some("postgres") | Some("cockroachdb") | Some("neon") => 5432,
                Some("tidb") => 4000,
                Some("oceanbase") => 2881,
                Some("doris") | Some("starrocks") => 9030,
                // ClickHouse's MySQL compatibility endpoint listens on 9004.
                // The native TCP endpoint (9000) uses a different protocol.
                Some("clickhouse") => 9004,
                Some("mssql") => 1433,
                Some("oracle") => 1521,
                Some("mariadb") | Some("mysql") | None => 3306,
                _ => 3306,
            },
        }
    }
}

/// Sidebar grouping node.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub sort_order: i64,
}

/// Categories used by the sidebar to bucket connections.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Ssh,
    Ftp,
    Database,
    Docker,
}

impl Category {
    pub fn of(c: &Connection) -> Self {
        match c.kind {
            ConnKind::Ssh | ConnKind::Sftp => Category::Ssh,
            ConnKind::Ftp => Category::Ftp,
            ConnKind::Sql | ConnKind::Redis | ConnKind::Mongo => Category::Database,
            ConnKind::Docker => Category::Docker,
        }
    }
}

/// A saved SQL snippet / favourite query.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: String,
    pub connection_id: Option<String>,
    pub name: String,
    pub sql_text: String,
    #[serde(default)]
    pub tags: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
}

/// One entry in the query history panel.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: i64,
    pub connection_id: Option<String>,
    pub sql_text: String,
    pub succeeded: bool,
    pub rows_affected: u64,
    pub elapsed_ms: u64,
    pub error: Option<String>,
    pub created_at: String,
}

/// A remote directory entry, shared by SFTP and FTP listing code paths.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    /// Absolute path on the remote side.
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    /// Modification time as a Unix timestamp in seconds.
    pub modified: Option<i64>,
    pub permissions: Option<String>,
    pub owner: Option<String>,
    pub group: Option<String>,
}

/// Progress payload emitted during long transfers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
    pub transfer_id: String,
    pub direction: String,
    /// Bytes moved so far.
    pub transferred: u64,
    /// Total bytes, or 0 when the remote size is unknown.
    pub total: u64,
    pub current_file: String,
    /// 0..100, or -1 when indeterminate.
    pub percent: f64,
    pub done: bool,
    pub error: Option<String>,
}
