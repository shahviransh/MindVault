use crate::error::{AppError, AppResult};
use crate::policy::{default_allow, Level};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRow {
    pub level: Level,
    pub started_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub block_completed: bool,
    pub frozen_allow: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub image_name: String,
    pub category: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Schedule {
    pub id: String,
    /// 0 = Monday through 6 = Sunday.
    pub days: Vec<u8>,
    /// Local wall-clock start, "HH:MM".
    pub start: String,
    pub minutes: u32,
    pub level: Level,
}

pub struct Store {
    conn: Connection,
}

impl Store {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| AppError::Message(err.to_string()))?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS kv (
                k TEXT PRIMARY KEY,
                v TEXT NOT NULL
            );",
        )?;
        let store = Self { conn };
        if store.get("api_base")?.is_none() {
            store.set("api_base", "https://text.pollinations.ai/openai")?;
        }
        if store.get("model")?.is_none() {
            store.set("model", "openai-fast")?;
        }
        if store.get("allow_hosts")?.is_none() {
            store.set(
                "allow_hosts",
                &serde_json::to_string(&default_allow()).unwrap_or_else(|_| "[]".into()),
            )?;
        }
        if store.get("custom_blocks")?.is_none() {
            store.set("custom_blocks", "[]")?;
        }
        Ok(store)
    }

    fn get(&self, key: &str) -> AppResult<Option<String>> {
        let mut statement = self.conn.prepare("SELECT v FROM kv WHERE k = ?1")?;
        let mut rows = statement.query(params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    fn set(&self, key: &str, value: &str) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO kv (k, v) VALUES (?1, ?2)
             ON CONFLICT(k) DO UPDATE SET v = excluded.v",
            params![key, value],
        )?;
        Ok(())
    }

    fn remove(&self, key: &str) -> AppResult<()> {
        self.conn.execute("DELETE FROM kv WHERE k = ?1", params![key])?;
        Ok(())
    }

    pub fn pin_hash(&self) -> AppResult<Option<String>> {
        self.get("pin_hash")
    }

    pub fn set_pin_hash(&self, value: &str) -> AppResult<()> {
        self.set("pin_hash", value)
    }

    pub fn recovery_hash(&self) -> AppResult<Option<String>> {
        self.get("recovery_hash")
    }

    pub fn set_recovery_hash(&self, value: &str) -> AppResult<()> {
        self.set("recovery_hash", value)
    }

    pub fn recovery_acknowledged(&self) -> AppResult<bool> {
        Ok(self.get("recovery_ack")?.as_deref() == Some("1"))
    }

    pub fn set_recovery_acknowledged(&self) -> AppResult<()> {
        self.set("recovery_ack", "1")
    }

    pub fn api_base(&self) -> AppResult<String> {
        Ok(self
            .get("api_base")?
            .unwrap_or_else(|| "https://text.pollinations.ai/openai".into()))
    }

    pub fn set_api_base(&self, value: &str) -> AppResult<()> {
        self.set("api_base", value)
    }

    pub fn model(&self) -> AppResult<String> {
        Ok(self.get("model")?.unwrap_or_else(|| "openai-fast".into()))
    }

    pub fn set_model(&self, value: &str) -> AppResult<()> {
        self.set("model", value)
    }

    pub fn allow_hosts(&self) -> AppResult<Vec<String>> {
        self.json("allow_hosts", default_allow())
    }

    pub fn set_allow_hosts(&self, hosts: &[String]) -> AppResult<()> {
        self.set("allow_hosts", &serde_json::to_string(hosts).unwrap_or_else(|_| "[]".into()))
    }

    pub fn custom_blocks(&self) -> AppResult<Vec<String>> {
        self.json("custom_blocks", Vec::new())
    }

    pub fn set_custom_blocks(&self, names: &[String]) -> AppResult<()> {
        self.set(
            "custom_blocks",
            &serde_json::to_string(names).unwrap_or_else(|_| "[]".into()),
        )
    }

    pub fn suggestion(&self) -> AppResult<Option<Suggestion>> {
        match self.get("pending_suggestion")? {
            Some(raw) if !raw.is_empty() && raw != "null" => Ok(serde_json::from_str(&raw).ok()),
            _ => Ok(None),
        }
    }

    pub fn set_suggestion(&self, suggestion: Option<&Suggestion>) -> AppResult<()> {
        match suggestion {
            Some(value) => self.set(
                "pending_suggestion",
                &serde_json::to_string(value).unwrap_or_else(|_| "null".into()),
            ),
            None => self.remove("pending_suggestion"),
        }
    }

    pub fn session(&self) -> AppResult<Option<SessionRow>> {
        match self.get("session")? {
            Some(raw) if !raw.is_empty() && raw != "null" => Ok(serde_json::from_str(&raw).ok()),
            _ => Ok(None),
        }
    }

    pub fn set_session(&self, session: Option<&SessionRow>) -> AppResult<()> {
        match session {
            Some(value) => self.set(
                "session",
                &serde_json::to_string(value).unwrap_or_else(|_| "null".into()),
            ),
            None => self.remove("session"),
        }
    }

    pub fn schedules(&self) -> AppResult<Vec<Schedule>> {
        self.json("schedules", Vec::new())
    }

    pub fn set_schedules(&self, schedules: &[Schedule]) -> AppResult<()> {
        self.set(
            "schedules",
            &serde_json::to_string(schedules).unwrap_or_else(|_| "[]".into()),
        )
    }

    pub fn schedule_fired(&self) -> AppResult<Vec<String>> {
        self.json("schedule_fired", Vec::new())
    }

    pub fn set_schedule_fired(&self, marks: &[String]) -> AppResult<()> {
        self.set(
            "schedule_fired",
            &serde_json::to_string(marks).unwrap_or_else(|_| "[]".into()),
        )
    }

    pub fn enforcing(&self) -> AppResult<bool> {
        Ok(self.get("enforcing")?.as_deref() == Some("1"))
    }

    pub fn set_enforcing(&self, on: bool) -> AppResult<()> {
        self.set("enforcing", if on { "1" } else { "0" })
    }

    fn json<T: for<'de> Deserialize<'de>>(&self, key: &str, fallback: T) -> AppResult<T> {
        match self.get(key)? {
            Some(raw) => Ok(serde_json::from_str(&raw).unwrap_or(fallback)),
            None => Ok(fallback),
        }
    }
}
