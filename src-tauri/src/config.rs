use crate::paths::{ensure_app_data_dir, settings_backup_path, settings_file_path};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

/// Current on-disk settings schema. Bump together with a new step in [`migrate_value`].
///
/// History:
/// - v1: initial schema (poll cadence, monitor, alerts, workspaces, Codex toggle).
/// - v2: adds `process_reconciliation`; normalizes and de-duplicates approved workspaces
///   case-insensitively (v1 `dedup()` only removed consecutive duplicates).
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct UserSettings {
    pub schema_version: u32,
    pub poll_interval_ms: u64,
    pub target_monitor_index: usize,
    pub horizontal_offset_px: i32,
    pub top_inset_px: i32,
    pub auto_collapse_on_blur: bool,
    pub reduce_motion: bool,
    pub alert_on_waiting: bool,
    pub alert_on_failure: bool,
    pub stale_minutes: u32,
    pub approved_workspaces: Vec<String>,
    pub enable_codex_logs: bool,
    /// Cross-check working/waiting sessions against running provider processes.
    pub process_reconciliation: bool,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA_VERSION,
            poll_interval_ms: 2500,
            target_monitor_index: 0,
            horizontal_offset_px: 0,
            top_inset_px: 10,
            auto_collapse_on_blur: false,
            reduce_motion: false,
            alert_on_waiting: true,
            alert_on_failure: true,
            stale_minutes: 15,
            approved_workspaces: Vec::new(),
            enable_codex_logs: true,
            process_reconciliation: true,
        }
    }
}

/// Where the active settings came from on startup. Surfaced in the integration health panel.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SettingsSource {
    Disk,
    Backup,
    Defaults,
}

#[derive(Debug, Clone, Serialize)]
pub struct SettingsHealth {
    pub source: SettingsSource,
    pub path: String,
    pub schema_version: u32,
    pub migrated_from: Option<u32>,
    /// Path the unreadable settings file was moved to, if recovery happened.
    pub quarantined_path: Option<String>,
    pub warning: Option<String>,
    pub last_save_error: Option<String>,
}

impl Default for SettingsHealth {
    fn default() -> Self {
        Self {
            source: SettingsSource::Defaults,
            path: settings_file_path()
                .map(|p| p.display().to_string())
                .unwrap_or_default(),
            schema_version: CURRENT_SCHEMA_VERSION,
            migrated_from: None,
            quarantined_path: None,
            warning: None,
            last_save_error: None,
        }
    }
}

/// Normalizes a Windows path for comparison: trims, unifies separators, strips trailing
/// separators (except drive roots) and lowercases.
pub fn normalize_path_key(path: &str) -> String {
    let mut s = path.trim().replace('/', "\\");
    while s.len() > 3 && s.ends_with('\\') {
        s.pop();
    }
    s.to_lowercase()
}

fn dedupe_workspaces(list: &mut Vec<String>) {
    let mut seen = std::collections::HashSet::new();
    list.retain(|w| {
        let trimmed = w.trim();
        !trimmed.is_empty() && seen.insert(normalize_path_key(trimmed))
    });
    for w in list.iter_mut() {
        *w = w.trim().to_string();
    }
}

/// Applies forward-only schema migrations to a raw JSON object.
/// Returns the migrated value and the schema version it started from.
pub fn migrate_value(mut value: Value) -> Result<(Value, u32), String> {
    let obj = value
        .as_object_mut()
        .ok_or_else(|| "Settings root is not a JSON object".to_string())?;
    let from = obj
        .get("schema_version")
        .and_then(Value::as_u64)
        .map(|v| v as u32)
        .unwrap_or(1)
        .max(1);

    let mut version = from;
    if version == 1 {
        obj.entry("process_reconciliation").or_insert(Value::Bool(true));
        if let Some(Value::Array(list)) = obj.get_mut("approved_workspaces") {
            let mut paths: Vec<String> = list
                .iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect();
            dedupe_workspaces(&mut paths);
            *list = paths.into_iter().map(Value::String).collect();
        }
        version = 2;
    }
    // Future versions are read best-effort: unknown keys are ignored by serde.
    obj.insert(
        "schema_version".to_string(),
        Value::from(version.max(CURRENT_SCHEMA_VERSION)),
    );
    Ok((value, from))
}

