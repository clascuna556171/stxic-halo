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
    expect(html).toContain('0 tokens · latest session');
    expect(html).toContain('Resets ');
    expect(html).toContain('<meter');
    expect(html).toContain('value="80"');
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
  it('shows five compact provider rows with details available on demand', () => {
    const html = renderToStaticMarkup(<UsageOverview agents={[]} result={{ reports: [], errors: [] }} />);
    for (const provider of ['Codex', 'Claude', 'Antigravity', 'GitHub Copilot', 'OpenCode']) {
      expect(html).toContain(`aria-label="${provider} usage"`);
      expect(html).toContain(`<strong>${provider}</strong>`);
    }
    expect(html).not.toContain('<select');
    expect(html).toContain('<details class="usage-provider-details');
    expect(html).toContain('Limit not available');
    expect(html).toContain('Tokens not available');
    expect(html).toContain('Connect OpenCode in Settings');
    expect(html).toContain('Claude quota can be supplied by the optional status line');
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
  it('shows 5-hour and 1-week quotas alongside token consumption even when observed >15m ago if unexpired', () => {
    const olderObserved = new Date(Date.now() - 45 * 60_000).toISOString();
    const future5h = Math.floor(Date.now() / 1000) + 7200;
    const future1w = Math.floor(Date.now() / 1000) + 86400 * 4;
    const codexReport: UsageReadResult = {
      reports: [{
        schema_version: 1,
        provider: 'codex',
        source: 'session-log',
        sessions: [{ session_id: 'codex-1', total_tokens: 187500, cost_usd: null, observed_at: olderObserved }],
        quotas: [
          { label: '1-week', used_percent: 31, window_minutes: 10080, resets_at: future1w, observed_at: olderObserved },
          { label: '5-hour', used_percent: 62, window_minutes: 300, resets_at: future5h, observed_at: olderObserved },
        ],
      }],
      errors: [],
    };
    const html = renderToStaticMarkup(<UsageOverview agents={[]} result={codexReport} />);
    const fiveHourIdx = html.indexOf('<strong>5-hour</strong>');
    const oneWeekIdx = html.indexOf('<strong>1-week</strong>');
    const detailsIdx = html.indexOf('<details class="usage-provider-details"');
    expect(fiveHourIdx).toBeGreaterThan(-1);
    expect(oneWeekIdx).toBeGreaterThan(fiveHourIdx);
    expect(detailsIdx).toBeGreaterThan(oneWeekIdx);
    expect(html).toContain('usage-limit-row--healthy');
    expect(html).toContain('38% left · 62% used');
    expect(html).toContain('69% left · 31% used');
    expect(html).toContain(`${(187500).toLocaleString()} tokens · latest session`);
    expect(html).toContain('value="38"');
    expect(html).toContain('value="69"');
  });
});
