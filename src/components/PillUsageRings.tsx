import { memo } from 'react';
import { contextBudget, currentSessions, PROVIDER_NAMES } from '../lib/sessionSummary';
import { providerUsage, quotaState, quotaWindowKind, USAGE_PROVIDERS } from '../lib/usage';
import type { Agent, Provider, ProviderUsageReport } from '../types';
import { ProviderIcon } from './ProviderIcon';

export interface ProviderRingItem {
  provider: Provider;
  name: string;
  shortLabel: string;
  /** Primary quota remaining percentage (5-hour primary, 1-week fallback), or null when unavailable. */
  percentRemaining: number | null;
  /** Active 5-hour quota remaining percentage (0-100), if reported. */
  fiveHourRemaining: number | null;
  /** Active 1-week quota remaining percentage (0-100), if reported. */
  oneWeekRemaining: number | null;
  /** Compact token count (e.g. "187k") when session tokens are reported. */
  tokenLabel: string | null;
  /** Raw latest session token count, if reported. */
  totalTokens: number | null;
  metric: 'quota' | 'context' | 'tokens' | 'none';
  detail: string;
  /** Concise single-line summary for the collapsed pill hover preview (5h, 1w, and tokens). */
  previewSummary: string;
  activeCount: number;
}

function formatCompactTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(tokens);
}

const SHORT_LABELS: Record<Provider, string> = {
  'claude-code': 'CL',
  codex: 'CX',
  antigravity: 'AG',
  'github-copilot': 'CP',
  opencode: 'OC',
  other: 'AI',
};

const RING_RADIUS = 9.6;
const RING_STROKE = 2.2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RECENT_SESSION_MS = 60 * 60_000;

