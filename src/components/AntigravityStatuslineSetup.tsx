import { useEffect, useState } from 'react';
import {
  checkAntigravityStatuslineStatus,
  disableAntigravityStatusline,
  enableAntigravityStatusline,
  isDesktop,
  prepareAntigravityStatusline,
  type ClaudeStatuslineStatus,
} from '../lib/desktop';

export function AntigravityStatuslineSetup() {
  const [status, setStatus] = useState<ClaudeStatuslineStatus | null>(null);
  const [manualCommand, setManualCommand] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isDesktop()) return;
    let active = true;
    void checkAntigravityStatuslineStatus()
      .then((res) => {
        if (!active) return;
        setStatus(res);
        if (res.state === 'custom-configured') {
          setManualCommand(res.command);
          setShowManual(true);
        }
      })
      .catch((err) => {
        if (active) setError(String(err));
      });
    return () => {
      active = false;
    };
  }, []);

  const activeCommand = manualCommand || status?.command || '';
  const manualPayload = activeCommand
    ? JSON.stringify({ statusLine: { type: 'command', command: activeCommand, stack_with_default: true } }, null, 2)
    : '';

  const handleEnable = () => {
    setError('');
    setCopied(false);
    setBusy(true);
    void enableAntigravityStatusline()
      .then((res) => {
        setStatus(res);
        if (res.state === 'custom-configured') {
          setManualCommand(res.command);
          setShowManual(true);
        }
      })
      .catch((err) => setError(String(err)))
      .finally(() => setBusy(false));
  };

  const handleDisable = () => {
    setError('');
    setCopied(false);
    setBusy(true);
    void disableAntigravityStatusline()
      .then((res) => {
        setStatus(res);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setBusy(false));
  };

  const handlePrepareManual = () => {
    setError('');
    setCopied(false);
    setBusy(true);
    void prepareAntigravityStatusline()
      .then((cmd) => {
        setManualCommand(cmd);
        setShowManual(true);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setBusy(false));
  };

  const handleCopy = () => {
    if (!manualPayload) return;
    setError('');
    setCopied(false);
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setError('Select and copy the entry above.');
      return;
    }
    void navigator.clipboard
      .writeText(manualPayload)
      .then(() => setCopied(true))
      .catch(() => setError('Select and copy the entry above.'));
  };

  const state = status?.state ?? 'not-configured';
  const summarySuffix = state === 'halo-configured'
    ? 'Enabled'
    : state === 'custom-configured'
      ? 'Custom detected'
      : 'Optional';

  return <details className="settings-card statusline-setup">
    <summary>Antigravity CLI (agy) quota · {summarySuffix}</summary>
    <p>Shows live % quota rings from interactive <strong>Antigravity CLI</strong> (<code>agy</code> in terminal) using <code>stack_with_default: true</code> so your built-in bar stays intact. Antigravity Desktop/IDE reports tokens only. Halo backs up your settings before enabling and never overwrites an existing custom status line.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
      {state === 'halo-configured' ? (
        <button type="button" className="inline-action" disabled={!isDesktop() || busy} onClick={handleDisable}>
          {busy ? 'Disabling…' : 'Disable status line'}
        </button>
      ) : state === 'custom-configured' ? (
        <button type="button" className="inline-action" disabled={!isDesktop() || busy} onClick={handlePrepareManual}>
          {busy ? 'Preparing…' : 'Refresh manual command'}
        </button>
      ) : (
        <>
          <button type="button" className="inline-action" disabled={!isDesktop() || busy} onClick={handleEnable}>
            {busy ? 'Enabling…' : 'Enable one-click'}
          </button>
          <button type="button" className="inline-action" disabled={!isDesktop() || busy} onClick={handlePrepareManual}>
            Manual JSON
          </button>
        </>
      )}
    </div>
    {status?.message && <p className="connection-note" role="status">{status.message}</p>}
    {showManual && manualPayload && <div className="statusline-command">
      <p>{state === 'custom-configured'
        ? 'A custom statusLine already exists in ~/.gemini/antigravity-cli/settings.json. Keep your existing command and integrate this script manually only if you can preserve its output.'
        : 'Add this entry to ~/.gemini/antigravity-cli/settings.json and restart agy. Remove the entry to disconnect.'}</p>
      <code>{manualPayload}</code>
      <button type="button" className="inline-action" onClick={handleCopy}>Copy settings entry</button>
      {copied && <p className="connection-note" role="status">Copied settings entry.</p>}
    </div>}
    {error && <p className="connection-error" role="alert">{error}</p>}
  </details>;
}
