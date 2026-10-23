use serde::{Deserialize, Serialize};

/// Unified error type surfaced to the frontend.
///
/// Every command returns `Result<T, AppError>`; the `Display` representation is
/// what the UI shows in toasts, so messages are written for humans.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Msg(String),

    #[error("数据库错误: {0}")]
    Db(String),

    #[error("SQL 错误: {0}")]
    Sql(String),

    #[error("SSH 错误: {0}")]
    Ssh(String),

    #[error("SFTP 错误: {0}")]
    Sftp(String),

    #[error("FTP 错误: {0}")]
    Ftp(String),

    #[error("Redis 错误: {0}")]
    Redis(String),

    #[error("MongoDB 错误: {0}")]
    Mongo(String),

    #[error("Docker 错误: {0}")]
    Docker(String),

    #[error("未找到连接: {0}")]
    NotFound(String),

    #[error("连接未建立或已断开: {0}")]
    NotConnected(String),

    #[error("加密/解密失败: {0}")]
    Crypto(String),

    #[error("IO 错误: {0}")]
    Io(String),

    #[error("参数错误: {0}")]
    Invalid(String),
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Sql(e.to_string())
    }
}

impl From<russh::Error> for AppError {
    fn from(e: russh::Error) -> Self {
        AppError::Ssh(e.to_string())
    }
}

impl From<suppaftp::FtpError> for AppError {
    fn from(e: suppaftp::FtpError) -> Self {
        AppError::Ftp(e.to_string())
    }
}

impl From<redis::RedisError> for AppError {
    fn from(e: redis::RedisError) -> Self {
        AppError::Redis(e.to_string())
    }
}

impl From<mongodb::error::Error> for AppError {
    fn from(e: mongodb::error::Error) -> Self {
        AppError::Mongo(e.to_string())
    }
}

impl From<bollard::errors::Error> for AppError {
    fn from(e: bollard::errors::Error) -> Self {
        AppError::Docker(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Msg(format!("JSON: {e}"))
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Msg(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        AppError::Msg(s.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

/// A single column in a result set.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnDef {
    pub name: String,
    /// Best-effort display type ("INT", "VARCHAR", "JSON", ...).
    pub data_type: String,
}

/// A cell value, normalised for transport to the webview.
///
/// We keep the wire format small and predictable: everything that is not a
/// number/bool/null/text is rendered to text by the driver layer, with a
/// `blob:...` marker for binary data so the UI can offer a hex viewer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Cell {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    Text(String),
}

impl Cell {
    pub fn from_json(v: &serde_json::Value) -> Self {
        match v {
            serde_json::Value::Null => Cell::Null,
            serde_json::Value::Bool(b) => Cell::Bool(*b),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Cell::Int(i)
                } else {
                    Cell::Float(n.as_f64().unwrap_or(0.0))
                }
            }
            other => Cell::Text(other.to_string()),
        }
    }
}

/// Result of a SQL query or command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<ColumnDef>,
    pub rows: Vec<Vec<Cell>>,
    pub rows_affected: u64,
    /// Server-reported execution time in milliseconds.
    pub elapsed_ms: u64,
    /// True when the statement returned no result set (INSERT/UPDATE/DDL).
    pub is_exec: bool,
    /// Optional textual feedback from the server ("Query OK, 3 rows affected").
    pub message: Option<String>,
}

impl QueryResult {
    pub fn exec(rows_affected: u64, elapsed_ms: u64, message: Option<String>) -> Self {
        Self {
            columns: Vec::new(),
            rows: Vec::new(),
            rows_affected,
            elapsed_ms,
            is_exec: true,
            message,
        }
    }
}
