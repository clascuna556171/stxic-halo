import type {
  Agent,
  AgentEvent,
  AgentProviderAdapter,
  AgentStatus,
  AlertItem,
  NotificationPolicyContract,
  Provider,
  UserSettings,
  WorkspaceConflict,
} from '../types';

const EVENT_STATUS: Record<string, AgentStatus> = {
  SessionStart: 'working',
  PreToolUse: 'working',
  PostToolUse: 'working',
  PermissionRequest: 'waiting',
  Error: 'error',
  Stop: 'completed',
  SessionEnd: 'completed',
};

const SUPPORTED_SOURCES: Record<string, { provider: Provider; name: string }> = {
  'claude-code': { provider: 'claude-code', name: 'Claude Code' },
  codex: { provider: 'codex', name: 'Codex' },
};

export function statusForEvent(event: string): AgentStatus {
  return EVENT_STATUS[event] ?? 'unknown';
}

export function displayPath(path: string): string {
  return (path.split(/[\\/]/).filter(Boolean).pop() || 'Workspace').slice(0, 60);
}

export function isSessionStale(
  lastSeenIso: string,
  status: AgentStatus,
  nowMs = Date.now(),
  staleMinutes = 15
): boolean {
  if (status !== 'working' && status !== 'waiting') return false;
  const parsed = new Date(lastSeenIso).getTime();
  if (!Number.isFinite(parsed)) return false;
  return nowMs - parsed > staleMinutes * 60_000;
}

function describeTask(event: AgentEvent, status: AgentStatus, previousTask?: string): string {
  if (event.event === 'PermissionRequest') {
    return event.tool_name
      ? `Approval required · ${event.tool_name.slice(0, 48)}`
      : 'Approval required';
  }
  if ((event.event === 'PreToolUse' || event.event === 'PostToolUse') && event.tool_name) {
    return `Using ${event.tool_name.slice(0, 48)}`;
  }
  if (status === 'waiting') return 'Approval required';
  if (status === 'error') return 'Session reported an execution error';
  if (status === 'completed') return 'Agent stopped responding';
  return previousTask ?? 'Session detected';
}

/**
 * Sanitized hook events contain no prompts, tool arguments, transcripts, or credentials.
 * Reduces chronological JSONL hook records into up to 16 active/recent sessions.
 */
export function sessionsFromEvents(
  events: AgentEvent[],
  options?: { nowMs?: number; staleMinutes?: number }
): Agent[] {
  const nowMs = options?.nowMs ?? Date.now();
  const staleMinutes = options?.staleMinutes ?? 15;
  const sessions = new Map<string, Agent>();

  for (const event of events) {
    if (event.schema_version !== 1 || !event.session_id) continue;
    const sourceMeta = SUPPORTED_SOURCES[event.source];
    if (!sourceMeta) continue;

    const existing = sessions.get(event.session_id);
    const nextStatus = statusForEvent(event.event);
    const resolvedStatus =
      nextStatus === 'unknown' ? (existing?.status ?? 'unknown') : nextStatus;
    const workspace = event.cwd ? displayPath(event.cwd) : existing?.workspace ?? 'Workspace';

    sessions.set(event.session_id, {
      id: event.session_id,
      provider: sourceMeta.provider,
      name: sourceMeta.name,
      task: describeTask(event, resolvedStatus, existing?.task),
      workspace,
      status: resolvedStatus,
      contextPercent: null, // Hook lifecycle events do not provide context window percentage.
      tokenUsage: null, // Hook lifecycle events do not provide token counts.
      lastSeen: event.timestamp,
      proof: null, // Stop hook is never treated as verified Proof-of-Work.
      isDemo: false,
      isStale: isSessionStale(event.timestamp, resolvedStatus, nowMs, staleMinutes),
      // First reported cwd = launch directory, which is what the provider process runs in.
      workspacePath: existing?.workspacePath ?? event.cwd ?? undefined,
    });
  }

  return [...sessions.values()].reverse().slice(0, 16);
}

export const claudeCodeAdapter: AgentProviderAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code (PowerShell hook)',
  bridgePath: 'scripts/claude-hook.ps1 → %LOCALAPPDATA%\\STXICHalo\\events.jsonl',
  status: 'active',
  capabilities: {
    lifecycle: true,
    tokenUsage: false,
    contextWindow: false,
    approvals: true,
    proofOfWork: false,
  },
  reduceEvents(events, options) {
    return sessionsFromEvents(
      events.filter((e) => e.source === 'claude-code'),
      options
    );
  },
};

import { codexAdapter } from './codexAdapter';

export const codexPlannedAdapter: AgentProviderAdapter = codexAdapter;

export const PROVIDER_ADAPTERS: readonly AgentProviderAdapter[] = [
  claudeCodeAdapter,
  codexAdapter,
];

