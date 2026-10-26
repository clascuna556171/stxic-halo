import type { Agent, ProcessLifecycleSnapshot, Provider } from '../types';

/**
 * Hook events newer than (process table time - grace) cannot be judged yet: the provider
 * process may have started after the last table enumeration (refreshed at most every 10s).
 */
export const RECONCILE_GRACE_MS = 5_000;

const PROVIDER_PROCESS_ID: Record<Provider, string | null> = {
  'claude-code': 'claude-code',
  codex: 'codex',
  // These integrations report lifecycle through hooks/plugins. The process collector
  // cannot reliably match their IDE hosts, so absence is never evidence of exit.
  antigravity: null,
  'github-copilot': null,
  opencode: null,
  other: null,
};

export const EXITED_TASK = 'Process exited · no SessionEnd received';

/** Windows path key: unified separators, no trailing separator (except drive roots), lowercase. */
export function normalizePathKey(path: string): string {
  let s = path.trim().replace(/\//g, '\\');
  while (s.length > 3 && s.endsWith('\\')) s = s.slice(0, -1);
  return s.toLowerCase();
}

function isAncestorOrSame(ancestor: string, descendant: string): boolean {
  if (ancestor === descendant) return true;
  const prefix = ancestor.endsWith('\\') ? ancestor : `${ancestor}\\`;
  return descendant.startsWith(prefix);
}

/** True when either directory contains the other (agent may run in a sub-folder of the launch dir). */
export function pathsRelated(a: string, b: string): boolean {
  const ka = normalizePathKey(a);
  const kb = normalizePathKey(b);
  if (!ka || !kb) return false;
  return isAncestorOrSame(ka, kb) || isAncestorOrSame(kb, ka);
}

function isActive(agent: Agent): boolean {
  return agent.status === 'working' || agent.status === 'waiting';
}

function markExited(agent: Agent): Agent {
  return { ...agent, status: 'completed', task: EXITED_TASK, isStale: false, liveness: 'exited' };
}

/**
 * Reconciles hook/log-derived sessions with running provider processes.
 *
 * Rules (only for live, active sessions — working or waiting):
 * - A provider process whose cwd is the session's launch directory (or a parent/child of it)
 *   → `alive`.
 * - No provider process at all, or every provider process has a known, unrelated cwd, and the
 *   session's last event predates the process table → `exited` (status becomes completed).
 * - Anything else (unknown cwd, events newer than the table, reconciliation off) → `unverified`.
 *
 * The rules err toward `unverified`/`alive` so a running agent is never falsely reported as gone.
 */
export function reconcileSessions(
  agents: Agent[],
  snapshot: ProcessLifecycleSnapshot | null,
  options?: { enabled?: boolean }
): Agent[] {
  const enabled = options?.enabled !== false;

  return agents.map((agent) => {
    if (agent.isDemo || !isActive(agent)) return agent;
    if (!enabled || !snapshot || !snapshot.available) {
      return { ...agent, liveness: 'unverified' };
    }

    const providerId = PROVIDER_PROCESS_ID[agent.provider];
    if (!providerId) return { ...agent, liveness: 'unverified' };

    const procs = snapshot.processes.filter((p) => p.provider === providerId);
    const workspacePath = agent.workspacePath?.trim() || null;

    if (workspacePath && procs.some((p) => p.cwd && pathsRelated(p.cwd, workspacePath))) {
      return { ...agent, liveness: 'alive' };
    }

    const lastSeenMs = Date.parse(agent.lastSeen);
    const predatesSnapshot =
      Number.isFinite(lastSeenMs) && lastSeenMs + RECONCILE_GRACE_MS < snapshot.refreshed_at;

    const noProcess = procs.length === 0;
    const allUnrelated =
      workspacePath !== null && procs.length > 0 && procs.every((p) => p.cwd !== null);

    if ((noProcess || allUnrelated) && predatesSnapshot) {
      return markExited(agent);
    }
    return { ...agent, liveness: 'unverified' };
  });
}
