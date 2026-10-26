use crate::events::AgentEvent;
use serde::{Deserialize, Serialize};
use std::{
    env,
    fs::{self, File},
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CodexSessionTelemetry {
    pub session_id: String,
    pub workspace: String,
    pub status: String,
    pub total_tokens: Option<u64>,
    pub context_tokens: Option<u64>,
    pub context_window: Option<u64>,
    pub context_percent: Option<f64>,
    pub usage_observed_at: Option<String>,
    pub quota_windows: Vec<crate::usage::QuotaWindow>,
    pub last_seen: String,
    pub last_event: String,
}

pub fn codex_home_dir() -> Option<PathBuf> {
    if let Ok(val) = env::var("CODEX_HOME") {
        let p = PathBuf::from(val);
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(profile) = env::var("USERPROFILE") {
        let p = PathBuf::from(profile).join(".codex");
        if p.exists() {
            return Some(p);
        }
    }
    if let Ok(home) = env::var("HOME") {
        let p = PathBuf::from(home).join(".codex");
        if p.exists() {
            return Some(p);
        }
    }
    None
}

/// Recursively discovers rollout-*.jsonl files inside ~/.codex/sessions, sorted newest first.
pub fn find_recent_rollout_files(sessions_dir: &Path, max_files: usize) -> Vec<PathBuf> {
    let mut files = Vec::new();
    collect_rollout_files(sessions_dir, &mut files);
    // Sort by last modified time descending (newest first)
    files.sort_by(|a, b| {
        let m_a = fs::metadata(a).and_then(|m| m.modified()).ok();
        let m_b = fs::metadata(b).and_then(|m| m.modified()).ok();
        m_b.cmp(&m_a)
    });
    if files.len() > max_files {
        files.truncate(max_files);
    }
    files
}

fn collect_rollout_files(dir: &Path, acc: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_rollout_files(&path, acc);
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with("rollout-") && name.ends_with(".jsonl") {
                acc.push(path);
            }
        }
    }
}

