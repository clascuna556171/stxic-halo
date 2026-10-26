import { relativeTime } from '../lib/format';
import { isDesktop } from '../lib/desktop';
import { PROVIDER_NAMES } from '../lib/sessionSummary';
import { providerUsage, quotaState, usageAge, USAGE_PROVIDERS } from '../lib/usage';
import type { Agent, UsageReadResult } from '../types';

const money = (value: number) => new Intl.NumberFormat(undefined, {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4,
}).format(value);

export function UsageOverview({ agents, result }: { agents: Agent[]; result: UsageReadResult }) {
  return <section className="usage-overview" aria-label="Provider usage and limits">
    <div className="section-heading"><h2>Usage &amp; limits</h2><span className="subtle-label">All providers</span></div>
    {!isDesktop() && <p className="usage-unavailable">Browser preview. Local usage readings appear in the desktop app.</p>}
    {USAGE_PROVIDERS.map(provider => <ProviderUsageSection key={provider} provider={provider} agents={agents} result={result} />)}
    <p className="usage-footnote">Session totals do not measure subscription allowance. Reported cost may differ from your bill.</p>
    {result.errors.length > 0 && <p className="connection-error" role="alert">{result.errors.join(' ')}</p>}
  </section>;
}

const missingReadings = {
  codex: { quota: 'No quota snapshot in the local Codex logs yet.', session: 'Start a Codex task with the log adapter enabled to receive token totals.' },
  'claude-code': { quota: 'Claude sends quota through its status line, not lifecycle hooks. No usage export is connected.', session: 'Claude lifecycle hooks report activity only. Tokens and cost need a separate usage source.' },
  antigravity: { quota: 'Antigravity hooks do not report quota. Check /usage in Antigravity for your account limits.', session: 'Antigravity hooks report activity only; token totals and cost are not included.' },
  'github-copilot': { quota: 'Copilot session logs do not provide account allowance. Check /usage in Copilot.', session: 'No recorded usage yet. Copilot CLI saves session totals in checkpoints and on shutdown.' },
  opencode: { quota: 'OpenCode does not publish account quota through this plugin. Check your model provider’s usage page.', session: 'Connect OpenCode in Settings, then finish a turn to publish tokens and reported cost.' },
};

function ProviderUsageSection({ provider, agents, result }: { provider: typeof USAGE_PROVIDERS[number]; agents: Agent[]; result: UsageReadResult }) {
  const usage = providerUsage(provider, agents, result.reports);
  const reported = usage.sessions.length > 0 || usage.quotas.length > 0;
  return <section className="usage-provider" aria-label={`${PROVIDER_NAMES[provider]} usage`}>
    <div className="usage-provider-heading"><h3>{PROVIDER_NAMES[provider]}</h3><span>{reported ? 'Recorded usage' : 'No reading yet'}</span></div>
    <div className="usage-account">
      <h4>Subscription quota</h4>
      {usage.quotas.length ? usage.quotas.map(quota => {
        const state = quotaState(quota)!;
        return <div className="usage-quota" key={quota.label}>
          <div className="usage-quota-heading"><span>{quota.label}{quota.window_minutes ? ` · ${quota.window_minutes.toLocaleString()} min` : ''}</span>
            <strong>{state.expired ? 'Awaiting refresh' : `${state.remaining}% left${state.stale ? ' (last report)' : ''}`}</strong></div>
          {!state.stale && <meter min={0} max={100} value={100 - quota.used_percent} aria-label={`${PROVIDER_NAMES[provider]} ${quota.label} remaining quota`} />}
          <p>{state.resetMs ? `${state.expired ? 'Reported reset' : 'Resets'} ${new Date(state.resetMs).toLocaleString()}` : 'Reset time unavailable'}</p>
          <small>{quota.source} · {relativeTime(quota.observed_at)}{state.stale ? ' · needs refresh' : ''}</small>
        </div>;
      }) : <p className="usage-unavailable">{missingReadings[provider].quota}</p>}
    </div>
    <div className="usage-sessions">
      <h4>Session usage</h4>
      {usage.sessions.length ? usage.sessions.map(session => {
        const agent = agents.find(a => a.provider === provider && (a.id === session.session_id || a.id === `${provider}:${session.session_id}`));
        return <div className="usage-session" key={session.session_id}>
          <strong title={session.session_id}>{agent?.workspace ?? `Session ${session.session_id.slice(0, 12)}`}</strong>
          <dl><div><dt>Tokens used</dt><dd>{session.total_tokens === null ? 'Not reported' : session.total_tokens.toLocaleString()}</dd></div>
            <div><dt>Reported cost</dt><dd>{session.cost_usd === null ? 'Not reported' : money(session.cost_usd)}</dd></div>
            {session.premium_requests != null && <div><dt>Premium requests</dt><dd>{session.premium_requests.toLocaleString()}</dd></div>}</dl>
          <small>{session.source} · {relativeTime(session.observed_at)}{usageAge(session.observed_at) === 'stale' ? ' · last report' : ''}</small>
        </div>;
      }) : <p className="usage-unavailable">{missingReadings[provider].session}</p>}
    </div>
  </section>;
}
