import { memo } from 'react';
import { contextBudget, currentSessions, PROVIDER_NAMES } from '../lib/sessionSummary';
import { providerUsage, quotaState, USAGE_PROVIDERS } from '../lib/usage';
import type { Agent, Provider, ProviderUsageReport } from '../types';
import { ProviderIcon } from './ProviderIcon';

export interface ProviderRingItem {
  provider: Provider;
  name: string;
  shortLabel: string;
  /** Remaining percentage (0-100), or null when active without a reported percentage. */
  percentRemaining: number | null;
  /** Compact token count (e.g. "187k") when tokens are known but no percentage limit is reported. */
  tokenLabel: string | null;
  metric: 'quota' | 'context' | 'tokens' | 'none';
  detail: string;
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

const RING_RADIUS = 7.2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

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

  // Also include providers with fresh, non-stale quota readings when no active sessions exist.
  if (orderedProviders.length === 0) {
    for (const provider of USAGE_PROVIDERS) {
      const usage = providerUsage(provider, agents, reports);
      const hasFreshQuota = usage.quotas.some((q) => {
        const state = quotaState(q, now);
        return state !== null && !state.stale;
      });
      if (hasFreshQuota) orderedProviders.push(provider);
    }
  }

  return orderedProviders.slice(0, 3).map((provider) => {
    const name = PROVIDER_NAMES[provider] ?? 'AI';
    const shortLabel = SHORT_LABELS[provider] ?? 'AI';
    const activeCount = activeCounts.get(provider) ?? 0;

    // 1. Prefer unexpired, fresh quota window (lowest remaining %).
    const usage = providerUsage(provider, agents, reports);
    let bestQuota: { remaining: number; label: string } | null = null;
    for (const quota of usage.quotas) {
      const state = quotaState(quota, now);
      if (!state || state.stale) continue;
      if (!bestQuota || state.remaining < bestQuota.remaining) {
        bestQuota = { remaining: Math.round(state.remaining), label: quota.label };
      }
    }
    if (bestQuota) {
      return {
        provider,
        name,
        shortLabel,
        percentRemaining: bestQuota.remaining,
        tokenLabel: null,
        metric: 'quota',
        detail: `${name}: ${bestQuota.remaining}% left (${bestQuota.label})`,
        activeCount,
      };
    }

    // 2. Fallback to active session context remaining %.
    const providerActive = active.filter((a) => a.provider === provider);
    let lowestContext: { percentRemaining: number; remaining: number } | null = null;
    for (const agent of providerActive) {
      const budget = contextBudget(agent);
      if (!budget) continue;
      if (!lowestContext || budget.percentRemaining < lowestContext.percentRemaining) {
        lowestContext = budget;
      }
    }
    if (lowestContext) {
      return {
        provider,
        name,
        shortLabel,
        percentRemaining: lowestContext.percentRemaining,
        tokenLabel: null,
        metric: 'context',
        detail: `${name}: ${lowestContext.percentRemaining}% context left (${lowestContext.remaining.toLocaleString()} tokens)`,
        activeCount,
      };
    }

    // 3. Fallback to real reported session tokens (e.g. Antigravity transcript tokens) without fabricating a %.
    const latestSessionWithTokens = usage.sessions.find((s) => typeof s.total_tokens === 'number' && s.total_tokens > 0);
    if (latestSessionWithTokens && latestSessionWithTokens.total_tokens !== null) {
      const compact = formatCompactTokens(latestSessionWithTokens.total_tokens);
      return {
        provider,
        name,
        shortLabel,
        percentRemaining: null,
        tokenLabel: compact,
        metric: 'tokens',
        detail: `${name}: ${latestSessionWithTokens.total_tokens.toLocaleString()} tokens`,
        activeCount,
      };
    }

    // 4. Active provider with no token/quota source reporting yet.
    const hint = provider === 'claude-code'
      ? 'enable Claude status line in Settings for %'
      : 'no token/quota source reported yet';
    return {
      provider,
      name,
      shortLabel,
      percentRemaining: null,
      tokenLabel: null,
      metric: 'none',
      detail: `${name}: active (${hint})`,
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

export const PillUsageRings = memo(function PillUsageRings({
  rings,
}: {
  rings: readonly ProviderRingItem[];
}) {
  if (rings.length === 0) return null;

  return (
    <span className="pill-rings" aria-label="Active AI usage">
      {rings.map((ring) => {
        const tone = ringTone(ring.percentRemaining);
        const clamped = ring.percentRemaining === null
          ? 0
          : Math.max(0, Math.min(100, ring.percentRemaining));
        const dashOffset = RING_CIRCUMFERENCE * (1 - clamped / 100);

        return (
          <span
            key={ring.provider}
            className={`pill-ring pill-ring--${tone} pill-ring--${ring.provider}`}
            title={ring.detail}
            aria-label={ring.detail}
          >
            <span className="pill-ring-icon">
              <ProviderIcon provider={ring.provider} />
            </span>
            <svg className="pill-ring-svg" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
              <circle
                className="pill-ring-track"
                cx="9"
                cy="9"
                r={RING_RADIUS}
                strokeWidth="2.1"
                fill="none"
              />
              {ring.percentRemaining !== null ? (
                <circle
                  className="pill-ring-arc"
                  cx="9"
                  cy="9"
                  r={RING_RADIUS}
                  strokeWidth="2.1"
                  fill="none"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  transform="rotate(-90 9 9)"
                />
              ) : (
                <circle
                  className="pill-ring-arc pill-ring-arc--dashed"
                  cx="9"
                  cy="9"
                  r={RING_RADIUS}
                  strokeWidth="1.7"
                  fill="none"
                  strokeDasharray="2.8 2.8"
                />
              )}
            </svg>
            <span className="pill-ring-value tabular">
              {ring.percentRemaining !== null ? `${ring.percentRemaining}%` : ring.tokenLabel ?? '--'}
            </span>
          </span>
        );
      })}
    </span>
  );
});
