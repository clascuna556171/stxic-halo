import { useEffect, useState } from 'react';
import { isDesktop, readProviderConnections, setProviderConnection } from '../lib/desktop';
import { PROVIDER_NAMES } from '../lib/sessionSummary';
import type { BridgeProvider, ProviderConnection } from '../types';

const providers: BridgeProvider[] = ['antigravity', 'github-copilot', 'opencode'];

export function ProviderConnections() {
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [busy, setBusy] = useState<BridgeProvider | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let disposed = false;
    void readProviderConnections().then(value => { if (!disposed) { setConnections(value); setLoaded(true); } })
      .catch(() => { if (!disposed) setError('Could not read provider connections. Reopen Settings to retry.'); });
    return () => { disposed = true; };
  }, []);
  const change = async (provider: BridgeProvider, enabled: boolean) => {
    if (busy) return;
    setBusy(provider); setError(''); setNotice('');
    try {
      const result = await setProviderConnection(provider, enabled);
      setConnections(previous => [...previous.filter(c => c.provider !== provider), result]);
      setNotice(enabled ? `${PROVIDER_NAMES[provider]} bridge installed. Start a new session to receive activity.`
        : `${PROVIDER_NAMES[provider]} disconnected. Existing activity remains in history; restart the provider to unload its bridge.`);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(null); }
  };
  return <div className="provider-connections">
    {providers.map(provider => {
      const connection = connections.find(c => c.provider === provider);
      return <div className="setting-row" key={provider}>
        <div className="setting-description">
          <strong>{PROVIDER_NAMES[provider]}{provider === 'github-copilot' ? ' CLI' : ''}</strong>
          <p>{provider === 'opencode' ? 'Local plugin · activity, session tokens and reported cost.' : provider === 'github-copilot' ? 'Hooks add activity. Existing CLI logs provide tokens and premium-request totals.' : 'Local hooks · activity. Usage requires a local export.'}</p>
          <small>{connection?.installed ? 'Bridge installed · restart provider after changes' : 'Not connected'}</small>
          {connection && <details className="connection-path"><summary>Configuration file</summary><code>{connection.config_path}</code></details>}
        </div>
        <button type="button" className="inline-action" disabled={!isDesktop() || !loaded || busy !== null}
          aria-label={`${connection?.installed ? 'Disconnect' : 'Connect'} ${PROVIDER_NAMES[provider]}`}
          onClick={() => void change(provider, !connection?.installed)}>
          {busy === provider ? 'Working…' : connection?.installed ? 'Disconnect' : 'Connect'}
        </button>
      </div>;
    })}
    {!isDesktop() && <p className="connection-note">Open the desktop app to connect providers.</p>}
    <p className="connection-note">Connect installs Halo’s hooks or plugin in your user configuration. Existing entries are preserved. Requires a provider version with hook/plugin support.</p>
    {error && <p className="connection-error" role="alert">{error}</p>}
    <p className="connection-note" role="status">{notice}</p>
  </div>;
}