/// Parses and migrates settings JSON text.
pub fn parse_settings(contents: &str) -> Result<(UserSettings, u32), String> {
    let raw: Value =
        serde_json::from_str(contents).map_err(|e| format!("Invalid settings JSON: {e}"))?;
    let (migrated, from) = migrate_value(raw)?;
    let settings: UserSettings = serde_json::from_value(migrated)
        .map_err(|e| format!("Settings do not match the expected schema: {e}"))?;
    Ok((settings.sanitized(), from))
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default()
}

impl UserSettings {
    pub fn sanitized(mut self) -> Self {
        self.schema_version = CURRENT_SCHEMA_VERSION;
        self.poll_interval_ms = self.poll_interval_ms.clamp(1000, 15000);
        self.target_monitor_index = self.target_monitor_index.min(16);
        self.horizontal_offset_px = self.horizontal_offset_px.clamp(-1600, 1600);
        self.top_inset_px = self.top_inset_px.clamp(4, 64);
        self.stale_minutes = self.stale_minutes.clamp(5, 120);
        dedupe_workspaces(&mut self.approved_workspaces);
        self
    }

    pub fn load_from_disk() -> Self {
        Self::load_with_health().0
    }

    /// Loads settings with migration and corruption recovery:
    /// 1. `settings.json` (migrated forward if older),
    /// 2. if unreadable: quarantine it as `settings.corrupt-<ts>.json`, then try `settings.json.bak`,
    /// 3. otherwise fall back to defaults.
    pub fn load_with_health() -> (Self, SettingsHealth) {
        let mut health = SettingsHealth::default();
        let (Ok(path), Ok(backup)) = (settings_file_path(), settings_backup_path()) else {
            health.warning = Some("Local app data directory unavailable; using defaults".into());
            return (Self::default(), health);
        };
        Self::load_from_paths(&path, &backup)
    }

    pub fn load_from_paths(path: &Path, backup: &Path) -> (Self, SettingsHealth) {
        let mut health = SettingsHealth {
            path: path.display().to_string(),
            ..SettingsHealth::default()
        };

        if !path.exists() {
            return (Self::default(), health);
        }

        let primary_error = match fs::read_to_string(path)
            .map_err(|e| format!("Cannot read settings file: {e}"))
            .and_then(|c| parse_settings(&c))
        {
            Ok((settings, from)) => {
                health.source = SettingsSource::Disk;
                health.migrated_from = (from < CURRENT_SCHEMA_VERSION).then_some(from);
                if from > CURRENT_SCHEMA_VERSION {
                    health.warning = Some(format!(
                        "Settings were written by a newer Halo (schema v{from}); unknown options are ignored"
                    ));
                    // Preserve the newer file before this build rewrites it.
                    let keep = path.with_file_name(format!("settings.v{from}.json"));
                    if !keep.exists() {
                        let _ = fs::copy(path, &keep);
                    }
                }
                return (settings, health);
            }
            Err(e) => e,
        };

        // Quarantine the unreadable file so the next save cannot silently destroy it.
        let quarantine = path.with_file_name(format!("settings.corrupt-{}.json", unix_seconds()));
        if fs::rename(path, &quarantine).is_ok() {
            health.quarantined_path = Some(quarantine.display().to_string());
        }

        if let Ok((settings, from)) = fs::read_to_string(backup)
            .map_err(|e| e.to_string())
            .and_then(|c| parse_settings(&c))
        {
            health.source = SettingsSource::Backup;
            health.migrated_from = (from < CURRENT_SCHEMA_VERSION).then_some(from);
            health.warning = Some(format!(
                "Settings file was unreadable ({primary_error}); restored last known good backup"
            ));
            return (settings, health);
        }

        health.source = SettingsSource::Defaults;
        health.warning = Some(format!(
            "Settings file was unreadable ({primary_error}); defaults restored"
        ));
        (Self::default(), health)
    }

