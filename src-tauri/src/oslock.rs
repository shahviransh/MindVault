#![allow(dead_code)]

use crate::policy::{RuleKind, RuleSpec};
use std::net::IpAddr;
use std::path::PathBuf;

pub fn remote_addresses(rules: &[RuleSpec]) -> (Vec<String>, Vec<String>) {
    let mut v4 = Vec::new();
    let mut v6 = Vec::new();
    for rule in rules {
        if !rule.name.starts_with("MindVault_") {
            continue;
        }
        let RuleKind::BlockRemote { addresses } = &rule.kind else {
            continue;
        };
        for address in addresses {
            let Ok(ip) = address.parse::<IpAddr>() else {
                continue;
            };
            if ip.is_loopback() || ip.is_unspecified() {
                continue;
            }
            let text = ip.to_string();
            let list = match ip {
                IpAddr::V4(_) => &mut v4,
                IpAddr::V6(_) => &mut v6,
            };
            if !list.contains(&text) {
                list.push(text);
            }
        }
    }
    (v4, v6)
}

pub fn program_paths(rules: &[RuleSpec]) -> Vec<String> {
    let mut paths = Vec::new();
    for rule in rules {
        if !rule.name.starts_with("MindVault_") {
            continue;
        }
        let RuleKind::BlockProgram { path } = &rule.kind else {
            continue;
        };
        if safe_program_path(path) && !paths.iter().any(|existing| existing == path) {
            paths.push(path.clone());
        }
    }
    paths
}

fn safe_program_path(path: &str) -> bool {
    path.starts_with('/')
        && path.len() < 400
        && !path.chars().any(|ch| {
            matches!(ch, '\n' | '\r' | '\'' | '"' | ';' | '`' | '$' | '|' | '&' | '\\')
        })
}

pub fn nft_ruleset(v4: &[String], v6: &[String]) -> String {
    let mut body = String::new();
    if !v4.is_empty() {
        body.push_str(&format!("        ip daddr {{ {} }} drop\n", v4.join(", ")));
    }
    if !v6.is_empty() {
        body.push_str(&format!("        ip6 daddr {{ {} }} drop\n", v6.join(", ")));
    }
    format!(
        "table inet mindvault {{\n    chain output {{\n        type filter hook output priority 0; policy accept;\n{body}    }}\n}}\n"
    )
}

pub fn pf_anchor(v4: &[String], v6: &[String]) -> String {
    let mut body = String::new();
    if !v4.is_empty() {
        body.push_str(&format!(
            "block drop out quick inet from any to {}\n",
            pf_list(v4)
        ));
    }
    if !v6.is_empty() {
        body.push_str(&format!(
            "block drop out quick inet6 from any to {}\n",
            pf_list(v6)
        ));
    }
    body
}

fn pf_list(ips: &[String]) -> String {
    if ips.len() == 1 {
        ips[0].clone()
    } else {
        format!("{{ {} }}", ips.join(", "))
    }
}

pub fn linux_apply_script(ruleset: &str) -> String {
    format!(
        "#!/bin/sh\nset -eu\nif ! command -v nft >/dev/null 2>&1; then\n  echo \"Install nftables to block sites. The session was not changed.\" >&2\n  exit 1\nfi\nnft delete table inet mindvault 2>/dev/null || true\nnft -f - << 'MINDVAULT_NFT'\n{ruleset}MINDVAULT_NFT\n"
    )
}

pub fn linux_clear_script() -> String {
    "#!/bin/sh\nset -eu\nif command -v nft >/dev/null 2>&1; then\n  nft delete table inet mindvault 2>/dev/null || true\nfi\n".into()
}

