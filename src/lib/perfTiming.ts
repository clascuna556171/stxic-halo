import type { PollTimingSummary } from '../types';

export const MAX_POLL_TIMINGS = 60;

export const EMPTY_POLL_TIMING: PollTimingSummary = {
  samples: 0,
  lastMs: null,
  avgMs: null,
  p95Ms: null,
};

/** Appends a poll round-trip duration to a bounded ring buffer. */
export function appendPollTiming(samples: readonly number[], ms: number): number[] {
  if (!Number.isFinite(ms) || ms < 0) return [...samples];
  const next = [...samples, ms];
  return next.length > MAX_POLL_TIMINGS ? next.slice(next.length - MAX_POLL_TIMINGS) : next;
}

export function summarizePollTimings(samples: readonly number[]): PollTimingSummary {
  if (samples.length === 0) return EMPTY_POLL_TIMING;
  const sorted = [...samples].sort((a, b) => a - b);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  const avg = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    samples: samples.length,
    lastMs: round(samples[samples.length - 1]),
    avgMs: round(avg),
    p95Ms: round(sorted[p95Index]),
  };
}
