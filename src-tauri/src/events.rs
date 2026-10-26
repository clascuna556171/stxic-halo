use crate::paths::{ensure_app_data_dir, event_log_backup_path, event_log_path};
use crate::perf::PerfRegistry;
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    fs::{self, File},
    io::{BufRead, BufReader, Seek, SeekFrom},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Runtime};

pub const TAIL_BYTES: u64 = 256 * 1024;
pub const MAX_LOG_FILE_BYTES: u64 = 2 * 1024 * 1024; // Auto-rotate at 2 MiB
pub const MAX_LINE_BYTES: usize = 2048;
pub const MAX_BOUNDED_EVENTS: usize = 250;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentEvent {
    pub schema_version: u32,
    pub source: String,
    pub session_id: String,
    pub timestamp: String,
    pub event: String,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub tool_name: Option<String>,
}

impl AgentEvent {
    pub fn is_valid(&self) -> bool {
        let valid_source = matches!(self.source.as_str(), "claude-code" | "codex" | "antigravity" | "github-copilot" | "opencode");
        let valid_cwd = self.cwd.as_ref().map_or(true, |c| c.len() <= 512);
        let valid_tool = self.tool_name.as_ref().map_or(true, |t| t.len() <= 48);

        self.schema_version == 1
            && valid_source
            && !self.session_id.is_empty()
            && self.session_id.len() <= 128
            && !self.timestamp.is_empty()
            && self.timestamp.len() <= 64
            && !self.event.is_empty()
            && self.event.len() <= 64
            && valid_cwd
            && valid_tool
    }
}

/// Rotates an event log file to its backup path reliably across platforms.
/// On Windows, `fs::rename` fails if the destination file already exists; this helper
/// removes any existing backup first, and provides a copy-and-truncate fallback so
/// the oversized source file is guaranteed to be rotated or cleared.
pub fn rotate_log_file(path: &Path, backup: &Path) -> std::io::Result<()> {
    if backup.exists() {
        let _ = fs::remove_file(backup);
    }
    if fs::rename(path, backup).is_err() {
        if fs::copy(path, backup).is_ok() {
            let _ = fs::write(path, b"");
        } else {
            let _ = fs::write(path, b"");
        }
    }
    Ok(())
}

/// In-memory bounded queue ensuring strict memory caps with FIFO eviction.
#[derive(Debug, Clone)]
pub struct BoundedEventQueue {
    max_size: usize,
    queue: VecDeque<AgentEvent>,
}

impl BoundedEventQueue {
    pub fn new(max_size: usize) -> Self {
        Self {
            max_size: max_size.clamp(1, 2000),
            queue: VecDeque::with_capacity(max_size),
        }
    }

    pub fn push(&mut self, event: AgentEvent) {
        if self.queue.len() >= self.max_size {
            self.queue.pop_front();
        }
        self.queue.push_back(event);
    }

    pub fn extend<I: IntoIterator<Item = AgentEvent>>(&mut self, events: I) {
        for event in events {
            self.push(event);
        }
    }

    pub fn to_vec(&self) -> Vec<AgentEvent> {
        self.queue.iter().cloned().collect()
    }

    pub fn len(&self) -> usize {
        self.queue.len()
    }

    pub fn is_empty(&self) -> bool {
        self.queue.is_empty()
    }

    pub fn clear(&mut self) {
        self.queue.clear();
    }
}

impl Default for BoundedEventQueue {
    fn default() -> Self {
        Self::new(MAX_BOUNDED_EVENTS)
    }
}

/// Stateful event log reader with:
/// 1. Metadata-based zero-read caching (`len` + `modified_ms`)
/// 2. Bounded in-memory event queue (250 events max)
/// 3. Auto-rotation when file exceeds 2 MiB
/// 4. Truncation detection and recovery
pub struct EventLogReader {
    last_len: u64,
    last_modified_ms: u128,
    event_queue: BoundedEventQueue,
    last_error: Option<String>,
}

/// Live health of the local hook event log, for the integration status panel.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EventLogStatus {
    pub path: String,
    pub exists: bool,
    pub size_bytes: u64,
    pub modified_ms: Option<u64>,
    pub buffered_events: usize,
    pub last_error: Option<String>,
}