    pub fn save_to_disk(&self) -> Result<Self, String> {
        let dir = ensure_app_data_dir()?;
        let path = settings_file_path()?;
        let backup = settings_backup_path()?;
        self.save_to_paths(&dir.join("settings.json.tmp"), &path, &backup)
    }

    /// Atomic save: write temp file, keep the current valid file as last-known-good backup,
    /// then replace.
    pub fn save_to_paths(&self, temp_path: &Path, path: &Path, backup: &Path) -> Result<Self, String> {
        let sanitized = self.clone().sanitized();
        let payload = serde_json::to_string_pretty(&sanitized)
            .map_err(|_| "Could not serialize settings".to_string())?;
        fs::write(temp_path, payload)
            .map_err(|e| format!("Could not write temporary settings file: {e}"))?;

        if let Ok(existing) = fs::read_to_string(path) {
            if parse_settings(&existing).is_ok() {
                let _ = fs::write(backup, existing);
            }
        }

        fs::rename(temp_path, path)
            .or_else(|_| {
                let res = fs::copy(temp_path, path).map(|_| ());
                let _ = fs::remove_file(temp_path);
                res
            })
            .map_err(|e| format!("Could not commit settings file: {e}"))?;

        Ok(sanitized)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("halo-settings-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn migrates_v1_settings_to_current() {
        let v1 = r#"{
            "schema_version": 1,
            "poll_interval_ms": 5000,
            "approved_workspaces": ["C:\\Work\\App", "c:/work/app/", "D:\\Other", "C:\\Work\\App"]
        }"#;
        let (settings, from) = parse_settings(v1).unwrap();
        assert_eq!(from, 1);
        assert_eq!(settings.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(settings.poll_interval_ms, 5000);
        assert!(settings.process_reconciliation);
        assert_eq!(settings.approved_workspaces, vec!["C:\\Work\\App", "D:\\Other"]);
    }

    #[test]
    fn reads_newer_schema_best_effort() {
        let future = r#"{ "schema_version": 9, "stale_minutes": 30, "brand_new_option": true }"#;
        let (settings, from) = parse_settings(future).unwrap();
        assert_eq!(from, 9);
        assert_eq!(settings.stale_minutes, 30);
    }

    #[test]
    fn corrupt_file_is_quarantined_and_backup_restored() {
        let dir = temp_dir("corrupt");
        let path = dir.join("settings.json");
        let backup = dir.join("settings.json.bak");
        fs::write(&path, "{ not json").unwrap();
        fs::write(&backup, r#"{ "schema_version": 2, "stale_minutes": 42 }"#).unwrap();

        let (settings, health) = UserSettings::load_from_paths(&path, &backup);
        assert_eq!(settings.stale_minutes, 42);
        assert_eq!(health.source, SettingsSource::Backup);
        assert!(health.warning.is_some());
        let quarantined = health.quarantined_path.expect("corrupt file should be quarantined");
        assert!(Path::new(&quarantined).exists());
        assert!(!path.exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_file_without_backup_falls_back_to_defaults() {
        let dir = temp_dir("defaults");
        let path = dir.join("settings.json");
        fs::write(&path, "[1,2,3]").unwrap();
        let (settings, health) = UserSettings::load_from_paths(&path, &dir.join("missing.bak"));
        assert_eq!(settings.poll_interval_ms, UserSettings::default().poll_interval_ms);
        assert_eq!(health.source, SettingsSource::Defaults);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_keeps_last_known_good_backup() {
        let dir = temp_dir("save");
        let path = dir.join("settings.json");
        let backup = dir.join("settings.json.bak");
        let tmp = dir.join("settings.json.tmp");

        let first = UserSettings { stale_minutes: 20, ..Default::default() };
        first.save_to_paths(&tmp, &path, &backup).unwrap();
        assert!(!backup.exists(), "no backup before a valid file exists");

        let second = UserSettings { stale_minutes: 25, ..Default::default() };
        second.save_to_paths(&tmp, &path, &backup).unwrap();
        let (restored, _) = parse_settings(&fs::read_to_string(&backup).unwrap()).unwrap();
        assert_eq!(restored.stale_minutes, 20);
        let (current, _) = parse_settings(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(current.stale_minutes, 25);
        let _ = fs::remove_dir_all(&dir);
    }
}
