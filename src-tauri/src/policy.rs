use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

pub const MAX_SESSION_MINUTES: u32 = 8 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Level {
    Light,
    Standard,
    Full,
}

impl Level {
    pub fn as_str(self) -> &'static str {
        match self {
            Level::Light => "Light",
            Level::Standard => "Standard",
            Level::Full => "Full",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcInfo {
    pub pid: u32,
    pub name: String,
    pub cmd: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProgramClass {
    Ai,
    Browser,
    Entertainment,
}

// Keep in sync with src/hostCatalog.ts (STUDY_HOSTS + GAME_HOSTS).
pub const DEFAULT_ALLOW: &[&str] = &[
    // Study
    "wikipedia.org",
    "khanacademy.org",
    "coursera.org",
    "edx.org",
    "arxiv.org",
    "scholar.google.com",
    "brilliant.org",
    "projecteuler.net",
    "leetcode.com",
    // Online puzzle games: skill-building, no feed, chat, or social layer.
    "lichess.org",
    "chess.com",
    "sudoku.com",
    "play2048.co",
    "puzzlebaron.com",
    "jigsawplanet.com",
];

pub const DENY_HOSTS: &[&str] = &[
    "chatgpt.com",
    "openai.com",
    "claude.ai",
    "anthropic.com",
    "gemini.google.com",
    "copilot.microsoft.com",
    "githubcopilot.com",
    "cursor.com",
    "cursor.sh",
    "ollama.com",
    "lmstudio.ai",
    "youtube.com",
    "youtu.be",
    "netflix.com",
    "tiktok.com",
    "reddit.com",
    "steampowered.com",
    "steamcommunity.com",
    "twitch.tv",
    "instagram.com",
    "facebook.com",
    "x.com",
    "twitter.com",
];

const AI_IMAGES: &[&str] = &[
    "chatgpt.exe",
    "claude.exe",
    "ollama.exe",
    "ollama app.exe",
    "lm studio.exe",
    "lms.exe",
    "lm-studio",
    "lmstudio",
    "cursor.exe",
    "copilot.exe",
    "mscopilot.exe",
    "githubcopilot.exe",
    "code.exe",
];

const BROWSERS: &[&str] = &[
    "chrome.exe",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "msedge.exe",
    "microsoft-edge",
    "firefox.exe",
    "brave.exe",
    "opera.exe",
    "vivaldi.exe",
    "safari",
];

const ENTERTAINMENT: &[&str] = &[
    "steam.exe",
    "steamwebhelper.exe",
    "epicgameslauncher.exe",
    "xboxpcapp.exe",
];

const PROTECTED: &[&str] = &[
    "explorer.exe",
    "taskmgr.exe",
    "systemsettings.exe",
    "dwm.exe",
    "lsass.exe",
    "csrss.exe",
    "winlogon.exe",
    "services.exe",
    "svchost.exe",
    "mindvault.exe",
    "securityhealthservice.exe",
    "smartscreen.exe",
    "applicationframehost.exe",
    "searchhost.exe",
    "startmenuexperiencehost.exe",
    "shellexperiencehost.exe",
    "sihost.exe",
    "ctfmon.exe",
    "conhost.exe",
    "registry.exe",
    "regedit.exe",
    "cmd.exe",
    "systemd",
    "init",
    "launchd",
    "kernel_task",
    "gnome-shell",
    "plasmashell",
    "xorg",
    "xwayland",
    "mutter",
    "kwin_wayland",
    "kwin_x11",
    "finder",
    "dock",
    "systemuiserver",
    "windowserver",
    "loginwindow",
    "controlcenter",
    "terminal",
    "gnome-terminal",
    "gnome-terminal-server",
    "konsole",
    "kitty",
    "alacritty",
    "wezterm",
    "xterm",
    "ptyxis",
    "sudo",
    "pkexec",
    "osascript",
    "sshd",
    "bash",
    "zsh",
    "fish",
    "sh",
    "dash",
    "apt",
    "apt-get",
    "dpkg",
    "pacman",
    "nft",
    "pfctl",
];

const AI_CLI_STEMS: &[&str] = &["claude", "cursor-agent", "aider", "ollama", "copilot"];

pub fn validate_minutes(minutes: u32) -> AppResult<()> {
    if minutes == 0 || minutes > MAX_SESSION_MINUTES {
        Err(AppError::Duration)
    } else {
        Ok(())
    }
}

pub fn default_allow() -> Vec<String> {
    DEFAULT_ALLOW.iter().map(|host| (*host).to_string()).collect()
}

pub fn deny_hosts() -> Vec<String> {
    DENY_HOSTS.iter().map(|host| (*host).to_string()).collect()
}

pub fn normalize_host(raw: &str) -> String {
    raw.trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .trim_start_matches("www.")
        .to_ascii_lowercase()
}

pub(crate) fn host_matches(host: &str, rule: &str) -> bool {
    let rule = normalize_host(rule);
    host == rule || host.ends_with(&format!(".{rule}"))
}

pub fn is_denied_host(host: &str) -> bool {
    let host = normalize_host(host);
    DENY_HOSTS.iter().any(|rule| host_matches(&host, rule))
}

pub fn valid_host_syntax(host: &str) -> bool {
    let host = normalize_host(host);
    if host.len() < 3 || host.len() > 253 || !host.contains('.') {
        return false;
    }
    host.chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == '-')
        && !host.starts_with('.')
        && !host.ends_with('.')
        && !host.contains("..")
}

pub fn sanitize_allowlist(hosts: &[String], extra_deny: &[String]) -> AppResult<Vec<String>> {
    let mut clean = Vec::new();
    for host in hosts {
        let host = normalize_host(host);
        if host.is_empty() {
            continue;
        }
        if !valid_host_syntax(&host) {
            return Err(AppError::Message(format!("{host} is not a host name.")));
        }
        if is_denied_host(&host) || extra_deny.iter().any(|rule| host_matches(&host, rule)) {
            return Err(AppError::Message(format!(
                "{host} is on the denylist and cannot be added."
            )));
        }
        if !clean.iter().any(|existing: &String| existing == &host) {
            clean.push(host);
        }
    }
    Ok(clean)
}

#[allow(dead_code)]
pub fn study_url_allowed(url: &str, allow: &[String]) -> AppResult<()> {
    study_url_allowed_except(url, allow, &[])
}

pub fn study_url_allowed_except(url: &str, allow: &[String], extra_deny: &[String]) -> AppResult<()> {
    let parsed = url::Url::parse(url).map_err(|_| AppError::BadUrl)?;
    if parsed.scheme() != "https" {
        return Err(AppError::BadUrl);
    }
    let host = parsed.host_str().ok_or(AppError::BadUrl)?;
    let host = normalize_host(host);
    if is_denied_host(&host) || extra_deny.iter().any(|rule| host_matches(&host, rule)) {
        return Err(AppError::DeniedHost);
    }
    if allow.iter().any(|rule| host_matches(&host, rule)) {
        Ok(())
    } else {
        Err(AppError::BadUrl)
    }
}

pub fn image_base(name: &str) -> String {
    name.rsplit(['\\', '/'])
        .next()
        .unwrap_or(name)
        .trim()
        .to_ascii_lowercase()
}

pub fn is_protected_image(name: &str) -> bool {
    let base = image_base(name);
    PROTECTED.iter().any(|item| *item == base)
}

pub fn valid_block_image(name: &str) -> bool {
    let base = image_base(name);
    base.ends_with(".exe")
        && base.len() > 4
        && base.len() < 80
        && !base.contains("..")
        && base
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == ' ' || ch == '-' || ch == '_')
}

fn file_stem(arg: &str) -> String {
    let base = image_base(arg);
    let trimmed = base
        .trim_end_matches(".cmd")
        .trim_end_matches(".exe")
        .trim_end_matches(".bat");
    trimmed.to_string()
}

fn is_our_helper(cmd: &[String]) -> bool {
    let joined = cmd.join(" ").to_ascii_lowercase();
    joined.contains("mindvault_")
        || joined.contains("get-netfirewallrule")
        || joined.contains("remove-netfirewallrule")
        || joined.contains("--uninstall-cleanup")
        || joined.contains("new-netfirewallrule")
        || joined.contains("table inet mindvault")
        || joined.contains("pf.anchors/mindvault")
        || joined.contains("socketfilterfw")
}

fn matches_name(list: &[&str], base: &str) -> bool {
    let stem = base.trim_end_matches(".exe");
    list.iter()
        .any(|item| *item == base || item.trim_end_matches(".exe") == stem)
}

fn shell_invokes_ai(cmd: &[String]) -> bool {
    let stems: Vec<String> = cmd.iter().map(|arg| file_stem(arg)).collect();
    if stems.iter().any(|stem| AI_CLI_STEMS.contains(&stem.as_str())) {
        return true;
    }
    stems.windows(2).any(|pair| pair[0] == "gh" && pair[1] == "copilot")
}

/// The Windows Copilot app is `mscopilot.exe`, and its page runs in a bundled WebView.
/// Only that WebView is closed. MindVault's own WebView has a different command line.
fn copilot_host_process(image: &str, cmd: &[String]) -> bool {
    let stem = image_base(image).trim_end_matches(".exe").to_string();
    if stem != "msedgewebview2" && stem != "msedge" {
        return false;
    }
    let joined = cmd.join(" ").to_ascii_lowercase().replace('/', "\\");
    joined.contains("\\microsoft\\copilot\\")
        || joined.contains("microsoft.copilot_")
        || joined.contains("mscopilot.exe")
}

fn is_ai_cli(image: &str, cmd: &[String]) -> bool {
    const INTERPRETERS: &[&str] = &["node", "python", "pythonw", "python3", "bun", "deno", "ruby"];
    let stem = image.trim_end_matches(".exe");
    if !INTERPRETERS.contains(&stem) {
        return false;
    }
    shell_invokes_ai(cmd)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeptServer {
    None,
    Ollama,
    LmStudio,
}

/// The local server that matches the saved tutor address stays up. `ollama run` is still closed.
pub fn kept_server_for_base(base: &str) -> KeptServer {
    let Ok(url) = url::Url::parse(base.trim()) else {
        return KeptServer::None;
    };
    let Some(host) = url.host_str() else {
        return KeptServer::None;
    };
    let host = host.trim_matches(['[', ']']);
    let loopback = host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "::1";
    if !loopback {
        return KeptServer::None;
    }
    match url.port().unwrap_or(0) {
        11434 => KeptServer::Ollama,
        1234 => KeptServer::LmStudio,
        _ => KeptServer::None,
    }
}

fn is_spared_server(image: &str, cmd: &[String], kept: KeptServer) -> bool {
    let base = image_base(image);
    let stem = base.trim_end_matches(".exe");
    match kept {
        KeptServer::Ollama => {
            stem == "ollama app" || (stem == "ollama" && !cmd.iter().any(|arg| arg.eq_ignore_ascii_case("run")))
        }
        KeptServer::LmStudio => matches!(stem, "lm studio" | "lms" | "lm-studio" | "lmstudio"),
        KeptServer::None => false,
    }
}

fn protected_stem(name: &str) -> bool {
    let owned = image_base(name);
    let stem = owned.trim_end_matches(".exe");
    PROTECTED.iter().any(|item| item.trim_end_matches(".exe") == stem)
}

fn program_same(listed: &str, base: &str) -> bool {
    let owned = image_base(listed);
    let listed_stem = owned.trim_end_matches(".exe");
    let base_stem = base.trim_end_matches(".exe");
    !listed_stem.is_empty() && listed_stem == base_stem
}

pub fn should_stop(
    image: &str,
    cmd: &[String],
    level: Level,
    extra: &[String],
    entertainment: &[String],
    kept: KeptServer,
) -> bool {
    let base = image_base(image);
    if protected_stem(&base) || is_our_helper(cmd) {
        return false;
    }
    if is_spared_server(image, cmd, kept) {
        return false;
    }
    if extra.iter().any(|name| image_base(name) == base) {
        return valid_block_image(&base);
    }
    if matches_name(AI_IMAGES, &base) || copilot_host_process(&base, cmd) {
        return true;
    }
    if is_ai_cli(&base, cmd) {
        return true;
    }
    if matches!(base.as_str(), "powershell.exe" | "pwsh.exe") {
        return shell_invokes_ai(cmd);
    }
    if level != Level::Light && matches_name(BROWSERS, &base) {
        return true;
    }
    if level == Level::Full && matches_name(ENTERTAINMENT, &base) {
        return true;
    }
    if level == Level::Full && entertainment.iter().any(|name| program_same(name, &base)) {
        return true;
    }
    false
}

pub fn select_targets(
    procs: &[ProcInfo],
    level: Level,
    extra: &[String],
    entertainment: &[String],
    kept: KeptServer,
) -> Vec<u32> {
    let self_pid = std::process::id();
    procs
        .iter()
        .filter(|proc_| {
            proc_.pid != self_pid && should_stop(&proc_.name, &proc_.cmd, level, extra, entertainment, kept)
        })
        .map(|proc_| proc_.pid)
        .collect()
}

pub fn locks_this_computer() -> bool {
    std::env::var("MINDVAULT_FAKE_ENFORCER").is_err()
        && (cfg!(windows) || cfg!(target_os = "linux") || cfg!(target_os = "macos"))
}

pub fn class_for_level(class: ProgramClass, level: Level) -> bool {
    match class {
        ProgramClass::Ai => true,
        ProgramClass::Browser => level != Level::Light,
        ProgramClass::Entertainment => level == Level::Full,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FoundProgram {
    pub class: ProgramClass,
    pub label: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuleKind {
    BlockProgram { path: String },
    BlockRemote { addresses: Vec<String> },
    AllowProgramRemote { path: String, addresses: Vec<String> },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuleSpec {
    pub name: String,
    pub kind: RuleKind,
}

pub fn specs_for(
    level: Level,
    programs: &[FoundProgram],
    ai_ips: &[String],
    entertainment_ips: &[String],
    api_ips: &[String],
    own_exe: &str,
) -> Vec<RuleSpec> {
    let mut rules = Vec::new();
    for program in programs {
        if !class_for_level(program.class, level) {
            continue;
        }
        let slug = program
            .label
            .chars()
            .filter(|ch| ch.is_ascii_alphanumeric())
            .collect::<String>();
        rules.push(RuleSpec {
            name: format!("MindVault_BlockProg_{slug}"),
            kind: RuleKind::BlockProgram {
                path: program.path.clone(),
            },
        });
    }
    if level != Level::Light && !ai_ips.is_empty() {
        rules.push(RuleSpec {
            name: "MindVault_BlockIP_ai".into(),
            kind: RuleKind::BlockRemote {
                addresses: ai_ips.to_vec(),
            },
        });
    }
    if level == Level::Full && !entertainment_ips.is_empty() {
        rules.push(RuleSpec {
            name: "MindVault_BlockIP_entertainment".into(),
            kind: RuleKind::BlockRemote {
                addresses: entertainment_ips.to_vec(),
            },
        });
    }
    if level != Level::Light && !api_ips.is_empty() && !own_exe.is_empty() {
        rules.push(RuleSpec {
            name: "MindVault_Allow_Tutor".into(),
            kind: RuleKind::AllowProgramRemote {
                path: own_exe.to_string(),
                addresses: api_ips.to_vec(),
            },
        });
    }
    rules
}

pub fn ai_domains_except(api_host: &str) -> Vec<String> {
    const AI: &[&str] = &[
        "chatgpt.com",
        "claude.ai",
        "api.anthropic.com",
        "gemini.google.com",
        "generativelanguage.googleapis.com",
        "copilot.microsoft.com",
        "githubcopilot.com",
        "api2.cursor.sh",
        "ollama.com",
        "lmstudio.ai",
    ];
    let api_host = normalize_host(api_host);
    AI.iter()
        .map(|host| (*host).to_string())
        .filter(|host| !host_matches(host, &api_host) && host != &api_host)
        .collect()
}

pub fn entertainment_domains(extra: &[String]) -> Vec<String> {
    let mut hosts = [
        "youtube.com",
        "youtu.be",
        "netflix.com",
        "tiktok.com",
        "reddit.com",
        "steampowered.com",
        "twitch.tv",
    ]
    .into_iter()
    .map(str::to_string)
    .collect::<Vec<_>>();
    for host in extra {
        let host = normalize_host(host);
        if valid_host_syntax(&host) && !hosts.iter().any(|existing| existing == &host) {
            hosts.push(host);
        }
    }
    hosts
}

pub fn sanitize_entertainment_hosts(hosts: &[String]) -> AppResult<Vec<String>> {
    if hosts.len() > 40 {
        return Err(AppError::Message("Keep the extra entertainment list to 40 sites.".into()));
    }
    let mut clean = Vec::new();
    for host in hosts {
        let host = normalize_host(host);
        if host.is_empty() {
            continue;
        }
        if !valid_host_syntax(&host) {
            return Err(AppError::Message(format!("{host} is not a host name.")));
        }
        if is_denied_host(&host) {
            return Err(AppError::Message(format!("{host} is already blocked.")));
        }
        if !clean.iter().any(|existing: &String| existing == &host) {
            clean.push(host);
        }
    }
    Ok(clean)
}

pub fn sanitize_entertainment_programs(names: &[String]) -> AppResult<Vec<String>> {
    if names.len() > 40 {
        return Err(AppError::Message("Keep the extra entertainment list to 40 programs.".into()));
    }
    let mut clean = Vec::new();
    for name in names {
        let base = image_base(name);
        let ok = !base.is_empty()
            && base.len() < 80
            && !base.contains("..")
            && !base.contains(':')
            && base
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '.' || ch == ' ' || ch == '-' || ch == '_');
        if !ok || protected_stem(&base) {
            return Err(AppError::Message(format!("{base} cannot be blocked.")));
        }
        if ENTERTAINMENT.iter().any(|item| program_same(item, &base)) {
            return Err(AppError::Message(format!("{base} is already blocked on Full.")));
        }
        if !clean.iter().any(|existing: &String| program_same(existing, &base)) {
            clean.push(base);
        }
    }
    Ok(clean)
}

pub fn candidate_programs() -> Vec<(ProgramClass, &'static str, &'static [&'static str])> {
    vec![
        (
            ProgramClass::Ai,
            "chatgpt",
            &["WindowsApps/ChatGPT.exe"],
        ),
        (ProgramClass::Ai, "claude", &["AnthropicClaude/claude.exe"]),
        (
            ProgramClass::Ai,
            "ollama",
            &[
                "Programs/Ollama/ollama.exe",
                "Ollama/ollama.exe",
                "bin/ollama",
                "local/bin/ollama",
            ],
        ),
        (
            ProgramClass::Ai,
            "lmstudio",
            &[
                "Programs/LM Studio/LM Studio.exe",
                "LM-Studio/LM Studio.exe",
                "LM Studio.app/Contents/MacOS/LM Studio",
                "bin/lm-studio",
                "bin/lms",
            ],
        ),
        (
            ProgramClass::Ai,
            "cursor",
            &[
                "Programs/cursor/Cursor.exe",
                "cursor/Cursor.exe",
                "bin/cursor",
                "local/bin/cursor",
            ],
        ),
        (
            ProgramClass::Ai,
            "copilot",
            &[
                "Microsoft/Copilot/Application/mscopilot.exe",
                "Microsoft/Copilot/mscopilot.exe",
            ],
        ),
        (
            ProgramClass::Ai,
            "code",
            &[
                "Programs/Microsoft VS Code/Code.exe",
                "bin/code",
                "share/code/code",
            ],
        ),
        (
            ProgramClass::Browser,
            "chrome",
            &[
                "Google/Chrome/Application/chrome.exe",
                "bin/google-chrome",
                "bin/google-chrome-stable",
                "google/chrome/chrome",
                "Google Chrome.app/Contents/MacOS/Google Chrome",
            ],
        ),
        (
            ProgramClass::Browser,
            "msedge",
            &[
                "Microsoft/Edge/Application/msedge.exe",
                "bin/microsoft-edge",
                "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            ],
        ),
        (
            ProgramClass::Browser,
            "firefox",
            &[
                "Mozilla Firefox/firefox.exe",
                "bin/firefox",
                "Firefox.app/Contents/MacOS/firefox",
            ],
        ),
        (
            ProgramClass::Browser,
            "brave",
            &[
                "BraveSoftware/Brave-Browser/Application/brave.exe",
                "bin/brave",
                "bin/brave-browser",
                "Brave Browser.app/Contents/MacOS/Brave Browser",
            ],
        ),
        (
            ProgramClass::Browser,
            "safari",
            &["Safari.app/Contents/MacOS/Safari"],
        ),
        (
            ProgramClass::Entertainment,
            "steam",
            &["Steam/steam.exe", "bin/steam", "Steam.app/Contents/MacOS/steam_osx"],
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duration_caps_at_eight_hours() {
        assert!(validate_minutes(0).is_err());
        assert!(validate_minutes(481).is_err());
        assert!(validate_minutes(480).is_ok());
        assert!(validate_minutes(25).is_ok());
    }

    #[test]
    fn denylist_beats_allowlist() {
        let allow = vec!["youtube.com".into(), "wikipedia.org".into()];
        assert!(study_url_allowed("https://www.youtube.com/watch?v=1", &allow).is_err());
        assert!(study_url_allowed("https://chatgpt.com/c/1", &allow).is_err());
        assert!(study_url_allowed("https://en.wikipedia.org/wiki/Memory", &allow).is_ok());
        assert!(study_url_allowed("https://evil.example/wiki", &allow).is_err());
        assert!(study_url_allowed("http://en.wikipedia.org/wiki/Memory", &allow).is_err());
    }

    #[test]
    fn protected_processes_are_never_stopped() {
        for name in [
            "taskmgr.exe",
            "SystemSettings.exe",
            "explorer.exe",
            "winlogon.exe",
            "lsass.exe",
            "csrss.exe",
            "dwm.exe",
            "svchost.exe",
            "MindVault.exe",
            "regedit.exe",
        ] {
            let procs = vec![ProcInfo {
                pid: 10,
                name: name.into(),
                cmd: vec![],
            }];
            let hits = select_targets(&procs, Level::Full, &[name.into()], &[], KeptServer::None);
            assert!(hits.is_empty(), "{name}");
        }
    }

    #[test]
    fn level_controls_what_is_stopped() {
        let ai = ProcInfo {
            pid: 1,
            name: "ChatGPT.exe".into(),
            cmd: vec![],
        };
        let cli = ProcInfo {
            pid: 2,
            name: "node.exe".into(),
            cmd: vec!["node".into(), r"C:\npm\claude.cmd".into()],
        };
        let vite = ProcInfo {
            pid: 3,
            name: "node.exe".into(),
            cmd: vec!["node".into(), r"C:\repo\node_modules\vite\bin\vite.js".into()],
        };
        let chrome = ProcInfo {
            pid: 4,
            name: "chrome.exe".into(),
            cmd: vec![],
        };
        let steam = ProcInfo {
            pid: 5,
            name: "steam.exe".into(),
            cmd: vec![],
        };
        let helper = ProcInfo {
            pid: 6,
            name: "powershell.exe".into(),
            cmd: vec!["powershell".into(), "Remove-NetFirewallRule".into()],
        };
        let procs = vec![ai, cli, vite, chrome, steam, helper];
        assert_eq!(select_targets(&procs, Level::Light, &[], &[], KeptServer::None), vec![1, 2]);
        assert_eq!(select_targets(&procs, Level::Standard, &[], &[], KeptServer::None), vec![1, 2, 4]);
        assert_eq!(
            select_targets(&procs, Level::Full, &[], &[], KeptServer::None),
            vec![1, 2, 4, 5]
        );
        let ollama = vec![
            ProcInfo {
                pid: 7,
                name: "ollama.exe".into(),
                cmd: vec!["ollama".into(), "serve".into()],
            },
            ProcInfo {
                pid: 8,
                name: "ollama.exe".into(),
                cmd: vec!["ollama".into(), "run".into(), "llama3.2".into()],
            },
        ];
        assert_eq!(select_targets(&ollama, Level::Light, &[], &[], KeptServer::None), vec![7, 8]);
        assert_eq!(select_targets(&ollama, Level::Light, &[], &[], KeptServer::Ollama), vec![8]);
        let studio = vec![ProcInfo {
            pid: 13,
            name: "LM Studio.exe".into(),
            cmd: vec![],
        }];
        assert_eq!(select_targets(&studio, Level::Light, &[], &[], KeptServer::None), vec![13]);
        assert_eq!(select_targets(&studio, Level::Light, &[], &[], KeptServer::Ollama), vec![13]);
        assert_eq!(select_targets(&studio, Level::Light, &[], &[], KeptServer::LmStudio), Vec::<u32>::new());
        assert_eq!(kept_server_for_base("http://127.0.0.1:1234/v1"), KeptServer::LmStudio);
        assert_eq!(kept_server_for_base("http://127.0.0.1:11434/v1"), KeptServer::Ollama);
        assert_eq!(kept_server_for_base("https://api.openai.com/v1"), KeptServer::None);
        let unix = vec![
            ProcInfo {
                pid: 9,
                name: "google-chrome".into(),
                cmd: vec![],
            },
            ProcInfo {
                pid: 10,
                name: "systemd".into(),
                cmd: vec![],
            },
            ProcInfo {
                pid: 11,
                name: "Finder".into(),
                cmd: vec![],
            },
            ProcInfo {
                pid: 12,
                name: "ollama".into(),
                cmd: vec!["ollama".into(), "serve".into()],
            },
        ];
        assert_eq!(select_targets(&unix, Level::Light, &[], &[], KeptServer::Ollama), Vec::<u32>::new());
        assert_eq!(select_targets(&unix, Level::Standard, &[], &[], KeptServer::Ollama), vec![9]);
        let copilot = ProcInfo {
            pid: 14,
            name: "mscopilot.exe".into(),
            cmd: vec![],
        };
        assert_eq!(select_targets(&[copilot], Level::Standard, &[], &[], KeptServer::None), vec![14]);
        let bundled = ProcInfo {
            pid: 15,
            name: "msedgewebview2.exe".into(),
            cmd: vec![r"C:\Program Files (x86)\Microsoft\Copilot\Application\msedgewebview2.exe".into()],
        };
        assert_eq!(select_targets(&[bundled], Level::Light, &[], &[], KeptServer::None), vec![15]);
        let own_webview = ProcInfo {
            pid: 16,
            name: "msedgewebview2.exe".into(),
            cmd: vec![r"C:\Program Files\MindVault\MindVault.exe".into()],
        };
        assert!(select_targets(&[own_webview], Level::Full, &[], &[], KeptServer::None).is_empty());
        let discord = ProcInfo {
            pid: 17,
            name: "Discord.exe".into(),
            cmd: vec![],
        };
        assert!(select_targets(&[discord.clone()], Level::Standard, &[], &["discord.exe".into()], KeptServer::None).is_empty());
        assert_eq!(
            select_targets(&[discord], Level::Full, &[], &["discord".into()], KeptServer::None),
            vec![17]
        );
        assert!(sanitize_entertainment_hosts(&["discord.com".into()]).unwrap() == vec!["discord.com".to_string()]);
        assert!(sanitize_entertainment_hosts(&["youtube.com".into()]).is_err());
        assert!(sanitize_entertainment_programs(&["taskmgr.exe".into()]).is_err());
        assert!(sanitize_entertainment_programs(&["spotify".into()]).is_ok());
        assert_eq!(
            entertainment_domains(&["discord.com".into()]).iter().any(|host| host == "discord.com"),
            true
        );
    }

    #[test]
    fn specs_follow_level_and_prefix() {
        let programs = vec![
            FoundProgram {
                class: ProgramClass::Ai,
                label: "chatgpt".into(),
                path: r"C:\ai\ChatGPT.exe".into(),
            },
            FoundProgram {
                class: ProgramClass::Browser,
                label: "chrome".into(),
                path: r"C:\br\chrome.exe".into(),
            },
            FoundProgram {
                class: ProgramClass::Entertainment,
                label: "steam".into(),
                path: r"C:\st\steam.exe".into(),
            },
        ];
        let ai_ips = vec!["1.1.1.1".into()];
        let fun_ips = vec!["2.2.2.2".into()];
        let api_ips = vec!["9.9.9.9".into()];
        let light = specs_for(Level::Light, &programs, &ai_ips, &fun_ips, &api_ips, r"C:\MindVault.exe");
        assert!(light.iter().all(|rule| rule.name.starts_with("MindVault_")));
        assert!(light.iter().any(|rule| rule.name.contains("chatgpt")));
        assert!(light.iter().all(|rule| !rule.name.contains("chrome") && !rule.name.contains("steam")));
        let standard = specs_for(
            Level::Standard,
            &programs,
            &ai_ips,
            &fun_ips,
            &api_ips,
            r"C:\MindVault.exe",
        );
        assert!(standard.iter().any(|rule| rule.name.contains("chrome")));
        assert!(standard.iter().any(|rule| rule.name == "MindVault_BlockIP_ai"));
        assert!(standard.iter().any(|rule| rule.name == "MindVault_Allow_Tutor"));
        assert!(standard.iter().all(|rule| !rule.name.contains("steam") && rule.name != "MindVault_BlockIP_entertainment"));
        let full = specs_for(Level::Full, &programs, &ai_ips, &fun_ips, &api_ips, r"C:\MindVault.exe");
        assert!(full.iter().any(|rule| rule.name.contains("steam")));
        assert!(full.iter().any(|rule| rule.name == "MindVault_BlockIP_entertainment"));
        assert!(ai_domains_except("api.openai.com").iter().all(|host| host != "api.openai.com"));
    }
}