impl Default for EventLogReader {
    fn default() -> Self {
        Self {
            last_len: 0,
            last_modified_ms: 0,
            event_queue: BoundedEventQueue::new(MAX_BOUNDED_EVENTS),
            last_error: None,
        }
    }
}

impl EventLogReader {
    pub fn new() -> Self {
        Self::default()
    }

    /// Checks the event log file for updates. Returns (has_new_events, current_events).
    pub fn check_for_updates(&mut self) -> Result<(bool, Vec<AgentEvent>), String> {
        let path = event_log_path()?;
        if !path.exists() {
            if self.last_len > 0 {
                // File was deleted or moved
                self.last_len = 0;
                self.last_modified_ms = 0;
                self.event_queue.clear();
                return Ok((true, Vec::new()));
            }
            return Ok((false, Vec::new()));
        }

        let metadata =
            fs::metadata(&path).map_err(|_| "Cannot inspect Halo event file".to_string())?;
        let len = metadata.len();

        // 1. Truncation detection: if file size shrank, reset and reload
        if len < self.last_len {
            self.last_len = 0;
            self.last_modified_ms = 0;
            self.event_queue.clear();
        }

        // 2. Automatic log rotation at 2 MiB to bound disk usage
        if len > MAX_LOG_FILE_BYTES {
            if let Ok(backup) = event_log_backup_path() {
                let _ = rotate_log_file(&path, &backup);
            } else {
                let _ = fs::write(&path, b"");
            }
            self.last_len = 0;
            self.last_modified_ms = 0;
            self.event_queue.clear();
            return Ok((true, Vec::new()));
        }

        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis())
            .unwrap_or(0);

        // Fast path: unchanged file requires 0 reads and 0 JSON parsing
        if len == self.last_len && modified_ms == self.last_modified_ms && modified_ms > 0 {
            return Ok((false, self.event_queue.to_vec()));
        }

        let mut file = File::open(&path).map_err(|_| "Cannot read Halo event file".to_string())?;
        let start = len.saturating_sub(TAIL_BYTES);
        file.seek(SeekFrom::Start(start))
            .map_err(|_| "Cannot seek in Halo event file".to_string())?;

        let mut reader = BufReader::new(file);
        if start > 0 {
            // Discard a potentially partial line at the start of the tail window
            let mut partial = String::new();
            let _ = reader.read_line(&mut partial);
        }

        let mut new_events = Vec::new();
        for line in reader.lines().flatten() {
            if line.is_empty() || line.len() > MAX_LINE_BYTES {
                continue;
            }
            if let Ok(event) = serde_json::from_str::<AgentEvent>(&line) {
                if event.is_valid() {
                    new_events.push(event);
                }
            }
        }

        self.last_len = len;
        self.last_modified_ms = modified_ms;
        self.event_queue.clear();
        self.event_queue.extend(new_events);

        Ok((true, self.event_queue.to_vec()))
    }

    pub fn read_recent(&mut self) -> Result<Vec<AgentEvent>, String> {
        let (_, events) = self.poll()?;
        Ok(events)
    }

    /// `check_for_updates` that remembers the most recent failure for the health panel.
    pub fn poll(&mut self) -> Result<(bool, Vec<AgentEvent>), String> {
        let result = self.check_for_updates();
        self.last_error = result.as_ref().err().cloned();
        result
    }

    pub fn status(&self) -> EventLogStatus {
        let path = event_log_path().ok();
        let metadata = path.as_ref().and_then(|p| fs::metadata(p).ok());
        EventLogStatus {
            path: path.map(|p| p.display().to_string()).unwrap_or_default(),
            exists: metadata.is_some(),
            size_bytes: metadata.as_ref().map(|m| m.len()).unwrap_or(0),
            modified_ms: metadata
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64),
            buffered_events: self.event_queue.len(),
            last_error: self.last_error.clone(),
        }
    }

    pub fn clear(&mut self) -> Result<(), String> {
        let _ = ensure_app_data_dir()?;
        let path = event_log_path()?;
        if path.exists() {
            File::create(&path).map_err(|_| "Cannot clear Halo event log".to_string())?;
        }
        self.last_len = 0;
        self.last_modified_ms = 0;
        self.event_queue.clear();
        Ok(())
    }
}

