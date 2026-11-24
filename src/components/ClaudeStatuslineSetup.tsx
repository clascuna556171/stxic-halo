import { useState } from 'react';
import { isDesktop, prepareClaudeStatusline } from '../lib/desktop';

export function ClaudeStatuslineSetup() {
  const [command, setCommand] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleCopy = () => {
    setError('');
    setCopied(false);
    const payload = JSON.stringify({ statusLine: { type: 'command', command } }, null, 2);
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setError('Select and copy the entry above.');
      return;
    }
    void navigator.clipboard
      .writeText(payload)
      .then(() => setCopied(true))
      .catch(() => setError('Select and copy the entry above.'));
  };

  return <details className="settings-card statusline-setup">
    <summary>Claude quota · optional status line</summary>
    <p>Claude can provide quota data through its status line. Halo prepares a local script; you choose how to add it in Claude Code. It does not access credentials or make requests.</p>
    <p>If you already use a custom status line, keep it and integrate the script manually only if you can preserve its output.</p>
    <button type="button" className="inline-action" disabled={!isDesktop()} onClick={() => { setError(''); setCopied(false); void prepareClaudeStatusline().then(setCommand).catch(err => setError(String(err))); }}>Prepare setup command</button>
    {command && <div className="statusline-command"><p>When no status line is configured, add this entry to your Claude Code settings JSON. Restart Claude Code. Remove the entry to disconnect. Do not replace an existing status line without preserving it.</p><code>{JSON.stringify({ statusLine: { type: 'command', command } }, null, 2)}</code><button type="button" className="inline-action" onClick={handleCopy}>Copy settings entry</button>{copied && <p className="connection-note" role="status">Copied settings entry.</p>}</div>}
    {error && <p className="connection-error" role="alert">{error}</p>}
  </details>;
}
