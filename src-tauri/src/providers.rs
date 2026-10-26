//! Opt-in hook/plugin installation. Only Halo's named entries are changed.
use serde::Serialize;
use serde_json::{json, Value};
use std::{env, fs, path::{Path, PathBuf}, sync::Mutex};

const HOOK: &str = include_str!("../../scripts/provider-hook.ps1");
const PLUGIN: &str = include_str!("../../scripts/opencode-halo.js");
const MARKER: &str = "STXIC Halo";
static INSTALL_LOCK: Mutex<()> = Mutex::new(());
const BRIDGES: [&str; 3] = ["antigravity", "github-copilot", "opencode"];

#[derive(Debug, Clone, Serialize)]
pub struct ProviderConnection {
    pub provider: String,
    pub installed: bool,
    pub config_path: String,
}

fn config_path(provider: &str) -> Result<PathBuf, String> {
    let profile = env::var_os("USERPROFILE").or_else(|| env::var_os("HOME"))
        .map(PathBuf::from).ok_or("Cannot locate the user profile")?;
    match provider {
        "antigravity" => Ok(profile.join(".gemini/config/hooks.json")),
        "github-copilot" => Ok(env::var_os("COPILOT_HOME").map(PathBuf::from)
            .unwrap_or_else(|| profile.join(".copilot")).join("hooks/stxic-halo.json")),
        "opencode" => Ok(env::var_os("XDG_CONFIG_HOME").map(PathBuf::from)
            .unwrap_or_else(|| profile.join(".config")).join("opencode/plugins/stxic-halo.js")),
        _ => Err("Unsupported provider bridge".into()),
    }
}

fn read_config(path: &Path) -> Result<Value, String> {
    if !path.exists() { return Ok(json!({})); }
    if fs::metadata(path).map_err(|_| "Cannot inspect hook config")?.len() > 1_048_576 {
        return Err("Hook config exceeds 1 MiB; left unchanged".into());
    }
    let text = fs::read_to_string(path).map_err(|_| "Cannot read hook config")?;
    let value: Value = serde_json::from_str(text.trim_start_matches('\u{feff}'))
        .map_err(|_| "Hook config is not valid JSON; left unchanged")?;
    if !value.is_object() { return Err("Hook config must be an object; left unchanged".into()); }
    Ok(value)
}

fn save(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|_| "Cannot create bridge directory")?; }
    // A first-install backup is never overwritten by subsequent connects/disconnects.
    let backup = path.with_extension(format!("{}.halo-backup", path.extension().and_then(|e| e.to_str()).unwrap_or("")));
    if path.exists() && !backup.exists() { fs::copy(path, backup).map_err(|_| "Cannot back up existing hook config")?; }
    let temp = path.with_extension("halo-tmp");
    fs::write(&temp, content).map_err(|_| "Cannot write bridge config")?;
    fs::rename(&temp, path).map_err(|_| "Cannot replace bridge config".to_owned())
}

fn hook_command(script: &Path, provider: &str, event: &str) -> String {
    format!("powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"{}\" -Source {} -Event {}", script.display(), provider, event)
}

pub fn hook_config(provider: &str, script: &Path) -> Value {
    if provider == "antigravity" {
        let mut entry = json!({});
        for event in ["SessionStart", "PreInvocation", "PostInvocation", "Stop"] {
            entry[event] = json!([{"type":"command", "command":hook_command(script, provider, event), "timeout":5}]);
        }
        for event in ["PreToolUse", "PostToolUse"] {
            entry[event] = json!([{"matcher":".*", "hooks":[{"type":"command", "command":hook_command(script, provider, event), "timeout":5}]}]);
        }
        entry
    } else {
        let mut hooks = json!({});
        for (name, event) in [("sessionStart", "SessionStart"), ("sessionEnd", "SessionEnd"),
            ("userPromptSubmitted", "UserPromptSubmit"), ("preToolUse", "PreToolUse"),
            ("postToolUse", "PostToolUse"), ("agentStop", "Stop"), ("errorOccurred", "Error"),
            ("permissionRequest", "PermissionRequest")] {
            hooks[name] = json!([{"type":"command", "powershell":hook_command(script, provider, event), "timeoutSec":5}]);
        }
        json!({"version":1,"hooks":hooks})
    }
}

fn is_installed(provider: &str, path: &Path) -> bool {
    if fs::metadata(path).map_or(true, |m| !m.is_file() || m.len() > 1_048_576) { return false; }
    if provider == "antigravity" {
        // Detection failures do not masquerade as an enabled connection.
        read_config(&path).ok().and_then(|v| v.get("stxic-halo").cloned())
            .is_some_and(|v| v.get("enabled").and_then(Value::as_bool) != Some(false)
                && v.to_string().contains("provider-hook.ps1"))
    } else {
        fs::read_to_string(&path).ok().is_some_and(|text| {
            if provider == "opencode" { text.contains(MARKER) && text.contains("HaloPlugin") }
            else { text.contains("provider-hook.ps1") && text.contains("github-copilot") }
        })
    }
}

