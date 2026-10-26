//! Read numeric cumulative usage from existing Copilot CLI session logs.
//! No commands, credential reads, new sessions, or outbound requests.
use crate::usage::{ProviderUsageReport, SessionUsage, UsageSource};
use serde_json::Value;
use std::{collections::BTreeMap, env, fs::{self, File}, io::{Read, Seek, SeekFrom}, path::{Path, PathBuf}, sync::{Mutex, OnceLock}, time::SystemTime};

const TAIL_BYTES: u64 = 256 * 1024;
const MAX_SESSIONS: usize = 16;
type CacheEntry = (u64, Option<SystemTime>, Option<ProviderUsageReport>);
static CACHE: OnceLock<Mutex<BTreeMap<PathBuf, CacheEntry>>> = OnceLock::new();

fn number(value: Option<&Value>) -> Option<f64> {
    value.and_then(Value::as_f64).filter(|n| n.is_finite() && *n >= 0.0 && *n <= 9_007_199_254_740_991.0)
}

pub fn parse_usage_lines(bytes: &[u8], session_id: &str) -> Option<ProviderUsageReport> {
    if session_id.is_empty() || session_id.len() > 128 || !session_id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_') { return None; }
    let mut latest = None;
    for line in bytes.split(|c| *c == b'\n').filter(|line| line.len() <= 65_536) {
        let Ok(event) = serde_json::from_slice::<Value>(line) else { continue; };
        let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");
        if !matches!(event_type, "session.shutdown" | "session.usage_checkpoint") { continue; }
        let Some(data) = event.get("data") else { continue; };
        let Some(timestamp) = event.get("timestamp").and_then(Value::as_str)
            .filter(|s| s.len() >= 20 && s.len() <= 40 && s.contains('T') && s.ends_with('Z')) else { continue; };
        let premium_requests = number(data.get("totalPremiumRequests"));
        // Metrics snapshots are cumulative, including across resumes. Never sum
        // different checkpoints/shutdowns or infer USD from premium requests.
        // Newer CLIs persist their authoritative model counters inside the
        // accounting snapshot, including while a session is still open.
        let accounting = data.get("accountingSnapshot").filter(|v| v.is_object()).unwrap_or(data);
        let total_tokens = accounting.get("modelMetrics").and_then(Value::as_object)
            .filter(|models| !models.is_empty()).and_then(|models| {
                models.values().try_fold(0_u64, |sum, metric| {
                    let usage = metric.get("usage")?;
                    let input = usage.get("inputTokens")?.as_u64()?;
                    let output = usage.get("outputTokens")?.as_u64()?;
                    // Cache/reasoning counters are breakdowns, not extra input/output.
                    sum.checked_add(input)?.checked_add(output).filter(|n| *n <= 9_007_199_254_740_991)
                })
            });
        if premium_requests.is_none() && total_tokens.is_none() { continue; }
        latest = Some(ProviderUsageReport {
            schema_version: 1, provider: "github-copilot".into(),
            sessions: vec![SessionUsage { session_id: session_id.into(), total_tokens, cost_usd: None,
                premium_requests, observed_at: timestamp.into() }],
            quotas: vec![], source: Some(UsageSource::SessionLog),
        });
    }
    latest
}

fn read_tail(path: &Path, session_id: &str) -> Result<Option<ProviderUsageReport>, String> {
    let mut file = File::open(path).map_err(|_| "Copilot: cannot read a session usage log")?;
    let len = file.metadata().map_err(|_| "Copilot: cannot inspect a session usage log")?.len();
    let offset = len.saturating_sub(TAIL_BYTES);
    file.seek(SeekFrom::Start(offset)).map_err(|_| "Copilot: cannot seek session log")?;
    let mut bytes = Vec::new();
    file.take(TAIL_BYTES).read_to_end(&mut bytes).map_err(|_| "Copilot: cannot read session usage")?;
    let start = if offset > 0 { bytes.iter().position(|c| *c == b'\n').map_or(bytes.len(), |n| n + 1) } else { 0 };
    Ok(parse_usage_lines(&bytes[start..], session_id))
}

