use serde::Serialize;
use std::{
    collections::HashMap,
    ffi::OsStr,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use sysinfo::{
    CpuRefreshKind, MemoryRefreshKind, Pid, ProcessRefreshKind, ProcessesToUpdate, RefreshKind,
    System, UpdateKind,
};

/// Minimum interval between expensive Windows process table enumerations.
const PROCESS_COUNT_INTERVAL_SECS: u64 = 10;

#[derive(Debug, Clone, Serialize)]
pub struct Metrics {
    pub cpu_percent: f32,
    pub memory_used_bytes: u64,
    pub memory_total_bytes: u64,
    pub process_count: usize,
    pub sampled_at: u64,
    pub sample_duration_ms: u32,
}

/// A running AI-agent provider process. Only the provider kind, PID and working directory
/// leave this module — command lines (which can contain prompts) are used for classification
/// in memory and are never serialized.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProviderProcess {
    pub provider: String,
    pub pid: u32,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct ProcessLifecycleSnapshot {
    pub available: bool,
    /// Unix epoch milliseconds of the process table enumeration backing this snapshot.
    pub refreshed_at: u64,
    pub processes: Vec<ProviderProcess>,
    pub claude_processes: usize,
    pub codex_processes: usize,
}

/// Halo's own resource footprint, for performance instrumentation.
#[derive(Debug, Clone, Serialize, Default)]
pub struct SelfFootprint {
    pub available: bool,
    pub pid: u32,
    /// CPU share normalized to the whole machine (0-100).
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub virtual_memory_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Candidate {
    Claude,
    Codex,
    /// Script runtime that might host a provider CLI; needs the command line to classify.
    Runtime,
}

fn candidate_for_name(name: &OsStr) -> Option<Candidate> {
    let lower = name.to_string_lossy().to_lowercase();
    let stem = lower.strip_suffix(".exe").unwrap_or(&lower);
    match stem {
        "claude" => Some(Candidate::Claude),
        "node" | "bun" => Some(Candidate::Runtime),
        s if s == "codex" || s.starts_with("codex-") => Some(Candidate::Codex),
        _ => None,
    }
}

/// Classifies a script-runtime command line into a provider id without retaining it.
pub fn classify_runtime_cmd<S: AsRef<OsStr>>(cmd: &[S]) -> Option<&'static str> {
    let joined = cmd
        .iter()
        .map(|part| part.as_ref().to_string_lossy().to_lowercase().replace('/', "\\"))
        .collect::<Vec<_>>()
        .join(" ");
    if joined.contains("@anthropic-ai\\claude-code") || joined.contains("\\claude-code\\cli") {
        Some("claude-code")
    } else if joined.contains("@openai\\codex") || joined.contains("\\codex\\bin\\codex") {
        Some("codex")
    } else {
        None
    }
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

/// Lightweight host telemetry collector tuned for minimal background CPU and handle overhead.
/// - Initializes only CPU and memory refresh kinds on startup (avoids scanning disks/networks/users).
/// - Samples CPU and RAM on every poll, but throttles Windows process count enumeration to once
///   every 10 seconds with `ProcessRefreshKind::nothing()` (avoiding per-process command-line/memory queries).
/// - Provider process classification only reads command line / cwd for the handful of
///   `claude`, `codex`, `node` and `bun` processes, once per process lifetime.
pub struct TelemetryCollector {
    system: System,
    last_process_refresh: Option<Instant>,
    last_process_refresh_ms: u64,
    cached_process_count: usize,
    /// (pid, start_time) -> provider id (None = runtime process that is not a provider).
    provider_cache: HashMap<(u32, u64), Option<&'static str>>,
    self_pid: Option<Pid>,
}

impl TelemetryCollector {
    pub fn new() -> Self {
        let specifics = RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything());
        let mut system = System::new_with_specifics(specifics);
        // Prime initial CPU delta baseline so the first UI sample has a meaningful reading.
        system.refresh_cpu_usage();
        system.refresh_memory();

        Self {
            system,
            last_process_refresh: None,
            last_process_refresh_ms: 0,
            cached_process_count: 0,
            provider_cache: HashMap::new(),
            self_pid: sysinfo::get_current_pid().ok(),
        }
    }

    fn refresh_process_table_if_due(&mut self) {
        let due = match self.last_process_refresh {
            None => true,
            Some(prev) => prev.elapsed().as_secs() >= PROCESS_COUNT_INTERVAL_SECS,
        };
        if !due {
            return;
        }
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::nothing(),
        );
        self.cached_process_count = self.system.processes().len();
        self.last_process_refresh = Some(Instant::now());
        self.last_process_refresh_ms = epoch_ms();
    }

    pub fn sample(&mut self) -> Metrics {
        let started = Instant::now();

        self.system.refresh_cpu_usage();
        self.system.refresh_memory();
        self.refresh_process_table_if_due();

        let cpu_raw = self.system.global_cpu_usage();
        let cpu_percent = if cpu_raw.is_finite() {
            cpu_raw.clamp(0.0, 100.0)
        } else {
            0.0
        };

        Metrics {
            cpu_percent,
            memory_used_bytes: self.system.used_memory(),
            memory_total_bytes: self.system.total_memory(),
            process_count: self.cached_process_count,
            sampled_at: epoch_ms(),
            sample_duration_ms: started.elapsed().as_millis() as u32,
        }
    }

    /// Returns running provider processes from the (at most 10s old) process table.
    pub fn provider_processes(&mut self) -> ProcessLifecycleSnapshot {
        self.refresh_process_table_if_due();

        let candidates: Vec<(Pid, u64, Candidate)> = self
            .system
            .processes()
            .iter()
            .filter_map(|(pid, p)| {
                candidate_for_name(p.name()).map(|c| (*pid, p.start_time(), c))
            })
            .collect();

        // Read command line + cwd once per new candidate process (UpdateKind::OnlyIfNotSet).
        let unseen: Vec<Pid> = candidates
            .iter()
            .filter(|(pid, start, _)| !self.provider_cache.contains_key(&(pid.as_u32(), *start)))
            .map(|(pid, _, _)| *pid)
            .collect();
        if !unseen.is_empty() {
            self.system.refresh_processes_specifics(
                ProcessesToUpdate::Some(&unseen),
                false,
                ProcessRefreshKind::nothing()
                    .with_cmd(UpdateKind::OnlyIfNotSet)
                    .with_cwd(UpdateKind::OnlyIfNotSet),
            );
        }

        let mut live_keys = Vec::with_capacity(candidates.len());
        let mut processes = Vec::new();
        for (pid, start, candidate) in candidates {
            let key = (pid.as_u32(), start);
            live_keys.push(key);
            let Some(process) = self.system.process(pid) else { continue };
            let provider = *self.provider_cache.entry(key).or_insert_with(|| match candidate {
                Candidate::Claude => Some("claude-code"),
                Candidate::Codex => Some("codex"),
                Candidate::Runtime => classify_runtime_cmd(process.cmd()),
            });
            if let Some(provider) = provider {
                processes.push(ProviderProcess {
                    provider: provider.to_string(),
                    pid: pid.as_u32(),
                    cwd: process.cwd().map(|c| c.display().to_string()),
                });
            }
        }
        self.provider_cache.retain(|key, _| live_keys.contains(key));
        processes.sort_by_key(|p| p.pid);

        ProcessLifecycleSnapshot {
            available: self.last_process_refresh.is_some(),
            refreshed_at: self.last_process_refresh_ms,
            claude_processes: processes.iter().filter(|p| p.provider == "claude-code").count(),
            codex_processes: processes.iter().filter(|p| p.provider == "codex").count(),
            processes,
        }
    }

    /// Samples Halo's own CPU and memory (single-process refresh; no table scan).
    pub fn self_footprint(&mut self) -> SelfFootprint {
        let Some(pid) = self.self_pid else {
            return SelfFootprint::default();
        };
        self.system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[pid]),
            false,
            ProcessRefreshKind::nothing().with_cpu().with_memory(),
        );
        let cores = self.system.cpus().len().max(1) as f32;
        match self.system.process(pid) {
            Some(p) => SelfFootprint {
                available: true,
                pid: pid.as_u32(),
                cpu_percent: (p.cpu_usage() / cores).clamp(0.0, 100.0),
                memory_bytes: p.memory(),
                virtual_memory_bytes: p.virtual_memory(),
            },
            None => SelfFootprint::default(),
        }
    }
}

