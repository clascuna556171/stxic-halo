import { useEffect, useRef, useState } from 'react';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { isDesktop } from '../lib/desktop';
import { lowQuotaWarnings, USAGE_PROVIDERS } from '../lib/usage';
import { PROVIDER_NAMES } from '../lib/sessionSummary';
import { isQuietHour, quotaNotificationKey } from '../lib/notificationPolicy';
import type { Agent, UsageReadResult } from '../types';

type Provider = typeof USAGE_PROVIDERS[number];
type Preferences = { enabled: boolean; quiet: boolean; providers: Provider[] };
const KEY = 'stxic.halo.desktopQuotaNotifications';
const SEEN = 'stxic.halo.notifiedQuotaWindows';
const defaults: Preferences = { enabled: false, quiet: true, providers: [...USAGE_PROVIDERS] };
function readPreferences(): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { enabled: raw.enabled === true, quiet: raw.quiet !== false, providers: Array.isArray(raw.providers) ? USAGE_PROVIDERS.filter(p => raw.providers.includes(p)) : [...USAGE_PROVIDERS] };
  } catch { return defaults; }
}
function save(value: Preferences) { try { localStorage.setItem(KEY, JSON.stringify(value)); window.dispatchEvent(new Event('halo-notifications-change')); } catch { /* Keep disabled on failure. */ } }

export function useQuotaNotifications(agents: Agent[], result: UsageReadResult, demo: boolean) {
  const [prefs, setPrefs] = useState(readPreferences);
  const inFlight = useRef(false);
  useEffect(() => { const update = () => setPrefs(readPreferences()); window.addEventListener('halo-notifications-change', update); return () => window.removeEventListener('halo-notifications-change', update); }, []);
  useEffect(() => {
    if (!isDesktop() || demo || !prefs.enabled || isQuietHour(new Date().getHours(), prefs.quiet)) return;
    const warnings = lowQuotaWarnings(agents.filter(a => !a.isDemo), result.reports).filter(w => prefs.providers.includes(w.provider) && w.quota.resets_at);
    if (!warnings.length || inFlight.current) return;
    inFlight.current = true;
    let cancelled = false;
    void (async () => {
      if (!await isPermissionGranted() || cancelled) return;
      let seen: string[] = [];
      try { const value = JSON.parse(localStorage.getItem(SEEN) || '[]'); if (Array.isArray(value)) seen = value.filter(v => typeof v === 'string').slice(-100); } catch { return; }
      for (const w of warnings) {
        const key = quotaNotificationKey(w.provider, w.quota.label, w.quota.resets_at);
        if (!key || seen.includes(key)) continue;
        sendNotification({ title: `${PROVIDER_NAMES[w.provider]} quota`, body: `${w.quota.label}: ${w.remaining}% remaining (last reported ${new Date(w.quota.observed_at).toLocaleString()}).` });
        seen.push(key);
      }
      try { localStorage.setItem(SEEN, JSON.stringify(seen.slice(-100))); } catch { /* No persistent deduplication available. */ }
    })().catch(() => {}).finally(() => { inFlight.current = false; });
    return () => { cancelled = true; };
  }, [agents, result, demo, prefs]);
}

export function QuotaNotificationSettings() {
  const [prefs, setPrefs] = useState(readPreferences);
  const [message, setMessage] = useState('');
  const change = (next: Preferences) => { setPrefs(next); save(next); };
  return <details className="notification-settings"><summary>Desktop quota notifications</summary>
    <p>Optional alerts for fresh readings at 20% or less. One alert per reported reset window; readings without a reset time stay in Halo.</p>
    <label><input type="checkbox" checked={prefs.enabled} disabled={!isDesktop()} onChange={event => {
      if (!event.target.checked) { change({ ...prefs, enabled: false }); return; }
      void (async () => { const allowed = await isPermissionGranted() || await requestPermission() === 'granted'; if (allowed) change({ ...prefs, enabled: true }); else setMessage('Notifications are not allowed in Windows settings.'); })().catch(() => setMessage('Could not enable notifications.'));
    }} /> Enable desktop alerts</label>
    <label><input type="checkbox" checked={prefs.quiet} onChange={event => change({ ...prefs, quiet: event.target.checked })} /> Quiet hours: 10 PM–8 AM local time</label>
    <fieldset><legend>Providers</legend>{USAGE_PROVIDERS.map(provider => <label key={provider}><input type="checkbox" checked={prefs.providers.includes(provider)} onChange={event => change({ ...prefs, providers: event.target.checked ? [...prefs.providers, provider] : prefs.providers.filter(p => p !== provider) })} /> {PROVIDER_NAMES[provider]}</label>)}</fieldset>
    {message && <p role="status">{message}</p>}
  </details>;
}