export function computeActiveProviderRings(
  agents: readonly Agent[],
  reports: readonly ProviderUsageReport[],
  now = Date.now(),
): ProviderRingItem[] {
  const active = currentSessions(agents);
  const activeCounts = new Map<Provider, number>();
  const orderedProviders: Provider[] = [];

  for (const agent of active) {
    activeCounts.set(agent.provider, (activeCounts.get(agent.provider) ?? 0) + 1);
    if (!orderedProviders.includes(agent.provider)) {
      orderedProviders.push(agent.provider);
    }
  }

  // Always include providers with active (unexpired) quota readings so quota rings are never hidden
  // behind another provider's token-only active session.
  for (const provider of USAGE_PROVIDERS) {
    if (orderedProviders.includes(provider)) continue;
    const usage = providerUsage(provider, agents, reports);
    const hasActiveQuota = usage.quotas.some((q) => {
      const state = quotaState(q, now);
      return state !== null && state.active;
    });
    if (hasActiveQuota) orderedProviders.push(provider);
  }

  // Keep recently completed sessions and providers with reported token/context usage visible
  // in the notch pill after an AI finishes a chat or turn, instead of dropping to "unavailable".
  const recentCandidates: Array<{ provider: Provider; timestamp: number }> = [];
  for (const provider of USAGE_PROVIDERS) {
    if (orderedProviders.includes(provider)) continue;
    const usage = providerUsage(provider, agents, reports);
    const latestTokenSession = usage.sessions.find(
      (s) => typeof s.total_tokens === 'number' && s.total_tokens >= 0,
    );
    const providerAgents = agents
      .filter((a) => a.provider === provider)
      .sort((a, b) => (Date.parse(b.lastSeen) || 0) - (Date.parse(a.lastSeen) || 0));
    const latestAgent = providerAgents[0];
    const hasContext = providerAgents.some((a) => contextBudget(a) !== null);
    const agentTs = latestAgent ? Date.parse(latestAgent.lastSeen) || 0 : 0;
    const isRecentlySeen = agentTs > 0 && now - agentTs <= RECENT_SESSION_MS;

    if (latestTokenSession || hasContext || isRecentlySeen) {
      const tokenTs = latestTokenSession ? Date.parse(latestTokenSession.observed_at) || 0 : 0;
      recentCandidates.push({ provider, timestamp: Math.max(tokenTs, agentTs) });
    }
  }
  recentCandidates
    .sort((a, b) => b.timestamp - a.timestamp)
    .forEach(({ provider }) => orderedProviders.push(provider));

  return orderedProviders.slice(0, 3).map((provider) => {
    const name = PROVIDER_NAMES[provider] ?? 'AI';
    const shortLabel = SHORT_LABELS[provider] ?? 'AI';
    const activeCount = activeCounts.get(provider) ?? 0;

    // 1. Prefer unexpired, active quota windows: 5-hour primary, falling back to 1-week, then other.
    const usage = providerUsage(provider, agents, reports);
    const latestSessionWithTokens = usage.sessions.find((s) => typeof s.total_tokens === 'number' && s.total_tokens >= 0);
    const totalTokens = latestSessionWithTokens?.total_tokens ?? null;
    const compactTokens = totalTokens !== null && totalTokens > 0
      ? formatCompactTokens(totalTokens)
      : totalTokens === 0
        ? '0'
        : null;

    const activeQuotas: Array<{ remaining: number; label: string; kind: '5-hour' | '1-week' | 'other' }> = [];
    let fiveHour: { remaining: number; label: string } | null = null;
    let oneWeek: { remaining: number; label: string } | null = null;
    let firstOther: { remaining: number; label: string } | null = null;

    for (const quota of usage.quotas) {
      const state = quotaState(quota, now);
      if (!state || !state.active) continue;
      const kind = quotaWindowKind(quota);
      const entry = { remaining: Math.round(state.remaining), label: quota.label, kind };
      activeQuotas.push(entry);
      if (kind === '5-hour' && !fiveHour) fiveHour = entry;
      else if (kind === '1-week' && !oneWeek) oneWeek = entry;
      else if (!firstOther) firstOther = entry;
    }

    const primaryQuota = fiveHour ?? oneWeek ?? firstOther;
    if (primaryQuota) {
      const quotaSummary = activeQuotas.length === 1 && !compactTokens
        ? `${primaryQuota.remaining}% left (${primaryQuota.label})`
        : `${activeQuotas.map((q) => `${q.label} ${q.remaining}% left`).join(' · ')}${compactTokens ? ` · ${compactTokens} tokens` : ''}`;

      const previewParts: string[] = [];
      if (fiveHour) previewParts.push(`5h ${fiveHour.remaining}%`);
      if (oneWeek) previewParts.push(`1w ${oneWeek.remaining}%`);
      if (!fiveHour && !oneWeek) previewParts.push(`${primaryQuota.label} ${primaryQuota.remaining}%`);
      if (compactTokens) previewParts.push(`${compactTokens} tokens`);

      return {
        provider,
        name,
        shortLabel,
        percentRemaining: primaryQuota.remaining,
        fiveHourRemaining: fiveHour?.remaining ?? null,
        oneWeekRemaining: oneWeek?.remaining ?? null,
        tokenLabel: compactTokens,
        totalTokens,
        metric: 'quota',
        detail: `${name}: ${quotaSummary}`,
        previewSummary: `${name} · ${previewParts.join(' · ')}`,
        activeCount,
      };
    }

    // 2. Fallback to active (or most recent completed) session context remaining %.
    const providerActive = active.filter((a) => a.provider === provider);
    const contextSource = providerActive.length > 0
      ? providerActive
      : agents
          .filter((a) => a.provider === provider)
          .sort((a, b) => (Date.parse(b.lastSeen) || 0) - (Date.parse(a.lastSeen) || 0))
          .slice(0, 1);
    let lowestContext: { percentRemaining: number; remaining: number } | null = null;
    for (const agent of contextSource) {
      const budget = contextBudget(agent);
      if (!budget) continue;
      if (!lowestContext || budget.percentRemaining < lowestContext.percentRemaining) {
        lowestContext = budget;
      }
    }
    if (lowestContext) {
      const tokenPart = compactTokens ? ` · ${compactTokens} tokens` : '';
      return {
        provider,
        name,
        shortLabel,
        percentRemaining: lowestContext.percentRemaining,
        fiveHourRemaining: null,
        oneWeekRemaining: null,
        tokenLabel: compactTokens,
        totalTokens,
        metric: 'context',
        detail: `${name}: ${lowestContext.percentRemaining}% context left (${lowestContext.remaining.toLocaleString()} tokens)${tokenPart}`,
        previewSummary: `${name} · ${lowestContext.percentRemaining}% context${tokenPart}`,
        activeCount,
      };
    }

    // 3. Fallback to real reported session tokens without fabricating a quota %.
    if (totalTokens !== null && compactTokens !== null) {
      return {
        provider,
        name,
        shortLabel,
        percentRemaining: null,
        fiveHourRemaining: null,
        oneWeekRemaining: null,
        tokenLabel: compactTokens,
        totalTokens,
        metric: 'tokens',
        detail: `${name}: ${totalTokens.toLocaleString()} tokens · latest session`,
        previewSummary: `${name} · ${compactTokens} tokens`,
        activeCount,
      };
    }

    // 4. Active or recently completed provider with no token/quota source reporting yet.
    const hint = provider === 'claude-code'
      ? 'enable Claude Code CLI status line in Settings for 5h/1w quota'
      : provider === 'antigravity'
        ? 'enable Antigravity CLI (agy) status line in Settings for quota'
        : 'no token/quota source reported yet';
    return {
      provider,
      name,
      shortLabel,
      percentRemaining: null,
      fiveHourRemaining: null,
      oneWeekRemaining: null,
      tokenLabel: null,
      totalTokens: null,
      metric: 'none',
      detail: `${name}: ${activeCount > 0 ? 'active' : 'recent session'} (${hint})`,
      previewSummary: `${name} · ${activeCount > 0 ? 'active' : 'recent session'}`,
      activeCount,
    };
  });
}

