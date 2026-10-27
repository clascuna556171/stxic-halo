//! Fixed-path, bounded, metadata-only usage exports. No credentials or network access.
use serde::{Deserialize, Serialize};
use std::{fs::File, io::Read, path::Path, sync::Mutex};
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

#[tauri::command]
pub fn read_usage_reports(settings: State<'_, Mutex<UserSettings>>) -> Result<UsageReadResult, String> {
    let read_copilot = settings.lock().map_err(|_| "Settings unavailable")?.enable_copilot_usage_logs;
    let root = crate::paths::app_data_dir()?.join("usage");
    let mut result = UsageReadResult::default();
    for provider in PROVIDERS {
        match read_report(&root.join(format!("{provider}.json")), provider) {
            Ok(Some(report)) => result.reports.push(report),
            Ok(None) => {},
            Err(error) => result.errors.push(error),
        }
    }
    append_copilot_usage(read_copilot, &mut result, crate::copilot_usage::read_local_usage);
    // One snapshot per OpenCode session prevents independent hosts overwriting
    // one another. Inspect at most 32 entries and read the newest 16 bounded files.
    let mut files: Vec<_> = std::fs::read_dir(root.join("opencode-sessions")).into_iter().flatten()
        .filter_map(Result::ok).take(32)
        .filter(|entry| entry.path().extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    files.sort_by_key(|entry| std::cmp::Reverse(entry.metadata().and_then(|m| m.modified()).ok()));
    for entry in files.into_iter().take(16) {
        match read_report(&entry.path(), "opencode") {
            Ok(Some(mut report)) => { report.source = Some(UsageSource::Plugin); result.reports.push(report); },
            Ok(None) => {},
            Err(error) => result.errors.push(error),
        }
    }
    Ok(result)
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
}