/// Parses a rollout JSONL session file strictly observing the security boundary:
/// NEVER reads auth.json, API keys, prompt transcripts, or assistant response text.
/// Extracts only: session_id, cwd, timestamp, event type, token counts, and context percentage.
pub fn parse_rollout_file(path: &Path) -> Result<(CodexSessionTelemetry, Vec<AgentEvent>), String> {
    let file = File::open(path).map_err(|e| format!("Cannot open rollout file: {}", e))?;
    let reader = BufReader::new(file);

    let mut telemetry = CodexSessionTelemetry {
        status: "unknown".to_string(),
        last_event: "Unknown".to_string(),
        ..Default::default()
    };
    let mut events = Vec::new();

    for line_res in reader.lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(_) => continue,
        };
        if line.trim().is_empty() {
            continue;
        }

        let val: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let msg_type = val.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let ts = val.get("timestamp").and_then(|v| v.as_str()).unwrap_or("");

        if msg_type == "session_meta" {
            if let Some(payload) = val.get("payload") {
                if let Some(sid) = payload
                    .get("session_id")
                    .or_else(|| payload.get("id"))
                    .and_then(|v| v.as_str())
                {
                    telemetry.session_id = sid.to_string();
                }
                if let Some(cwd) = payload.get("cwd").and_then(|v| v.as_str()) {
                    telemetry.workspace = cwd.to_string();
                }
                if let Some(cw) = payload.get("context_window").and_then(|v| v.as_u64()) {
                    telemetry.context_window = Some(cw);
                }
                if !ts.is_empty() {
                    telemetry.last_seen = ts.to_string();
                }
                telemetry.status = "working".to_string();
                telemetry.last_event = "SessionStart".to_string();

                events.push(AgentEvent {
                    schema_version: 1,
                    source: "codex".to_string(),
                    session_id: telemetry.session_id.clone(),
                    timestamp: ts.to_string(),
                    event: "SessionStart".to_string(),
                    cwd: Some(telemetry.workspace.clone()),
                    tool_name: None,
                });
            }
        } else if msg_type == "event_msg" {
            if let Some(payload) = val.get("payload") {
                let event_type = payload.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if !ts.is_empty() {
                    telemetry.last_seen = ts.to_string();
                }

                match event_type {
                    "task_started" => {
                        telemetry.status = "working".to_string();
                        telemetry.last_event = "task_started".to_string();
                        events.push(AgentEvent {
                            schema_version: 1,
                            source: "codex".to_string(),
                            session_id: telemetry.session_id.clone(),
                            timestamp: ts.to_string(),
                            event: "PreToolUse".to_string(),
                            cwd: Some(telemetry.workspace.clone()),
                            tool_name: Some("task_started".to_string()),
                        });
                    }
                    "item_completed" => {
                        let item_type = payload
                            .get("item")
                            .and_then(|i| i.get("type"))
                            .and_then(|t| t.as_str())
                            .unwrap_or("");

                        let mapped_tool = if item_type.is_empty() {
                            None
                        } else {
                            Some(item_type.to_string())
                        };

                        events.push(AgentEvent {
                            schema_version: 1,
                            source: "codex".to_string(),
                            session_id: telemetry.session_id.clone(),
                            timestamp: ts.to_string(),
                            event: "PreToolUse".to_string(),
                            cwd: Some(telemetry.workspace.clone()),
                            tool_name: mapped_tool,
                        });
                    }
                    "token_count" => {
                        if let Some(limits) = payload.get("rate_limits").filter(|v| v.is_object()) {
                            let bucket = limits.get("limit_id").and_then(|v| v.as_str()).unwrap_or("codex");
                            let mut windows = Vec::new();
                            for slot in ["primary", "secondary"] {
                                if let Some(window) = limits.get(slot) {
                                    if let Some(used) = window.get("used_percent").and_then(|v| v.as_f64())
                                        .filter(|n| n.is_finite() && (0.0..=100.0).contains(n)) {
                                        windows.push(crate::usage::QuotaWindow {
                                            label: format!("{} {}", bucket.chars().take(48).collect::<String>(), slot),
                                            used_percent: used,
                                            window_minutes: window.get("window_minutes").and_then(|v| v.as_u64()),
                                            resets_at: window.get("resets_at").and_then(|v| v.as_u64())
                                                .filter(|n| *n <= 253_402_300_799),
                                            observed_at: ts.to_owned(),
                                        });
                                    }
                                }
                            }
                            // Replace only this pool; never combine different model quotas.
                            let prefix = format!("{} ", bucket.chars().take(48).collect::<String>());
                            telemetry.quota_windows.retain(|q| !q.label.starts_with(&prefix));
                            telemetry.quota_windows.extend(windows);
                            telemetry.quota_windows.truncate(8);
                        }
                        if let Some(info) = payload.get("info").filter(|v| v.is_object()) {
                            let total_tok = info
                                .get("total_token_usage")
                                .and_then(|u| u.get("total_tokens"))
                                .and_then(|v| v.as_u64());

                            if let Some(tok) = total_tok {
                                telemetry.total_tokens = Some(tok);
                                telemetry.usage_observed_at = Some(ts.to_owned());
                            }
                            // Cumulative billing tokens are not current context occupancy.
                            telemetry.context_tokens = info
                                .get("last_token_usage")
                                .and_then(|u| u.get("total_tokens"))
                                .and_then(|v| v.as_u64());
                            telemetry.context_percent = None;

                            if let Some(cw) =
                                info.get("model_context_window").and_then(|v| v.as_u64())
                            {
                                telemetry.context_window = Some(cw);
                            }

                            if let (Some(used), Some(window)) =
                                (telemetry.context_tokens, telemetry.context_window)
                            {
                                if window > 0 {
                                    let pct =
                                        (used as f64 / window as f64 * 100.0).clamp(0.0, 100.0);
                                    telemetry.context_percent = Some(pct);
                                }
                            }
                        }
                    }
                    "task_complete" => {
                        telemetry.status = "completed".to_string();
                        telemetry.last_event = "Stop".to_string();
                        events.push(AgentEvent {
                            schema_version: 1,
                            source: "codex".to_string(),
                            session_id: telemetry.session_id.clone(),
                            timestamp: ts.to_string(),
                            event: "Stop".to_string(),
                            cwd: Some(telemetry.workspace.clone()),
                            tool_name: None,
                        });
                    }
                    _ => {}
                }
            }
        }
    }

    Ok((telemetry, events))
}

pub fn read_local_codex_sessions(
    max_sessions: usize,
) -> Result<(Vec<CodexSessionTelemetry>, Vec<AgentEvent>), String> {
    let home = match codex_home_dir() {
        Some(h) => h,
        None => return Ok((Vec::new(), Vec::new())),
    };

    let sessions_dir = home.join("sessions");
    if !sessions_dir.exists() {
        return Ok((Vec::new(), Vec::new()));
    }

    let files = find_recent_rollout_files(&sessions_dir, max_sessions);
    let mut telemetries = Vec::new();
    let mut all_events = Vec::new();

    for file in files {
        if let Ok((telemetry, mut evs)) = parse_rollout_file(&file) {
            if !telemetry.session_id.is_empty() {
                telemetries.push(telemetry);
                all_events.append(&mut evs);
            }
        }
    }

    Ok((telemetries, all_events))
}

