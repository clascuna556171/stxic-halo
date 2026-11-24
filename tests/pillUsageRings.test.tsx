import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { computeActiveProviderRings, PillUsageRing } from '../src/components/PillUsageRings';
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

  it('uses fresh 5-hour quota remaining % as primary when reported for an active provider', () => {
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
    expect(rings[0].fiveHourRemaining).toBe(72);
    expect(rings[0].oneWeekRemaining).toBeNull();
    expect(rings[0].metric).toBe('quota');
  });

  it('prioritizes 5-hour quota over 1-week for the ring arc and falls back to 1-week when 5-hour is absent', () => {
    const observed = '2026-11-23T14:50:30Z';
    const reports: ProviderUsageReport[] = [
      {
        schema_version: 1,
        provider: 'claude-code',
        source: 'statusline',
        sessions: [{ session_id: 'cl-1', total_tokens: 42_000, cost_usd: null, observed_at: observed }],
        quotas: [
          { label: '5-hour', used_percent: 55, window_minutes: 300, resets_at: Math.floor(now / 1000) + 3600, observed_at: observed },
          { label: '1-week', used_percent: 80, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 86400, observed_at: observed },
        ],
      },
      {
        schema_version: 1,
        provider: 'codex',
        source: 'session-log',
        sessions: [{ session_id: 'cx-1', total_tokens: 187_000, cost_usd: null, observed_at: observed }],
        quotas: [
          { label: '1-week', used_percent: 97, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 86400, observed_at: observed },
        ],
      },
    ];

    const rings = computeActiveProviderRings([], reports, now);
    expect(rings).toHaveLength(2);
    const claudeRing = rings.find((r) => r.provider === 'claude-code')!;
    const codexRing = rings.find((r) => r.provider === 'codex')!;

    expect(claudeRing.percentRemaining).toBe(45);
    expect(claudeRing.fiveHourRemaining).toBe(45);
    expect(claudeRing.oneWeekRemaining).toBe(20);
    expect(claudeRing.previewSummary).toBe('Claude · 5h 45% · 1w 20% · 42k tokens');

    expect(codexRing.percentRemaining).toBe(3);
    expect(codexRing.fiveHourRemaining).toBeNull();
    expect(codexRing.oneWeekRemaining).toBe(3);
    expect(codexRing.previewSummary).toBe('Codex · 1w 3% · 187k tokens');
  });

  it('keeps providers with active quota visible alongside another provider active session', () => {
    const observed = '2026-11-23T14:50:30Z';
    const agents = [makeAgent({ id: 'ag-1', provider: 'antigravity', tokenUsage: 95_000, usageObservedAt: observed })];
    const reports: ProviderUsageReport[] = [
      {
        schema_version: 1,
        provider: 'codex',
        source: 'session-log',
        sessions: [{ session_id: 'cx-1', total_tokens: 187_000, cost_usd: null, observed_at: observed }],
        quotas: [
          { label: '5-hour', used_percent: 55, window_minutes: 300, resets_at: Math.floor(now / 1000) + 3600, observed_at: observed },
          { label: '1-week', used_percent: 31, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 86400, observed_at: observed },
        ],
      },
    ];

    const rings = computeActiveProviderRings(agents, reports, now);
    expect(rings.map((r) => r.provider)).toEqual(['antigravity', 'codex']);
    expect(rings[1].metric).toBe('quota');
    expect(rings[1].percentRemaining).toBe(45);
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

  it('includes 5-hour, 1-week quota windows and token consumption together even when observed >15m ago if unexpired', () => {
    const olderObserved = '2026-11-23T14:00:00Z';
    const reports: ProviderUsageReport[] = [
      {
        schema_version: 1,
        provider: 'codex',
        source: 'session-log',
        sessions: [{ session_id: 'cx-1', total_tokens: 187_000, cost_usd: null, observed_at: olderObserved }],
        quotas: [
          { label: '1-week', used_percent: 31, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 86400, observed_at: olderObserved },
          { label: '5-hour', used_percent: 90, window_minutes: 300, resets_at: Math.floor(now / 1000) + 3600, observed_at: olderObserved },
        ],
      },
    ];

    const rings = computeActiveProviderRings([], reports, now);
    expect(rings).toHaveLength(1);
    expect(rings[0].provider).toBe('codex');
    expect(rings[0].percentRemaining).toBe(10);
    expect(rings[0].fiveHourRemaining).toBe(10);
    expect(rings[0].oneWeekRemaining).toBe(69);
    expect(rings[0].tokenLabel).toBe('187k');
    expect(rings[0].metric).toBe('quota');
    expect(rings[0].detail).toBe('Codex: 5-hour 10% left · 1-week 69% left · 187k tokens');
    expect(rings[0].previewSummary).toBe('Codex · 5h 10% · 1w 69% · 187k tokens');
  });
});

describe('PillUsageRing component', () => {
  const now = Date.parse('2026-11-23T14:51:00Z');
  const observed = '2026-11-23T14:50:30Z';

  it('wraps the provider icon inside the circular SVG progress ring and supports left/right flanking alignment', () => {
    const reports: ProviderUsageReport[] = [
      {
        schema_version: 1,
        provider: 'claude-code',
        source: 'statusline',
        sessions: [{ session_id: 'cl-1', total_tokens: 42_000, cost_usd: null, observed_at: observed }],
        quotas: [
          { label: '5-hour', used_percent: 55, window_minutes: 300, resets_at: Math.floor(now / 1000) + 3600, observed_at: observed },
          { label: '1-week', used_percent: 25, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 86400, observed_at: observed },
        ],
      },
    ];
    const [ring] = computeActiveProviderRings([], reports, now);

    const leftHtml = renderToStaticMarkup(<PillUsageRing ring={ring} align="left" />);
    expect(leftHtml).toContain('class="pill-ring-gauge"');
    expect(leftHtml).toContain('viewBox="0 0 24 24"');
    expect(leftHtml).toContain('stroke-linecap="round"');
    expect(leftHtml).toContain('transform="rotate(-90 12 12)"');
    expect(leftHtml).toContain('class="pill-ring-icon"');
    expect(leftHtml).toContain('>45%<');
    expect(leftHtml.indexOf('pill-ring-gauge')).toBeLessThan(leftHtml.indexOf('>45%<'));

    const rightHtml = renderToStaticMarkup(<PillUsageRing ring={ring} align="right" />);
    expect(rightHtml).toContain('pill-ring--align-right');
    expect(rightHtml.indexOf('>45%<')).toBeLessThan(rightHtml.indexOf('pill-ring-gauge'));
  });

  it('renders the custom image icon inside the ring for Antigravity', () => {
    const [ring] = computeActiveProviderRings(
      [makeAgent({ id: 'ag-1', provider: 'antigravity', tokenUsage: 42_000, usageObservedAt: observed })],
      [],
      now,
    );
    const html = renderToStaticMarkup(<PillUsageRing ring={ring} align="left" />);
    expect(html).toContain('class="pill-ring-icon"');
    expect(html).toContain('class="provider-icon-img"');
    expect(html).toContain('antigravity-icon.png');
  });
});