function ringTone(percentRemaining: number | null): 'healthy' | 'warning' | 'critical' | 'unknown' {
  if (percentRemaining === null) return 'unknown';
  if (percentRemaining <= 10) return 'critical';
  if (percentRemaining <= 25) return 'warning';
  return 'healthy';
}

export const PillUsageRing = memo(function PillUsageRing({
  ring,
  align = 'left',
}: {
  ring: ProviderRingItem;
  align?: 'left' | 'right';
}) {
  const tone = ringTone(ring.percentRemaining);
  const clamped = ring.percentRemaining === null
    ? 0
    : Math.max(0, Math.min(100, ring.percentRemaining));
  const dashOffset = RING_CIRCUMFERENCE * (1 - clamped / 100);
  const labelText = ring.percentRemaining !== null ? `${ring.percentRemaining}%` : ring.tokenLabel ?? '--';

  return (
    <span
      className={`pill-ring pill-ring--${tone} pill-ring--${ring.provider} pill-ring--align-${align}`}
      aria-label={ring.detail}
      data-provider={ring.provider}
      data-metric={ring.metric}
    >
      {align === 'right' && (
        <span className="pill-ring-value tabular">{labelText}</span>
      )}
      <span className="pill-ring-gauge">
        <svg className="pill-ring-svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <circle
            className="pill-ring-track"
            cx="12"
            cy="12"
            r={RING_RADIUS}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          {ring.percentRemaining !== null ? (
            <circle
              className="pill-ring-arc"
              cx="12"
              cy="12"
              r={RING_RADIUS}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 12 12)"
            />
          ) : (
            <circle
              className="pill-ring-arc pill-ring-arc--dashed"
              cx="12"
              cy="12"
              r={RING_RADIUS}
              strokeWidth="1.8"
              fill="none"
              strokeDasharray="3 3"
            />
          )}
        </svg>
        <span className="pill-ring-icon">
          <ProviderIcon provider={ring.provider} />
        </span>
      </span>
      {align === 'left' && (
        <span className="pill-ring-value tabular">{labelText}</span>
      )}
    </span>
  );
});

export const PillUsageRings = memo(function PillUsageRings({
  rings,
  align = 'left',
}: {
  rings: readonly ProviderRingItem[];
  align?: 'left' | 'right';
}) {
  if (rings.length === 0) return null;

  return (
    <span className="pill-rings" aria-label="Active AI usage">
      {rings.map((ring) => (
        <PillUsageRing key={ring.provider} ring={ring} align={align} />
      ))}
    </span>
  );
});
