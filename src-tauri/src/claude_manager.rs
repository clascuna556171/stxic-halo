use crate::paths::ensure_app_data_dir;
use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{fs, path::{Path, PathBuf}, process::Command};

const MANAGE_CLAUDE_HOOK_SCRIPT: &str = include_str!("../../scripts/manage-claude-hook.ps1");
const CLAUDE_HOOK_SCRIPT: &str = include_str!("../../scripts/claude-hook.ps1");
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeHookStatus {
    pub success: bool,
    pub installed: bool,
    pub hook_count: usize,
    pub config_path: String,
    pub hook_path: String,
    pub backup_exists: bool,
    pub backup_path: String,
    pub message: String,
}

fn ensure_embedded_script(path: &Path, content: &str) -> Result<(), String> {
    if fs::read_to_string(path).ok().as_deref() == Some(content) {
        return Ok(());
    }
    fs::write(path, content)
        .map_err(|e| format!("Could not write embedded script {}: {}", path.display(), e))
}

pub fn resolve_manager_script_path() -> Result<PathBuf, String> {
    let dir = ensure_app_data_dir()?.join("integrations");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Could not create integrations directory: {}", e))?;

    let manager_path = dir.join("manage-claude-hook.ps1");
    let hook_path = dir.join("claude-hook.ps1");
    ensure_embedded_script(&manager_path, MANAGE_CLAUDE_HOOK_SCRIPT)?;
    ensure_embedded_script(&hook_path, CLAUDE_HOOK_SCRIPT)?;

    Ok(manager_path)
}

pub fn execute_hook_manager(action: &str) -> Result<ClaudeHookStatus, String> {
    let script = resolve_manager_script_path()?;
    let script_str = script
        .to_str()
        .ok_or_else(|| "Invalid unicode in script path".to_string())?;

    let mut command = Command::new("powershell.exe");
    command.args([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script_str,
        "-Action",
        action,
    ]);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .map_err(|e| format!("Failed to spawn PowerShell manager: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();

    if !output.status.success() || trimmed.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Hook manager error (exit code {:?}): {}\n{}",
            output.status.code(),
            trimmed,
            stderr.trim()
        ));
    }

    serde_json::from_str::<ClaudeHookStatus>(trimmed)
        .map_err(|e| format!("Invalid JSON response from manager: {}\nRaw: {}", e, trimmed))
}

/// Spawning PowerShell takes ~0.5-1.5s; run it off the Tauri main thread so the
/// floating window stays responsive.
async fn run_hook_manager(action: &'static str) -> Result<ClaudeHookStatus, String> {
    tauri::async_runtime::spawn_blocking(move || execute_hook_manager(action))
        .await
        .map_err(|e| format!("Hook manager worker failed: {e}"))?
}

#[tauri::command]
pub async fn check_claude_hook_status() -> Result<ClaudeHookStatus, String> {
    run_hook_manager("Status").await
}

#[tauri::command]
pub async fn enable_claude_hook() -> Result<ClaudeHookStatus, String> {
    run_hook_manager("Enable").await
}

#[tauri::command]
pub async fn disable_claude_hook(rollback: bool) -> Result<ClaudeHookStatus, String> {
    run_hook_manager(if rollback { "Rollback" } else { "Disable" }).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_script_path_resolution() {
        let res = resolve_manager_script_path();
        assert!(res.is_ok(), "Expected embedded manage-claude-hook.ps1 to materialize");
        let path = res.unwrap();
        assert!(path.exists());
        assert!(path.ends_with("manage-claude-hook.ps1"));
        let hook_sibling = path.parent().unwrap().join("claude-hook.ps1");
        assert!(hook_sibling.exists(), "Expected sibling claude-hook.ps1 to materialize");
    }
}
