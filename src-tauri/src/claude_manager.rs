use serde::{Deserialize, Serialize};
use std::{env, path::PathBuf, process::Command};

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

pub fn resolve_manager_script_path() -> Result<PathBuf, String> {
    let candidates = [
        PathBuf::from("scripts/manage-claude-hook.ps1"),
        PathBuf::from("../scripts/manage-claude-hook.ps1"),
    ];

    for c in &candidates {
        if c.exists() {
            return std::fs::canonicalize(c)
                .map_err(|e| format!("Cannot canonicalize path: {}", e));
        }
    }

    if let Ok(exe) = env::current_exe() {
        if let Some(dir) = exe.parent() {
            let direct = dir.join("scripts/manage-claude-hook.ps1");
            if direct.exists() {
                return Ok(direct);
            }
            let dev_ancestor = dir.join("../../../scripts/manage-claude-hook.ps1");
            if dev_ancestor.exists() {
                return std::fs::canonicalize(&dev_ancestor)
                    .map_err(|e| format!("Cannot canonicalize path: {}", e));
            }
        }
    }

    Err("Could not find manage-claude-hook.ps1 in workspace".to_string())
}

pub fn execute_hook_manager(action: &str) -> Result<ClaudeHookStatus, String> {
    let script = resolve_manager_script_path()?;
    let script_str = script
        .to_str()
        .ok_or_else(|| "Invalid unicode in script path".to_string())?;

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            script_str,
            "-Action",
            action,
        ])
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
        assert!(res.is_ok(), "Expected manage-claude-hook.ps1 to be found");
        let path = res.unwrap();
        assert!(path.exists());
        assert!(path.ends_with("manage-claude-hook.ps1"));
    }
}
