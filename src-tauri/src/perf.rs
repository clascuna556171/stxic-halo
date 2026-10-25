use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::Mutex,
    time::{Duration, Instant},
};

/// Rolling timing statistics for one instrumented operation.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct TimingStat {
    pub count: u64,
    pub last_ms: f64,
    pub avg_ms: f64,
    pub max_ms: f64,
}

impl TimingStat {
    pub fn record(&mut self, elapsed: Duration) {
        let ms = elapsed.as_secs_f64() * 1000.0;
        self.count += 1;
        self.last_ms = ms;
        self.max_ms = self.max_ms.max(ms);
        // Incremental mean avoids keeping per-sample history.
        self.avg_ms += (ms - self.avg_ms) / self.count as f64;
    }
}

/// Local-only, in-memory performance counters. Nothing is persisted or transmitted.
pub struct PerfRegistry {
    started: Instant,
    stats: Mutex<BTreeMap<&'static str, TimingStat>>,
}

impl Default for PerfRegistry {
    fn default() -> Self {
        Self {
            started: Instant::now(),
            stats: Mutex::new(BTreeMap::new()),
        }
    }
}

impl PerfRegistry {
    pub fn record(&self, name: &'static str, elapsed: Duration) {
        if let Ok(mut stats) = self.stats.lock() {
            stats.entry(name).or_default().record(elapsed);
        }
    }

    /// Times `f` and records it under `name`.
    pub fn time<T>(&self, name: &'static str, f: impl FnOnce() -> T) -> T {
        let started = Instant::now();
        let out = f();
        self.record(name, started.elapsed());
        out
    }

    pub fn uptime_secs(&self) -> u64 {
        self.started.elapsed().as_secs()
    }

    pub fn snapshot(&self) -> BTreeMap<String, TimingStat> {
        self.stats
            .lock()
            .map(|s| s.iter().map(|(k, v)| (k.to_string(), v.clone())).collect())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timing_stat_tracks_last_avg_and_max() {
        let mut stat = TimingStat::default();
        stat.record(Duration::from_millis(10));
        stat.record(Duration::from_millis(30));
        assert_eq!(stat.count, 2);
        assert!((stat.avg_ms - 20.0).abs() < 0.01);
        assert!((stat.max_ms - 30.0).abs() < 0.01);
        assert!((stat.last_ms - 30.0).abs() < 0.01);
    }

    #[test]
    fn registry_records_named_operations() {
        let registry = PerfRegistry::default();
        let value = registry.time("op", || 7);
        assert_eq!(value, 7);
        assert_eq!(registry.snapshot()["op"].count, 1);
    }
}
