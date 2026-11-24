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

const FIVE_HOUR_LABEL = /^(5[- ]?h(?:ours?|rs?)?|five[- ]?hours?|primary|codex primary)(\s+limit)?$/i;
const ONE_WEEK_LABEL = /^(1[- ]?w(?:eek|k)?|weekly|7[- ]?d(?:ays?)?|seven[- ]?days?|secondary|codex secondary)(\s+limit)?$/i;
const FIVE_HOUR_TEXT_ONLY = /^(5[- ]?h(?:ours?|rs?)?|five[- ]?hours?)(\s+limit)?$/i;
const ONE_WEEK_TEXT_ONLY = /^(1[- ]?w(?:eek|k)?|weekly|7[- ]?d(?:ays?)?|seven[- ]?days?)(\s+limit)?$/i;

export type QuotaWindowKind = '5-hour' | '1-week' | 'other';

export function quotaWindowKind(quota: Pick<QuotaWindow, 'label' | 'window_minutes'> & Partial<QuotaWindow>): QuotaWindowKind {
  const norm = normalizeQuotaWindow(quota);
  if (norm.key === 'window:300') return '5-hour';
  if (norm.key === 'window:10080') return '1-week';
  return 'other';
}

export function normalizeQuotaWindow(quota: Pick<QuotaWindow, 'label' | 'window_minutes'> & Partial<QuotaWindow>): { key: string; label: string; order: number } {
  const trimmed = quota.label.trim();
  const minutes = numeric(quota.window_minutes) && quota.window_minutes > 0 ? quota.window_minutes : null;
  if (minutes === 300 && (!trimmed || FIVE_HOUR_LABEL.test(trimmed))) {
    return { key: 'window:300', label: '5-hour', order: 300 };
  }
  if (minutes === 10080 && (!trimmed || ONE_WEEK_LABEL.test(trimmed))) {
    return { key: 'window:10080', label: '1-week', order: 10080 };
  }
  if (minutes === null) {
    if (FIVE_HOUR_TEXT_ONLY.test(trimmed)) return { key: 'window:300', label: '5-hour', order: 300 };
    if (ONE_WEEK_TEXT_ONLY.test(trimmed)) return { key: 'window:10080', label: '1-week', order: 10080 };
  }
  return {
    key: trimmed.toLowerCase(),
    label: trimmed || quota.label,
    order: minutes ?? Number.MAX_SAFE_INTEGER,
  };
}

export function quotaState(quota: QuotaWindow, now = Date.now()) {
  if (!numeric(quota.used_percent) || quota.used_percent > 100 || usageAge(quota.observed_at, now) === 'invalid') return null;
  const resetMs = numeric(quota.resets_at) && quota.resets_at > 0 ? quota.resets_at * 1000 : null;
  const expired = resetMs !== null && resetMs <= now;
  const age = usageAge(quota.observed_at, now);
  return {
    used: Math.round(quota.used_percent * 10) / 10,
    remaining: Math.round((100 - quota.used_percent) * 10) / 10,
    resetMs,
    expired,
    stale: expired || age === 'stale',
    active: !expired && (resetMs !== null || age === 'recent'),
  };
}

export function providerUsage(provider: Provider, agents: readonly Agent[], reports: readonly ProviderUsageReport[]) {
  const sessions = new Map<string, SessionUsage & { source: string }>();
  const quotas = new Map<string, QuotaWindow & { source: string; _order: number }>();
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
    const norm = normalizeQuotaWindow(quota);
    const previous = quotas.get(norm.key);
    if (!previous || Date.parse(previous.observed_at) < Date.parse(quota.observed_at)) {
      quotas.set(norm.key, { ...quota, label: norm.label, source, _order: norm.order });
    }
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
  return {
    sessions: [...sessions.values()].sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at)).slice(0, 16),
    quotas: [...quotas.values()]
      .sort((a, b) => a._order - b._order || a.label.localeCompare(b.label))
      .map(({ _order: _, ...q }) => q),
  };
}

/** Warnings only use unexpired, recent quota observations; never infer allowances. */
export function lowQuotaWarnings(agents: readonly Agent[], reports: readonly ProviderUsageReport[], now = Date.now()) {
  return USAGE_PROVIDERS.flatMap(provider => providerUsage(provider, agents, reports).quotas.flatMap(quota => {
    const state = quotaState(quota, now);
    return state && !state.stale && state.remaining <= 20 ? [{ provider, quota, remaining: state.remaining }] : [];
  }));
}
