import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
// The distributed plugin is plain ESM so OpenCode can load it without dependencies.
import { HaloPlugin } from '../scripts/opencode-halo.js';

const temporaryRoots = [];
const testRoot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'halo-provider-'));
  temporaryRoots.push(root); return root;
};
afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    if (!resolve(root).startsWith(join(tmpdir(), 'halo-provider-'))) throw new Error('Unexpected test cleanup target');
    await rm(root, { recursive: true, force: true });
  }
});

describe('OpenCode plugin', () => {
  it('records lifecycle and recomputes duplicate message totals without persisting content', async () => {
    const root = await testRoot();
    const prior = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    try {
      const message = { info: { id: 'm1', sessionID: 's1', role: 'assistant', cost: 0.01,
        tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 1 } } },
        parts: [{ text: 'SECRET_RESPONSE' }] };
      const plugin = await HaloPlugin({ directory: 'C:/work/project', client: { session: {
        messages: async () => ({ data: [message, message, { info: { id: 'm2', sessionID: 'foreign', role: 'assistant', cost: 999 } }] }),
      } } });
      await plugin.event({ event: { type: 'session.created', properties: { info: { id: 's1', title: 'SECRET_TITLE' } } } });
      await plugin['tool.execute.before']({ sessionID: 's1', tool: 'bash', args: { command: 'SECRET_COMMAND' } });
      await plugin.event({ event: { type: 'permission.asked', properties: { sessionID: 's1' } } });
      await plugin.event({ event: { type: 'session.idle', properties: { sessionID: 's1' } } });
      await plugin.event({ event: { type: 'session.idle', properties: { sessionID: 's1' } } });
      const data = await readFile(join(root, 'STXICHalo/usage/opencode-sessions/s1.json'), 'utf8');
      const events = await readFile(join(root, 'STXICHalo/events.jsonl'), 'utf8');
      expect(JSON.parse(data).sessions[0]).toMatchObject({ total_tokens: 21, cost_usd: 0.01 });
      expect(events.split('\n').filter(Boolean).map(line => JSON.parse(line).event))
        .toEqual(['SessionStart', 'PreToolUse', 'PermissionRequest', 'Stop', 'Stop']);
      expect(data + events).not.toContain('SECRET');
      const restarted = await HaloPlugin({ directory: 'C:/work/project', client: { session: { messages: async () => ({ data: [message] }) } } });
      await restarted.event({ event: { type: 'session.idle', properties: { sessionID: 's1' } } });
      expect(JSON.parse(await readFile(join(root, 'STXICHalo/usage/opencode-sessions/s1.json'), 'utf8')).sessions[0].total_tokens).toBe(21);
    } finally { if (prior === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = prior; }
  });
  it('keeps missing usage unknown and cannot traverse outside the usage directory', async () => {
    const root = await testRoot();
    const prior = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = root;
    try {
      let calls = 0;
      const plugin = await HaloPlugin({ directory: '', client: { session: { messages: async () => {
        calls++; return { data: [{ info: { id: 'm', sessionID: 'safe', role: 'assistant', cost: 0 } }] };
      } } } });
      await plugin.event({ event: { type: 'session.idle', properties: { sessionID: '../escape' } } });
      expect(calls).toBe(0);
      await plugin.event({ event: { type: 'session.idle', properties: { sessionID: 'safe' } } });
      const data = JSON.parse(await readFile(join(root, 'STXICHalo/usage/opencode-sessions/safe.json'), 'utf8'));
      expect(data.sessions[0].total_tokens).toBeNull();
      expect(data.sessions[0].cost_usd).toBe(0);
    } finally { if (prior === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = prior; }
  });
});

describe.skipIf(process.platform !== 'win32')('Windows provider bridge', () => {
  it.each([
    ['antigravity', { conversationId: 'antigravity-session', workspacePaths: ['C:/work/app'], toolCall: { name: 'run_command', args: { value: 'SECRET' } } }],
    ['github-copilot', { sessionId: 'copilot-session', cwd: 'C:/work/app', toolName: 'bash', initialPrompt: 'SECRET' }],
    ['github-copilot', { session_id: 'copilot-vscode-format', cwd: 'C:/work/app', tool_name: 'Bash', tool_input: 'SECRET' }],
  ])('sanitizes %s payloads and never returns an approval decision', async (source, input) => {
    const root = await testRoot();
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', resolve('scripts/provider-hook.ps1'), '-Source', source, '-Event', 'PreToolUse'],
      { input: JSON.stringify(input), env: { ...process.env, LOCALAPPDATA: root }, encoding: 'utf8', timeout: 10000 });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    const line = await readFile(join(root, 'STXICHalo/events.jsonl'), 'utf8');
    expect(JSON.parse(line)).toMatchObject({ source, event: 'PreToolUse', cwd: 'C:/work/app' });
    expect(line).not.toContain('SECRET');
    expect(Object.keys(JSON.parse(line)).sort()).toEqual(['schema_version', 'source', 'session_id', 'timestamp', 'event', 'cwd', 'tool_name'].sort());
  });
});
