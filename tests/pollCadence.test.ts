import { describe, expect, it } from 'vitest';
import {
  DEEP_SLEEP_AFTER_IDLE_TICKS,
  DEEP_SLEEP_INTERVAL_MS,
  isIdle,
  nextPollInterval,
  type PollCadenceInput,
} from '../src/lib/pollCadence';

const idle = (patch: Partial<PollCadenceInput> = {}): PollCadenceInput => ({
  activeRateMs: 2500, expanded: false, claudeProcesses: 0, codexProcesses: 0, agents: [], idleStreak: 0, ...patch,
});

describe('poll cadence', () => {
  it('uses the configured rate whenever something is active', () => {
    const streak = DEEP_SLEEP_AFTER_IDLE_TICKS + 5;
    expect(nextPollInterval(idle({ expanded: true, idleStreak: streak }))).toBe(2500);
    expect(nextPollInterval(idle({ claudeProcesses: 1, idleStreak: streak }))).toBe(2500);
    expect(nextPollInterval(idle({ codexProcesses: 2, idleStreak: streak }))).toBe(2500);
    expect(nextPollInterval(idle({ agents: [{ status: 'working' }], idleStreak: streak }))).toBe(2500);
  });

  it('treats a session waiting on the user as active so approvals are never delayed', () => {
    expect(isIdle(idle({ agents: [{ status: 'waiting' }] }))).toBe(false);
    expect(nextPollInterval(idle({ agents: [{ status: 'waiting' }], idleStreak: 10 }))).toBe(2500);
  });

  it('ignores finished, errored and unknown sessions when deciding idleness', () => {
    const agents = [{ status: 'completed' as const }, { status: 'error' as const }, { status: 'unknown' as const }];
    expect(isIdle(idle({ agents }))).toBe(true);
  });

  it('backs off to eco, then deep sleep only after several idle polls', () => {
    expect(nextPollInterval(idle({ idleStreak: 0 }))).toBe(6250);
    expect(nextPollInterval(idle({ idleStreak: DEEP_SLEEP_AFTER_IDLE_TICKS - 1 }))).toBe(6250);
    expect(nextPollInterval(idle({ idleStreak: DEEP_SLEEP_AFTER_IDLE_TICKS }))).toBe(DEEP_SLEEP_INTERVAL_MS);
  });

  it('never waits longer than the 15 second ceiling and never polls faster than 1 second', () => {
    expect(nextPollInterval(idle({ activeRateMs: 15000, idleStreak: 0 }))).toBe(DEEP_SLEEP_INTERVAL_MS);
    expect(nextPollInterval(idle({ activeRateMs: 999999, expanded: true }))).toBe(DEEP_SLEEP_INTERVAL_MS);
    expect(nextPollInterval(idle({ activeRateMs: 10, expanded: true }))).toBe(1000);
    expect(nextPollInterval(idle({ activeRateMs: 1000, idleStreak: 0 }))).toBe(5000);
  });

  it('returns to the fast rate as soon as activity appears, regardless of a long idle streak', () => {
    const deep = idle({ idleStreak: 50 });
    expect(nextPollInterval(deep)).toBe(DEEP_SLEEP_INTERVAL_MS);
    expect(nextPollInterval({ ...deep, expanded: true })).toBe(2500);
  });
});
