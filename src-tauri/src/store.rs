//! Built-in application store, backed by a bundled SQLite database.
//!
//! The schema separates *non-secret* connection metadata from *secret* fields
//! so that listing connections never has to touch the vault, and a locked vault
//! still lets the sidebar render. Secrets live in the `secrets` table keyed by
//! `(connection_id, field)` and are bound to that key via AAD.

use std::path::Path;

use serde_json::json;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Row, SqlitePool};

use crate::crypto::{self, VaultKey};
use crate::error::{AppError, AppResult, QueryResult};
use crate::models::*;

/// How the vault key is obtained at startup.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VaultMode {
    /// Key is derived from a master password the user types at startup.
    Master,
    /// Key is a random file-protected secret; convenient, less strict.
    Convenience,
    /// No vault configured yet — first run.
    Unset,
}

#[derive(Clone)]
pub struct Store {
    pub pool: SqlitePool,
}

impl Store {
    /// Open (creating if needed) the application database at `path`.
    pub async fn open(path: &Path) -> AppResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }

        let opts = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            // WAL keeps the UI responsive while a long write is in flight.
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .foreign_keys(true)
            .busy_timeout(std::time::Duration::from_secs(10));

        let pool = SqlitePoolOptions::new()
            .max_connections(8)
            .connect_with(opts)
            .await
            .map_err(|e| AppError::Db(e.to_string()))?;

        let store = Self { pool };
        store.migrate().await?;
        Ok(store)
    }

    async fn migrate(&self) -> AppResult<()> {
        let ddl = [
            r#"CREATE TABLE IF NOT EXISTS app_meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )"#,
            r#"CREATE TABLE IF NOT EXISTS groups (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                parent_id  TEXT REFERENCES groups(id) ON DELETE CASCADE,
                color      TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0
            )"#,
            r#"CREATE TABLE IF NOT EXISTS connections (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                kind       TEXT NOT NULL,
                group_id   TEXT REFERENCES groups(id) ON DELETE SET NULL,
                host       TEXT NOT NULL DEFAULT '',
                port       INTEGER NOT NULL DEFAULT 0,
                username   TEXT NOT NULL DEFAULT '',
                config     TEXT NOT NULL DEFAULT '{}',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"#,
            r#"CREATE TABLE IF NOT EXISTS secrets (
                connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                field         TEXT NOT NULL,
                cipher        TEXT NOT NULL,
                PRIMARY KEY (connection_id, field)
            )"#,
            r#"CREATE TABLE IF NOT EXISTS snippets (
                id            TEXT PRIMARY KEY,
                connection_id TEXT,
                name          TEXT NOT NULL,
                sql_text      TEXT NOT NULL,
                tags          TEXT,
                created_at    TEXT NOT NULL
            )"#,
            r#"CREATE TABLE IF NOT EXISTS history (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                connection_id TEXT,
                sql_text      TEXT NOT NULL,
                succeeded     INTEGER NOT NULL,
                rows_affected INTEGER NOT NULL DEFAULT 0,
                elapsed_ms    INTEGER NOT NULL DEFAULT 0,
                error         TEXT,
                created_at    TEXT NOT NULL
            )"#,
            r#"CREATE TABLE IF NOT EXISTS known_hosts (
                host        TEXT NOT NULL,
                port        INTEGER NOT NULL,
                key_type    TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                first_seen  TEXT NOT NULL,
                PRIMARY KEY (host, port, key_type)
            )"#,
            r#"CREATE TABLE IF NOT EXISTS ssh_monitor_samples (
                connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
                sampled_at    INTEGER NOT NULL,
                payload       TEXT NOT NULL,
                PRIMARY KEY (connection_id, sampled_at)
            )"#,
            "CREATE INDEX IF NOT EXISTS idx_history_conn ON history(connection_id, id DESC)",
            "CREATE INDEX IF NOT EXISTS idx_conn_kind ON connections(kind)",
            "CREATE INDEX IF NOT EXISTS idx_ssh_monitor_samples_time ON ssh_monitor_samples(connection_id, sampled_at)",
        ];

        for stmt in ddl {
            sqlx::query(stmt)
                .execute(&self.pool)
                .await
                .map_err(|e| AppError::Db(format!("初始化表结构失败: {e}")))?;
        }
        Ok(())
    }

    /* ------------------------------------------------------------------ */
    /* app_meta                                                            */
    /* ------------------------------------------------------------------ */

    pub async fn meta_get(&self, key: &str) -> AppResult<Option<String>> {
        let row = sqlx::query("SELECT value FROM app_meta WHERE key = ?")
            .bind(key)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.map(|r| r.get::<String, _>("value")))
    }

    pub async fn meta_set(&self, key: &str, value: &str) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO app_meta(key, value) VALUES(?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(key)
        .bind(value)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn vault_mode(&self) -> AppResult<VaultMode> {
        Ok(match self.meta_get("vault.mode").await?.as_deref() {
            Some("master") => VaultMode::Master,
            Some("convenience") => VaultMode::Convenience,
            _ => VaultMode::Unset,
        })
    }

    /// Store the vault parameters after the key has been established.
    pub async fn set_vault_master(&self, salt_b64: &str, verifier: &str) -> AppResult<()> {
        self.meta_set("vault.mode", "master").await?;
        self.meta_set("vault.salt", salt_b64).await?;
        self.meta_set("vault.verifier", verifier).await?;
        Ok(())
    }

    pub async fn vault_salt(&self) -> AppResult<Option<String>> {
        self.meta_get("vault.salt").await
    }

    pub async fn vault_verifier(&self) -> AppResult<Option<String>> {
        self.meta_get("vault.verifier").await
    }

    /* ------------------------------------------------------------------ */
    /* groups                                                              */
    /* ------------------------------------------------------------------ */

    pub async fn list_groups(&self) -> AppResult<Vec<Group>> {
        let rows = sqlx::query("SELECT * FROM groups ORDER BY sort_order, name")
            .fetch_all(&self.pool)
            .await?;
        Ok(rows
            .into_iter()
            .map(|r| Group {
                id: r.get("id"),
                name: r.get("name"),
                parent_id: r.get("parent_id"),
                color: r.get("color"),
                sort_order: r.get("sort_order"),
            })
            .collect())
    }

    pub async fn upsert_group(&self, g: &Group) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO groups(id, name, parent_id, color, sort_order) VALUES(?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name, parent_id = excluded.parent_id,
                color = excluded.color, sort_order = excluded.sort_order",
        )
        .bind(&g.id)
        .bind(&g.name)
        .bind(&g.parent_id)
        .bind(&g.color)
        .bind(g.sort_order)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_group(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM groups WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /* ------------------------------------------------------------------ */
    /* connections                                                         */
    /* ------------------------------------------------------------------ */

    pub async fn list_connections(&self) -> AppResult<Vec<Connection>> {
        let rows = sqlx::query("SELECT * FROM connections ORDER BY sort_order, name")
            .fetch_all(&self.pool)
            .await?;
        rows.into_iter().map(Self::row_to_connection).collect()
    }

    pub async fn get_connection(&self, id: &str) -> AppResult<Connection> {
        let row = sqlx::query("SELECT * FROM connections WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or_else(|| AppError::NotFound(id.to_string()))?;
        Self::row_to_connection(row)
    }

    fn row_to_connection(r: sqlx::sqlite::SqliteRow) -> AppResult<Connection> {
        let id: String = r.get("id");
        let config_text: String = r.get("config");
        let mut config: serde_json::Value = serde_json::from_str(&config_text)
            .map_err(|error| AppError::Db(format!("连接配置 JSON 无效 ({id}): {error}")))?;

        let kind_str: String = r.get("kind");
        let kind = ConnKind::parse(&kind_str)
            .ok_or_else(|| AppError::Db(format!("未知的连接类型: {kind_str}")))?;

        let name: String = r.get("name");
        let group_id: Option<String> = r.get("group_id");
        let host: String = r.get("host");
        let port = r.get::<i64, _>("port").clamp(0, u16::MAX as i64) as u16;
        let username: String = r.get("username");
        let created_at: String = r.get("created_at");
        let updated_at: String = r.get("updated_at");

        // These indexed columns are intentionally excluded from the JSON config.
        // Seed them before deserialization because they are required by Connection.
        let config_object = config.as_object_mut().ok_or_else(|| {
            AppError::Db(format!("连接配置格式错误 ({id}): expected a JSON object"))
        })?;
        config_object.insert("id".into(), json!(id));
        config_object.insert("name".into(), json!(name));
        config_object.insert("kind".into(), json!(kind));
        config_object.insert("groupId".into(), json!(group_id));
        config_object.insert("host".into(), json!(host));
        config_object.insert("port".into(), json!(port));
        config_object.insert("username".into(), json!(username));
        config_object.insert("createdAt".into(), json!(created_at));
        config_object.insert("updatedAt".into(), json!(updated_at));

        // Deserialize the flexible half of the record from the JSON column, then
        // overwrite the indexed columns (they are the source of truth).
        let mut conn: Connection = serde_json::from_value(config)
            .map_err(|error| AppError::Db(format!("连接配置格式错误 ({id}): {error}")))?;

        conn.id = id;
        conn.name = name;
        conn.kind = kind;
        conn.group_id = group_id;
        conn.host = host;
        conn.port = port;
        conn.username = username;
        conn.created_at = Some(created_at);
        conn.updated_at = Some(updated_at);
        // Secrets never live in this table.
        conn.password = None;
        conn.key_passphrase = None;
        Ok(conn)
    }

    /// Insert or update a connection. Secrets, when present, are sealed with the
    /// vault key and written to the `secrets` table.
    ///
    /// When `key` is `None` the secret rows are left untouched, which is what
    /// keeps an edit made with a locked vault from silently wiping passwords.
    pub async fn upsert_connection(&self, c: &Connection, key: Option<&VaultKey>) -> AppResult<()> {
        let now = now_iso();
        let created = c.created_at.clone().unwrap_or_else(|| now.clone());

        // Serialise the non-indexed fields.
        let mut cfg = serde_json::to_value(c)?;
        if let Some(obj) = cfg.as_object_mut() {
            for k in [
                "id",
                "name",
                "kind",
                "groupId",
                "host",
                "port",
                "username",
                "createdAt",
                "updatedAt",
                "password",
                "keyPassphrase",
            ] {
                obj.remove(k);
            }
        }

        sqlx::query(
            "INSERT INTO connections(id, name, kind, group_id, host, port, username, config, created_at, updated_at)
             VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name, kind = excluded.kind, group_id = excluded.group_id,
                host = excluded.host, port = excluded.port, username = excluded.username,
                config = excluded.config, updated_at = excluded.updated_at",
        )
        .bind(&c.id)
        .bind(&c.name)
        .bind(c.kind.as_str())
        .bind(&c.group_id)
        .bind(&c.host)
        .bind(c.port as i64)
        .bind(&c.username)
        .bind(cfg.to_string())
        .bind(&created)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        if let Some(key) = key {
            if let Some(pw) = c.password.as_deref() {
                self.set_secret(key, &c.id, "password", pw).await?;
            }
            if let Some(pass) = c.key_passphrase.as_deref() {
                self.set_secret(key, &c.id, "key_passphrase", pass).await?;
            }
        }
        Ok(())
    }

    pub async fn delete_connection(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM connections WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Move a connection into a group (or to the root when `group_id` is None).
    pub async fn set_connection_group(&self, id: &str, group_id: Option<&str>) -> AppResult<()> {
        sqlx::query("UPDATE connections SET group_id = ?, updated_at = ? WHERE id = ?")
            .bind(group_id)
            .bind(now_iso())
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /* ------------------------------------------------------------------ */
    /* secrets                                                             */
    /* ------------------------------------------------------------------ */

    pub async fn set_secret(
        &self,
        key: &VaultKey,
        connection_id: &str,
        field: &str,
        plaintext: &str,
    ) -> AppResult<()> {
        let aad = crypto::aad_for(connection_id, field);
        let cipher = crypto::seal(key, plaintext, &aad)?;
        sqlx::query(
            "INSERT INTO secrets(connection_id, field, cipher) VALUES(?, ?, ?)
             ON CONFLICT(connection_id, field) DO UPDATE SET cipher = excluded.cipher",
        )
        .bind(connection_id)
        .bind(field)
        .bind(&cipher)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_secret(
        &self,
        key: &VaultKey,
        connection_id: &str,
        field: &str,
    ) -> AppResult<Option<String>> {
        let row = sqlx::query("SELECT cipher FROM secrets WHERE connection_id = ? AND field = ?")
            .bind(connection_id)
            .bind(field)
            .fetch_optional(&self.pool)
            .await?;

        match row {
            None => Ok(None),
            Some(r) => {
                let aad = crypto::aad_for(connection_id, field);
                let cipher: String = r.get("cipher");
                Ok(Some(crypto::open(key, &cipher, &aad)?))
            }
        }
    }

    pub async fn delete_secret(&self, connection_id: &str, field: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM secrets WHERE connection_id = ? AND field = ?")
            .bind(connection_id)
            .bind(field)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Does a stored password exist for this connection?
    pub async fn has_secret(&self, connection_id: &str, field: &str) -> AppResult<bool> {
        let row = sqlx::query("SELECT 1 FROM secrets WHERE connection_id = ? AND field = ?")
            .bind(connection_id)
            .bind(field)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.is_some())
    }

    /// Load a connection together with its decrypted secrets, ready to connect.
    pub async fn load_with_secrets(&self, key: &VaultKey, id: &str) -> AppResult<Connection> {
        let mut c = self.get_connection(id).await?;
        c.password = self.get_secret(key, id, "password").await?;
        c.key_passphrase = self.get_secret(key, id, "key_passphrase").await?;
        Ok(c)
    }

    /* ------------------------------------------------------------------ */
    /* snippets & history                                                  */
    /* ------------------------------------------------------------------ */

    pub async fn list_snippets(&self, connection_id: Option<&str>) -> AppResult<Vec<Snippet>> {
        let rows = match connection_id {
            Some(id) => {
                sqlx::query("SELECT * FROM snippets WHERE connection_id = ? ORDER BY name")
                    .bind(id)
                    .fetch_all(&self.pool)
                    .await?
            }
            None => {
                sqlx::query("SELECT * FROM snippets ORDER BY name")
                    .fetch_all(&self.pool)
                    .await?
            }
        };
        Ok(rows
            .into_iter()
            .map(|r| Snippet {
                id: r.get("id"),
                connection_id: r.get("connection_id"),
                name: r.get("name"),
                sql_text: r.get("sql_text"),
                tags: r.get("tags"),
                created_at: r.get("created_at"),
            })
            .collect())
    }

    pub async fn upsert_snippet(&self, s: &Snippet) -> AppResult<()> {
        let created = s.created_at.clone().unwrap_or_else(now_iso);
        sqlx::query(
            "INSERT INTO snippets(id, connection_id, name, sql_text, tags, created_at)
             VALUES(?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                connection_id = excluded.connection_id, name = excluded.name,
                sql_text = excluded.sql_text, tags = excluded.tags",
        )
        .bind(&s.id)
        .bind(&s.connection_id)
        .bind(&s.name)
        .bind(&s.sql_text)
        .bind(&s.tags)
        .bind(&created)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_snippet(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM snippets WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn push_history(
        &self,
        connection_id: Option<&str>,
        sql_text: &str,
        result: Option<&QueryResult>,
        error: Option<&str>,
    ) -> AppResult<()> {
        let (ok, affected, elapsed) = match result {
            Some(r) => (1i64, r.rows_affected as i64, r.elapsed_ms as i64),
            None => (0, 0, 0),
        };
        sqlx::query(
            "INSERT INTO history(connection_id, sql_text, succeeded, rows_affected, elapsed_ms, error, created_at)
             VALUES(?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(connection_id)
        .bind(sql_text)
        .bind(ok)
        .bind(affected)
        .bind(elapsed)
        .bind(error)
        .bind(now_iso())
        .execute(&self.pool)
        .await?;

        // Keep the history bounded so the app database does not grow forever.
        sqlx::query(
            "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 2000)",
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn push_activity(
        &self,
        connection_id: Option<&str>,
        description: &str,
        succeeded: bool,
        elapsed_ms: u64,
        error: Option<&str>,
    ) -> AppResult<i64> {
        let result = sqlx::query(
            "INSERT INTO history(connection_id, sql_text, succeeded, rows_affected, elapsed_ms, error, created_at)
             VALUES(?, ?, ?, 0, ?, ?, ?)",
        )
        .bind(connection_id)
        .bind(description)
        .bind(if succeeded { 1i64 } else { 0i64 })
        .bind(elapsed_ms.min(i64::MAX as u64) as i64)
        .bind(error)
        .bind(now_iso())
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 2000)",
        )
        .execute(&self.pool)
        .await?;
        Ok(result.last_insert_rowid())
    }

    pub async fn finish_activity(
        &self,
        id: i64,
        elapsed_ms: u64,
        succeeded: bool,
        error: Option<&str>,
    ) -> AppResult<()> {
        sqlx::query("UPDATE history SET succeeded = ?, elapsed_ms = ?, error = ? WHERE id = ?")
            .bind(if succeeded { 1i64 } else { 0i64 })
            .bind(elapsed_ms.min(i64::MAX as u64) as i64)
            .bind(error)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn list_history(&self, limit: i64) -> AppResult<Vec<HistoryEntry>> {
        let rows = sqlx::query("SELECT * FROM history ORDER BY id DESC LIMIT ?")
            .bind(limit)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows
            .into_iter()
            .map(|r| HistoryEntry {
                id: r.get("id"),
                connection_id: r.get("connection_id"),
                sql_text: r.get("sql_text"),
                succeeded: r.get::<i64, _>("succeeded") != 0,
                rows_affected: r.get::<i64, _>("rows_affected").max(0) as u64,
                elapsed_ms: r.get::<i64, _>("elapsed_ms").max(0) as u64,
                error: r.get("error"),
                created_at: r.get("created_at"),
            })
            .collect())
    }

    pub async fn clear_history(&self) -> AppResult<()> {
        sqlx::query("DELETE FROM history")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_history_entry(&self, id: i64) -> AppResult<()> {
        sqlx::query("DELETE FROM history WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn save_ssh_monitor_sample(
        &self,
        connection_id: &str,
        sampled_at: i64,
        payload: &str,
    ) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO ssh_monitor_samples(connection_id, sampled_at, payload) VALUES(?, ?, ?)
             ON CONFLICT(connection_id, sampled_at) DO UPDATE SET payload = excluded.payload",
        )
        .bind(connection_id)
        .bind(sampled_at)
        .bind(payload)
        .execute(&self.pool)
        .await?;

        let retention_cutoff = sampled_at.saturating_sub(30 * 24 * 60 * 60 * 1000);
        sqlx::query("DELETE FROM ssh_monitor_samples WHERE sampled_at < ?")
            .bind(retention_cutoff)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn list_ssh_monitor_samples(
        &self,
        connection_id: &str,
        since: i64,
    ) -> AppResult<Vec<(i64, String)>> {
        let rows = sqlx::query(
            "SELECT sampled_at, payload FROM ssh_monitor_samples
             WHERE connection_id = ? AND sampled_at >= ? ORDER BY sampled_at",
        )
        .bind(connection_id)
        .bind(since)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| (row.get("sampled_at"), row.get("payload")))
            .collect())
    }

    /* ------------------------------------------------------------------ */
    /* known hosts (SSH trust-on-first-use)                                */
    /* ------------------------------------------------------------------ */

    /// Returns `Ok(true)` when the key is already trusted, `Ok(false)` when the
    /// host is new, and an error when the host's key has *changed* — which is
    /// the case the user must be warned about.
    pub async fn check_known_host(
        &self,
        host: &str,
        port: u16,
        key_type: &str,
        fingerprint: &str,
    ) -> AppResult<KnownHostVerdict> {
        let row = sqlx::query(
            "SELECT fingerprint FROM known_hosts WHERE host = ? AND port = ? AND key_type = ?",
        )
        .bind(host)
        .bind(port as i64)
        .bind(key_type)
        .fetch_optional(&self.pool)
        .await?;

        Ok(match row {
            None => KnownHostVerdict::Unknown,
            Some(r) => {
                let stored: String = r.get("fingerprint");
                if stored == fingerprint {
                    KnownHostVerdict::Trusted
                } else {
                    KnownHostVerdict::Changed {
                        stored: stored.clone(),
                        presented: fingerprint.to_string(),
                    }
                }
            }
        })
    }

    pub async fn trust_host(
        &self,
        host: &str,
        port: u16,
        key_type: &str,
        fingerprint: &str,
    ) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO known_hosts(host, port, key_type, fingerprint, first_seen)
             VALUES(?, ?, ?, ?, ?)
             ON CONFLICT(host, port, key_type) DO UPDATE SET fingerprint = excluded.fingerprint",
        )
        .bind(host)
        .bind(port as i64)
        .bind(key_type)
        .bind(fingerprint)
        .bind(now_iso())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn forget_host(&self, host: &str, port: u16) -> AppResult<()> {
        sqlx::query("DELETE FROM known_hosts WHERE host = ? AND port = ?")
            .bind(host)
            .bind(port as i64)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum KnownHostVerdict {
    /// Never seen before; the UI asks the user to confirm.
    Unknown,
    /// Matches the stored key.
    Trusted,
    /// The host presented a different key than before — possible MITM.
    Changed { stored: String, presented: String },
}

/// Current UTC time as an ISO-8601 string.
pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}
