//! Short-lived, same-user permission mailbox. No tool input enters the event log.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PermissionRequest {
    pub id: String,
    pub session_id: String,
    pub cwd: String,
    pub tool_name: String,
    pub tool_input: String,
    pub expires_at: u64,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn valid_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|c| c.is_ascii_hexdigit())
}

fn read_request(dir: &Path, id: &str, now: u64) -> Result<PermissionRequest, String> {
    if !valid_id(id) {
        return Err("Invalid request identifier".into());
    }
    let path = dir.join(format!("{id}.request.json"));
    let metadata = fs::symlink_metadata(&path).map_err(|_| "Request is no longer available")?;
    if !metadata.is_file() || metadata.len() > 32768 {
        return Err("Invalid permission request".into());
    }
    let request: PermissionRequest =
        serde_json::from_slice(&fs::read(path).map_err(|_| "Cannot read request")?)
            .map_err(|_| "Invalid permission request")?;
    if request.id != id
        || request.expires_at <= now
        || request.expires_at > now + 45000
        || request.tool_input.len() > 16384
        || request.tool_name.len() > 128
        || request.session_id.len() > 128
        || request.cwd.len() > 4096
    {
        return Err("Request expired or invalid; review it in Claude Code".into());
    }
    Ok(request)
}

fn list_pending(dir: &Path, now: u64) -> Result<Vec<PermissionRequest>, String> {
    fs::create_dir_all(dir).map_err(|_| "Cannot create permission mailbox")?;
    fs::write(dir.join("heartbeat"), b"active").map_err(|_| "Cannot update permission bridge")?;
    let mut pending = Vec::new();
    for entry in fs::read_dir(dir)
        .map_err(|_| "Cannot read permission mailbox")?
        .take(512)
        .flatten()
    {
        let name = entry.file_name().to_string_lossy().into_owned();
        // Recover temporary input and orphaned responses after an interrupted hook.
        if name.ends_with(".tmp") || name.ends_with(".decision.json") {
            let id = name.split('.').next().unwrap_or_default();
            if valid_id(id)
                && entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .is_some_and(|age| now.saturating_sub(age.as_millis() as u64) > 45000)
            {
                let _ = fs::remove_file(entry.path());
            }
            continue;
        }
        let Some(id) = name.strip_suffix(".request.json") else {
            continue;
        };
        if !valid_id(id) {
            continue;
        }
        match read_request(dir, id, now) {
            Ok(request) if !dir.join(format!("{id}.decision.json")).exists() => {
                if pending.len() < 64 {
                    pending.push(request);
                }
            }
            Err(_) => {
                let _ = fs::remove_file(entry.path());
                let _ = fs::remove_file(dir.join(format!("{id}.decision.json")));
            }
            _ => {}
        }
    }
    pending.sort_by_key(|request| request.expires_at);
    Ok(pending)
}

fn submit(dir: &Path, id: &str, behavior: &str, now: u64) -> Result<(), String> {
    if !matches!(behavior, "allow" | "deny") {
        return Err("Invalid permission decision".into());
    }
    read_request(dir, id, now)?;
    // create_new ensures repeated clicks or concurrent windows cannot change a decision.
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dir.join(format!("{id}.decision.json")))
        .map_err(|_| "Decision already submitted or request unavailable")?;
    file.write_all(format!("{{\"behavior\":\"{behavior}\"}}").as_bytes())
        .map_err(|_| "Cannot send permission decision".to_string())
}

#[tauri::command]
pub fn list_permission_requests() -> Result<Vec<PermissionRequest>, String> {
    list_pending(&crate::paths::app_data_dir()?.join("permissions"), now_ms())
}