pub fn macos_apply_script(anchor: &str, paths: &[String]) -> String {
    let mut script = String::from("#!/bin/sh\nset -eu\n");
    if !anchor.is_empty() {
        script.push_str("cat > /etc/pf.anchors/mindvault << 'MINDVAULT_PF'\n");
        script.push_str(anchor);
        script.push_str("MINDVAULT_PF\n");
        script.push_str("touch /etc/pf.conf\n");
        script.push_str("grep -qx 'anchor \"mindvault\"' /etc/pf.conf || printf '\\nanchor \"mindvault\"\\nload anchor \"mindvault\" from \"/etc/pf.anchors/mindvault\"\\n' >> /etc/pf.conf\n");
        script.push_str("pfctl -f /etc/pf.conf\n");
        script.push_str("pfctl -e || true\n");
    }
    script.push_str(": > /var/tmp/mindvault-apps.txt\n");
    script.push_str("FW=/usr/libexec/ApplicationFirewall/socketfilterfw\n");
    for path in paths {
        script.push_str(&format!("\"$FW\" --blockapp '{path}' || true\n"));
        script.push_str(&format!("printf '%s\\n' '{path}' >> /var/tmp/mindvault-apps.txt\n"));
    }
    script
}

pub fn macos_clear_script() -> String {
    "#!/bin/sh\nset -eu\nif [ -f /etc/pf.conf ]; then\n  grep -v -x -e 'anchor \"mindvault\"' -e 'load anchor \"mindvault\" from \"/etc/pf.anchors/mindvault\"' /etc/pf.conf > /etc/pf.conf.mindvault.tmp || true\n  mv /etc/pf.conf.mindvault.tmp /etc/pf.conf\n  pfctl -f /etc/pf.conf || true\nfi\nrm -f /etc/pf.anchors/mindvault\nif [ -f /var/tmp/mindvault-apps.txt ]; then\n  FW=/usr/libexec/ApplicationFirewall/socketfilterfw\n  while IFS= read -r path; do\n    [ -n \"$path\" ] || continue\n    \"$FW\" --unblockapp \"$path\" || true\n  done < /var/tmp/mindvault-apps.txt\n  rm -f /var/tmp/mindvault-apps.txt\nfi\n".into()
}

fn marker_path() -> PathBuf {
    std::env::temp_dir().join("mindvault-os-lock")
}

pub fn apply_rules(rules: &[RuleSpec]) -> Result<(), String> {
    let (v4, v6) = remote_addresses(rules);
    let paths = program_paths(rules);
    let needs_net = !v4.is_empty() || !v6.is_empty();
    #[cfg(target_os = "linux")]
    let script = {
        let _ = &paths;
        if !needs_net {
            return Ok(());
        }
        linux_apply_script(&nft_ruleset(&v4, &v6))
    };
    #[cfg(target_os = "macos")]
    let script = {
        if !needs_net && paths.is_empty() {
            return Ok(());
        }
        macos_apply_script(&pf_anchor(&v4, &v6), &paths)
    };
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = (needs_net, paths);
        return Ok(());
    }
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        run_root(&script)?;
        let _ = std::fs::write(marker_path(), "1");
        Ok(())
    }
}

pub fn clear_rules() -> Result<(), String> {
    if !marker_path().exists() && !linux_table_present() && !macos_anchor_present() {
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    let script = linux_clear_script();
    #[cfg(target_os = "macos")]
    let script = macos_clear_script();
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        return Ok(());
    }
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        run_root(&script)?;
        let _ = std::fs::remove_file(marker_path());
        Ok(())
    }
}

fn linux_table_present() -> bool {
    #[cfg(target_os = "linux")]
    {
        return std::process::Command::new("nft")
            .args(["list", "table", "inet", "mindvault"])
            .status()
            .map(|status| status.success())
            .unwrap_or(false);
    }
    #[cfg(not(target_os = "linux"))]
    false
}

fn macos_anchor_present() -> bool {
    #[cfg(target_os = "macos")]
    {
        return std::path::Path::new("/etc/pf.anchors/mindvault").exists()
            || std::path::Path::new("/var/tmp/mindvault-apps.txt").exists();
    }
    #[cfg(not(target_os = "macos"))]
    false
}

#[cfg(unix)]
fn is_root() -> bool {
    unsafe { geteuid() == 0 }
}

#[cfg(unix)]
extern "C" {
    fn geteuid() -> u32;
}

