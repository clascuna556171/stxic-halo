//! Fixed-path, bounded, metadata-only usage exports. No credentials or network access.
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    env,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
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

fn read_antigravity_transcript_tail(path: &Path, session_id: &str) -> Option<SessionUsage> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    let start = len.saturating_sub(131_072);
    if start > 0 {
        file.seek(SeekFrom::Start(start)).ok()?;
    }
    let mut buf = Vec::new();
    file.take(131_072).read_to_end(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf);
    for line in text.lines().rev() {
        if !line.contains("input_tokens") && !line.contains("output_tokens") {
            continue;
        }
        let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let created_at = match val.get("created_at").and_then(|v| v.as_str()) {
            Some(ts) if timestamp_shape(ts) => ts.to_string(),
            _ => continue,
        };
        let input = val.get("input_tokens").and_then(|v| v.as_u64());
        let cache_read = val.get("cache_read_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
        let output = val.get("output_tokens").and_then(|v| v.as_u64());
        if input.is_none() && output.is_none() {
            continue;
        }
        let total = input.unwrap_or(0).saturating_add(cache_read).saturating_add(output.unwrap_or(0));
        return Some(SessionUsage {
            session_id: session_id.to_string(),
            total_tokens: Some(total),
            cost_usd: None,
            premium_requests: None,
            observed_at: created_at,
        });
    }
    None
}

fn append_antigravity_usage(
    cache: &mut BTreeMap<(PathBuf, String), UsageCacheEntry>,
    result: &mut UsageReadResult,
) {
    let Some(home) = env::var_os("USERPROFILE").or_else(|| env::var_os("HOME")).map(PathBuf::from) else {
        return;
    };
    let brain_dir = home.join(".gemini").join("antigravity").join("brain");
    let Ok(entries) = fs::read_dir(&brain_dir) else {
        return;
    };
    let mut candidates = Vec::new();
    for entry in entries.flatten().take(48) {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.is_empty() || name.len() > 128 {
            continue;
        }
        let transcript = entry.path().join(".system_generated").join("logs").join("transcript.jsonl");
        if let Ok(meta) = fs::metadata(&transcript) {
            if meta.is_file() {
                candidates.push((transcript, name, meta.len(), meta.modified().ok()));
            }
        }
    }
    candidates.sort_by_key(|(_, _, _, modified)| std::cmp::Reverse(*modified));
    let mut sessions = Vec::new();
    for (path, session_id, len, modified) in candidates.into_iter().take(8) {
        let key = (path.clone(), "antigravity".to_string());
        if let Some((c_len, c_mod, cached)) = cache.get(&key) {
            if *c_len == len && *c_mod == modified {
                if let Ok(Some(report)) = cached {
                    sessions.extend(report.sessions.clone());
                }
                continue;
            }
        }
        let report_opt = read_antigravity_transcript_tail(&path, &session_id).map(|session| ProviderUsageReport {
            schema_version: 1,
            provider: "antigravity".to_string(),
            sessions: vec![session],
            quotas: Vec::new(),
            source: Some(UsageSource::SessionLog),
        });
        if let Some(ref report) = report_opt {
            sessions.extend(report.sessions.clone());
        }
        if cache.len() >= 128 && !cache.contains_key(&key) {
            cache.clear();
        }
        cache.insert(key, (len, modified, Ok(report_opt)));
    }
    if !sessions.is_empty() {
        result.reports.push(ProviderUsageReport {
            schema_version: 1,
            provider: "antigravity".to_string(),
            sessions,
            quotas: Vec::new(),
            source: Some(UsageSource::SessionLog),
        });
    }
}

