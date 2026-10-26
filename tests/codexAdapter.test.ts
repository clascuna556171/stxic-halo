import { describe, expect, it } from 'vitest';
import {
  codexAdapter,
  parseCodexRolloutLines,
  reduceCodexSessions,
} from '../src/lib/codexAdapter';
import type { AgentEvent, CodexSessionTelemetry } from '../src/types';

describe('Codex CLI Adapter: Rollout Log Parser', () => {
  it('parses session_meta, token counts, and calculates context percentage without leaking prompts', () => {
    const rolloutLines = [
      JSON.stringify({
        timestamp: '2026-10-25T11:00:00.000Z',
        ordinal: 0,
        type: 'session_meta',
        payload: {
          session_id: 'codex-sess-alpha',
          cwd: 'D:\\Tech\\Projects\\staxichalo',
          context_window: 250000,
          secret_key_should_not_leak: 'sk-123456789',
          base_instructions: 'System instructions that must never be stored',
        },
      }),
      JSON.stringify({
        timestamp: '2026-10-25T11:01:00.000Z',
        ordinal: 1,
        type: 'event_msg',
        payload: {
          type: 'task_started',
        },
      }),
      JSON.stringify({
        timestamp: '2026-10-25T11:02:00.000Z',
        ordinal: 2,
        type: 'event_msg',
        payload: {
          type: 'item_completed',
          item: {
            type: 'CommandExecution',
            command: 'git status',
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-10-25T11:03:00.000Z',
        ordinal: 3,
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              total_tokens: 50000,
              input_tokens: 45000,
              output_tokens: 5000,
            },
            last_token_usage: { total_tokens: 25000 },
            model_context_window: 250000,
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-10-25T11:05:00.000Z',
        ordinal: 4,
        type: 'event_msg',
        payload: {
          type: 'task_complete',
        },
      }),
    ];

    const result = parseCodexRolloutLines(rolloutLines);
    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe('codex-sess-alpha');
    expect(result?.workspace).toBe('D:\\Tech\\Projects\\staxichalo');
    expect(result?.status).toBe('completed');
    expect(result?.tokenUsage).toBe(50000);
    expect(result?.contextPercent).toBe(10); // Current context, not cumulative session tokens
    expect(result?.lastSeen).toBe('2026-10-25T11:05:00.000Z');

    // Verify events generated for the timeline
    expect(result?.events).toHaveLength(4);
    expect(result?.events[0].event).toBe('SessionStart');
    expect(result?.events[1].event).toBe('PreToolUse');
    expect(result?.events[2].event).toBe('PreToolUse');
    expect(result?.events[3].event).toBe('Stop');

    // Verify zero secret or instruction leakage in stringified output
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('sk-123456789');
    expect(serialized).not.toContain('System instructions that must never be stored');
  });

  it('gracefully returns null for rollout logs without valid session metadata', () => {
    const invalidLines = [
      JSON.stringify({ type: 'random_noise', payload: {} }),
      'not-even-json',
    ];
    expect(parseCodexRolloutLines(invalidLines)).toBeNull();
  });
});

describe('Codex CLI Adapter: Session Reducer & Multi-session Concurrency', () => {
  it('reports two simultaneous Codex sessions with separate IDs and state', () => {
    const events: AgentEvent[] = [
      {
        schema_version: 1,
        source: 'codex',
        session_id: 'session-alpha',
        timestamp: '2026-10-25T12:00:00Z',
        event: 'SessionStart',
        cwd: 'C:\\work\\repo-a',
      },
      {
        schema_version: 1,
        source: 'codex',
        session_id: 'session-beta',
        timestamp: '2026-10-25T12:05:00Z',
        event: 'SessionStart',
        cwd: 'C:\\work\\repo-b',
      },
      {
        schema_version: 1,
        source: 'codex',
        session_id: 'session-alpha',
        timestamp: '2026-10-25T12:06:00Z',
        event: 'PreToolUse',
        cwd: 'C:\\work\\repo-a',
        tool_name: 'CommandExecution',
      },
    ];

    const telemetry: CodexSessionTelemetry[] = [
      {
        session_id: 'session-alpha',
        workspace: 'C:\\work\\repo-a',
        status: 'working',
        total_tokens: 32000,
        context_percent: 16,
        last_seen: '2026-10-25T12:06:00Z',
        last_event: 'PreToolUse',
      },
      {
        session_id: 'session-beta',
        workspace: 'C:\\work\\repo-b',
        status: 'working',
        total_tokens: 12000,
        context_percent: 6,
        last_seen: '2026-10-25T12:05:00Z',
        last_event: 'SessionStart',
      },
    ];

    const reduced = reduceCodexSessions(events, {
      nowMs: new Date('2026-10-25T12:10:00Z').getTime(),
      staleMinutes: 15,
      telemetry,
    });

    expect(reduced).toHaveLength(2);
    const alpha = reduced.find((a) => a.id === 'session-alpha');
    const beta = reduced.find((a) => a.id === 'session-beta');

    expect(alpha).toBeDefined();
    expect(alpha?.workspace).toBe('repo-a');
    expect(alpha?.tokenUsage).toBe(32000);
    expect(alpha?.contextPercent).toBe(16);
    expect(alpha?.status).toBe('working');
    expect(alpha?.isStale).toBe(false);

    expect(beta).toBeDefined();
    expect(beta?.workspace).toBe('repo-b');
    expect(beta?.tokenUsage).toBe(12000);
    expect(beta?.contextPercent).toBe(6);
    expect(beta?.status).toBe('working');
    expect(beta?.isStale).toBe(false);
  });

  it('marks inactive Codex sessions as stale according to configured threshold', () => {
    const events: AgentEvent[] = [
      {
        schema_version: 1,
        source: 'codex',
        session_id: 'session-old',
        timestamp: '2026-10-25T10:00:00Z',
        event: 'SessionStart',
        cwd: 'C:\\work\\repo-c',
      },
    ];

    const reduced = reduceCodexSessions(events, {
      nowMs: new Date('2026-10-25T10:45:00Z').getTime(), // 45 minutes later
      staleMinutes: 15,
    });

    expect(reduced).toHaveLength(1);
    expect(reduced[0].isStale).toBe(true);
  });

  it('verifies codexAdapter provider capabilities comply with active v0.2 spec', () => {
    expect(codexAdapter.id).toBe('codex');
    expect(codexAdapter.status).toBe('active');
    expect(codexAdapter.capabilities.lifecycle).toBe(true);
    expect(codexAdapter.capabilities.tokenUsage).toBe(true);
    expect(codexAdapter.capabilities.contextWindow).toBe(true);
    expect(codexAdapter.capabilities.proofOfWork).toBe(true);
  });
});
