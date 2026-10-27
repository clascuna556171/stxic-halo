import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

describe.runIf(process.platform === 'win32')('Claude status-line capture', () => {
  it('writes only quota metadata and clears missing fields without exposing session content', () => {
    const root = mkdtempSync(join(tmpdir(), 'halo-claude-status-'));
    try {
      const execute = (rate_limits) => spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve('scripts/claude-statusline.ps1')], {
        input: JSON.stringify({ session_id: 'session-123', model: { display_name: 'Claude' }, rate_limits, transcript_path: 'SECRET', other: 'SECRET' }),
        env: { ...process.env, LOCALAPPDATA: root }, encoding: 'utf8', timeout: 20000,
      });
      expect(execute({ five_hour: { used_percentage: 85, resets_at: 2000000000 } }).status).toBe(0);
      const path = join(root, 'STXICHalo', 'usage', 'claude-statusline', 'session-123.json');
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw);
      expect(parsed.quotas).toHaveLength(1);
      expect(parsed.quotas[0].used_percent).toBe(85);
      expect(raw).not.toContain('SECRET');
      expect(execute({}).status).toBe(0);
      expect(JSON.parse(readFileSync(path, 'utf8')).quotas).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 25000);
});