fn append_codex_usage<F>(enabled: bool, result: &mut UsageReadResult, read: F)
where F: FnOnce() -> Result<(Vec<crate::codex::CodexSessionTelemetry>, Vec<crate::events::AgentEvent>), String> {
    if !enabled {
        return;
    }
    let Ok((telemetries, _)) = read() else {
        return;
    };
    let mut sessions = Vec::new();
    let mut quota_map: BTreeMap<String, QuotaWindow> = BTreeMap::new();
    for t in telemetries {
        if let Some(tokens) = t.total_tokens {
            let observed = t.usage_observed_at.as_deref().unwrap_or(&t.last_seen);
            if !t.session_id.is_empty() && t.session_id.len() <= 128 && timestamp_shape(observed) {
                sessions.push(SessionUsage {
                    session_id: t.session_id.clone(),
                    total_tokens: Some(tokens),
                    cost_usd: None,
                    premium_requests: None,
                    observed_at: observed.to_string(),
                });
            }
        }
        for q in t.quota_windows {
            if !q.label.is_empty()
                && q.label.len() <= 80
                && q.used_percent.is_finite()
                && (0.0..=100.0).contains(&q.used_percent)
                && timestamp_shape(&q.observed_at)
            {
                let replace = quota_map
                    .get(&q.label)
                    .map_or(true, |prev| q.observed_at > prev.observed_at);
                if replace {
                    quota_map.insert(q.label.clone(), q);
                }
            }
        }
    }
    sessions.truncate(16);
    let quotas: Vec<QuotaWindow> = quota_map.into_values().take(8).collect();
    if !sessions.is_empty() || !quotas.is_empty() {
        result.reports.push(ProviderUsageReport {
            schema_version: 1,
            provider: "codex".to_string(),
            sessions,
            quotas,
            source: Some(UsageSource::SessionLog),
        });
    }
}