pub fn read_local_usage() -> (Vec<ProviderUsageReport>, Vec<String>) {
    let root = env::var_os("COPILOT_HOME").map(PathBuf::from).or_else(|| {
        env::var_os("USERPROFILE").or_else(|| env::var_os("HOME")).map(|p| PathBuf::from(p).join(".copilot"))
    });
    let Some(root) = root else { return (vec![], vec![]); };
    let directory = root.join("session-state");
    let entries = match fs::read_dir(&directory) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return (vec![], vec![]),
        Err(_) => return (vec![], vec!["Copilot: session usage directory cannot be read".into()]),
    };
    let mut files: Vec<_> = entries.filter_map(Result::ok).take(1024)
        .filter(|entry| entry.file_type().is_ok_and(|t| t.is_dir()))
        .filter_map(|entry| {
            let path = entry.path().join("events.jsonl");
            let meta = fs::metadata(&path).ok()?;
            Some((path, entry.file_name().to_string_lossy().to_string(), meta.len(), meta.modified().ok()))
        }).collect();
    files.sort_by_key(|(_, _, _, modified)| std::cmp::Reverse(*modified));
    files.truncate(MAX_SESSIONS);
    let mut cache = match CACHE.get_or_init(|| Mutex::new(BTreeMap::new())).lock() {
        Ok(cache) => cache, Err(_) => return (vec![], vec!["Copilot: usage reader is busy".into()]),
    };
    cache.retain(|path, _| files.iter().any(|(file, _, _, _)| file == path));
    let mut reports = vec![];
    let mut errors = vec![];
    for (path, id, len, modified) in files {
        if let Some((old_len, old_modified, report)) = cache.get(&path) {
            if *old_len == len && *old_modified == modified { if let Some(report) = report { reports.push(report.clone()); } continue; }
        }
        match read_tail(&path, &id) {
            Ok(report) => { if let Some(report) = &report { reports.push(report.clone()); } cache.insert(path, (len, modified, report)); },
            Err(error) => errors.push(error),
        }
    }
    (reports, errors)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn latest_cumulative_snapshot_wins_without_invented_tokens_or_dollars() {
        let lines = br#"{"type":"session.shutdown","timestamp":"2026-10-26T12:00:00Z","data":{"totalPremiumRequests":2,"modelMetrics":{"model":{"usage":{"inputTokens":100,"outputTokens":20,"cacheReadTokens":80,"reasoningTokens":10}}}}}
{"type":"assistant.message","data":{"content":"SECRET_RESPONSE"}}
{"type":"session.shutdown","timestamp":"2026-10-26T12:01:00Z","data":{"totalPremiumRequests":3.5,"modelMetrics":{"model":{"usage":{"inputTokens":200,"outputTokens":40}}}}}"#;
        let report = parse_usage_lines(lines, "test-session").unwrap();
        assert_eq!(report.sessions[0].total_tokens, Some(240));
        assert_eq!(report.sessions[0].premium_requests, Some(3.5));
        assert!(report.sessions[0].cost_usd.is_none());
        assert!(!serde_json::to_string(&report).unwrap().contains("SECRET"));
        let checkpoint = br#"{"type":"session.usage_checkpoint","timestamp":"2026-10-26T12:02:00Z","data":{"totalPremiumRequests":0,"totalNanoAiu":1000000000}}"#;
        let report = parse_usage_lines(checkpoint, "test-session").unwrap();
        assert_eq!(report.sessions[0].premium_requests, Some(0.0));
        assert_eq!(report.sessions[0].total_tokens, None);
        assert_eq!(report.sessions[0].cost_usd, None);
        assert!(parse_usage_lines(checkpoint, "../escape").is_none());
    }

    #[test]
    fn partial_model_counts_are_unknown_and_bad_counters_are_rejected() {
        let lines = br#"{"type":"session.shutdown","timestamp":"2026-10-26T12:00:00Z","data":{"totalPremiumRequests":1,"modelMetrics":{"complete":{"usage":{"inputTokens":10,"outputTokens":20}},"missing":{"usage":{"inputTokens":5}}}}}"#;
        assert_eq!(parse_usage_lines(lines, "s").unwrap().sessions[0].total_tokens, None);
        let invalid = br#"{"type":"session.usage_checkpoint","timestamp":"2026-10-26T12:00:00Z","data":{"totalPremiumRequests":-1}}"#;
        assert!(parse_usage_lines(invalid, "s").is_none());
    }

    #[test]
    fn reads_authoritative_live_checkpoint_counters_before_shutdown() {
        let checkpoint = br#"{"type":"session.usage_checkpoint","timestamp":"2026-10-26T12:00:00Z","data":{"totalPremiumRequests":1,"modelMetrics":{},"accountingSnapshot":{"modelMetrics":{"model":{"usage":{"inputTokens":20000,"outputTokens":400}}}}}}"#;
        let report = parse_usage_lines(checkpoint, "s").unwrap();
        assert_eq!(report.sessions[0].total_tokens, Some(20400));
        assert_eq!(report.sessions[0].premium_requests, Some(1.0));
    }
}
