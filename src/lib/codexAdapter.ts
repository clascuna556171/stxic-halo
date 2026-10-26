import type {
  Agent,
  AgentEvent,
  AgentProviderAdapter,
  CodexSessionTelemetry,
} from '../types';
import { displayPath, isSessionStale, statusForEvent } from './agentEvents';

export interface ParsedCodexSession {
  sessionId: string;
  workspace: string;
  status: Agent['status'];
  task: string;
  tokenUsage: number | null;
  contextPercent: number | null;
  lastSeen: string;
  events: AgentEvent[];
}

/**
 * Parses raw JSONL lines from a ~/.codex/sessions/** /rollout-*.jsonl file.
 * Observes strict zero-leakage security guardrails:
 * Never extracts or retains prompts, instructions, message bodies, or auth secrets.
 */
export function parseCodexRolloutLines(lines: string[]): ParsedCodexSession | null {
  let sessionId = '';
  let workspace = '';
  let status: Agent['status'] = 'unknown';
  let task = 'Codex session active';
  let tokenUsage: number | null = null;
  let contextWindow: number | null = null;
  let contextPercent: number | null = null;
  let lastSeen = new Date().toISOString();
  const events: AgentEvent[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    const msgType = String(parsed.type ?? '');
    const ts = typeof parsed.timestamp === 'string' ? parsed.timestamp : lastSeen;

    if (msgType === 'session_meta' && parsed.payload && typeof parsed.payload === 'object') {
      const payload = parsed.payload as Record<string, unknown>;
      sessionId = String(payload.session_id || payload.id || '');
      workspace = String(payload.cwd || '');
      if (typeof payload.context_window === 'number') {
        contextWindow = payload.context_window;
      }
      lastSeen = ts;
      status = 'working';
      task = `Session initialized in ${displayPath(workspace) || 'workspace'}`;

      events.push({
        schema_version: 1,
        source: 'codex',
        session_id: sessionId,
        timestamp: ts,
        event: 'SessionStart',
        cwd: workspace,
      });
    } else if (msgType === 'event_msg' && parsed.payload && typeof parsed.payload === 'object') {
      const payload = parsed.payload as Record<string, unknown>;
      const eventType = String(payload.type || '');
      lastSeen = ts;

      if (eventType === 'task_started') {
        status = 'working';
        task = 'Executing task';
        events.push({
          schema_version: 1,
          source: 'codex',
          session_id: sessionId,
          timestamp: ts,
          event: 'PreToolUse',
          cwd: workspace,
          tool_name: 'task_started',
        });
      } else if (eventType === 'item_completed') {
        const item = payload.item as Record<string, unknown> | undefined;
        const itemType = String(item?.type || '');
        if (itemType === 'CommandExecution') {
          task = 'Executed shell command';
          events.push({
            schema_version: 1,
            source: 'codex',
            session_id: sessionId,
            timestamp: ts,
            event: 'PreToolUse',
            cwd: workspace,
            tool_name: 'CommandExecution',
          });
        }
      } else if (eventType === 'token_count') {
        const info = payload.info as Record<string, unknown> | undefined;
        if (info) {
          const totalUsage = info.total_token_usage as Record<string, unknown> | undefined;
          const lastUsage = info.last_token_usage as Record<string, unknown> | undefined;
          const tokens = totalUsage?.total_tokens;
          if (typeof tokens === 'number' && Number.isSafeInteger(tokens) && tokens >= 0) {
            tokenUsage = tokens;
          }
          if (typeof info.model_context_window === 'number' && info.model_context_window > 0) {
            contextWindow = info.model_context_window;
          }
          const contextTokens = lastUsage?.total_tokens;
          contextPercent = typeof contextTokens === 'number' && Number.isFinite(contextTokens) && contextTokens >= 0
            && contextWindow !== null && contextWindow > 0
            ? Math.min(100, Math.round((contextTokens / contextWindow) * 100)) : null;
        }
      } else if (eventType === 'task_complete') {
        status = 'completed';
        task = 'Task finished';
        events.push({
          schema_version: 1,
          source: 'codex',
          session_id: sessionId,
          timestamp: ts,
          event: 'Stop',
          cwd: workspace,
        });
      }
    }
  }

  if (!sessionId) return null;

  return {
    sessionId,
    workspace,
    status,
    task,
    tokenUsage,
    contextPercent,
    lastSeen,
    events,
  };
}