/// Reads metadata-only token consumption and rate-limit exhaustion records from a Claude Code JSONL tail.
/// Never reads or retains prompt/response text or credentials.
pub(crate) fn read_claude_session_tail(path: &Path, session_id: &str) -> Option<ProviderUsageReport> {
    if session_id.is_empty() || session_id.len() > 128 {
        return None;
    }
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    const CLAUDE_TAIL_BYTES: u64 = 262_144;
    let start = len.saturating_sub(CLAUDE_TAIL_BYTES);
    if start > 0 {
        file.seek(SeekFrom::Start(start)).ok()?;
    }
    let mut buf = Vec::new();
    file.take(CLAUDE_TAIL_BYTES).read_to_end(&mut buf).ok()?;
    let slice = if start > 0 {
        match buf.iter().position(|c| *c == b'\n') {
            Some(pos) => &buf[pos + 1..],
            None => return None,
        }
    } else {
        &buf[..]
    };
    let text = String::from_utf8_lossy(slice);
    let mut latest_session: Option<SessionUsage> = None;
    let mut quota_map: BTreeMap<String, QuotaWindow> = BTreeMap::new();

    for line in text.lines() {
        if !line.contains("\"usage\"") && !line.contains("\"quotaLimits\"") {
            continue;
        }
        let Ok(val) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let Some(ts) = val.get("timestamp").and_then(|v| v.as_str()).filter(|s| timestamp_shape(s)) else {
            continue;
        };

        if let Some(usage) = val.get("message").and_then(|m| m.get("usage")).filter(|v| v.is_object()) {
            let input = usage.get("input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let cache_create = usage.get("cache_creation_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let cache_read = usage.get("cache_read_input_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let output = usage.get("output_tokens").and_then(|v| v.as_u64()).unwrap_or(0);
            let total = input
                .saturating_add(cache_create)
                .saturating_add(cache_read)
                .saturating_add(output);
            if total > 0 && total <= 9_007_199_254_740_991 {
                latest_session = Some(SessionUsage {
                    session_id: session_id.to_string(),
                    total_tokens: Some(total),
                    cost_usd: None,
                    premium_requests: None,
                    observed_at: ts.to_string(),
                });
            }
        }

        if let Some(ql) = val.get("quotaLimits").filter(|v| v.is_object()) {
            let status = ql.get("status").and_then(|v| v.as_str()).unwrap_or("");
            if status == "rejected" {
                let limit_type = ql.get("rateLimitType").and_then(|v| v.as_str()).unwrap_or("");
                let window_info = match limit_type {
                    "five_hour" => Some(("5-hour", 300_u64)),
                    "seven_day" => Some(("1-week", 10_080_u64)),
                    _ => None,
                };
                if let Some((label, window_minutes)) = window_info {
                    let resets_at = ql
                        .get("resetsAt")
                        .and_then(|v| v.as_u64())
                        .filter(|n| *n <= 253_402_300_799);
                    quota_map.insert(
                        label.to_string(),
                        QuotaWindow {
                            label: label.to_string(),
                            used_percent: 100.0,
                            window_minutes: Some(window_minutes),
                            resets_at,
                            observed_at: ts.to_string(),
                        },
                    );
                }
            }
        }
    }

    let sessions: Vec<SessionUsage> = latest_session.into_iter().collect();
    let quotas: Vec<QuotaWindow> = quota_map.into_values().collect();
    if sessions.is_empty() && quotas.is_empty() {
        return None;
    }
    Some(ProviderUsageReport {
        schema_version: 1,
        provider: "claude-code".to_string(),
        sessions,
        quotas,
        source: Some(UsageSource::SessionLog),
    })
}

fn append_claude_session_usage(
    cache: &mut BTreeMap<(PathBuf, String), UsageCacheEntry>,
    result: &mut UsageReadResult,
) {
    let Some(home) = env::var_os("USERPROFILE").or_else(|| env::var_os("HOME")).map(PathBuf::from) else {
        return;
    };
    let projects_dir = home.join(".claude").join("projects");
    let Ok(project_entries) = fs::read_dir(&projects_dir) else {
        return;
    };
    let mut candidates = Vec::new();
    for project_entry in project_entries.flatten().take(64) {
        if !project_entry.file_type().is_ok_and(|t| t.is_dir()) {
            continue;
        }
        let Ok(files) = fs::read_dir(project_entry.path()) else {
            continue;
        };
        for file_entry in files.flatten().take(64) {
            let path = file_entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let Some(session_id) = path.file_stem().and_then(|s| s.to_str()).map(str::to_string) else {
                continue;
            };
            if session_id.is_empty() || session_id.len() > 128 {
                continue;
            }
            if let Ok(meta) = file_entry.metadata() {
                if meta.is_file() {
                    candidates.push((path, session_id, meta.len(), meta.modified().ok()));
                }
            }
        }
    }
    candidates.sort_by_key(|(_, _, _, modified)| std::cmp::Reverse(*modified));
    let mut sessions = Vec::new();
    let mut quota_map: BTreeMap<String, QuotaWindow> = BTreeMap::new();
    for (path, session_id, len, modified) in candidates.into_iter().take(8) {
        let key = (path.clone(), "claude-code".to_string());
        let report_opt = if let Some((c_len, c_mod, cached)) = cache.get(&key) {
            if *c_len == len && *c_mod == modified {
                cached.as_ref().ok().cloned().flatten()
            } else {
                let parsed = read_claude_session_tail(&path, &session_id);
                cache.insert(key, (len, modified, Ok(parsed.clone())));
                parsed
            }
        } else {
            let parsed = read_claude_session_tail(&path, &session_id);
            if cache.len() >= 128 {
                cache.clear();
            }
            cache.insert(key, (len, modified, Ok(parsed.clone())));
            parsed
        };
        if let Some(report) = report_opt {
            sessions.extend(report.sessions);
            for q in report.quotas {
                let replace = quota_map
                    .get(&q.label)
                    .map_or(true, |prev| q.observed_at > prev.observed_at);
                if replace {
                    quota_map.insert(q.label.clone(), q);
                }
            }
        }
    }
    sessions.truncate(16);
    let quotas: Vec<QuotaWindow> = quota_map.into_values().take(8).collect();
    if !sessions.is_empty() || !quotas.is_empty() {
        result.reports.push(ProviderUsageReport {
            schema_version: 1,
            provider: "claude-code".to_string(),
            sessions,
            quotas,
            source: Some(UsageSource::SessionLog),
        });
    }
}

fn collect_usage_reports(read_copilot: bool, read_codex: bool) -> Result<UsageReadResult, String> {
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
    append_codex_usage(read_codex, &mut result, || crate::codex::read_local_codex_sessions(8));
    append_copilot_usage(read_copilot, &mut result, crate::copilot_usage::read_local_usage);
    append_antigravity_usage(&mut cache, &mut result);
    append_claude_session_usage(&mut cache, &mut result);
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
    let (read_copilot, read_codex) = {
        let guard = settings.lock().map_err(|_| "Settings unavailable")?;
        (guard.enable_copilot_usage_logs, guard.enable_codex_logs)
    };
    tauri::async_runtime::spawn_blocking(move || collect_usage_reports(read_copilot, read_codex))
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

    #[test]
    fn claude_session_tail_extracts_tokens_and_active_quota_without_leaking_content() {
        let path = std::env::temp_dir().join(format!("halo-claude-tail-{}.jsonl", std::process::id()));
        fs::write(
            &path,
            concat!(
                "{\"type\":\"assistant\",\"timestamp\":\"2026-11-23T15:25:00.000Z\",\"message\":{\"content\":\"SECRET_TEXT\",\"usage\":{\"input_tokens\":2,\"cache_creation_input_tokens\":1000,\"cache_read_input_tokens\":300000,\"output_tokens\":500}}}\n",
                "{\"type\":\"assistant\",\"timestamp\":\"2026-11-23T15:27:27.129Z\",\"quotaLimits\":{\"status\":\"rejected\",\"rateLimitType\":\"seven_day\",\"resetsAt\":1795507200},\"message\":{\"usage\":{\"input_tokens\":0,\"output_tokens\":0}}}\n",
                "{\"type\":\"assistant\",\"timestamp\":\"2026-11-23T15:28:00.000Z\",\"quotaLimits\":{\"status\":\"rejected\",\"rateLimitType\":\"five_hour\",\"resetsAt\":1795490000}}\n"
            ),
        )
        .unwrap();
        let report = read_claude_session_tail(&path, "ca22cc19-test").unwrap();
        let _ = fs::remove_file(&path);
        assert!(report.valid("claude-code"));
        assert_eq!(report.sessions.len(), 1);
        assert_eq!(report.sessions[0].total_tokens, Some(301_502));
        assert_eq!(report.quotas.len(), 2);
        let five_hr = report.quotas.iter().find(|q| q.label == "5-hour").unwrap();
        assert_eq!(five_hr.used_percent, 100.0);
        assert_eq!(five_hr.window_minutes, Some(300));
        assert_eq!(five_hr.resets_at, Some(1795490000));
        let weekly = report.quotas.iter().find(|q| q.label == "1-week").unwrap();
        assert_eq!(weekly.used_percent, 100.0);
        assert_eq!(weekly.window_minutes, Some(10_080));
        assert_eq!(weekly.resets_at, Some(1795507200));
        let serialized = serde_json::to_string(&report).unwrap();
        assert!(!serialized.contains("SECRET_TEXT"));
    }

    #[test]
    fn codex_usage_appends_only_when_enabled_and_preserves_5h_and_1w_quotas() {
        let mut disabled = UsageReadResult::default();
        append_codex_usage(false, &mut disabled, || panic!("disabled codex reader must not run"));
        assert!(disabled.reports.is_empty());

        let mut enabled = UsageReadResult::default();
        append_codex_usage(true, &mut enabled, || {
            Ok((
                vec![crate::codex::CodexSessionTelemetry {
                    session_id: "codex-s1".into(),
                    workspace: "C:\\work".into(),
                    status: "completed".into(),
                    total_tokens: Some(3_641_074),
                    usage_observed_at: Some("2026-11-12T13:14:00Z".into()),
                    quota_windows: vec![
                        QuotaWindow {
                            label: "5-hour".into(),
                            used_percent: 99.0,
                            window_minutes: Some(300),
                            resets_at: Some(1794501310),
                            observed_at: "2026-11-12T13:14:00Z".into(),
                        },
                        QuotaWindow {
                            label: "1-week".into(),
                            used_percent: 31.0,
                            window_minutes: Some(10_080),
                            resets_at: Some(1795069959),
                            observed_at: "2026-11-12T13:14:00Z".into(),
                        },
                    ],
                    last_seen: "2026-11-12T13:14:00Z".into(),
                    last_event: "Stop".into(),
                    ..Default::default()
                }],
                vec![],
            ))
        });
        assert_eq!(enabled.reports.len(), 1);
        let report = &enabled.reports[0];
        assert!(report.valid("codex"));
        assert_eq!(report.sessions[0].total_tokens, Some(3_641_074));
        assert_eq!(report.quotas.len(), 2);
        assert!(report.quotas.iter().any(|q| q.label == "5-hour" && q.window_minutes == Some(300)));
        assert!(report.quotas.iter().any(|q| q.label == "1-week" && q.window_minutes == Some(10_080)));
    }
}
