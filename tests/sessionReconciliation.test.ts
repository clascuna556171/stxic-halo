import { describe, expect, it } from 'vitest';
import {
  normalizePathKey,
  pathsRelated,
  reconcileSessions,
} from '../src/lib/sessionReconciliation';
import type { Agent, ProcessLifecycleSnapshot } from '../src/types';

function createMockAgent(overrides?: Partial<Agent>): Agent {
  return {
    id: 'test-session-1',
    provider: 'claude-code',
    name: 'Claude Code',
    task: 'Working on task',
    workspace: 'stxic-halo',
    workspacePath: 'C:\\Tech\\Projects\\stxic-halo',
    status: 'working',
    contextPercent: null,
    tokenUsage: null,
    lastSeen: '2026-10-25T12:00:00.000Z',
    proof: null,
    isDemo: false,
    ...overrides,
  };
}

describe('session reconciliation', () => {
  it('normalizes Windows path keys and tests ancestry', () => {
    expect(normalizePathKey('C:/Tech/Projects/stxic-halo/')).toBe('c:\\tech\\projects\\stxic-halo');
    expect(
      pathsRelated('C:\\Tech\\Projects\\stxic-halo', 'C:/Tech/Projects/stxic-halo/src')
    ).toBe(true);
    expect(
      pathsRelated('C:\\Tech\\Projects\\stxic-halo', 'D:\\Other\\stxic-halo')
    ).toBe(false);
  });

  it('marks active session as alive when matching provider process exists', () => {
    const agent = createMockAgent();
    const snapshot: ProcessLifecycleSnapshot = {
      available: true,
      refreshed_at: Date.parse('2026-10-25T12:05:00.000Z'),
      claude_processes: 1,
      codex_processes: 0,
      processes: [
        {
          provider: 'claude-code',
          pid: 1234,
          cwd: 'C:\\Tech\\Projects\\stxic-halo',
        },
      ],
    };

    const reconciled = reconcileSessions([agent], snapshot);
    expect(reconciled[0].liveness).toBe('alive');
    expect(reconciled[0].status).toBe('working');
  });

  it('marks active session as exited when no provider process is running and event predates snapshot', () => {
    const agent = createMockAgent({
      lastSeen: '2026-10-25T12:00:00.000Z',
    });
    const snapshot: ProcessLifecycleSnapshot = {
      available: true,
      refreshed_at: Date.parse('2026-10-25T12:05:00.000Z'), // 5 minutes later
      claude_processes: 0,
      codex_processes: 0,
      processes: [],
    };

    const reconciled = reconcileSessions([agent], snapshot);
    expect(reconciled[0].status).toBe('completed');
    expect(reconciled[0].liveness).toBe('exited');
    expect(reconciled[0].task).toContain('Process exited');
  });

  it('leaves status untouched if event was emitted within grace period of snapshot', () => {
    const agent = createMockAgent({
      lastSeen: '2026-10-25T12:05:00.000Z', // Same time as snapshot
    });
    const snapshot: ProcessLifecycleSnapshot = {
      available: true,
      refreshed_at: Date.parse('2026-10-25T12:05:01.000Z'), // only 1s later (within 5s grace)
      claude_processes: 0,
      codex_processes: 0,
      processes: [],
    };

    const reconciled = reconcileSessions([agent], snapshot);
    expect(reconciled[0].status).toBe('working');
    expect(reconciled[0].liveness).toBe('unverified');
  });

  it('preserves completed/error sessions without altering them', () => {
    const agent = createMockAgent({
      status: 'completed',
    });
    const snapshot: ProcessLifecycleSnapshot = {
      available: true,
      refreshed_at: Date.parse('2026-10-25T12:05:00.000Z'),
      claude_processes: 0,
      codex_processes: 0,
      processes: [],
    };

    const reconciled = reconcileSessions([agent], snapshot);
    expect(reconciled[0].status).toBe('completed');
    expect(reconciled[0].liveness).toBeUndefined();
  });

  it('ignores reconciliation when disabled in settings', () => {
    const agent = createMockAgent();
    const snapshot: ProcessLifecycleSnapshot = {
      available: true,
      refreshed_at: Date.parse('2026-10-25T12:05:00.000Z'),
      claude_processes: 0,
      codex_processes: 0,
      processes: [],
    };

    const reconciled = reconcileSessions([agent], snapshot, { enabled: false });
    expect(reconciled[0].status).toBe('working');
    expect(reconciled[0].liveness).toBe('unverified');
  });
});
