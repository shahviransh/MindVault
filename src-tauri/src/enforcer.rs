use crate::policy::{RuleKind, RuleSpec};
use std::path::{Path, PathBuf};

pub trait Enforcer: Send {
    fn apply(&mut self, rules: &[RuleSpec]) -> Result<(), String>;
    fn clear(&mut self) -> Result<(), String>;
    // Only inspected by tests, which assert on exactly which rules were applied/cleared.
    #[allow(dead_code)]
    fn recorded(&self) -> Vec<String>;
}

// Test-only stand-in for HostEnforcer so session tests never touch the real firewall.
#[derive(Default)]
#[allow(dead_code)]
pub struct MemoryEnforcer {
    names: Vec<String>,
}

impl Enforcer for MemoryEnforcer {
    fn apply(&mut self, rules: &[RuleSpec]) -> Result<(), String> {
        self.names = rules.iter().map(|rule| rule.name.clone()).collect();
        Ok(())
    }

    fn clear(&mut self) -> Result<(), String> {
        self.names.clear();
        Ok(())
    }

    fn recorded(&self) -> Vec<String> {
        self.names.clone()
    }
}

pub fn clear_script() -> String {
    "Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'MindVault_*' } | Remove-NetFirewallRule\r\n".into()
}

fn ps_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

/// Windows Firewall rejects `\\?\` paths, missing `.exe` suffixes, and `? * " < > |`.
/// Those rules are left out so one bad path does not cancel the session.
pub fn firewall_program_path(path: &str) -> Option<String> {
    let trimmed = path.trim();
    let path = if let Some(rest) = trimmed.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = trimmed.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        trimmed.to_string()
    };
    if path.len() < 7 || path.len() > 260 {
        return None;
    }
    let drive = path.as_bytes().get(1).copied() == Some(b':');
    let unc = path.starts_with(r"\\");
    if !drive && !unc {
        return None;
    }
    if !path.to_ascii_lowercase().ends_with(".exe") {
        return None;
    }
    if path
        .chars()
        .any(|ch| matches!(ch, '/' | '*' | '?' | '"' | '<' | '>' | '|' | '\n' | '\r'))
    {
        return None;
    }
    Some(path)
}

pub fn apply_script(rules: &[RuleSpec]) -> String {
    let mut script = String::from("$ErrorActionPreference = 'Stop'\r\n");
    script.push_str(&clear_script());
    for rule in rules {
        if !rule.name.starts_with("MindVault_") {
            continue;
        }
        let name = ps_quote(&rule.name);
        match &rule.kind {
            RuleKind::BlockProgram { path } => {
                let Some(path) = firewall_program_path(path) else {
                    continue;
                };
                script.push_str(&format!(
                    "New-NetFirewallRule -DisplayName {name} -Direction Outbound -Action Block -Profile Any -Program {} | Out-Null\r\n",
                    ps_quote(&path)
                ));
            }
            RuleKind::BlockRemote { addresses } => {
                if addresses.is_empty() {
                    continue;
                }
                let list = addresses
                    .iter()
                    .map(|address| ps_quote(address))
                    .collect::<Vec<_>>()
                    .join(",");
                script.push_str(&format!(
                    "New-NetFirewallRule -DisplayName {name} -Direction Outbound -Action Block -Profile Any -RemoteAddress {list} | Out-Null\r\n"
                ));
            }
            RuleKind::AllowProgramRemote { path, addresses } => {
                if addresses.is_empty() {
                    continue;
                }
                let Some(path) = firewall_program_path(path) else {
                    continue;
                };
                let list = addresses
                    .iter()
                    .map(|address| ps_quote(address))
                    .collect::<Vec<_>>()
                    .join(",");
                script.push_str(&format!(
                    "New-NetFirewallRule -DisplayName {name} -Direction Outbound -Action Allow -Profile Any -Program {} -RemoteAddress {list} | Out-Null\r\n",
                    ps_quote(&path)
                ));
            }
        }
    }
    script
}

pub fn discover_programs(roots: &[PathBuf], level: crate::policy::Level) -> Vec<crate::policy::FoundProgram> {
    let mut found = Vec::new();
    for (class, label, relatives) in crate::policy::candidate_programs() {
        if !crate::policy::class_for_level(class, level) {
            continue;
        }
        if let Some(path) = roots.iter().find_map(|root| {
            relatives.iter().find_map(|relative| {
                let candidate = root.join(relative);
                candidate.is_file().then(|| candidate.display().to_string())
            })
        }) {
            found.push(crate::policy::FoundProgram {
                class,
                label: label.to_string(),
                path,
            });
        }
    }
    found
}

pub fn program_roots() -> Vec<PathBuf> {
    let mut roots = windows_roots();
    roots.push(PathBuf::from("/usr"));
    roots.push(PathBuf::from("/usr/local"));
    roots.push(PathBuf::from("/opt"));
    roots.push(PathBuf::from("/Applications"));
    roots.push(PathBuf::from("/System/Applications"));
    if let Ok(home) = std::env::var("HOME") {
        let home = PathBuf::from(home);
        roots.push(home.join(".local"));
        roots.push(home.clone());
    }
    roots
}

pub fn windows_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for key in ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData", "ProgramW6432"] {
        if let Ok(value) = std::env::var(key) {
            roots.push(PathBuf::from(value));
        }
    }
    roots
}