#[tauri::command]
pub fn read_codex_telemetry(limit: Option<usize>) -> Result<Vec<CodexSessionTelemetry>, String> {
    let (telemetry, _) = read_local_codex_sessions(limit.unwrap_or(8))?;
    Ok(telemetry)
}

#[tauri::command]
pub fn read_codex_events(limit: Option<usize>) -> Result<Vec<AgentEvent>, String> {
    let (_, events) = read_local_codex_sessions(limit.unwrap_or(8))?;
    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quota_only_updates_preserve_tokens_and_keep_pools_separate() {
        let file = std::env::temp_dir().join(format!("halo-quota-test-{}.jsonl", std::process::id()));
        fs::write(&file, concat!(
            "{\"timestamp\":\"2026-10-26T12:00:00Z\",\"type\":\"session_meta\",\"payload\":{\"id\":\"s\"}}\n",
            "{\"timestamp\":\"2026-10-26T12:01:00Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"total_tokens\":800000}},\"rate_limits\":{\"limit_id\":\"codex\",\"primary\":{\"used_percent\":20,\"window_minutes\":300,\"resets_at\":1800000000}}}}\n",
            "{\"timestamp\":\"2026-10-26T12:02:00Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":null,\"rate_limits\":{\"limit_id\":\"review\",\"primary\":{\"used_percent\":40,\"window_minutes\":10080}}}}\n",
            "{\"timestamp\":\"2026-10-26T12:03:00Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"rate_limits\":{\"limit_id\":\"codex\",\"primary\":{\"used_percent\":0,\"window_minutes\":300},\"secondary\":{\"used_percent\":101}}}}"
        )).unwrap();
        let (telemetry, _) = parse_rollout_file(&file).unwrap();
        fs::remove_file(file).unwrap();
        assert_eq!(telemetry.total_tokens, Some(800000));
        assert_eq!(telemetry.usage_observed_at.as_deref(), Some("2026-10-26T12:01:00Z"));
        assert_eq!(telemetry.context_tokens, None);
        assert_eq!(telemetry.quota_windows.len(), 2);
        assert_eq!(telemetry.quota_windows.iter().find(|q| q.label == "codex primary").unwrap().used_percent, 0.0);
        assert_eq!(telemetry.quota_windows.iter().find(|q| q.label == "review primary").unwrap().used_percent, 40.0);
        let serialized = serde_json::to_string(&telemetry).unwrap();
        assert!(!serialized.contains("prompt"));
    }
    #[test]
    fn cumulative_tokens_do_not_claim_context_occupancy() {
        let file = std::env::temp_dir().join("halo-cumulative-context-test.jsonl");
        fs::write(&file, concat!(
            "{\"type\":\"session_meta\",\"payload\":{\"id\":\"session\",\"context_window\":200000}}\n",
            "{\"type\":\"event_msg\",\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"total_tokens\":900000}}}}"
        )).unwrap();
        let (telemetry, _) = parse_rollout_file(&file).unwrap();
        fs::remove_file(file).unwrap();
        assert_eq!(telemetry.total_tokens, Some(900000));
        assert_eq!(telemetry.context_tokens, None);
        assert_eq!(telemetry.context_percent, None);
    }

    #[test]
    fn test_parse_rollout_lines() {
        let lines = vec![
            r#"{"timestamp":"2026-10-25T10:00:00Z","type":"session_meta","payload":{"session_id":"test-session-123","cwd":"C:\\work\\project","context_window":200000}}"#,
            r#"{"timestamp":"2026-10-25T10:01:00Z","type":"event_msg","payload":{"type":"task_started"}}"#,
            r#"{"timestamp":"2026-10-25T10:02:00Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":500000},"last_token_usage":{"total_tokens":50000},"model_context_window":200000}}}"#,
            r#"{"timestamp":"2026-10-25T10:05:00Z","type":"event_msg","payload":{"type":"task_complete"}}"#,
        ];

        let tmp_file = std::env::temp_dir().join("test_rollout_halo.jsonl");
        fs::write(&tmp_file, lines.join("\n")).unwrap();

        let (telemetry, events) = parse_rollout_file(&tmp_file).unwrap();
        let _ = fs::remove_file(tmp_file);

        assert_eq!(telemetry.session_id, "test-session-123");
        assert_eq!(telemetry.workspace, "C:\\work\\project");
        assert_eq!(telemetry.total_tokens, Some(500000));
        assert_eq!(telemetry.context_tokens, Some(50000));
        assert_eq!(telemetry.context_window, Some(200000));
        assert_eq!(telemetry.context_percent, Some(25.0));
        assert_eq!(telemetry.status, "completed");

        assert_eq!(events.len(), 3);
        assert_eq!(events[0].event, "SessionStart");
        assert_eq!(events[1].event, "PreToolUse");
        assert_eq!(events[2].event, "Stop");
    }
}
