import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UsageOverview } from '../src/components/UsageOverview';
import type { UsageReadResult } from '../src/types';

describe('usage panel', () => {
  const observed_at = new Date().toISOString();
  const result: UsageReadResult = { reports: [{ schema_version: 1, provider: 'codex',
    sessions: [{ session_id: 'session', total_tokens: 0, cost_usd: 0, observed_at }],
    quotas: [{ label: 'Weekly', used_percent: 20, resets_at: Math.floor(Date.now() / 1000) + 3600, observed_at }],
  }], errors: [] };
  it('renders reported quota, reset, true zero usage and cost with separate headings', () => {
    const html = renderToStaticMarkup(<UsageOverview agents={[]} result={result} />);
    expect(html).toContain('80% left');
    expect(html).toContain('Resets ');
    expect(html).toContain('<meter');
    expect(html).toContain('>0</dd>');
    expect(html).toContain('$0.00');
    expect(html).toContain('Subscription quota');
    expect(html).toContain('Session usage');
    expect(html).toContain('Reported cost');
    expect(html).toContain('Antigravity');
    expect(html).toContain('GitHub Copilot');
    expect(html).toContain('OpenCode');
  });
  it('renders expired windows as awaiting refresh without a misleading progress meter', () => {
    const expired = { ...result, reports: [{ ...result.reports[0], quotas: [{ ...result.reports[0].quotas[0], resets_at: 1 }] }] };
    const html = renderToStaticMarkup(<UsageOverview agents={[]} result={expired} />);
    expect(html).toContain('Awaiting refresh');
    expect(html).not.toContain('<meter');
    expect(html).not.toContain('80% left');
  });
  it('shows all five providers together without a selector or hidden provider sections', () => {
    const html = renderToStaticMarkup(<UsageOverview agents={[]} result={{ reports: [], errors: [] }} />);
    for (const provider of ['Codex', 'Claude', 'Antigravity', 'GitHub Copilot', 'OpenCode']) {
      expect(html).toContain(`aria-label="${provider} usage"`);
      expect(html).toContain(`<h3>${provider}</h3>`);
    }
    expect(html).not.toContain('<select');
    expect(html).not.toContain('<details');
    expect(html).toContain('Connect OpenCode in Settings');
    expect(html).toContain('Claude sends quota through its status line');
    expect(html).toContain('Check /usage in Antigravity');
  });
  it('shows usage from multiple providers simultaneously and keeps premium requests separate from dollars', () => {
    const mixed: UsageReadResult = { reports: [...result.reports, { schema_version: 1, provider: 'github-copilot', source: 'session-log',
      sessions: [{ session_id: 'copilot-session', total_tokens: 123456, cost_usd: null, premium_requests: 1.5, observed_at }], quotas: [] }], errors: [] };
    const html = renderToStaticMarkup(<UsageOverview agents={[]} result={mixed} />);
    expect(html).toContain('80% left');
    expect(html).toContain((123456).toLocaleString());
    expect(html).toContain('Premium requests');
    expect(html).toContain('>1.5</dd>');
    expect(html).not.toContain('$1.50');
  });
});