#[tauri::command]
pub fn respond_to_permission(id: String, behavior: String) -> Result<(), String> {
    submit(
        &crate::paths::app_data_dir()?.join("permissions"),
        &id,
        &behavior,
        now_ms(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (std::path::PathBuf, String) {
        let id = format!(
            "{:032x}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let dir = std::env::temp_dir().join(format!("halo-permissions-{id}"));
        fs::create_dir_all(&dir).unwrap();
        let request = PermissionRequest {
            id: id.clone(),
            session_id: "session".into(),
            cwd: "workspace".into(),
            tool_name: "Bash".into(),
            tool_input: "{\"command\":\"npm test\"}".into(),
            expires_at: 45000,
        };
        fs::write(
            dir.join(format!("{id}.request.json")),
            serde_json::to_vec(&request).unwrap(),
        )
        .unwrap();
        (dir, id)
    }
    #[test]
    fn pending_decisions_are_single_use_and_do_not_cross_requests() {
        let (dir, id) = fixture();
        assert_eq!(list_pending(&dir, 1000).unwrap().len(), 1);
        assert!(submit(&dir, &id, "allow", 1000).is_ok());
        assert!(submit(&dir, &id, "deny", 1000).is_err());
        assert!(list_pending(&dir, 1000).unwrap().is_empty());
        assert_eq!(
            fs::read_to_string(dir.join(format!("{id}.decision.json"))).unwrap(),
            "{\"behavior\":\"allow\"}"
        );
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn rejects_expired_missing_invalid_and_traversal_requests() {
        let (dir, id) = fixture();
        assert!(submit(&dir, &id, "approve", 1000).is_err());
        assert!(submit(&dir, "../settings", "allow", 1000).is_err());
        assert!(submit(&dir, &"a".repeat(32), "allow", 1000).is_err());
        assert!(submit(&dir, &id, "allow", 45000).is_err());
        assert!(list_pending(&dir, 45000).unwrap().is_empty());
        assert!(!dir.join(format!("{id}.request.json")).exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(windows)]
    fn hook_roundtrip(behavior: Option<&str>) {
        use std::{
            os::windows::process::CommandExt,
            process::{Command, Stdio},
            time::{Duration, Instant},
        };
        let (root, _) = fixture();
        let mailbox = root.join("STXICHalo/permissions");
        if behavior.is_some() {
            list_pending(&mailbox, now_ms()).unwrap();
        }
        let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("../scripts/claude-hook.ps1");
        let mut child = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
            ])
            .arg(script)
            .env("LOCALAPPDATA", &root)
            .creation_flags(0x08000000)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child.stdin.take().unwrap().write_all(br#"{"hook_event_name":"PermissionRequest","session_id":"test-session","cwd":"C:\\test","tool_name":"Bash","tool_input":{"command":"echo private-input-marker"}}"#).unwrap();
        let start = Instant::now();
        let mut sent = false;
        while child.try_wait().unwrap().is_none() && start.elapsed() < Duration::from_secs(12) {
            if let Some(behavior) = behavior {
                let requests = list_pending(&mailbox, now_ms()).unwrap();
                if !sent {
                    if let Some(request) = requests.first() {
                        assert!(request.tool_input.contains("private-input-marker"));
                        submit(&mailbox, &request.id, behavior, now_ms()).unwrap();
                        sent = true;
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        if child.try_wait().unwrap().is_none() {
            let _ = child.kill();
            panic!("Hook did not finish");
        }
        let output = child.wait_with_output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        if let Some(behavior) = behavior {
            assert!(
                sent,
                "No pending request created: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            let result: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
            assert_eq!(
                result["hookSpecificOutput"]["hookEventName"],
                "PermissionRequest"
            );
            assert_eq!(
                result["hookSpecificOutput"]["decision"]["behavior"],
                behavior
            );
            assert!(fs::read_dir(&mailbox).unwrap().all(|entry| !entry
                .unwrap()
                .file_name()
                .to_string_lossy()
                .ends_with(".json")));
        } else {
            assert!(output.stdout.is_empty());
        }
        let log = fs::read_to_string(root.join("STXICHalo/events.jsonl")).unwrap();
        assert!(!log.contains("private-input-marker"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[cfg(windows)]
    fn real_powershell_hook_delivers_approval_and_removes_sensitive_input() {
        hook_roundtrip(Some("allow"));
    }
    #[test]
    #[cfg(windows)]
    fn real_powershell_hook_delivers_denial_and_removes_sensitive_input() {
        hook_roundtrip(Some("deny"));
    }
    #[test]
    #[cfg(windows)]
    fn real_powershell_hook_falls_through_when_halo_is_offline() {
        hook_roundtrip(None);
    }
}