/// Active background file watcher that monitors events.jsonl
/// and emits `halo://events-updated` via Tauri window events whenever modifications occur.
pub struct EventLogWatcher {
    running: Arc<AtomicBool>,
}

impl EventLogWatcher {
    pub fn start<R: Runtime>(
        app: AppHandle<R>,
        reader: Arc<Mutex<EventLogReader>>,
        perf: Arc<PerfRegistry>,
        poll_interval: Duration,
    ) -> Self {
        let running = Arc::new(AtomicBool::new(true));
        let running_clone = running.clone();

        thread::spawn(move || {
            while running_clone.load(Ordering::Relaxed) {
                thread::sleep(poll_interval);
                if let Ok(mut guard) = reader.lock() {
                    let result = perf.time("event_watcher_check", || guard.poll());
                    if let Ok((has_new, events)) = result {
                        if has_new {
                            let _ = app.emit("halo://events-updated", &events);
                        }
                    }
                }
            }
        });

        Self { running }
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_event(id: &str) -> AgentEvent {
        AgentEvent {
            schema_version: 1,
            source: "claude-code".to_string(),
            session_id: id.to_string(),
            timestamp: "2026-10-25T12:00:00Z".to_string(),
            event: "SessionStart".to_string(),
            cwd: Some("C:\\work".to_string()),
            tool_name: None,
        }
    }

    #[test]
    fn test_bounded_event_queue_fifo_eviction() {
        let mut queue = BoundedEventQueue::new(3);
        queue.push(make_test_event("e1"));
        queue.push(make_test_event("e2"));
        queue.push(make_test_event("e3"));
        assert_eq!(queue.len(), 3);

        // 4th event pushes out e1 (FIFO)
        queue.push(make_test_event("e4"));
        assert_eq!(queue.len(), 3);

        let items = queue.to_vec();
        assert_eq!(items[0].session_id, "e2");
        assert_eq!(items[1].session_id, "e3");
        assert_eq!(items[2].session_id, "e4");
    }

    #[test]
    fn test_agent_event_validation_guardrails() {
        let valid = make_test_event("valid-1");
        assert!(valid.is_valid());

        // Invalid source
        let bad_source = AgentEvent {
            source: "unauthorized-hacker".to_string(),
            ..valid.clone()
        };
        assert!(!bad_source.is_valid());

        // Invalid schema version
        let bad_schema = AgentEvent {
            schema_version: 99,
            ..valid.clone()
        };
        assert!(!bad_schema.is_valid());

        // Empty session ID
        let empty_session = AgentEvent {
            session_id: "".to_string(),
            ..valid.clone()
        };
        assert!(!empty_session.is_valid());
    }

    #[test]
    fn test_log_rotation_when_backup_file_already_exists() {
        let temp_dir = std::env::temp_dir().join(format!(
            "halo_test_rot_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();

        let source = temp_dir.join("events.jsonl");
        let backup = temp_dir.join("events.jsonl.bak");

        // Pre-create backup with old data to simulate Windows destination collision
        fs::write(&backup, b"old stale backup content\n").unwrap();
        assert!(backup.exists());

        // Create oversized source file (> 2 MiB)
        let payload = vec![b'A'; (MAX_LOG_FILE_BYTES + 8192) as usize];
        fs::write(&source, &payload).unwrap();

        let initial_source_len = fs::metadata(&source).unwrap().len();
        assert!(initial_source_len > MAX_LOG_FILE_BYTES);

        // Execute rotation helper
        rotate_log_file(&source, &backup).expect("rotation should succeed despite existing backup");

        // Verification 1: backup exists and matches new oversized source content
        assert!(backup.exists());
        let backup_len = fs::metadata(&backup).unwrap().len();
        assert_eq!(backup_len, initial_source_len);

        // Verification 2: source is either deleted (via rename) or truncated to 0 bytes
        let remaining_len = if source.exists() {
            fs::metadata(&source).unwrap().len()
        } else {
            0
        };
        assert_eq!(remaining_len, 0);

        // Clean up
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
