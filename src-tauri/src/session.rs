use crate::enforcer::Enforcer;
use crate::error::{AppError, AppResult};
use crate::policy::{
    ai_domains_except, deny_hosts, entertainment_domains, kept_server_for_base, sanitize_allowlist, select_targets,
    specs_for, study_url_allowed, validate_minutes, KeptServer, Level, ProcInfo, RuleKind, RuleSpec,
};
use crate::secrets::Secrets;
use crate::store::{Schedule, SessionRow, Store, Suggestion};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{Duration, NaiveDateTime, Utc};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    // Built by tests only; production always runs Mode::Live (see lib.rs).
    #[allow(dead_code)]
    Test,
    Live,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppView {
    pub enrolled: bool,
    pub recovery_acknowledged: bool,
    pub has_api_key: bool,
    pub api_base: String,
    pub model: String,
    pub allow_hosts: Vec<String>,
    pub deny_hosts: Vec<String>,
    pub custom_blocks: Vec<String>,
    pub pending_suggestion: Option<Suggestion>,
    pub session: Option<SessionRow>,
    pub schedules: Vec<Schedule>,
    pub practice_mode: bool,
}

pub struct PreparedCall {
    pub base: String,
    pub key: String,
    pub model: String,
}

pub struct Service {
    store: Store,
    enforcer: Box<dyn Enforcer>,
    secrets: Box<dyn Secrets>,
    mode: Mode,
}

impl Service {
    pub fn new(store: Store, enforcer: Box<dyn Enforcer>, secrets: Box<dyn Secrets>, mode: Mode) -> Self {
        Self {
            store,
            enforcer,
            secrets,
            mode,
        }
    }

    pub fn view(&self) -> AppResult<AppView> {
        Ok(AppView {
            enrolled: self
            .store
            .pin_hash()?
            .is_some_and(|hash| !hash.is_empty()),
            recovery_acknowledged: self.store.recovery_acknowledged()?,
            has_api_key: self.secrets.get_key().map_err(AppError::Message)?.is_some(),
            api_base: self.store.api_base()?,
            model: self.store.model()?,
            allow_hosts: self.store.allow_hosts()?,
            deny_hosts: deny_hosts(),
            custom_blocks: self.store.custom_blocks()?,
            pending_suggestion: self.store.suggestion()?,
            session: self.store.session()?,
            schedules: self.store.schedules()?,
            practice_mode: practice_mode(),
        })
    }

    pub fn enroll(&mut self, pin: &str) -> AppResult<String> {
        if self
            .store
            .pin_hash()?
            .is_some_and(|hash| !hash.is_empty())
        {
            return Err(AppError::AlreadyEnrolled);
        }
        if pin.trim().len() < 4 {
            return Err(AppError::WeakPin);
        }
        let recovery = new_recovery_key();
        self.store.set_pin_hash(&hash_secret(pin)?)?;
        self.store.set_recovery_hash(&hash_secret(&recovery)?)?;
        Ok(recovery)
    }

    pub fn acknowledge_recovery(&mut self) -> AppResult<()> {
        if self.store.recovery_hash()?.unwrap_or_default().is_empty() {
            return Err(AppError::NotEnrolled);
        }
        self.store.set_recovery_acknowledged()
    }

    pub fn reset_setup(&mut self, pin: &str) -> AppResult<()> {
        if self.store.recovery_acknowledged()? {
            return Err(AppError::Message(
                "Setup is already saved. Use the recovery key during a session.".into(),
            ));
        }
        self.require_pin(pin)?;
        self.store.set_pin_hash("")?;
        self.store.set_recovery_hash("")?;
        Ok(())
    }

    pub fn set_allowlist(&mut self, pin: &str, hosts: &[String]) -> AppResult<AppView> {
        self.require_unlocked_pin(pin)?;
        let clean = sanitize_allowlist(hosts)?;
        self.store.set_allow_hosts(&clean)?;
        self.view()
    }

