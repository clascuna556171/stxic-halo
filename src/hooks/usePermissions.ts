import { useEffect, useRef, useState } from 'react';
import { isDesktop, listPermissionRequests, respondToPermission, type PermissionRequest } from '../lib/desktop';

export function usePermissions(enabled: boolean) {
  const [requests, setRequests] = useState<PermissionRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const responding = useRef(false);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!enabled || !isDesktop()) { setRequests([]); return; }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await listPermissionRequests();
        if (active) setRequests(next);
      } catch {
        if (active) { setRequests([]); setError('Approval bridge unavailable. Review the request in Claude Code.'); }
      } finally {
        if (active) timer = setTimeout(() => void poll(), 500);
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [enabled]);

  async function decide(id: string, behavior: 'allow' | 'deny') {
    if (responding.current) return;
    responding.current = true;
    setBusy(true);
    setError(null);
    try {
      await respondToPermission(id, behavior);
      setRequests(previous => previous.filter(request => request.id !== id));
      setNotice(behavior === 'allow' ? 'Approval sent to Claude Code.' : 'Denial sent to Claude Code.');
    } catch (failure) {
      setError(String(failure));
    } finally {
      responding.current = false;
      setBusy(false);
    }
  }
  return { requests, busy, error, notice, decide };
}
