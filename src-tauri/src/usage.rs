//! Fixed-path, bounded, metadata-only usage exports. No credentials or network access.
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::SystemTime,
};
use tauri::State;
use crate::config::UserSettings;

pub const PROVIDERS: [&str; 5] = ["claude-code", "codex", "antigravity", "github-copilot", "opencode"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaWindow {
    pub label: String,
    pub used_percent: f64,
    pub window_minutes: Option<u64>,
    pub resets_at: Option<u64>,
    pub observed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionUsage {
    pub session_id: String,
    pub total_tokens: Option<u64>,
    pub cost_usd: Option<f64>,
    pub premium_requests: Option<f64>,
    pub observed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderUsageReport {
    pub schema_version: u32,
    pub provider: String,
    #[serde(default)]
    pub sessions: Vec<SessionUsage>,
    #[serde(default)]
    pub quotas: Vec<QuotaWindow>,
    pub source: Option<UsageSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UsageSource { SessionLog, LocalExport, Plugin, Statusline }

fn timestamp_shape(value: &str) -> bool {
    value.len() >= 20 && value.len() <= 40 && value.contains('T') && value.ends_with('Z')
}

impl ProviderUsageReport {
    fn valid(&self, provider: &str) -> bool {
        self.schema_version == 1 && self.provider == provider && PROVIDERS.contains(&provider)
            && self.sessions.len() <= 16 && self.quotas.len() <= 8
            && self.sessions.iter().all(|s| !s.session_id.is_empty() && s.session_id.len() <= 128
                && timestamp_shape(&s.observed_at)
                && s.total_tokens.map_or(true, |n| n <= 9_007_199_254_740_991)
                && s.cost_usd.map_or(true, |n| n.is_finite() && n >= 0.0))
            && self.sessions.iter().all(|s| s.premium_requests.map_or(true, |n| n.is_finite() && n >= 0.0 && n <= 9_007_199_254_740_991.0))
            && self.quotas.iter().all(|q| !q.label.is_empty() && q.label.len() <= 80
                && q.used_percent.is_finite() && (0.0..=100.0).contains(&q.used_percent)
                && q.resets_at.map_or(true, |n| n <= 253_402_300_799)
                && timestamp_shape(&q.observed_at))
    }
}

type UsageCacheEntry = (u64, Option<SystemTime>, Result<Option<ProviderUsageReport>, String>);
static USAGE_CACHE: OnceLock<Mutex<BTreeMap<(PathBuf, String), UsageCacheEntry>>> = OnceLock::new();

pub fn read_report(path: &Path, provider: &str) -> Result<Option<ProviderUsageReport>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(format!("{provider}: cannot read usage export")),
    };
    let mut bytes = Vec::new();
    file.take(65_537).read_to_end(&mut bytes).map_err(|_| format!("{provider}: cannot read usage export"))?;
    if bytes.len() > 65_536 { return Err(format!("{provider}: usage export exceeds 64 KiB")); }
    let mut report: ProviderUsageReport = serde_json::from_slice(&bytes)
        .map_err(|_| format!("{provider}: invalid usage export JSON"))?;
    if !report.valid(provider) { return Err(format!("{provider}: invalid usage export values")); }
    report.source = Some(UsageSource::LocalExport);
    Ok(Some(report))
}

fn read_report_cached(
    cache: &mut BTreeMap<(PathBuf, String), UsageCacheEntry>,
    path: &Path,
    provider: &str,
) -> Result<Option<ProviderUsageReport>, String> {
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            cache.remove(&(path.to_path_buf(), provider.to_string()));
            return Ok(None);
        }
        Err(_) => return Err(format!("{provider}: cannot read usage export")),
    };
    let len = meta.len();
    let modified = meta.modified().ok();
    let key = (path.to_path_buf(), provider.to_string());
    if let Some((old_len, old_modified, cached)) = cache.get(&key) {
        if *old_len == len && *old_modified == modified && modified.is_some() {
            return cached.clone();
        }
    }
    let result = read_report(path, provider);
    if cache.len() >= 128 && !cache.contains_key(&key) {
        cache.clear();
    }
    cache.insert(key, (len, modified, result.clone()));
    result
}

fn collect_recent_json_reports(
    dir: &Path,
    provider: &str,
    source: UsageSource,
    inspect_limit: usize,
    read_limit: usize,
    cache: &mut BTreeMap<(PathBuf, String), UsageCacheEntry>,
    result: &mut UsageReadResult,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(PathBuf, Option<SystemTime>)> = entries
        .filter_map(Result::ok)
        .take(inspect_limit)
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                let modified = entry.metadata().and_then(|m| m.modified()).ok();
                Some((path, modified))
            } else {
                None
            }
        })
        .collect();
    files.sort_by_key(|(_, modified)| std::cmp::Reverse(*modified));
    for (path, _) in files.into_iter().take(read_limit) {
        match read_report_cached(cache, &path, provider) {
            Ok(Some(mut report)) => {
                report.source = Some(source.clone());
                result.reports.push(report);
            }
            Ok(None) => {}
            Err(error) => result.errors.push(error),
        }
    }
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct UsageReadResult {
    pub reports: Vec<ProviderUsageReport>,
    pub errors: Vec<String>,
}