    pub fn set_api_config(&mut self, pin: &str, base: &str, model: &str) -> AppResult<AppView> {
        self.require_unlocked_pin(pin)?;
        let base = validate_api_base(base)?;
        let model = model.trim();
        if model.is_empty() || model.len() > 80 || model.chars().any(|ch| ch.is_control()) {
            return Err(AppError::Message("Enter a model name.".into()));
        }
        self.store.set_api_base(&base)?;
        self.store.set_model(model)?;
        self.view()
    }

    pub fn set_api_key(&mut self, pin: &str, key: &str) -> AppResult<AppView> {
        self.require_unlocked_pin(pin)?;
        let key = key.trim();
        if key.is_empty() {
            self.secrets.clear_key().map_err(AppError::Message)?;
        } else {
            self.secrets.set_key(key).map_err(AppError::Message)?;
        }
        self.view()
    }

    pub fn start_session(&mut self, level: Level, minutes: u32, pin: Option<&str>) -> AppResult<AppView> {
        validate_minutes(minutes)?;
        if self.store.pin_hash()?.is_none() {
            return Err(AppError::NotEnrolled);
        }
        if !self.store.recovery_acknowledged()? {
            return Err(AppError::RecoveryNotSaved);
        }
        if self.store.session()?.is_some() {
            return Err(AppError::AlreadyActive);
        }
        if level != Level::Light {
            let pin = pin.ok_or(AppError::PinRequired)?;
            self.require_pin(pin)?;
        }
        self.begin(level, minutes)
    }

    pub fn set_schedules(&mut self, pin: &str, schedules: &[Schedule]) -> AppResult<AppView> {
        self.require_unlocked_pin(pin)?;
        let clean = crate::schedule::validate(schedules)?;
        self.store.set_schedules(&clean)?;
        self.view()
    }

    /// Starts a session when a saved schedule is due. The PIN was checked when the
    /// schedule was saved, so it is not asked for again here.
    pub fn start_scheduled(&mut self, now: NaiveDateTime) -> AppResult<Option<AppView>> {
        if self.store.session()?.is_some()
            || self.store.pin_hash()?.unwrap_or_default().is_empty()
            || !self.store.recovery_acknowledged()?
        {
            return Ok(None);
        }
        let schedules = self.store.schedules()?;
        let mut fired = self.store.schedule_fired()?;
        let Some(due) = crate::schedule::due(&schedules, &fired, now) else {
            return Ok(None);
        };
        fired.retain(|mark| schedules.iter().any(|item| mark.starts_with(&format!("{}@", item.id))));
        fired.push(due.mark);
        if fired.len() > 64 {
            let drop = fired.len() - 64;
            fired.drain(..drop);
        }
        self.store.set_schedule_fired(&fired)?;
        self.begin(due.schedule.level, due.minutes_left).map(Some)
    }

    fn begin(&mut self, level: Level, minutes: u32) -> AppResult<AppView> {
        validate_minutes(minutes)?;
        let rules = self.plan(level)?;
        if let Err(err) = self.enforcer.apply(&rules) {
            let _ = self.enforcer.clear();
            return Err(AppError::Message(err));
        }
        let now = Utc::now();
        let session = SessionRow {
            level,
            started_at: now,
            ends_at: now + Duration::minutes(minutes as i64),
            block_completed: false,
            frozen_allow: self.store.allow_hosts()?,
        };
        if let Err(err) = self.store.set_session(Some(&session)) {
            let _ = self.enforcer.clear();
            return Err(err);
        }
        self.store.set_enforcing(true)?;
        self.view()
    }

    pub fn complete_block(&mut self) -> AppResult<AppView> {
        let mut session = self.store.session()?.ok_or(AppError::NoSession)?;
        session.block_completed = true;
        self.store.set_session(Some(&session))?;
        self.view()
    }

