use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("A session can be from 1 minute up to 8 hours.")]
    Duration,
    #[error("That site stays blocked.")]
    DeniedHost,
    #[error("Only https study pages on your allowlist can open.")]
    BadUrl,
    #[error("Enter the recovery key from setup.")]
    BadRecovery,
    #[error("Wrong PIN.")]
    BadPin,
    #[error("Finish a quiz or a skill game, or enter the recovery key.")]
    NotEarned,
    #[error("A session is already running.")]
    AlreadyActive,
    #[error("No session is running.")]
    NoSession,
    #[error("Change this before a session starts.")]
    Frozen,
    #[error("Save the recovery key before starting a session.")]
    RecoveryNotSaved,
    #[error("Set a PIN before starting a Standard or Full session.")]
    PinRequired,
    #[error("A cloud tutor needs an API key. A model on this computer does not. Reading and the skill games still work.")]
    NoKey,
    #[error("That request is not a study action.")]
    Freeform,
    #[error("That program cannot be blocked.")]
    ProtectedProgram,
    #[error("MindVault is already set up on this account.")]
    AlreadyEnrolled,
    #[error("Set up MindVault before doing that.")]
    NotEnrolled,
    #[error("Use at least 4 characters for the PIN.")]
    WeakPin,
    #[error("Classify programs before a session starts.")]
    ClassifyWhileLocked,
    #[error("The tutor is available during a session.")]
    TutorWhileUnlocked,
    #[error("{0}")]
    Message(String),
    #[error("{0}")]
    Store(#[from] rusqlite::Error),
    #[error("{0}")]
    Hash(String),
}

impl From<argon2::password_hash::Error> for AppError {
    fn from(value: argon2::password_hash::Error) -> Self {
        AppError::Hash(value.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
