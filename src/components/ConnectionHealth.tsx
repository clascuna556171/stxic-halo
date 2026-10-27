import { useEffect, useState } from 'react';
import { isDesktop, readProviderConnections } from '../lib/desktop';
import { PROVIDER_NAMES } from '../lib/sessionSummary';
import { USAGE_PROVIDERS } from '../lib/usage';
import { relativeTime } from '../lib/format';
import { ProviderIcon } from './ProviderIcon';
import type { Agent, ClaudeHookStatus, ProviderConnection } from '../types';

export function ConnectionHealth({ agents, claudeHookStatus, codexLogsEnabled, onConnect }: {
  agents: Agent[]; claudeHookStatus?: ClaudeHookStatus | null; codexLogsEnabled: boolean; onConnect: () => void;
}) {
  const [connections, setConnections] = useState<ProviderConnection[] | null>(null);
  useEffect(() => {
    let active = true;
    if (isDesktop()) void readProviderConnections().then(value => { if (active) setConnections(value); }).catch(() => { if (active) setConnections(null); });
    return () => { active = false; };
  }, []);
  return <details className="connection-health">
    <summary>Provider connection health</summary>
    <p>Configuration and observed activity only. This does not check account access or provider service status.</p>
    {USAGE_PROVIDERS.map(provider => {
      const recent = agents.filter(agent => agent.provider === provider && !agent.isDemo).sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))[0];
      const installed = provider === 'codex' ? codexLogsEnabled : provider === 'claude-code' ? claudeHookStatus?.installed : connections?.find(c => c.provider === provider)?.installed;
      const status = !isDesktop() ? 'Desktop app required' : installed === undefined ? 'Configuration unknown' : installed ? (provider === 'codex' ? 'Log adapter enabled' : 'Bridge configured') : (provider === 'codex' ? 'Log adapter off' : 'Setup needed');
      return <div className="connection-health-row" key={provider}>
        <span className="provider-label"><ProviderIcon provider={provider} /><strong>{PROVIDER_NAMES[provider]}</strong></span>
        <span>{status}{recent ? ` · Last activity ${relativeTime(recent.lastSeen)}` : ' · No activity observed'}</span>
      </div>;
    })}
    <button type="button" className="inline-action" onClick={onConnect}>Manage connections</button>
  </details>;
}