pub fn resolve_ips(hosts: &[String]) -> Vec<String> {
    let mut ips = Vec::new();
    for host in hosts {
        let target = format!("{host}:443");
        if let Ok(addresses) = std::net::ToSocketAddrs::to_socket_addrs(&target) {
            for address in addresses {
                let ip = address.ip().to_string();
                if !ips.contains(&ip) {
                    ips.push(ip);
                }
            }
        }
    }
    ips
}

pub fn clear_platform() -> Result<(), String> {
    if !crate::policy::locks_this_computer() {
        return Ok(());
    }
    #[cfg(windows)]
    {
        return run_powershell(&clear_script());
    }
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        return crate::oslock::clear_rules();
    }
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    Ok(())
}

pub struct HostEnforcer;

impl Enforcer for HostEnforcer {
    fn apply(&mut self, rules: &[RuleSpec]) -> Result<(), String> {
        if !crate::policy::locks_this_computer() {
            return Ok(());
        }
        #[cfg(windows)]
        {
            return run_powershell(&apply_script(rules));
        }
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        {
            return crate::oslock::apply_rules(rules);
        }
        #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
        {
            let _ = rules;
            Ok(())
        }
    }

    fn clear(&mut self) -> Result<(), String> {
        if !crate::policy::locks_this_computer() {
            return Ok(());
        }
        #[cfg(windows)]
        {
            return run_powershell(&clear_script());
        }
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        {
            return crate::oslock::clear_rules();
        }
        #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
        Ok(())
    }

    fn recorded(&self) -> Vec<String> {
        Vec::new()
    }
}

pub fn run_powershell(body: &str) -> Result<(), String> {
    let dir = std::env::temp_dir();
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let script_path = dir.join(format!("mindvault-{stamp}.ps1"));
    let result_path = dir.join(format!("mindvault-{stamp}.txt"));
    let result_literal = result_path.display().to_string().replace('\'', "''");
    let wrapped = format!(
        "$ErrorActionPreference = 'Stop'\r\ntry {{\r\n{body}Set-Content -LiteralPath '{result_literal}' -Value 'ok'\r\n}} catch {{\r\nSet-Content -LiteralPath '{result_literal}' -Value $_.Exception.Message\r\nexit 1\r\n}}\r\n"
    );
    std::fs::write(&script_path, wrapped).map_err(|err| err.to_string())?;
    let _ = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            script_path.to_str().unwrap_or_default(),
        ])
        .status();
    if result_is_ok(&result_path) {
        let _ = std::fs::remove_file(&script_path);
        let _ = std::fs::remove_file(&result_path);
        return Ok(());
    }
    let elevate = format!(
        "Start-Process -FilePath powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','{}'",
        script_path.display().to_string().replace('\'', "''")
    );
    let _ = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-Command", &elevate])
        .status();
    if result_is_ok(&result_path) {
        let _ = std::fs::remove_file(&script_path);
        let _ = std::fs::remove_file(&result_path);
        return Ok(());
    }
    let message = std::fs::read_to_string(&result_path).unwrap_or_else(|_| {
        "Admin consent was denied. The session was not changed.".into()
    });
    let _ = std::fs::remove_file(&script_path);
    let _ = std::fs::remove_file(&result_path);
    Err(message.trim().to_string())
}

fn result_is_ok(path: &Path) -> bool {
    std::fs::read_to_string(path)
        .map(|text| text.trim() == "ok")
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::{specs_for, FoundProgram, Level, ProgramClass};

    #[test]
    fn memory_enforcer_clears_rules() {
        let mut enforcer = MemoryEnforcer::default();
        let rules = specs_for(
            Level::Full,
            &[FoundProgram {
                class: ProgramClass::Ai,
                label: "chatgpt".into(),
                path: r"C:\ai\ChatGPT.exe".into(),
            }],
            &["1.2.3.4".into()],
            &["8.8.8.8".into()],
            &["9.9.9.9".into()],
            r"C:\MindVault.exe",
        );
        enforcer.apply(&rules).unwrap();
        assert!(!enforcer.recorded().is_empty());
        assert!(enforcer.recorded().iter().all(|name| name.starts_with("MindVault_")));
        enforcer.clear().unwrap();
        assert!(enforcer.recorded().is_empty());
    }

    #[test]
    fn scripts_only_touch_prefixed_rules() {
        let rules = vec![crate::policy::RuleSpec {
            name: "MindVault_BlockProg_chrome".into(),
            kind: RuleKind::BlockProgram {
                path: r"C:\chrome.exe".into(),
            },
        }];
        let script = apply_script(&rules);
        assert!(script.contains("MindVault_"));
        assert!(script.contains("Remove-NetFirewallRule"));
        assert!(clear_script().contains("MindVault_*"));
        assert!(!script.contains("taskmgr"));
    }

    #[test]
    fn firewall_script_drops_paths_windows_rejects() {
        let rules = vec![
            crate::policy::RuleSpec {
                name: "MindVault_Allow_Tutor".into(),
                kind: RuleKind::AllowProgramRemote {
                    path: r"\\?\C:\Apps\MindVault.exe".into(),
                    addresses: vec!["1.2.3.4".into()],
                },
            },
            crate::policy::RuleSpec {
                name: "MindVault_BlockProg_shim".into(),
                kind: RuleKind::BlockProgram {
                    path: r"C:\Users\viran\bin\code".into(),
                },
            },
        ];
        let script = apply_script(&rules);
        assert!(script.contains(r"C:\Apps\MindVault.exe"));
        assert!(!script.contains('?'));
        assert!(!script.contains(r"bin\code"));
        assert!(firewall_program_path(r"\\?\UNC\server\share\app.exe").as_deref() == Some(r"\\server\share\app.exe"));
    }
}