fn connection(provider: &str) -> Result<ProviderConnection, String> {
    let path = config_path(provider)?;
    let installed = is_installed(provider, &path);
    Ok(ProviderConnection { provider: provider.into(), installed, config_path: path.to_string_lossy().into() })
}

#[tauri::command]
pub fn provider_connections() -> Result<Vec<ProviderConnection>, String> {
    BRIDGES.iter().map(|provider| connection(provider)).collect()
}

#[tauri::command]
pub fn set_provider_connection(provider: String, enabled: bool) -> Result<ProviderConnection, String> {
    let _guard = INSTALL_LOCK.lock().map_err(|_| "Bridge installer is busy")?;
    let path = config_path(&provider)?;
    let root = crate::paths::ensure_app_data_dir()?.join("integrations");
    let script = root.join("provider-hook.ps1");
    if enabled {
        fs::create_dir_all(&root).map_err(|_| "Cannot create integration directory")?;
        save(&script, HOOK)?;
    }
    configure_bridge(&provider, &path, &script, enabled)?;
    connection(&provider)
}

fn configure_bridge(provider: &str, path: &Path, script: &Path, enabled: bool) -> Result<(), String> {
    if provider == "antigravity" {
        let mut config = read_config(&path)?;
        if let Some(existing) = config.get("stxic-halo") {
            if !existing.to_string().contains("provider-hook.ps1") {
                return Err("The stxic-halo hook name is already in use; config left unchanged".into());
            }
        }
        if enabled { config["stxic-halo"] = hook_config(&provider, &script); }
        else { config.as_object_mut().unwrap().remove("stxic-halo"); }
        if path.exists() || enabled {
            save(&path, &serde_json::to_string_pretty(&config).map_err(|_| "Cannot serialize hook config")?)?;
        }
    } else {
        let installed = is_installed(provider, path);
        if path.exists() && !installed {
            return Err("An unrecognized file occupies Halo's bridge path; left unchanged".into());
        }
        if enabled {
            let content = if provider == "opencode" { PLUGIN.to_owned() }
                else { serde_json::to_string_pretty(&hook_config(&provider, &script)).map_err(|_| "Cannot serialize hook config")? };
            save(&path, &content)?;
        } else if installed {
            fs::remove_file(&path).map_err(|_| "Cannot remove Halo bridge")?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn respects_provider_specific_hook_formats() {
        let script = Path::new("C:/Users/Some User/Halo/provider-hook.ps1");
        let antigravity = hook_config("antigravity", script);
        assert!(antigravity["PreToolUse"][0]["hooks"].is_array());
        assert!(antigravity["PreInvocation"][0]["command"].as_str().unwrap().contains("-Event PreInvocation"));
        let copilot = hook_config("github-copilot", script);
        assert_eq!(copilot["version"], 1);
        assert!(copilot["hooks"]["agentStop"][0]["powershell"].as_str().unwrap().contains("-Event Stop"));
        assert!(copilot["hooks"]["subagentStop"].is_null());
    }

    #[test]
    fn install_disconnect_preserves_other_hooks_and_first_backup() {
        let dir = env::temp_dir().join(format!("halo-provider-config-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("hooks.json");
        let original = r#"{"my-linter":{"PostToolUse":[]}}"#;
        fs::write(&path, original).unwrap();
        let script = dir.join("provider-hook.ps1");
        configure_bridge("antigravity", &path, &script, true).unwrap();
        assert!(is_installed("antigravity", &path));
        configure_bridge("antigravity", &path, &script, true).unwrap();
        assert_eq!(fs::read_to_string(path.with_extension("json.halo-backup")).unwrap(), original);
        configure_bridge("antigravity", &path, &script, false).unwrap();
        assert_eq!(read_config(&path).unwrap(), serde_json::from_str::<Value>(original).unwrap());
        assert!(!is_installed("antigravity", &path));
        // Invalid JSON and occupied Halo paths must not be overwritten or removed.
        fs::write(&path, "broken JSON").unwrap();
        assert!(configure_bridge("antigravity", &path, &script, true).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "broken JSON");
        assert!(configure_bridge("github-copilot", &path, &script, true).is_err());
        assert!(configure_bridge("opencode", &path, &script, false).is_err());
        fs::remove_file(&path).unwrap();
        for provider in ["github-copilot", "opencode"] {
            configure_bridge(provider, &path, &script, true).unwrap();
            assert!(is_installed(provider, &path));
            configure_bridge(provider, &path, &script, false).unwrap();
            assert!(!path.exists());
        }
        // All cleanup is confined to the explicitly created temp test directory.
        assert!(dir.starts_with(env::temp_dir()) && dir.file_name().unwrap().to_string_lossy().starts_with("halo-provider-config-"));
        fs::remove_dir_all(dir).unwrap();
    }
}
