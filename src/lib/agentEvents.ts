import type {
  Agent,
  AgentEvent,
  AgentProviderAdapter,
  AgentStatus,
  AlertItem,
  NotificationPolicyContract,
  Provider,
  UserSettings,
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

export const notificationPolicy: NotificationPolicyContract = {
  evaluate(
    agents: Agent[],
    settings: Pick<UserSettings, 'alert_on_waiting' | 'alert_on_failure'>,
    acknowledgedKeys: ReadonlySet<string>
  ): AlertItem[] {
    const alerts: AlertItem[] = [];

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
