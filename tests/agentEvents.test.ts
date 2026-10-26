import { describe, expect, it } from 'vitest';
import {
  buildAlertKey,
  claudeCodeAdapter,
  detectWorkspaceConflicts,
  displayPath,
  isSessionStale,
  notificationPolicy,
  sessionsFromEvents,
  statusForEvent,
} from '../src/lib/agentEvents';
import { demoAgents } from '../src/data/demo';
import type { AgentEvent } from '../src/types';

const make = (
  event: string,
  overrides: Partial<AgentEvent> = {}
): AgentEvent => ({
  schema_version: 1,
  source: 'claude-code',
  session_id: 'abc',
  timestamp: '2026-10-25T00:00:00Z',
  event,
  cwd: 'C:\\work\\my-app',
  ...overrides,
});

describe('hook adapter & session reducer', () => {
  it('converts lifecycle events into states', () => {
    expect(statusForEvent('SessionStart')).toBe('working');
    expect(statusForEvent('PreToolUse')).toBe('working');
    expect(statusForEvent('PermissionRequest')).toBe('waiting');
    expect(statusForEvent('Error')).toBe('error');
    expect(statusForEvent('Stop')).toBe('completed');
    expect(statusForEvent('SessionEnd')).toBe('completed');
    expect(statusForEvent('Unexpected')).toBe('unknown');
  });

  it('keeps the latest session state and preserves truth guarantees', () => {
    const sessions = sessionsFromEvents([
      make('SessionStart'),
      make('PreToolUse', { tool_name: 'Bash' }),
      make('PermissionRequest', { tool_name: 'Bash' }),
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('waiting');
    expect(sessions[0].task).toContain('Approval required');
    expect(sessions[0].contextPercent).toBeNull();
    expect(sessions[0].tokenUsage).toBeNull();
    expect(sessions[0].proof).toBeNull();
  });

  it('rejects unknown sources and invalid schema versions', () => {
    expect(sessionsFromEvents([{ ...make('Stop'), source: 'unknown' }])).toHaveLength(0);
    expect(sessionsFromEvents([{ ...make('Stop'), schema_version: 2 }])).toHaveLength(0);
    expect(displayPath('C:\\somewhere\\app')).toBe('app');
  });

  it('flags working or waiting sessions as stale when lastSeen exceeds threshold', () => {
    const baseMs = new Date('2026-10-25T00:20:00Z').getTime();
    expect(isSessionStale('2026-10-25T00:00:00Z', 'working', baseMs, 15)).toBe(true);
    expect(isSessionStale('2026-10-25T00:10:00Z', 'working', baseMs, 15)).toBe(false);
    expect(isSessionStale('2026-10-25T00:00:00Z', 'completed', baseMs, 15)).toBe(false);

    const reduced = claudeCodeAdapter.reduceEvents([make('SessionStart')], {
      nowMs: baseMs,
      staleMinutes: 15,
    });
    expect(reduced[0].isStale).toBe(true);
  });

  it('evaluates and deduplicates alerts when acknowledged', () => {
    const settings = { alert_on_waiting: true, alert_on_failure: true };
    const initialAlerts = notificationPolicy.evaluate(demoAgents, settings, new Set());
    expect(initialAlerts).toHaveLength(1);
    expect(initialAlerts[0].agent.id).toBe('demo-claude');

    const ackKey = buildAlertKey(demoAgents[0]);
    const afterAck = notificationPolicy.evaluate(demoAgents, settings, new Set([ackKey]));
    expect(afterAck).toHaveLength(0);

    // A new event timestamp on the same session produces a fresh alert key
    const updatedAgent = { ...demoAgents[0], lastSeen: '2026-10-25T12:00:00Z' };
    const afterNewEvent = notificationPolicy.evaluate([updatedAgent], settings, new Set([ackKey]));
    expect(afterNewEvent).toHaveLength(1);
  });

  it('detects concurrent workspace collisions and raises conflict alerts', () => {
    const agentA = {
      ...demoAgents[0],
      isDemo: false,
      id: 'session-a',
      name: 'Claude Alpha',
      status: 'working' as const,
      workspace: 'C:\\Projects\\shared-repo',
    };
    const agentB = {
      ...demoAgents[0],
      isDemo: false,
      id: 'session-b',
      name: 'Codex Beta',
      provider: 'codex' as const,
      status: 'working' as const,
      workspace: 'C:\\Projects\\shared-repo\\', // trailing slash normalized
    };

    const conflicts = detectWorkspaceConflicts([agentA, agentB]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].session_ids).toEqual(['session-a', 'session-b']);
    expect(conflicts[0].providers).toContain('claude-code');
    expect(conflicts[0].providers).toContain('codex');

    const settings = { alert_on_waiting: false, alert_on_failure: false };
    const alerts = notificationPolicy.evaluate([agentA, agentB], settings, new Set());
    expect(alerts.some((al) => al.reason === 'workspace-conflict')).toBe(true);
    const conflictAlert = alerts.find((al) => al.reason === 'workspace-conflict');
    expect(conflictAlert?.headline).toContain('Claude Alpha & Codex Beta');
  });
});
