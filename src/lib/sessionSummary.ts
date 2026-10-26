import type { Agent } from '../types';

export function currentSessions(agents: readonly Agent[]): Agent[] {
  return agents.filter(a => (a.status === 'working' || a.status === 'waiting' || a.status === 'error')
    && !a.isStale && a.liveness !== 'exited')
    .sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen));
}

export function contextBudget(agent?: Agent) {
  const used = agent?.contextTokens;
  const limit = agent?.contextWindow;
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0
    || typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return null;
  const remaining = Math.max(0, Math.floor(limit - used));
  return { remaining, limit, percentRemaining: Math.round(remaining / limit * 100) };
}

export function providerName(agent?: Agent): string {
  return agent ? PROVIDER_NAMES[agent.provider] : 'Halo';
}

export const PROVIDER_NAMES: Record<Agent['provider'], string> = {
  'claude-code': 'Claude', codex: 'Codex', antigravity: 'Antigravity',
  'github-copilot': 'GitHub Copilot', opencode: 'OpenCode', other: 'Agent',
};