    pub fn end_early(&mut self) -> AppResult<AppView> {
        let session = self.store.session()?.ok_or(AppError::NoSession)?;
        if !session.block_completed {
            return Err(AppError::NotEarned);
        }
        self.finish()?;
        self.view()
    }

    pub fn end_light(&mut self, pin: &str) -> AppResult<AppView> {
        let session = self.store.session()?.ok_or(AppError::NoSession)?;
        if session.level != Level::Light {
            return Err(AppError::NotEarned);
        }
        self.require_pin(pin)?;
        self.finish()?;
        self.view()
    }

    pub fn end_with_recovery(&mut self, key: &str) -> AppResult<AppView> {
        if self.store.session()?.is_none() {
            return Err(AppError::NoSession);
        }
        let hash = self.store.recovery_hash()?.ok_or(AppError::BadRecovery)?;
        if !verify_secret(key.trim(), &hash) {
            return Err(AppError::BadRecovery);
        }
        self.finish()?;
        self.view()
    }

    pub fn expire_if_needed(&mut self) -> AppResult<bool> {
        let Some(session) = self.store.session()? else {
            return Ok(false);
        };
        if Utc::now() >= session.ends_at {
            self.finish()?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn on_process_exit(&mut self) -> AppResult<()> {
        self.enforcer.clear().map_err(AppError::Message)?;
        self.store.set_enforcing(false)?;
        Ok(())
    }

    pub fn heal(&mut self) -> AppResult<bool> {
        if let Some(session) = self.store.session()? {
            if Utc::now() >= session.ends_at {
                self.finish()?;
                return Ok(false);
            }
            let rules = self.plan(session.level)?;
            self.enforcer.apply(&rules).map_err(AppError::Message)?;
            self.store.set_enforcing(true)?;
            return Ok(true);
        }
        if self.store.enforcing()? {
            self.enforcer.clear().map_err(AppError::Message)?;
            self.store.set_enforcing(false)?;
        }
        Ok(false)
    }

    pub fn uninstall(&mut self) -> AppResult<()> {
        self.enforcer.clear().map_err(AppError::Message)?;
        self.store.set_session(None)?;
        self.store.set_enforcing(false)?;
        Ok(())
    }

    pub fn check_study_url(&self, url: &str) -> AppResult<()> {
        let session = self.store.session()?.ok_or(AppError::NoSession)?;
        study_url_allowed(url, &session.frozen_allow)
    }

    pub fn targets(&self, procs: &[ProcInfo]) -> Vec<u32> {
        let Ok(Some(session)) = self.store.session() else {
            return Vec::new();
        };
        let extra = self.store.custom_blocks().unwrap_or_default();
        let kept = kept_server_for_base(&self.store.api_base().unwrap_or_default());
        select_targets(procs, session.level, &extra, kept)
    }

    pub fn prepare_tutor(&self) -> AppResult<PreparedCall> {
        if self.store.session()?.is_none() {
            return Err(AppError::TutorWhileUnlocked);
        }
        self.prepared_call()
    }

    pub fn prepare_classify(&self, image_name: &str) -> AppResult<PreparedCall> {
        if self.store.session()?.is_some() {
            return Err(AppError::ClassifyWhileLocked);
        }
        if !crate::policy::valid_block_image(image_name) || crate::policy::is_protected_image(image_name) {
            return Err(AppError::ProtectedProgram);
        }
        self.prepared_call()
    }

    pub fn store_suggestion(&mut self, suggestion: Suggestion) -> AppResult<AppView> {
        if self.store.session()?.is_some() {
            return Err(AppError::ClassifyWhileLocked);
        }
        self.store.set_suggestion(Some(&suggestion))?;
        self.view()
    }

    pub fn accept_suggestion(&mut self, pin: &str) -> AppResult<AppView> {
        self.require_unlocked_pin(pin)?;
        let suggestion = self.store.suggestion()?.ok_or_else(|| {
            AppError::Message("There is no program waiting for review.".into())
        })?;
        if suggestion.category != "ai_tool" && suggestion.category != "entertainment" {
            return Err(AppError::Message("That program was classified as allowed.".into()));
        }
        if crate::policy::is_protected_image(&suggestion.image_name)
            || !crate::policy::valid_block_image(&suggestion.image_name)
        {
            return Err(AppError::ProtectedProgram);
        }
        let mut blocks = self.store.custom_blocks()?;
        if !blocks.iter().any(|name| name == &suggestion.image_name) {
            blocks.push(suggestion.image_name);
        }
        self.store.set_custom_blocks(&blocks)?;
        self.store.set_suggestion(None)?;
        self.view()
    }

    pub fn dismiss_suggestion(&mut self, pin: &str) -> AppResult<AppView> {
        self.require_unlocked_pin(pin)?;
        self.store.set_suggestion(None)?;
        self.view()
    }

    // Only inspected by tests, which assert on exactly which rules are active.
    #[allow(dead_code)]
    pub fn rules(&self) -> Vec<String> {
        self.enforcer.recorded()
    }

    #[cfg(test)]
    pub fn testing_shift_end(&mut self) -> AppResult<()> {
        let mut session = self.store.session()?.ok_or(AppError::NoSession)?;
        session.ends_at = Utc::now() - Duration::seconds(5);
        self.store.set_session(Some(&session))
    }

    fn prepared_call(&self) -> AppResult<PreparedCall> {
        let base = self.store.api_base()?;
        let mut key = self.secrets.get_key().map_err(AppError::Message)?.unwrap_or_default();
        // A saved cloud key must not be forwarded to the public free tutor.
        if crate::tutor::is_keyless_base(&base) {
            key.clear();
        }
        if key.is_empty() && !crate::tutor::allows_empty_key(&base) {
            return Err(AppError::NoKey);
        }
        Ok(PreparedCall {
            base,
            key,
            model: self.store.model()?,
        })
    }

    fn require_pin(&self, pin: &str) -> AppResult<()> {
        let hash = self.store.pin_hash()?.ok_or(AppError::NotEnrolled)?;
        if verify_secret(pin, &hash) {
            Ok(())
        } else {
            Err(AppError::BadPin)
        }
    }

    fn require_unlocked_pin(&self, pin: &str) -> AppResult<()> {
        if self.store.session()?.is_some() {
            return Err(AppError::Frozen);
        }
        self.require_pin(pin)
    }

    fn finish(&mut self) -> AppResult<()> {
        self.enforcer.clear().map_err(AppError::Message)?;
        self.store.set_session(None)?;
        self.store.set_enforcing(false)?;
        Ok(())
    }

    fn plan(&self, level: Level) -> AppResult<Vec<RuleSpec>> {
        match self.mode {
            Mode::Test => Ok(vec![RuleSpec {
                name: format!("MindVault_Test_{}", level.as_str()),
                kind: RuleKind::BlockProgram {
                    path: r"C:\fake\blocked.exe".into(),
                },
            }]),
            Mode::Live => {
                // A Windows Firewall block overrides an allow rule. The tutor API host
                // is therefore omitted from the global block, and known AI programs are
                // blocked by their own executable path instead.
                let kept = kept_server_for_base(&self.store.api_base()?);
                let mut programs = crate::enforcer::discover_programs(&crate::enforcer::program_roots(), level);
                programs.retain(|program| match kept {
                    KeptServer::Ollama => program.label != "ollama",
                    KeptServer::LmStudio => program.label != "lmstudio",
                    KeptServer::None => true,
                });
                let api_host = api_host(&self.store.api_base()?)?;
                let ai_ips = if level == Level::Light {
                    Vec::new()
                } else {
                    crate::enforcer::resolve_ips(&ai_domains_except(&api_host))
                };
                let entertainment_ips = if level == Level::Full {
                    crate::enforcer::resolve_ips(&entertainment_domains())
                } else {
                    Vec::new()
                };
                let api_ips = if level == Level::Light {
                    Vec::new()
                } else {
                    crate::enforcer::resolve_ips(&[api_host])
                };
                let exe = std::env::current_exe()
                    .ok()
                    .and_then(|path| crate::enforcer::firewall_program_path(&path.display().to_string()))
                    .unwrap_or_default();
                Ok(specs_for(
                    level,
                    &programs,
                    &ai_ips,
                    &entertainment_ips,
                    &api_ips,
                    &exe,
                ))
            }
        }
    }
}

pub fn practice_mode() -> bool {
    !crate::policy::locks_this_computer()
}

fn hash_secret(secret: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut rand::thread_rng());
    Ok(Argon2::default()
        .hash_password(secret.as_bytes(), &salt)?
        .to_string())
}

fn verify_secret(secret: &str, phc: &str) -> bool {
    PasswordHash::new(phc)
        .ok()
        .and_then(|parsed| {
            Argon2::default()
                .verify_password(secret.as_bytes(), &parsed)
                .ok()
        })
        .is_some()
}

fn new_recovery_key() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    let raw: String = (0..20)
        .map(|_| {
            let index = rand::Rng::gen_range(&mut rng, 0..ALPHABET.len());
            ALPHABET[index] as char
        })
        .collect();
    raw.as_bytes()
        .chunks(4)
        .filter_map(|chunk| std::str::from_utf8(chunk).ok())
        .collect::<Vec<_>>()
        .join("-")
}