#[cfg(unix)]
fn run_root(script: &str) -> Result<(), String> {
    let path = std::env::temp_dir().join(format!(
        "mindvault-{}.sh",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0)
    ));
    std::fs::write(&path, script).map_err(|err| err.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700));
    }
    let path_text = path.display().to_string();
    let result = if is_root() {
        run_command("sh", &[&path_text])
    } else if cfg!(target_os = "linux") {
        match run_command("pkexec", &["/bin/sh", &path_text]) {
            Ok(()) => Ok(()),
            Err(_) => run_command("sudo", &["--", "/bin/sh", &path_text]),
        }
    } else if cfg!(target_os = "macos") {
        let apple = format!(
            "do shell script \"/bin/sh \" & quoted form of \"{}\" with administrator privileges",
            path_text.replace('"', "")
        );
        run_command("osascript", &["-e", &apple])
    } else {
        Err("Admin consent was denied. The session was not changed.".into())
    };
    let _ = std::fs::remove_file(&path);
    result
}

#[cfg(unix)]
fn run_command(program: &str, args: &[&str]) -> Result<(), String> {
    let output = std::process::Command::new(program)
        .args(args)
        .output()
        .map_err(|_| "Admin consent was denied. The session was not changed.".to_string())?;
    if output.status.success() {
        return Ok(());
    }
    let err = String::from_utf8_lossy(&output.stderr);
    let message = err.trim();
    if message.is_empty() {
        Err("Admin consent was denied. The session was not changed.".into())
    } else {
        Err(message.chars().take(300).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn remote(name: &str, addresses: &[&str]) -> RuleSpec {
        RuleSpec {
            name: name.into(),
            kind: RuleKind::BlockRemote {
                addresses: addresses.iter().map(|item| (*item).to_string()).collect(),
            },
        }
    }

    #[test]
    fn nft_blocks_only_the_mindvault_table() {
        let rules = vec![
            remote("MindVault_BlockIP_ai", &["1.2.3.4", "127.0.0.1", "not-an-ip", "2001:db8::1"]),
            remote("Other_Block", &["9.9.9.9"]),
            RuleSpec {
                name: "MindVault_BlockProg_chrome".into(),
                kind: RuleKind::BlockProgram {
                    path: "/usr/bin/google-chrome".into(),
                },
            },
        ];
        let (v4, v6) = remote_addresses(&rules);
        let text = nft_ruleset(&v4, &v6);
        assert!(text.contains("table inet mindvault"));
        assert!(text.contains("1.2.3.4"));
        assert!(text.contains("2001:db8::1"));
        assert!(!text.contains("127.0.0.1"));
        assert!(!text.contains("9.9.9.9"));
        assert!(!text.contains("flush ruleset"));
        assert!(!text.contains("google-chrome"));
        let script = linux_apply_script(&text);
        assert!(script.contains("nft delete table inet mindvault"));
        assert!(!linux_clear_script().contains("flush ruleset"));
    }

    #[test]
    fn pf_never_disables_the_firewall_or_blocks_everything() {
        let rules = vec![remote("MindVault_BlockIP_entertainment", &["8.8.8.8", "::1"])];
        let (v4, v6) = remote_addresses(&rules);
        let anchor = pf_anchor(&v4, &v6);
        assert!(anchor.contains("8.8.8.8"));
        assert!(!anchor.contains("::1"));
        let script = macos_apply_script(&anchor, &["/Applications/Safari.app/Contents/MacOS/Safari".into()]);
        assert!(script.contains("anchor \"mindvault\""));
        assert!(script.contains("--blockapp '/Applications/Safari.app/Contents/MacOS/Safari'"));
        assert!(!script.contains("pfctl -d"));
        assert!(!script.contains("block all"));
        let clear = macos_clear_script();
        assert!(clear.contains("--unblockapp"));
        assert!(clear.contains("rm -f /etc/pf.anchors/mindvault"));
        assert!(!clear.contains("pfctl -d"));
        assert!(program_paths(&[RuleSpec {
            name: "MindVault_BlockProg_bad".into(),
            kind: RuleKind::BlockProgram {
                path: "/tmp/bad;rm".into(),
            },
        }])
        .is_empty());
    }
}
