import { describe, expect, it, vi } from 'vitest';
import { contextBudget, currentSessions } from '../src/lib/sessionSummary';
import { createHoverDisclosure } from '../src/lib/hoverDisclosure';
import { parseCodexRolloutLines, reduceCodexSessions } from '../src/lib/codexAdapter';
import type { Agent } from '../src/types';

const agent = (patch: Partial<Agent> = {}): Agent => ({
  id: 'session', provider: 'codex', name: 'Codex', task: 'Working', workspace: 'project',
  status: 'working', contextPercent: 25, tokenUsage: 700000, contextTokens: 50000,
  contextWindow: 200000, lastSeen: '2026-10-26T14:00:00Z', proof: null, isDemo: false, ...patch,
});

describe('simple session summary', () => {
  it('uses current context rather than cumulative usage and refuses to guess missing budgets', () => {
    expect(contextBudget(agent())).toEqual({ remaining: 150000, limit: 200000, percentRemaining: 75 });
    expect(contextBudget(agent({ contextTokens: null }))).toBeNull();
    expect(contextBudget(agent({ contextWindow: 0 }))).toBeNull();
    expect(contextBudget(agent({ contextTokens: NaN }))).toBeNull();
    expect(contextBudget(agent({ contextTokens: 250000 }))?.remaining).toBe(0);
  });
  it('shows the most recent current sessions and excludes historical, stale and exited sessions', () => {
    expect(currentSessions([
      agent({ id: 'old', status: 'completed' }), agent({ id: 'stale', isStale: true }),
      agent({ id: 'exited', liveness: 'exited' }), agent({ id: 'working' }),
      agent({ id: 'waiting', status: 'waiting', lastSeen: '2026-10-26T14:05:00Z' }),
    ]).map(a => a.id)).toEqual(['waiting', 'working']);
  });
  it('hover reveals only a preview; leaving never closes a dashboard opened by click', () => {
    vi.useFakeTimers();
    try {
      let preview = false, full = false;
      const hover = createHoverDisclosure(() => { preview = true; }, () => { preview = false; }, () => true);
      hover.enter();
      expect([preview, full]).toEqual([true, false]);
      full = true; preview = false; // Click opens the full dashboard.
      hover.leave(); vi.advanceTimersByTime(350);
      expect([preview, full]).toEqual([false, true]);
    } finally { vi.useRealTimers(); }
  });
  it('does not derive remaining context from a cumulative-only token event', () => {
    const parsed = parseCodexRolloutLines([
      JSON.stringify({ type: 'session_meta', payload: { id: 'session', context_window: 200000 } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: {total_tokens: 900000} } } }),
    ]);
    expect(parsed?.tokenUsage).toBe(900000);
    expect(parsed?.contextPercent).toBeNull();
  });
  it('carries exact context usage from native telemetry to the summary', () => {
    const agents = reduceCodexSessions([], { telemetry: [{ session_id: 'session', workspace: 'project', status: 'working',
      total_tokens: 700000, context_tokens: 50000, context_window: 200000, context_percent: 25,
      last_seen: new Date().toISOString(), last_event: 'PreToolUse' }] });
    expect(contextBudget(agents[0])?.remaining).toBe(150000);
  });
});