pub fn validate_api_base(base: &str) -> AppResult<String> {
    let url = url::Url::parse(base.trim()).map_err(|_| AppError::Message("API base must be a URL.".into()))?;
    let host = url
        .host_str()
        .ok_or_else(|| AppError::Message("API base must include a host.".into()))?;
    match url.scheme() {
        "https" => {}
        "http" if crate::tutor::is_loopback_host(host) => {}
        _ => {
            return Err(AppError::Message(
                "Use https, or http only for localhost.".into(),
            ))
        }
    }
    Ok(base.trim().trim_end_matches('/').to_string())
}

fn api_host(base: &str) -> AppResult<String> {
    let url = url::Url::parse(base).map_err(|_| AppError::Message("API base must be a URL.".into()))?;
    url.host_str()
        .map(str::to_string)
        .ok_or_else(|| AppError::Message("API base must include a host.".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enforcer::MemoryEnforcer;
    use crate::secrets::MemorySecrets;
    use crate::tutor::view_from_model;
    use serde_json::json;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT: AtomicU64 = AtomicU64::new(1);

    fn setup() -> Service {
        let id = NEXT.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir().join(format!("mindvault-{}-{id}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let store = Store::open(&path).unwrap();
        Service::new(
            store,
            Box::new(MemoryEnforcer::default()),
            Box::new(MemorySecrets::default()),
            Mode::Test,
        )
    }

    fn ready(svc: &mut Service) -> String {
        let key = svc.enroll("1234").unwrap();
        svc.acknowledge_recovery().unwrap();
        key
    }

    #[test]
    fn session_rejects_more_than_eight_hours() {
        let mut svc = setup();
        ready(&mut svc);
        assert!(svc.start_session(Level::Light, 481, None).is_err());
        assert!(svc.rules().is_empty());
        assert!(svc.view().unwrap().session.is_none());
    }

    #[test]
    fn recovery_key_ends_session_and_clears_rules() {
        let mut svc = setup();
        let key = ready(&mut svc);
        svc.start_session(Level::Standard, 30, Some("1234")).unwrap();
        assert!(!svc.rules().is_empty());
        assert!(svc.end_with_recovery("nope-nope").is_err());
        assert!(!svc.rules().is_empty());
        svc.end_with_recovery(&key).unwrap();
        assert!(svc.rules().is_empty());
        assert!(svc.view().unwrap().session.is_none());
    }

    #[test]
    fn standard_early_exit_needs_a_finished_block() {
        let mut svc = setup();
        ready(&mut svc);
        svc.start_session(Level::Standard, 30, Some("1234")).unwrap();
        assert!(svc.end_light("1234").is_err());
        assert!(svc.end_early().is_err());
        svc.complete_block().unwrap();
        svc.end_early().unwrap();
        assert!(svc.rules().is_empty());
    }

    #[test]
    fn light_pauses_with_pin() {
        let mut svc = setup();
        ready(&mut svc);
        svc.start_session(Level::Light, 15, None).unwrap();
        assert!(svc.end_light("9999").is_err());
        svc.end_light("1234").unwrap();
        assert!(svc.rules().is_empty());
    }

    #[test]
    fn uninstall_clears_an_active_session_without_pin() {
        let mut svc = setup();
        ready(&mut svc);
        svc.start_session(Level::Full, 45, Some("1234")).unwrap();
        svc.uninstall().unwrap();
        assert!(svc.rules().is_empty());
        assert!(svc.view().unwrap().session.is_none());
    }

    #[test]
    fn process_exit_clears_rules_and_reopen_restores_them() {
        let mut svc = setup();
        ready(&mut svc);
        svc.start_session(Level::Standard, 40, Some("1234")).unwrap();
        svc.on_process_exit().unwrap();
        assert!(svc.rules().is_empty());
        assert!(svc.view().unwrap().session.is_some());
        assert!(svc.heal().unwrap());
        assert!(!svc.rules().is_empty());
    }

    #[test]
    fn expired_session_clears_on_poll() {
        let mut svc = setup();
        ready(&mut svc);
        svc.start_session(Level::Full, 20, Some("1234")).unwrap();
        svc.testing_shift_end().unwrap();
        assert!(svc.expire_if_needed().unwrap());
        assert!(svc.rules().is_empty());
        assert!(svc.view().unwrap().session.is_none());
    }

    #[test]
    fn allowlist_freezes_and_denylist_wins() {
        let mut svc = setup();
        ready(&mut svc);
        assert!(svc
            .set_allowlist("1234", &["wikipedia.org".into(), "youtube.com".into()])
            .is_err());
        svc.set_allowlist("1234", &["wikipedia.org".into()]).unwrap();
        svc.start_session(Level::Standard, 25, Some("1234")).unwrap();
        assert!(svc
            .set_allowlist("1234", &["wikipedia.org".into(), "arxiv.org".into()])
            .is_err());
        assert!(svc.check_study_url("https://en.wikipedia.org/wiki/Attention").is_ok());
        assert!(svc.check_study_url("https://chatgpt.com").is_err());
        assert!(svc.check_study_url("https://www.youtube.com").is_err());
        assert!(svc.check_study_url("https://example.com").is_err());
    }

    #[test]
    fn model_output_cannot_change_lock() {
        let mut svc = setup();
        ready(&mut svc);
        svc.start_session(Level::Standard, 30, Some("1234")).unwrap();
        let before = svc.rules();
        let view = view_from_model(&json!({
            "summary": "ok",
            "endSession": true,
            "clearFirewall": true,
            "level": "light"
        }));
        assert!(view.summary.is_some());
        let after = svc.view().unwrap();
        assert!(after.session.is_some());
        assert_eq!(after.session.unwrap().level, Level::Standard);
        assert_eq!(svc.rules(), before);
    }

    fn morning() -> Schedule {
        Schedule {
            id: "morning".into(),
            days: vec![0, 1, 2, 3, 4, 5, 6],
            start: "09:00".into(),
            minutes: 60,
            level: Level::Standard,
        }
    }

    fn local(h: u32, m: u32) -> NaiveDateTime {
        chrono::NaiveDate::from_ymd_opt(2026, 10, 21)
            .unwrap()
            .and_hms_opt(h, m, 0)
            .unwrap()
    }

    #[test]
    fn schedules_need_pin_and_cannot_change_while_locked() {
        let mut svc = setup();
        ready(&mut svc);
        assert!(svc.set_schedules("0000", &[morning()]).is_err());
        svc.set_schedules("1234", &[morning()]).unwrap();
        svc.start_session(Level::Light, 10, None).unwrap();
        assert!(svc.set_schedules("1234", &[]).is_err());
        assert_eq!(svc.view().unwrap().schedules.len(), 1);
    }

    #[test]
    fn schedule_starts_once_and_ending_it_does_not_restart() {
        let mut svc = setup();
        let key = ready(&mut svc);
        svc.set_schedules("1234", &[morning()]).unwrap();
        assert!(svc.start_scheduled(local(8, 30)).unwrap().is_none());
        let view = svc.start_scheduled(local(9, 15)).unwrap().unwrap();
        let session = view.session.unwrap();
        assert_eq!(session.level, Level::Standard);
        assert!(session.ends_at - session.started_at <= Duration::minutes(45));
        assert!(!svc.rules().is_empty());
        assert!(svc.start_scheduled(local(9, 20)).unwrap().is_none());
        svc.end_with_recovery(&key).unwrap();
        assert!(svc.start_scheduled(local(9, 25)).unwrap().is_none());
    }

    #[test]
    fn loopback_tutor_does_not_need_a_key() {
        let mut svc = setup();
        ready(&mut svc);
        let fresh = svc.prepare_classify("notes.exe").unwrap();
        assert!(fresh.key.is_empty());
        assert_eq!(fresh.base, "https://text.pollinations.ai/openai");
        svc.set_api_config("1234", "https://api.openai.com/v1", "gpt-4o-mini")
            .unwrap();
        assert!(matches!(svc.prepare_classify("notes.exe"), Err(AppError::NoKey)));
        svc.set_api_config("1234", "http://127.0.0.1:11434/v1", "llama3.2")
            .unwrap();
        let call = svc.prepare_classify("notes.exe").unwrap();
        assert!(call.key.is_empty());
        assert_eq!(call.model, "llama3.2");
        svc.start_session(Level::Light, 10, None).unwrap();
        assert!(svc.prepare_tutor().is_ok());
        assert!(validate_api_base("http://10.0.0.5:11434/v1").is_err());
        assert!(validate_api_base("http://[::1]:8080/v1").is_ok());
        svc.end_light("1234").unwrap();
        svc.set_api_config("1234", "https://text.pollinations.ai/openai", "openai-fast")
            .unwrap();
        svc.set_api_key("1234", "sk-keep-this-local").unwrap();
        let call = svc.prepare_classify("notes.exe").unwrap();
        assert!(call.key.is_empty());
        assert_eq!(call.model, "openai-fast");
        svc.set_api_config("1234", "https://api.openai.com/v1", "gpt-4o-mini")
            .unwrap();
        let cloud = svc.prepare_classify("notes.exe").unwrap();
        assert_eq!(cloud.key, "sk-keep-this-local");
    }

    #[test]
    fn schedule_never_starts_before_setup_is_finished() {
        let mut svc = setup();
        svc.enroll("1234").unwrap();
        svc.store.set_schedules(&[morning()]).unwrap();
        assert!(svc.start_scheduled(local(9, 15)).unwrap().is_none());
        assert!(svc.rules().is_empty());
    }

    #[test]
    fn suggestion_cannot_block_task_manager() {
        let mut svc = setup();
        ready(&mut svc);
        let err = svc.store_suggestion(Suggestion {
            image_name: "taskmgr.exe".into(),
            category: "ai_tool".into(),
            reason: "no".into(),
        });
        assert!(err.is_ok());
        assert!(svc.accept_suggestion("1234").is_err());
        assert!(svc.view().unwrap().custom_blocks.is_empty());
    }
}