impl Default for TelemetryCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_provider_process_names() {
        assert_eq!(candidate_for_name(OsStr::new("claude.exe")), Some(Candidate::Claude));
        assert_eq!(candidate_for_name(OsStr::new("Codex.exe")), Some(Candidate::Codex));
        assert_eq!(
            candidate_for_name(OsStr::new("codex-x86_64-pc-windows-msvc.exe")),
            Some(Candidate::Codex)
        );
        assert_eq!(candidate_for_name(OsStr::new("node.exe")), Some(Candidate::Runtime));
        assert_eq!(candidate_for_name(OsStr::new("codexviewer.exe")), None);
        assert_eq!(candidate_for_name(OsStr::new("explorer.exe")), None);
    }

    #[test]
    fn classifies_runtime_command_lines() {
        let claude = ["node.exe", "C:/Users/me/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/cli.js"];
        assert_eq!(classify_runtime_cmd(&claude), Some("claude-code"));
        let codex = ["node", "C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js"];
        assert_eq!(classify_runtime_cmd(&codex), Some("codex"));
        let vite = ["node", "C:\\work\\node_modules\\vite\\bin\\vite.js"];
        assert_eq!(classify_runtime_cmd(&vite), None);
    }

    #[test]
    fn provider_snapshot_and_footprint_are_available() {
        let mut collector = TelemetryCollector::new();
        let snapshot = collector.provider_processes();
        assert!(snapshot.available);
        assert!(snapshot.refreshed_at > 0);
        let footprint = collector.self_footprint();
        assert!(footprint.available);
        assert!(footprint.memory_bytes > 0);
    }
}