export function buildAlertKey(agent: Agent): string {
  const failed = agent.proof?.testsFailed ?? 0;
  return `${agent.id}:${agent.status}:${failed}:${agent.lastSeen}`;
}

export function normalizeWorkspacePath(path: string): string {
  return path.trim().toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
}

export function detectWorkspaceConflicts(agents: Agent[]): WorkspaceConflict[] {
  const active = agents.filter(
    (a) => !a.isDemo && (a.status === 'working' || a.status === 'waiting')
  );
  const byWorkspace = new Map<string, Agent[]>();

  for (const agent of active) {
    const raw = agent.workspacePath || agent.workspace;
    const key = normalizeWorkspacePath(raw);
    if (!key) continue;
    const group = byWorkspace.get(key) ?? [];
    group.push(agent);
    byWorkspace.set(key, group);
  }

  const conflicts: WorkspaceConflict[] = [];

  for (const [, group] of byWorkspace.entries()) {
    if (group.length > 1) {
      const session_ids = group.map((a) => a.id);
      const session_names = group.map((a) => a.name);
      const providers = Array.from(new Set(group.map((a) => a.provider)));

      const fileSets = group.map(
        (a) => new Set((a.proof?.git?.files ?? []).map((f) => f.path.toLowerCase()))
      );
      const intersectingFiles: string[] = [];
      if (fileSets.length >= 2 && fileSets[0].size > 0 && fileSets[1].size > 0) {
        for (const f of fileSets[0]) {
          if (fileSets.slice(1).some((s) => s.has(f))) {
            intersectingFiles.push(f);
          }
        }
      }

      const detail =
        intersectingFiles.length > 0
          ? `${session_names.join(' and ')} are concurrently modifying ${intersectingFiles.length} common file${intersectingFiles.length === 1 ? '' : 's'} (${intersectingFiles.slice(0, 3).join(', ')}) in ${group[0].workspace}.`
          : `${session_names.join(' and ')} (${providers.join(', ')}) are concurrently active in ${group[0].workspace}. Potential Git lock and file overwrite risk.`;

      conflicts.push({
        workspace: group[0].workspace,
        session_ids,
        session_names,
        providers,
        detail,
      });
    }
  }

  return conflicts;
}

export const notificationPolicy: NotificationPolicyContract = {
  evaluate(
    agents: Agent[],
    settings: Pick<UserSettings, 'alert_on_waiting' | 'alert_on_failure'>,
    acknowledgedKeys: ReadonlySet<string>
  ): AlertItem[] {
    const alerts: AlertItem[] = [];

    // Evaluate workspace concurrency conflicts (Phase 2)
    const conflicts = detectWorkspaceConflicts(agents);
    for (const conflict of conflicts) {
      const key = `conflict:${[...conflict.session_ids].sort().join('+')}:${normalizeWorkspacePath(conflict.workspace)}`;
      if (acknowledgedKeys.has(key)) {
        continue;
      }
      const primaryAgent = agents.find((a) => a.id === conflict.session_ids[0]) ?? agents[0];
      alerts.push({
        key,
        agent: primaryAgent,
        severity: 'warning',
        reason: 'workspace-conflict',
        headline: `Workspace collision: ${conflict.session_names.join(' & ')}`,
        detail: conflict.detail,
        conflict,
      });
    }

    for (const agent of agents) {
      const failedCount = agent.proof?.testsFailed ?? 0;
      const isWaiting = agent.status === 'waiting';
      const isError = agent.status === 'error';
      const hasTestFailure = failedCount > 0;

      if (isWaiting && !settings.alert_on_waiting && !hasTestFailure) {
        continue;
      }
      if ((hasTestFailure || isError) && !settings.alert_on_failure && !isWaiting) {
        continue;
      }

      if (!isWaiting && !isError && !hasTestFailure) {
        continue;
      }

      const key = buildAlertKey(agent);
      if (acknowledgedKeys.has(key)) {
        continue;
      }

      const reason: AlertItem['reason'] = hasTestFailure
        ? 'tests-failed'
        : isError
          ? 'agent-error'
          : 'permission-waiting';

      const headline = hasTestFailure
        ? `${agent.name} · ${failedCount} test${failedCount === 1 ? '' : 's'} failed in sample verification`
        : isError
          ? `${agent.name} · Session execution error`
          : `${agent.name} · Permission request waiting`;

      const detail =
        hasTestFailure && agent.proof
          ? `${agent.proof.changedFiles !== null ? `${agent.proof.changedFiles} files Δ · ` : ''}${agent.proof.testsPassed ?? 0} passed · ${failedCount} failed (unverified)`
          : agent.task;

      alerts.push({
        key,
        agent,
        severity: hasTestFailure || isError ? 'error' : 'warning',
        reason,
        headline,
        detail,
      });
    }

    return alerts;
  },
};
