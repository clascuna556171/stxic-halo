import { describe, expect, it } from 'vitest';
import {
  appendPollTiming,
  EMPTY_POLL_TIMING,
  MAX_POLL_TIMINGS,
  summarizePollTimings,
} from '../src/lib/perfTiming';

describe('perf timing ring buffer & summary', () => {
  it('returns empty timing for empty input', () => {
    expect(summarizePollTimings([])).toEqual(EMPTY_POLL_TIMING);
  });

  it('caps buffer length at MAX_POLL_TIMINGS', () => {
    let samples: number[] = [];
    for (let i = 0; i < MAX_POLL_TIMINGS + 20; i++) {
      samples = appendPollTiming(samples, i);
    }
    expect(samples.length).toBe(MAX_POLL_TIMINGS);
    expect(samples[samples.length - 1]).toBe(MAX_POLL_TIMINGS + 19);
  });

  it('calculates average, last, and p95 correctly', () => {
    const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const summary = summarizePollTimings(samples);
    expect(summary.samples).toBe(10);
    expect(summary.lastMs).toBe(100);
    expect(summary.avgMs).toBe(55);
    expect(summary.p95Ms).toBe(100);
  });

  it('ignores negative or NaN timings', () => {
    let samples = [10, 20];
    samples = appendPollTiming(samples, -5);
    samples = appendPollTiming(samples, NaN);
    expect(samples).toEqual([10, 20]);
  });
});
