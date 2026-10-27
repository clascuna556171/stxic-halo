import { PROVIDER_NAMES } from './sessionSummary';
import type { Agent, AgentEvent, ProofSummary } from '../types';
import { displayPath } from './agentEvents';

export const workspaceIdentity = (path: string) => {
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/+$/, '') || '/';
  return /^(?:[a-z]:|\/\/)/i.test(normalized) ? normalized.toLowerCase() : normalized;
};
const time = (value: string) => Date.parse(value) || 0;

export function activityWorkspaces(agents: readonly Agent[], events: readonly AgentEvent[]) {
  const groups = new Map<string, { key: string; path: string; label: string; lastSeen: number; sessionIds: Set<string>; proof: ProofSummary | null }>();
  const add = (path: string | undefined, session: string, timestamp: string, proof?: ProofSummary | null) => {
    // Display names are not filesystem paths and must never be used to execute a check.
    if (!path || !/^(?:[a-z]:[\\/]|[\\/])/i.test(path)) return;
    const key = workspaceIdentity(path);
    const group = groups.get(key) ?? { key, path, label: displayPath(path), lastSeen: 0, sessionIds: new Set<string>(), proof: null };
    group.lastSeen = Math.max(group.lastSeen, time(timestamp));
    group.sessionIds.add(session);
    if (proof && (!group.proof || proofTime(proof) > proofTime(group.proof))) group.proof = proof;
    groups.set(key, group);
  };
  agents.forEach(a => add(a.workspacePath, a.id, a.lastSeen, a.proof));
  events.forEach(e => add(e.cwd, e.session_id, e.timestamp));
  return [...groups.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

export function recentActivity(events: readonly AgentEvent[], path?: string, sessionIds?: ReadonlySet<string>) {
  const seen = new Set<string>();
  return events.filter(e => !path || (e.cwd ? workspaceIdentity(e.cwd) === workspaceIdentity(path) : sessionIds?.has(e.session_id)))
    .filter(e => {
      const key = JSON.stringify([e.source, e.session_id, e.timestamp, e.event, e.tool_name, e.cwd]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).sort((a, b) => time(b.timestamp) - time(a.timestamp));
}

export function activityLabel(event: AgentEvent) {
  const tools: Record<string, string> = { Bash: 'Running a command', CommandExecution: 'Running a command', task_started: 'Working on a task', Read: 'Reading a file', Write: 'Writing a file', Edit: 'Editing a file', Grep: 'Searching files', Glob: 'Finding files' };
  switch (event.event) {
    case 'SessionStart': return 'Session started';
    case 'UserPromptSubmit': return 'New request started';
    case 'PreInvocation': return 'Model started working';
    case 'PostInvocation': return 'Model invocation finished';
    case 'SessionEnd': return 'Session ended';
    case 'PermissionRequest': return 'Waiting for your approval';
    case 'PreToolUse': return tools[event.tool_name ?? ''] ?? (event.tool_name ? `Using ${event.tool_name}` : 'Started an action');
    case 'PostToolUse': return event.tool_name ? `${event.tool_name} finished` : 'Action finished';
    case 'Stop': return 'Agent finished its turn';
    case 'Error': return 'Agent reported a problem';
    default: return 'Session updated';
  }
}

function proofTime(proof: ProofSummary) { return proof.evidenceTimestamp ?? proof.evidence_timestamp ?? 0; }

export function applyWorkspaceChecks(agents: Agent[], checks: Readonly<Record<string, ProofSummary>>): Agent[] {
  return agents.map(agent => {
    const proof = agent.workspacePath ? checks[workspaceIdentity(agent.workspacePath)] : undefined;
    return proof && (!agent.proof || proofTime(proof) >= proofTime(agent.proof)) ? { ...agent, proof } : agent;
  });
}

export function checkSummary(proof: ProofSummary | null | undefined) {
  const failed = proof?.testsFailed ?? proof?.tests_failed;
  const passed = proof?.testsPassed ?? proof?.tests_passed;
  return {
    files: proof?.git ? (proof.git.total_changed ? `${proof.git.total_changed} changed files` : 'No file changes') : proof ? 'Git status unavailable' : 'Files not checked',
    tests: failed && failed > 0 ? `${failed} tests failed` : proof?.verified && passed && passed > 0 ? `${passed} tests passed` : passed != null ? 'No passing tests confirmed' : 'Tests not run',
    failed: Boolean(failed && failed > 0),
  };
}

export function filterActivity(events: readonly AgentEvent[], provider: string, eventType: string) {
  return events.filter(event => provider === 'all' || (provider === 'other' ? !(event.source in PROVIDER_NAMES) || event.source === 'other' : event.source === provider))
    .filter(event => eventType === 'all' || (eventType === 'attention' ? ['PermissionRequest', 'Error'].includes(event.event) : event.event === eventType));
}
