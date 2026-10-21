use std::sync::Mutex;

pub trait Secrets: Send {
    fn set_key(&self, key: &str) -> Result<(), String>;
    fn get_key(&self) -> Result<Option<String>, String>;
    fn clear_key(&self) -> Result<(), String>;
}

// Test-only stand-in for KeyringSecrets so session tests never touch Credential Manager.
#[derive(Default)]
#[allow(dead_code)]
pub struct MemorySecrets {
    key: Mutex<Option<String>>,
}

impl Secrets for MemorySecrets {
    fn set_key(&self, key: &str) -> Result<(), String> {
        *self.key.lock().map_err(|err| err.to_string())? = Some(key.to_string());
        Ok(())
    }

    fn get_key(&self) -> Result<Option<String>, String> {
        Ok(self.key.lock().map_err(|err| err.to_string())?.clone())
    }

    fn clear_key(&self) -> Result<(), String> {
        *self.key.lock().map_err(|err| err.to_string())? = None;
        Ok(())
    }
}

pub struct KeyringSecrets;

impl Secrets for KeyringSecrets {
    fn set_key(&self, key: &str) -> Result<(), String> {
        let entry = keyring::Entry::new("MindVault", "llm-api-key").map_err(|err| err.to_string())?;
        entry.set_password(key).map_err(|err| err.to_string())
    }

    fn get_key(&self) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new("MindVault", "llm-api-key").map_err(|err| err.to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    }

    fn clear_key(&self) -> Result<(), String> {
        let entry = keyring::Entry::new("MindVault", "llm-api-key").map_err(|err| err.to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        }
    }
}