/**
 * Builds Agent objects from Codex events and optional telemetry summaries.
 * Correctly distinguishes multiple simultaneous sessions with separate IDs.
 */
export function reduceCodexSessions(
  events: AgentEvent[],
  options?: {
    nowMs?: number;
    staleMinutes?: number;
    telemetry?: readonly CodexSessionTelemetry[];
  }
): Agent[] {
  const sessions = new Map<string, Agent>();
  const nowMs = options?.nowMs ?? Date.now();
  const staleMinutes = options?.staleMinutes ?? 15;

  const codexEvents = events.filter((e) => e.source === 'codex');

  for (const event of codexEvents) {
    if (!event.session_id) continue;
    const existing = sessions.get(event.session_id);
    const eventStatus = statusForEvent(event.event);
    const lastSeen = event.timestamp || existing?.lastSeen || new Date().toISOString();
    const isStale = isSessionStale(lastSeen, eventStatus, nowMs, staleMinutes);

    let taskDesc = existing?.task || 'Codex activity';
    if (event.tool_name) {
      taskDesc = `Using ${event.tool_name}`;
    } else if (event.event === 'Stop') {
      taskDesc = 'Session completed';
    }

    sessions.set(event.session_id, {
      id: event.session_id,
      provider: 'codex',
      name: `Codex · ${event.session_id.slice(0, 8)}`,
      task: taskDesc,
      workspace: event.cwd ? displayPath(event.cwd) : existing?.workspace ?? 'workspace',
      status: eventStatus,
      contextPercent: existing?.contextPercent ?? null,
      tokenUsage: existing?.tokenUsage ?? null,
      lastSeen,
      proof: existing?.proof ?? null,
      isDemo: false,
      isStale,
      workspacePath: existing?.workspacePath ?? event.cwd ?? undefined,
    });
  }

  // Augment with rich telemetry (tokens, context percentage, exact workspace)
  if (options?.telemetry) {
    for (const tel of options.telemetry) {
      if (!tel.session_id) continue;
      const existing = sessions.get(tel.session_id);
      const isStale = isSessionStale(tel.last_seen, tel.status as Agent['status'], nowMs, staleMinutes);

      const agent: Agent = {
        id: tel.session_id,
        provider: 'codex',
        name: `Codex · ${tel.session_id.slice(0, 8)}`,
        task: tel.last_event === 'Stop' ? 'Task finished' : existing?.task ?? 'Codex local session',
        workspace: tel.workspace ? displayPath(tel.workspace) : existing?.workspace ?? 'workspace',
        status: (tel.status as Agent['status']) || existing?.status || 'working',
        contextPercent:
          typeof tel.context_percent === 'number'
            ? Math.round(tel.context_percent)
            : existing?.contextPercent ?? null,
        tokenUsage: typeof tel.total_tokens === 'number' ? tel.total_tokens : existing?.tokenUsage ?? null,
        contextTokens: tel.context_tokens ?? null,
        contextWindow: tel.context_window ?? null,
        usageObservedAt: tel.usage_observed_at,
        quotaWindows: tel.quota_windows ?? [],
        lastSeen: tel.last_seen || existing?.lastSeen || new Date().toISOString(),
        proof: existing?.proof ?? null,
        isDemo: false,
        isStale,
        workspacePath: tel.workspace || existing?.workspacePath,
      };

      sessions.set(tel.session_id, agent);
    }
  }

  return [...sessions.values()].reverse().slice(0, 16);
}

export const codexAdapter: AgentProviderAdapter = {
  id: 'codex',
  displayName: 'Codex CLI adapter (local session logs)',
  bridgePath: '%USERPROFILE%\\.codex\\sessions\\**\\rollout-*.jsonl',
  status: 'active',
  capabilities: {
    lifecycle: true,
    tokenUsage: true,
    contextWindow: true,
    approvals: true,
    proofOfWork: true,
  },
  reduceEvents(events, options) {
    return reduceCodexSessions(events, options);
  },
};