fn append_copilot_usage<F>(enabled: bool, result: &mut UsageReadResult, read: F)
where F: FnOnce() -> (Vec<ProviderUsageReport>, Vec<String>) {
    if enabled {
        let (reports, errors) = read();
        result.reports.extend(reports);
        result.errors.extend(errors);
    }
}

fn collect_usage_reports(read_copilot: bool) -> Result<UsageReadResult, String> {
    let root = crate::paths::app_data_dir()?.join("usage");
    let mut result = UsageReadResult::default();
    let mut cache = USAGE_CACHE
        .get_or_init(|| Mutex::new(BTreeMap::new()))
        .lock()
        .map_err(|_| "Usage cache lock poisoned".to_string())?;
    for provider in PROVIDERS {
        match read_report_cached(&mut cache, &root.join(format!("{provider}.json")), provider) {
            Ok(Some(report)) => result.reports.push(report),
            Ok(None) => {},
            Err(error) => result.errors.push(error),
        }
    }
    append_copilot_usage(read_copilot, &mut result, crate::copilot_usage::read_local_usage);
    // One snapshot per OpenCode session prevents independent hosts overwriting
    // one another. Inspect at most 32 entries and read the newest 16 bounded files.
    collect_recent_json_reports(
        &root.join("opencode-sessions"),
        "opencode",
        UsageSource::Plugin,
        32,
        16,
        &mut cache,
        &mut result,
    );
    collect_recent_json_reports(
        &root.join("claude-statusline"),
        "claude-code",
        UsageSource::Statusline,
        64,
        16,
        &mut cache,
        &mut result,
    );
    Ok(result)
}

#[tauri::command]
pub async fn read_usage_reports(settings: State<'_, Mutex<UserSettings>>) -> Result<UsageReadResult, String> {
    let read_copilot = settings.lock().map_err(|_| "Settings unavailable")?.enable_copilot_usage_logs;
    tauri::async_runtime::spawn_blocking(move || collect_usage_reports(read_copilot))
        .await
        .map_err(|e| format!("Usage reader worker failed: {e}"))?
}

/// Only prepares Halo's script. The user chooses whether and how to configure Claude Code.
#[tauri::command]
pub fn prepare_claude_statusline() -> Result<String, String> {
    let root = crate::paths::ensure_app_data_dir()?.join("integrations");
    std::fs::create_dir_all(&root).map_err(|_| "Cannot create integrations directory")?;
    let script = root.join("claude-statusline.ps1");
    std::fs::write(&script, include_str!("../../scripts/claude-statusline.ps1"))
        .map_err(|_| "Cannot write Halo status-line script")?;
    Ok(format!("powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"{}\"", script.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copilot_reader_runs_only_when_enabled() {
        let mut result = UsageReadResult::default();
        append_copilot_usage(false, &mut result, || panic!("disabled reader must not run"));
        append_copilot_usage(true, &mut result, || (vec![], vec!["reader ran".into()]));
        assert_eq!(result.errors, vec!["reader ran"]);
    }

    #[test]
    fn validates_source_and_rejects_misleading_metrics() {
        let mut report: ProviderUsageReport = serde_json::from_str(r#"{
            "schema_version":1,"provider":"opencode","sessions":[
            {"session_id":"s","total_tokens":0,"cost_usd":0,"observed_at":"2026-10-26T12:00:00Z"}],
            "quotas":[{"label":"weekly","used_percent":0,"observed_at":"2026-10-26T12:00:00Z"}]
        }"#).unwrap();
        assert!(report.valid("opencode"));
        assert!(!report.valid("codex"));
        report.quotas[0].used_percent = 101.0;
        assert!(!report.valid("opencode"));
        report.quotas.clear();
        report.sessions[0].cost_usd = Some(-1.0);
        assert!(!report.valid("opencode"));
    }

    #[test]
    fn report_cache_reuses_unchanged_and_clears_on_delete() {
        let path = std::env::temp_dir().join(format!("halo-usage-cache-{}.json", std::process::id()));
        fs::write(&path, r#"{"schema_version":1,"provider":"opencode","sessions":[{"session_id":"s1","total_tokens":100,"observed_at":"2026-10-26T12:00:00Z"}],"quotas":[]}"#).unwrap();
        let mut cache = BTreeMap::new();
        let r1 = read_report_cached(&mut cache, &path, "opencode").unwrap().unwrap();
        assert_eq!(r1.sessions[0].total_tokens, Some(100));
        assert_eq!(cache.len(), 1);
        let r2 = read_report_cached(&mut cache, &path, "opencode").unwrap().unwrap();
        assert_eq!(r2.sessions[0].total_tokens, Some(100));
        fs::write(&path, r#"{"schema_version":1,"provider":"opencode","sessions":[{"session_id":"s1","total_tokens":2500,"observed_at":"2026-10-26T12:01:00Z"}],"quotas":[]}"#).unwrap();
        let r3 = read_report_cached(&mut cache, &path, "opencode").unwrap().unwrap();
        assert_eq!(r3.sessions[0].total_tokens, Some(2500));
        fs::remove_file(&path).unwrap();
        assert!(read_report_cached(&mut cache, &path, "opencode").unwrap().is_none());
        assert!(cache.is_empty());
    }
}
