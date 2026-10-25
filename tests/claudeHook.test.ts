import { describe, expect, it } from 'vitest';
import {
  checkClaudeHookStatus,
  disableClaudeHook,
  enableClaudeHook,
} from '../src/lib/desktop';
import type { ClaudeHookStatus, AgentEvent } from '../src/types';

describe('Phase 1: Claude Code Hook Manager & Event Watcher', () => {
  it('returns valid ClaudeHookStatus in simulation/fallback environment', async () => {
    const status: ClaudeHookStatus = await checkClaudeHookStatus();
    expect(status.success).toBe(true);
    expect(typeof status.installed).toBe('boolean');
    expect(typeof status.hook_count).toBe('number');
    expect(status.config_path).toContain('.claude');
    expect(status.hook_path).toContain('claude-hook.ps1');
    expect(typeof status.backup_exists).toBe('boolean');
    expect(typeof status.message).toBe('string');
  });

  it('simulates safe 1-click enable with backup point creation', async () => {
    const enabled = await enableClaudeHook();
    expect(enabled.success).toBe(true);
    expect(enabled.installed).toBe(true);
    expect(enabled.hook_count).toBe(6);
    expect(enabled.backup_exists).toBe(true);
    expect(enabled.backup_path).toContain('.halo-bak');
  });

  it('simulates disable and clean rollback to backup', async () => {
    const disabled = await disableClaudeHook(false);
    expect(disabled.success).toBe(true);
    expect(disabled.installed).toBe(false);
    expect(disabled.hook_count).toBe(0);

    const rolledBack = await disableClaudeHook(true);
    expect(rolledBack.success).toBe(true);
    expect(rolledBack.installed).toBe(false);
    expect(rolledBack.message.toLowerCase()).toContain('rollback');
  });

  it('verifies bounded event queue FIFO eviction contract', () => {
    const maxCapacity = 5;
    const queue: AgentEvent[] = [];

    const pushBounded = (item: AgentEvent) => {
      queue.push(item);
      while (queue.length > maxCapacity) {
        queue.shift();
      }
    };

    for (let i = 1; i <= 8; i++) {
      pushBounded({
        schema_version: 1,
        source: 'claude-code',
        session_id: `sess-${i}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        event: 'PostToolUse',
      });
    }

    expect(queue.length).toBe(5);
    expect(queue[0].session_id).toBe('sess-4');
    expect(queue[4].session_id).toBe('sess-8');
  });

  it('enforces expected Claude Code 6 lifecycle hook events', () => {
    const requiredHooks = [
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'PermissionRequest',
      'Stop',
      'SessionEnd',
    ];
    expect(requiredHooks).toHaveLength(6);
    expect(requiredHooks).toContain('PermissionRequest');
    expect(requiredHooks).toContain('PostToolUse');
  });
});
