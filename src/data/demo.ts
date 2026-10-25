import type { Agent, AgentEvent, Metrics, MetricsHistorySummary } from '../types';

const now = new Date().toISOString();

export const demoAgents: Agent[] = [
  {
    id: 'demo-claude',
    provider: 'claude-code',
    name: 'Claude Code',
    task: 'Authentication refactor · awaiting Bash approval',
    workspace: 'portfolio-app',
    status: 'waiting',
    contextPercent: 68,
    tokenUsage: 18420,
    lastSeen: now,
    proof: { changedFiles: 8, testsPassed: 6, testsFailed: 2, verified: false },
    isDemo: true,
    isStale: false,
  },
  {
    id: 'demo-codex',
    provider: 'codex',
    name: 'Codex',
    task: 'Optimizing database queries',
    workspace: 'portfolio-app',
    status: 'working',
    contextPercent: 42,
    tokenUsage: 8260,
    lastSeen: now,
    proof: null,
    isDemo: true,
    isStale: false,
  },
];

export const demoEvents: AgentEvent[] = [
  {
    schema_version: 1,
    source: 'claude-code',
    session_id: 'demo-claude',
    timestamp: now,
    event: 'PermissionRequest',
    cwd: 'C:\\Projects\\portfolio-app',
    tool_name: 'Bash',
  },
  {
    schema_version: 1,
    source: 'claude-code',
    session_id: 'demo-claude',
    timestamp: now,
    event: 'PostToolUse',
    cwd: 'C:\\Projects\\portfolio-app',
    tool_name: 'Edit',
  },
  {
    schema_version: 1,
    source: 'claude-code',
    session_id: 'demo-claude',
    timestamp: now,
    event: 'SessionStart',
    cwd: 'C:\\Projects\\portfolio-app',
    tool_name: 'Read',
  },
];

export const demoMetrics: Metrics = {
  cpu_percent: 28,
  memory_used_bytes: 7.4 * 1024 ** 3,
  memory_total_bytes: 16 * 1024 ** 3,
  process_count: 192,
  sampled_at: Date.now(),
  sample_duration_ms: 2,
};

export const demoMetricsHistory: MetricsHistorySummary = {
  cpuSamples: [18, 21, 19, 24, 31, 29, 26, 22, 25, 34, 30, 28],
  memorySamples: [44, 44, 45, 45, 46, 46, 46, 46, 46, 46, 46, 46],
  peakCpuPercent: 34,
  avgCpuPercent: 26,
};
