import type { Agent, Provider, ProviderUsageReport, QuotaWindow, SessionUsage } from '../types';

export const USAGE_PROVIDERS = ['codex', 'claude-code', 'antigravity', 'github-copilot', 'opencode'] as const;
export const USAGE_STALE_MS = 15 * 60_000;
const validTime = (value: string) => Number.isFinite(Date.parse(value)) && Date.parse(value) > 0;
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function usageAge(observedAt: string, now = Date.now()): 'recent' | 'stale' | 'invalid' {
  const timestamp = Date.parse(observedAt);
  if (!validTime(observedAt) || timestamp > now + 60_000) return 'invalid';
  return now - timestamp > USAGE_STALE_MS ? 'stale' : 'recent';
}

export function quotaState(quota: QuotaWindow, now = Date.now()) {
  if (!numeric(quota.used_percent) || quota.used_percent > 100 || usageAge(quota.observed_at, now) === 'invalid') return null;
  const resetMs = numeric(quota.resets_at) && quota.resets_at > 0 ? quota.resets_at * 1000 : null;
  const expired = resetMs !== null && resetMs <= now;
  return { remaining: Math.round((100 - quota.used_percent) * 10) / 10, resetMs,
    expired, stale: expired || usageAge(quota.observed_at, now) === 'stale' };
}

export function providerUsage(provider: Provider, agents: readonly Agent[], reports: readonly ProviderUsageReport[]) {
  const sessions = new Map<string, SessionUsage & { source: string }>();
  const quotas = new Map<string, QuotaWindow & { source: string }>();
  const addSession = (session: SessionUsage, source: string) => {
    if (usageAge(session.observed_at) === 'invalid') return;
    const previous = sessions.get(session.session_id);
    if (previous && Date.parse(previous.observed_at) >= Date.parse(session.observed_at)) return;
    sessions.set(session.session_id, { ...session,
      total_tokens: numeric(session.total_tokens) && Number.isSafeInteger(session.total_tokens) ? session.total_tokens : null,
      cost_usd: numeric(session.cost_usd) ? session.cost_usd : null,
      premium_requests: numeric(session.premium_requests) ? session.premium_requests : null, source });
  };
  const addQuota = (quota: QuotaWindow, source: string) => {
    if (!quotaState(quota)) return;
    const previous = quotas.get(quota.label);
    if (!previous || Date.parse(previous.observed_at) < Date.parse(quota.observed_at)) quotas.set(quota.label, { ...quota, source });
  };
  for (const report of reports.filter(r => r.schema_version === 1 && r.provider === provider)) {
    const source = report.source === 'session-log' ? 'Session log' : report.source === 'plugin' ? 'Local plugin'
      : report.source === 'statusline' ? 'Claude status line' : provider === 'opencode' ? 'Local plugin/export' : 'Local export';
    report.sessions.forEach(s => addSession(s, source));
    report.quotas.forEach(q => addQuota(q, source));
  }
  for (const agent of agents.filter(a => a.provider === provider)) {
    if (agent.tokenUsage !== null) addSession({ session_id: agent.id, total_tokens: agent.tokenUsage,
      cost_usd: null, observed_at: agent.usageObservedAt ?? agent.lastSeen }, agent.isDemo ? 'Sample data' : 'Session log');
    agent.quotaWindows?.forEach(q => addQuota(q, agent.isDemo ? 'Sample data' : 'Session log'));
  }
  return { sessions: [...sessions.values()].sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at)).slice(0, 16),
    quotas: [...quotas.values()].sort((a, b) => a.label.localeCompare(b.label)) };
}

/** Warnings only use unexpired, recent quota observations; never infer allowances. */
export function lowQuotaWarnings(agents: readonly Agent[], reports: readonly ProviderUsageReport[], now = Date.now()) {
  return USAGE_PROVIDERS.flatMap(provider => providerUsage(provider, agents, reports).quotas.flatMap(quota => {
    const state = quotaState(quota, now);
    return state && !state.stale && state.remaining <= 20 ? [{ provider, quota, remaining: state.remaining }] : [];
  }));
}
