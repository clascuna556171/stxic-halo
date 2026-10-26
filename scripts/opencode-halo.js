// STXIC Halo — opt-in OpenCode plugin. Persist only lifecycle and numeric usage.
import { appendFile, mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

// Kept private: OpenCode treats every named function export as a plugin entry point.
function summarize(messages, sessionId, observedAt) {
  const assistants = new Map();
  for (const message of messages) {
    const info = message?.info;
    if (info?.role === 'assistant' && info.sessionID === sessionId && info.id) assistants.set(info.id, info);
  }
  let tokens = 0, cost = 0, tokensKnown = assistants.size > 0, costKnown = assistants.size > 0;
  for (const info of assistants.values()) {
    const t = info.tokens;
    // OpenCode's input excludes cached tokens. Match its stats breakdown; reasoning
    // is separate from output. Missing components are unknown, never assumed zero.
    const values = [t?.input, t?.output, t?.reasoning, t?.cache?.read, t?.cache?.write];
    if (values.every(finite)) tokens += values.reduce((a, b) => a + b, 0);
    else tokensKnown = false;
    if (finite(info.cost)) cost += info.cost;
    else costKnown = false;
  }
  return { session_id: sessionId, total_tokens: tokensKnown && Number.isSafeInteger(tokens) ? tokens : null,
    cost_usd: costKnown && Number.isFinite(cost) ? cost : null, observed_at: observedAt };
}

export const HaloPlugin = async ({ client, directory }) => {
  const root = join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'STXICHalo');
  const usageDir = join(root, 'usage', 'opencode-sessions');
  let chain = Promise.resolve();
  const lastUsage = new Map();
  const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);

  const emit = async (session, event, tool) => {
    if (!safeId(session)) return;
    await mkdir(root, { recursive: true });
    const log = join(root, 'events.jsonl');
    const size = await stat(log).then(s => s.size).catch(() => 0);
    if (size >= 2 * 1024 * 1024) {
      await unlink(log + '.bak').catch(() => {});
      await rename(log, log + '.bak').catch(() => {});
    }
    const record = { schema_version: 1, source: 'opencode', session_id: session,
      timestamp: new Date().toISOString(), event, cwd: String(directory || '').slice(0, 512),
      tool_name: typeof tool === 'string' ? tool.slice(0, 48) : undefined };
    await appendFile(log, JSON.stringify(record) + '\n', 'utf8');
  };

  const usage = async (session, force = false) => {
    if (!safeId(session) || (!force && Date.now() - (lastUsage.get(session) || 0) < 2000)) return;
    lastUsage.set(session, Date.now());
    if (lastUsage.size > 32) lastUsage.delete(lastUsage.keys().next().value);
    // Recompute from authoritative messages, deduped by ID, so updates, resumes,
    // and plugin restarts do not inflate cumulative totals. Parts never leave here.
    const result = await client.session.messages({ path: { id: session }, signal: AbortSignal.timeout(3000) });
    if (!Array.isArray(result.data)) return;
    const observedAt = new Date().toISOString();
    const report = { schema_version: 1, provider: 'opencode',
      sessions: [summarize(result.data, session, observedAt)], quotas: [] };
    await mkdir(usageDir, { recursive: true });
    const path = join(usageDir, session + '.json');
    const temp = path + `.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(report), 'utf8');
    await rename(temp, path);
    const files = await readdir(usageDir);
    const snapshots = await Promise.all(files.filter(f => /^[A-Za-z0-9_-]+\.json$/.test(f))
      .map(async name => ({ name, modified: await stat(join(usageDir, name)).then(s => s.mtimeMs).catch(() => 0) })));
    for (const file of snapshots.sort((a, b) => b.modified - a.modified).slice(32)) {
      await unlink(join(usageDir, file.name)).catch(() => {});
    }
  };
  // Serialize writes per host. Bridge failures never interrupt the user's agent.
  const enqueue = action => { chain = chain.then(action).catch(() => {}); return chain; };
  return {
    event: async ({ event }) => {
      // Drop streamed text/part events before queuing: a slow usage read must
      // never accumulate prompt or response chunks in Halo's pending work.
      if (!['session.created', 'session.status', 'session.idle', 'session.deleted', 'session.error',
        'permission.updated', 'permission.asked', 'permission.replied', 'message.updated'].includes(event?.type)) return;
      if (event.type === 'message.updated' && event.properties?.info?.role !== 'user'
        && !event.properties?.info?.time?.completed) return;
      return enqueue(async () => {
      const props = event?.properties || {};
      const session = props.sessionID || props.info?.id;
      switch (event?.type) {
        case 'session.created': await emit(session, 'SessionStart'); break;
        case 'session.status':
          if (props.status?.type === 'busy' || props.status?.type === 'retry') await emit(session, 'PreInvocation');
          if (props.status?.type === 'idle') { await emit(session, 'Stop'); await usage(session, true); }
          break;
        case 'session.idle': await emit(session, 'Stop'); await usage(session, true); break;
        case 'session.deleted': await emit(session, 'SessionEnd'); break;
        case 'session.error': await emit(session, 'Error'); break;
        case 'permission.updated': // Older OpenCode SDKs.
        case 'permission.asked': await emit(session, 'PermissionRequest'); break;
        case 'permission.replied': await emit(session, 'PreInvocation'); break;
        case 'message.updated':
          if (props.info?.role === 'user') await emit(props.info.sessionID, 'UserPromptSubmit');
          if (props.info?.role === 'assistant' && props.info.time?.completed) await usage(props.info.sessionID);
          break;
      }
      });
    },
    'tool.execute.before': async input => enqueue(() => emit(input.sessionID, 'PreToolUse', input.tool)),
    'tool.execute.after': async input => enqueue(() => emit(input.sessionID, 'PostToolUse', input.tool)),
  };
};
