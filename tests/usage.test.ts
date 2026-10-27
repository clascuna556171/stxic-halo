import { describe, expect, it } from 'vitest';
import { lowQuotaWarnings, providerUsage, quotaState, usageAge } from '../src/lib/usage';
import { parseCodexRolloutLines, reduceCodexSessions } from '../src/lib/codexAdapter';
import { sessionsFromEvents, PROVIDER_ADAPTERS } from '../src/lib/agentEvents';
import { reconcileSessions } from '../src/lib/sessionReconciliation';
import type { AgentEvent, ProviderUsageReport, QuotaWindow } from '../src/types';

const timestamp = new Date(Date.now() - 1000).toISOString();
const quota: QuotaWindow = { label: 'Weekly', used_percent: 27.5, observed_at: timestamp, resets_at: Math.floor(Date.now() / 1000) + 3600 };
const report = (patch: Partial<ProviderUsageReport> = {}): ProviderUsageReport => ({ schema_version: 1, provider: 'opencode',
  sessions: [{ session_id: 'session', total_tokens: 0, cost_usd: 0, observed_at: timestamp }], quotas: [], ...patch });

describe('usage and allowance are separate from context', () => {
  it('does not mislabel the last context token count as cumulative session usage', () => {
    const parsed = parseCodexRolloutLines([
      JSON.stringify({ type: 'session_meta', payload: { id: 's', context_window: 100000 } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { total_tokens: 5000 } } } }),
    ]);
    expect(parsed?.tokenUsage).toBeNull();
    expect(parsed?.contextPercent).toBe(5);
  });
  it('preserves real zero tokens and cost and never invents missing quota', () => {
    const usage = providerUsage('opencode', [], [report()]);
    expect(usage.sessions[0].total_tokens).toBe(0);
    expect(usage.sessions[0].cost_usd).toBe(0);
    expect(usage.quotas).toEqual([]);
  });
  it('deduplicates session snapshots and uses the latest, without summing quotas or session totals', () => {
    const newer = new Date(Date.now()).toISOString();
    const usage = providerUsage('opencode', [], [report(), report({ sessions: [{ session_id: 'session', total_tokens: 123, cost_usd: 0.01, observed_at: newer }] })]);
    expect(usage.sessions).toHaveLength(1);
    expect(usage.sessions[0].total_tokens).toBe(123);
    expect(providerUsage('codex', [], [report()]).sessions).toEqual([]);
  });
  it('shows logged account quota without inferring cost or replacing context', () => {
    const agents = reduceCodexSessions([], { telemetry: [{ session_id: 's', workspace: 'p', status: 'working', total_tokens: 500000,
      context_tokens: 1000, context_window: 100000, context_percent: 1, last_seen: timestamp, last_event: 'PreToolUse',
      usage_observed_at: timestamp, quota_windows: [quota] }] });
    const usage = providerUsage('codex', agents, []);
    expect(usage.sessions[0].total_tokens).toBe(500000);
    expect(usage.sessions[0].cost_usd).toBeNull();
    expect(agents[0].contextPercent).toBe(1);
    expect(quotaState(usage.quotas[0])?.remaining).toBe(72.5);
  });
  it('flags stale data and expired windows rather than assuming a reset restored quota', () => {
    expect(quotaState({ ...quota, resets_at: Math.floor(Date.now() / 1000) - 1 })?.expired).toBe(true);
    expect(usageAge(new Date(Date.now() - 16 * 60_000).toISOString())).toBe('stale');
    expect(quotaState({ ...quota, used_percent: 101 })).toBeNull();
    expect(quotaState({ ...quota, used_percent: NaN })).toBeNull();
    expect(quotaState({ ...quota, observed_at: 'invalid' })).toBeNull();
    expect(usageAge(new Date(Date.now() + 3600000).toISOString())).toBe('invalid');
  });
  it('rejects invalid tokens/cost and future observations without turning them into zero', () => {
    const usage = providerUsage('opencode', [], [report({ sessions: [{ session_id: 'session', total_tokens: -1, cost_usd: NaN, observed_at: timestamp }] })]);
    expect(usage.sessions[0].total_tokens).toBeNull();
    expect(usage.sessions[0].cost_usd).toBeNull();
    expect(providerUsage('opencode', [], [report({ sessions: [{ session_id: 's', total_tokens: 9, cost_usd: 1, observed_at: '2040-01-01T00:00:00Z' }] })]).sessions).toEqual([]);
  });
});

describe('additional provider lifecycle', () => {
  const event = (source: string, name = 'SessionStart'): AgentEvent => ({ schema_version: 1, source, session_id: 'same-id', timestamp, event: name, cwd: 'C:/work/app' });
  it('keeps provider sessions distinct even if raw session IDs collide', () => {
    const sessions = sessionsFromEvents([event('antigravity'), event('github-copilot'), event('opencode')]);
    expect(new Set(sessions.map(a => a.id)).size).toBe(3);
    expect(sessions.every(a => a.tokenUsage === null && a.contextPercent === null && a.proof === null)).toBe(true);
    expect(PROVIDER_ADAPTERS).toHaveLength(5);
  });
  it('resumes after Stop and reports approval/error without consuming subagent completion', () => {
    const sessions = sessionsFromEvents([event('antigravity', 'Stop'), event('antigravity', 'PreInvocation'), event('github-copilot', 'PermissionRequest'), event('opencode', 'Error')]);
    expect(sessions.find(a => a.provider === 'antigravity')?.status).toBe('working');
    expect(sessions.find(a => a.provider === 'antigravity')?.task).toBe('Model is working');
    expect(sessions.find(a => a.provider === 'github-copilot')?.status).toBe('waiting');
    expect(sessions.find(a => a.provider === 'opencode')?.status).toBe('error');
  });
  it('does not falsely complete providers that the process collector cannot identify', () => {
    const sessions = sessionsFromEvents([event('antigravity'), event('github-copilot'), event('opencode')]);
    const reconciled = reconcileSessions(sessions, { available: true, refreshed_at: Date.now() + 60000, processes: [], claude_processes: 0, codex_processes: 0 });
    expect(reconciled.every(a => a.status === 'working' && a.liveness === 'unverified')).toBe(true);
  });
});

it('warns only for fresh unexpired low quotas', () => {
  const now = Date.now();
  const make = (label: string, used_percent: number, observed_at: string, resets_at: number) => ({ label, used_percent, observed_at, resets_at });
  const quotas = [make('low', 80, new Date(now).toISOString(), now / 1000 + 3600), make('fine', 79, new Date(now).toISOString(), now / 1000 + 3600), make('stale', 95, new Date(now - 16 * 60000).toISOString(), now / 1000 + 3600), make('expired', 99, new Date(now).toISOString(), now / 1000 - 1)];
  expect(lowQuotaWarnings([], [report({ quotas })], now).map(w => w.quota.label)).toEqual(['low']);
});
