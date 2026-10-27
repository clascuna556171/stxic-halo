import { useState } from 'react';
import { haloRetention, isDesktop, type RetentionPreview } from '../lib/desktop';

export function DataControls() {
  const [days, setDays] = useState(() => { try { const n = Number(localStorage.getItem('stxic.halo.retentionDays')); return [7, 30, 90].includes(n) ? n : 30; } catch { return 30; } });
  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (clean: boolean) => {
    setBusy(true); setMessage('');
    try { const result = await haloRetention(days, clean); setPreview(clean ? null : result); setMessage(clean ? `Removed ${result.files} files${result.errors ? `; ${result.errors} could not be removed` : ''}.` : ''); }
    catch (error) { setMessage(String(error)); } finally { setBusy(false); }
  };
  return <details className="settings-card data-controls"><summary>Local data &amp; retention</summary>
    <p>Halo stores activity from enabled hooks and local usage snapshots on this device. The log readers above use local files; these sources do not send provider requests.</p>
    <p>Cleanup covers only Halo’s rotated activity backup and generated Claude and OpenCode usage snapshots. It leaves the active event log, provider-owned logs, settings, and manually supplied exports untouched.</p>
    <label>Remove files older than <select value={days} onChange={event => { const n = Number(event.target.value); setDays(n); setPreview(null); try { localStorage.setItem('stxic.halo.retentionDays', String(n)); } catch { /* Session only. */ } }}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label>
    <button type="button" className="inline-action" disabled={!isDesktop() || busy} onClick={() => void run(false)}>Preview cleanup</button>
    {preview && <div><p>{preview.files} files · {(preview.bytes / 1024).toFixed(1)} KB eligible{preview.errors ? ` · ${preview.errors} unavailable` : ''}</p><button type="button" className="inline-action" disabled={!preview.files || busy} onClick={() => void run(true)}>Remove eligible files</button></div>}
    <p role="status">{message}</p>
  </details>;
}
