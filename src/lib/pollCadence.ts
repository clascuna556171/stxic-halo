import type { Agent } from '../types';

/** Longest wait between background polls; matches the upper bound of `poll_interval_ms`. */
export const DEEP_SLEEP_INTERVAL_MS = 15000;
/** Consecutive idle polls required before backing off to deep sleep (so a brief lull never delays a session start). */
export const DEEP_SLEEP_AFTER_IDLE_TICKS = 3;

export interface PollCadenceInput {
  /** User-configured active interval; clamped to 1s-15s. */
  activeRateMs: number;
  /** The island is expanded or showing the hover preview. */
  expanded: boolean;
  claudeProcesses: number;
  codexProcesses: number;
  agents: Pick<Agent, 'status'>[];
  /** How many polls in a row found nothing active while collapsed. */
  idleStreak: number;
}

/** True when nothing needs a fast refresh: collapsed, no provider process, no session working or waiting on the user. */
export function isIdle(input: Omit<PollCadenceInput, 'activeRateMs' | 'idleStreak'>): boolean {
  if (input.expanded) return false;
  if (input.claudeProcesses > 0 || input.codexProcesses > 0) return false;
  return !input.agents.some(agent => agent.status === 'working' || agent.status === 'waiting');
}

/**
 * Chooses the wait before the next background poll.
 * Active: the configured rate. Idle: an eco rate, then deep sleep once idle for several polls.
 * New activity resets the idle streak (see the wake handler in `useHaloRuntime`), so the
 * island speeds up again as soon as it is opened or the event watcher reports a change.
 */
export function nextPollInterval(input: PollCadenceInput): number {
  const activeRate = Math.max(1000, Math.min(DEEP_SLEEP_INTERVAL_MS, input.activeRateMs));
  if (!isIdle(input)) return activeRate;
  if (input.idleStreak >= DEEP_SLEEP_AFTER_IDLE_TICKS) return DEEP_SLEEP_INTERVAL_MS;
  return Math.max(5000, Math.min(DEEP_SLEEP_INTERVAL_MS, activeRate * 2.5));
}
