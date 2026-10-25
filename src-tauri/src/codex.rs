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
    pub context_window: Option<u64>,
    pub context_percent: Option<f64>,
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
                        if let Some(info) = payload.get("info") {
                            let total_tok = info
                                .get("total_token_usage")
                                .and_then(|u| u.get("total_tokens"))
                                .or_else(|| {
                                    info.get("last_token_usage")
                                        .and_then(|u| u.get("total_tokens"))
                                })
                                .and_then(|v| v.as_u64());

                            if let Some(tok) = total_tok {
                                telemetry.total_tokens = Some(tok);
                            }

                            if let Some(cw) = info.get("model_context_window").and_then(|v| v.as_u64()) {
                                telemetry.context_window = Some(cw);
                            }

                            if let (Some(used), Some(window)) =
                                (telemetry.total_tokens, telemetry.context_window)
                            {
                                if window > 0 {
                                    let pct = (used as f64 / window as f64 * 100.0).clamp(0.0, 100.0);
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
pub fn read_codex_telemetry(
    limit: Option<usize>,
) -> Result<Vec<CodexSessionTelemetry>, String> {
    let (telemetry, _) = read_local_codex_sessions(limit.unwrap_or(8))?;
    Ok(telemetry)
}

#[tauri::command]
pub fn read_codex_events(
    limit: Option<usize>,
) -> Result<Vec<AgentEvent>, String> {
    let (_, events) = read_local_codex_sessions(limit.unwrap_or(8))?;
    Ok(events)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_rollout_lines() {
        let lines = vec![
            r#"{"timestamp":"2026-10-25T10:00:00Z","type":"session_meta","payload":{"session_id":"test-session-123","cwd":"C:\\work\\project","context_window":200000}}"#,
            r#"{"timestamp":"2026-10-25T10:01:00Z","type":"event_msg","payload":{"type":"task_started"}}"#,
            r#"{"timestamp":"2026-10-25T10:02:00Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"total_tokens":50000},"model_context_window":200000}}}"#,
            r#"{"timestamp":"2026-10-25T10:05:00Z","type":"event_msg","payload":{"type":"task_complete"}}"#,
        ];

        let tmp_file = std::env::temp_dir().join("test_rollout_halo.jsonl");
        fs::write(&tmp_file, lines.join("\n")).unwrap();

        let (telemetry, events) = parse_rollout_file(&tmp_file).unwrap();
        let _ = fs::remove_file(tmp_file);

        assert_eq!(telemetry.session_id, "test-session-123");
        assert_eq!(telemetry.workspace, "C:\\work\\project");
        assert_eq!(telemetry.total_tokens, Some(50000));
        assert_eq!(telemetry.context_window, Some(200000));
        assert_eq!(telemetry.context_percent, Some(25.0));
        assert_eq!(telemetry.status, "completed");

        assert_eq!(events.len(), 3);
        assert_eq!(events[0].event, "SessionStart");
        assert_eq!(events[1].event, "PreToolUse");
        assert_eq!(events[2].event, "Stop");
    }
}
