import { describe, expect, it } from 'vitest';
import { computeActiveProviderRings } from '../src/components/PillUsageRings';
import type { Agent, ProviderUsageReport } from '../src/types';

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'sess-1',
    name: 'Claude',
    task: 'Working',
    provider: 'claude-code',
    workspace: 'stxic-halo',
    status: 'working',
    lastSeen: '2026-11-23T14:50:00Z',
    tokenUsage: null,
    contextTokens: null,
    contextWindow: null,
    contextPercent: null,
    isStale: false,
    isDemo: false,
    liveness: 'alive',
    proof: null,
    ...overrides,
  };
}

describe('computeActiveProviderRings', () => {
  const now = Date.parse('2026-11-23T14:51:00Z');

  it('uses fresh quota remaining % when reported for an active provider', () => {
    const agents = [makeAgent({ provider: 'claude-code' })];
    const reports: ProviderUsageReport[] = [
      {
        schema_version: 1,
        provider: 'claude-code',
        source: 'statusline',
        sessions: [],
        quotas: [
          {
            label: '5-hour limit',
            used_percent: 28,
            resets_at: Math.floor(now / 1000) + 3600,
            observed_at: '2026-11-23T14:50:30Z',
          },
        ],
      },
    ];

    const rings = computeActiveProviderRings(agents, reports, now);
    expect(rings).toHaveLength(1);
    expect(rings[0].provider).toBe('claude-code');
    expect(rings[0].percentRemaining).toBe(72);
    expect(rings[0].metric).toBe('quota');
  });

  it('falls back to context remaining % when no quota window exists', () => {
    const agents = [
      makeAgent({
        provider: 'codex',
        contextTokens: 40_000,
        contextWindow: 200_000,
      }),
    ];

    const rings = computeActiveProviderRings(agents, [], now);
    expect(rings).toHaveLength(1);
    expect(rings[0].provider).toBe('codex');
    expect(rings[0].percentRemaining).toBe(80);
    expect(rings[0].metric).toBe('context');
  });

  it('renders an honest unknown ring for active providers without token/quota sources', () => {
    const agents = [makeAgent({ provider: 'claude-code' }), makeAgent({ id: 'sess-2', provider: 'antigravity' })];
    const rings = computeActiveProviderRings(agents, [], now);
    expect(rings).toHaveLength(2);
    expect(rings[0].percentRemaining).toBeNull();
    expect(rings[0].shortLabel).toBe('CL');
    expect(rings[1].percentRemaining).toBeNull();
    expect(rings[1].shortLabel).toBe('AG');
  });
});
