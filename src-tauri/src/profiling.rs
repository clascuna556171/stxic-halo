use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

pub const MAX_PROFILING_SAMPLES: usize = 120;
/// Minimum samples required before drawing a meaningful statistical slope.
pub const MIN_SAMPLES_FOR_ANALYSIS: usize = 5;
/// Leak threshold: sustained drift exceeding 512 KB per minute over at least 5 samples.
pub const LEAK_THRESHOLD_KB_PER_MIN: f64 = 512.0;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct MemorySample {
    pub timestamp_ms: u64,
    pub memory_bytes: u64,
    pub virtual_memory_bytes: u64,
    pub cpu_percent: f32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct LeakAnalysis {
    pub sample_count: usize,
    pub baseline_memory_bytes: u64,
    pub current_memory_bytes: u64,
    pub drift_bytes: i64,
    pub drift_rate_kb_per_min: f64,
    pub suspected_leak: bool,
    pub status: String,
}

/// Idle resource profiler and memory drift detector for STXIC Halo's background runtime.
#[derive(Debug, Clone)]
pub struct IdleProfiler {
    samples: VecDeque<MemorySample>,
    max_capacity: usize,
}

impl Default for IdleProfiler {
    fn default() -> Self {
        Self::new(MAX_PROFILING_SAMPLES)
    }
}

impl IdleProfiler {
    pub fn new(capacity: usize) -> Self {
        Self {
            samples: VecDeque::with_capacity(capacity.max(10)),
            max_capacity: capacity.max(10),
        }
    }

    pub fn record(&mut self, sample: MemorySample) {
        if self.samples.len() >= self.max_capacity {
            self.samples.pop_front();
        }
        self.samples.push_back(sample);
    }

    pub fn samples(&self) -> Vec<MemorySample> {
        self.samples.iter().cloned().collect()
    }

    pub fn analyze(&self) -> LeakAnalysis {
        let count = self.samples.len();
        if count < MIN_SAMPLES_FOR_ANALYSIS {
            return LeakAnalysis {
                sample_count: count,
                baseline_memory_bytes: self.samples.front().map(|s| s.memory_bytes).unwrap_or(0),
                current_memory_bytes: self.samples.back().map(|s| s.memory_bytes).unwrap_or(0),
                drift_bytes: 0,
                drift_rate_kb_per_min: 0.0,
                suspected_leak: false,
                status: format!("Collecting baseline ({count}/{MIN_SAMPLES_FOR_ANALYSIS} samples)"),
            };
        }

        let first = self.samples.front().unwrap();
        let last = self.samples.back().unwrap();

        let baseline = first.memory_bytes;
        let current = last.memory_bytes;
        let drift_bytes = (current as i64) - (baseline as i64);

        let duration_ms = last.timestamp_ms.saturating_sub(first.timestamp_ms);
        let duration_mins = (duration_ms as f64) / 60_000.0;

        let drift_rate_kb_per_min = if duration_mins > 0.01 {
            (drift_bytes as f64 / 1024.0) / duration_mins
        } else {
            0.0
        };

        let suspected_leak = drift_rate_kb_per_min > LEAK_THRESHOLD_KB_PER_MIN;

        let status = if suspected_leak {
            format!(
                "WARNING: Sustained memory growth detected (+{:.1} KB/min over {:.1} mins)",
                drift_rate_kb_per_min, duration_mins
            )
        } else if drift_bytes < 0 {
            format!(
                "Healthy: Memory reclaimed (-{:.1} KB over {:.1} mins)",
                (-drift_bytes as f64) / 1024.0,
                duration_mins
            )
        } else {
            format!(
                "Healthy: Stable footprint ({:+.1} KB/min over {:.1} mins)",
                drift_rate_kb_per_min, duration_mins
            )
        };

        LeakAnalysis {
            sample_count: count,
            baseline_memory_bytes: baseline,
            current_memory_bytes: current,
            drift_bytes,
            drift_rate_kb_per_min,
            suspected_leak,
            status,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_profiler_collects_baseline_initially() {
        let mut profiler = IdleProfiler::default();
        profiler.record(MemorySample {
            timestamp_ms: 1000,
            memory_bytes: 50 * 1024 * 1024,
            virtual_memory_bytes: 100 * 1024 * 1024,
            cpu_percent: 0.1,
        });

        let analysis = profiler.analyze();
        assert_eq!(analysis.sample_count, 1);
        assert!(!analysis.suspected_leak);
        assert!(analysis.status.contains("Collecting baseline"));
    }

    #[test]
    fn test_profiler_identifies_stable_runtime() {
        let mut profiler = IdleProfiler::default();
        let base_time = 100_000;
        let base_mem = 45 * 1024 * 1024;

        for i in 0..10 {
            profiler.record(MemorySample {
                timestamp_ms: base_time + (i as u64 * 60_000), // 1 min increments
                memory_bytes: base_mem + (if i % 2 == 0 { 1024 } else { 0 }),
                virtual_memory_bytes: 90 * 1024 * 1024,
                cpu_percent: 0.1,
            });
        }

        let analysis = profiler.analyze();
        assert_eq!(analysis.sample_count, 10);
        assert!(!analysis.suspected_leak);
        assert!(analysis.drift_rate_kb_per_min < 10.0);
        assert!(analysis.status.starts_with("Healthy"));
    }

    #[test]
    fn test_profiler_flags_sustained_leak() {
        let mut profiler = IdleProfiler::default();
        let base_time = 100_000;
        let base_mem = 40 * 1024 * 1024;

        // Simulate 2 MB/minute leak over 6 minutes
        for i in 0..6 {
            profiler.record(MemorySample {
                timestamp_ms: base_time + (i as u64 * 60_000),
                memory_bytes: base_mem + (i as u64 * 2 * 1024 * 1024),
                virtual_memory_bytes: 90 * 1024 * 1024,
                cpu_percent: 0.5,
            });
        }

        let analysis = profiler.analyze();
        assert_eq!(analysis.sample_count, 6);
        assert!(analysis.suspected_leak);
        assert!(analysis.drift_rate_kb_per_min > 1500.0);
        assert!(analysis.status.starts_with("WARNING"));
    }

    #[test]
    fn test_profiler_bounds_maximum_samples() {
        let mut profiler = IdleProfiler::new(10);
        for i in 0..30 {
            profiler.record(MemorySample {
                timestamp_ms: i as u64 * 1000,
                memory_bytes: 50 * 1024 * 1024,
                virtual_memory_bytes: 100 * 1024 * 1024,
                cpu_percent: 0.0,
            });
        }
        assert_eq!(profiler.samples().len(), 10);
        assert_eq!(profiler.samples().last().unwrap().timestamp_ms, 29000);
    }

    #[test]
    fn test_telemetry_repeated_sampling_memory_ceiling() {
        let mut collector = crate::telemetry::TelemetryCollector::new();
        let initial_footprint = collector.self_footprint();
        assert!(initial_footprint.available);

        for _ in 0..50 {
            let _ = collector.sample();
            let _ = collector.provider_processes();
        }

        let post_footprint = collector.self_footprint();
        assert!(post_footprint.available);
        let memory_diff = (post_footprint.memory_bytes as i64) - (initial_footprint.memory_bytes as i64);
        // Memory should remain stable and not balloon unexpectedly during continuous polling
        assert!(memory_diff < 35 * 1024 * 1024, "Unexpected memory inflation: {} bytes", memory_diff);
    }
}
