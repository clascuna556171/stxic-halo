import { describe, expect, it } from 'vitest';
import {
  appendPollTiming,
  MAX_POLL_TIMINGS,
  summarizePollTimings,
} from '../src/lib/perfTiming';
import {
  appendMetricsSample,
  EMPTY_METRICS_HISTORY,
  MAX_TELEMETRY_HISTORY,
} from '../src/lib/telemetryHistory';
import { dedupeWorkspaces, sanitizeSettings } from '../src/config/settings';
import type { Metrics } from '../src/types';

describe('Phase 3A Idle Leak Profiling & Memory Bound Verification', () => {
  it('strictly caps IPC poll timing ring buffer to MAX_POLL_TIMINGS under high churn', () => {
    let timings: number[] = [];
    for (let i = 0; i < 5000; i++) {
      timings = appendPollTiming(timings, (i % 25) + 1);
    }
    expect(timings.length).toBe(MAX_POLL_TIMINGS);
    expect(timings.length).toBeLessThanOrEqual(100);

    const summary = summarizePollTimings(timings);
    expect(summary.samples).toBe(MAX_POLL_TIMINGS);
    expect(summary.avgMs).toBeGreaterThan(0);
    expect(summary.p95Ms).toBeGreaterThanOrEqual(summary.avgMs!);
  });

  it('bounds metrics history samples to MAX_TELEMETRY_HISTORY across thousands of polls', () => {
    let history = EMPTY_METRICS_HISTORY;
    const baseTime = Date.now();

    for (let i = 0; i < 2000; i++) {
      const mockMetrics: Metrics = {
        cpu_percent: (i % 30) + 10,
        memory_used_bytes: 8 * 1024 * 1024 * 1024,
        memory_total_bytes: 16 * 1024 * 1024 * 1024,
        process_count: 220,
        sampled_at: baseTime + i * 500,
        sample_duration_ms: 2,
      };
      history = appendMetricsSample(history, mockMetrics);
    }

    expect(history.cpuSamples.length).toBe(MAX_TELEMETRY_HISTORY);
    expect(history.memorySamples.length).toBe(MAX_TELEMETRY_HISTORY);
    expect(history.peakCpuPercent).toBeGreaterThan(0);
    expect(history.avgCpuPercent).toBeGreaterThan(0);
  });

  it('deduplicates and normalizes large approved workspace lists without memory inflation', () => {
    const rawList: string[] = [];
    for (let i = 0; i < 1000; i++) {
      rawList.push(`D:\\Tech\\Project_${i % 5}\\`);
      rawList.push(`d:/tech/project_${i % 5}`);
    }
    const deduped = dedupeWorkspaces(rawList);
    // Only 5 unique normalized projects
    expect(deduped.length).toBe(5);

    const sanitized = sanitizeSettings({
      approved_workspaces: rawList,
    });
    expect(sanitized.approved_workspaces?.length).toBe(5);
  });
});
