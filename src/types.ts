export type AgentStatus = 'working' | 'waiting' | 'completed' | 'error' | 'unknown';
export type Provider = 'claude-code' | 'codex' | 'other';
export type Tab = 'overview' | 'activity' | 'system' | 'settings';

export interface GitFileChange {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitStatusSummary {
  branch: string | null;
  clean: boolean;
  total_changed: number;
  staged_count: number;
  modified_count: number;
  untracked_count: number;
  files: GitFileChange[];
}

export interface TestRunSummary {
  runner: string;
  passed: number;
  failed: number;
  total: number;
  duration_ms: number | null;
  summary_line: string | null;
}

export interface ProofSummary {
  changed_files?: number | null;
  changedFiles?: number | null;
  tests_passed?: number | null;
  testsPassed?: number | null;
  tests_failed?: number | null;
  testsFailed?: number | null;
  verified: boolean;
  git?: GitStatusSummary | null;
  test_summary?: TestRunSummary | null;
  testSummary?: TestRunSummary | null;
  provenance?: string;
  evidence_timestamp?: number;
  evidenceTimestamp?: number;
}

export interface WorkspaceConflict {
  workspace: string;
  session_ids: string[];
  session_names: string[];
  providers: string[];
  detail: string;
}

export interface Agent {
  id: string;
  provider: Provider;
  name: string;
  task: string;
  workspace: string;
  status: AgentStatus;
  contextPercent: number | null;
  tokenUsage: number | null;
  lastSeen: string;
  proof: ProofSummary | null;
  isDemo: boolean;
  isStale?: boolean;
  /** Full working directory reported by the provider (used for process reconciliation). */
  workspacePath?: string;
  /**
   * Result of reconciling an active session with running provider processes:
   * - `alive`: a provider process with a matching working directory is running
   * - `exited`: no matching provider process; the session ended without a SessionEnd/Stop event
   * - `unverified`: reconciliation unavailable or inconclusive
   */
  liveness?: SessionLiveness;
}

export type SessionLiveness = 'alive' | 'exited' | 'unverified';

export interface ProviderProcess {
  provider: string;
  pid: number;
  cwd: string | null;
}

export interface ProcessLifecycleSnapshot {
  available: boolean;
  refreshed_at: number;
  processes: ProviderProcess[];
  claude_processes: number;
  codex_processes: number;
}

export interface AgentEvent {
  schema_version: number;
  source: string;
  session_id: string;
  timestamp: string;
  event: string;
  cwd?: string;
  tool_name?: string;
}

export interface Metrics {
  cpu_percent: number;
  memory_used_bytes: number;
  memory_total_bytes: number;
  process_count: number;
  sampled_at: number;
  sample_duration_ms?: number;
}

export interface MetricsHistorySummary {
  cpuSamples: number[];
  memorySamples: number[];
  peakCpuPercent: number;
  avgCpuPercent: number;
}

export interface UserSettings {
  schema_version: number;
  poll_interval_ms: number;
  target_monitor_index: number;
  horizontal_offset_px: number;
  top_inset_px: number;
  auto_collapse_on_blur: boolean;
  reduce_motion: boolean;
  alert_on_waiting: boolean;
  alert_on_failure: boolean;
  stale_minutes: number;
  approved_workspaces?: string[];
  enable_codex_logs?: boolean;
  process_reconciliation?: boolean;
}

export type SettingsSource = 'disk' | 'backup' | 'defaults';

export interface SettingsHealth {
  source: SettingsSource;
  path: string;
  schema_version: number;
  migrated_from: number | null;
  quarantined_path: string | null;
  warning: string | null;
  last_save_error: string | null;
}

export interface EventLogStatus {
  path: string;
  exists: boolean;
  size_bytes: number;
  modified_ms: number | null;
  buffered_events: number;
  last_error: string | null;
}

export interface LaunchAtLoginStatus {
  supported: boolean;
  enabled: boolean;
  error: string | null;
}

export interface IntegrationStatus {
  settings: SettingsHealth;
  event_log: EventLogStatus;
  codex: { enabled: boolean; sessions_dir: string | null; sessions_dir_exists: boolean };
  launch_at_login: LaunchAtLoginStatus;
  single_instance: boolean;
  launched_at_login: boolean;
}

export interface TimingStat {
  count: number;
  last_ms: number;
  avg_ms: number;
  max_ms: number;
}

export interface LeakAnalysis {
  sample_count: number;
  baseline_memory_bytes: number;
  current_memory_bytes: number;
  drift_bytes: number;
  drift_rate_kb_per_min: number;
  suspected_leak: boolean;
  status: string;
}

export interface PerformanceStats {
  uptime_secs: number;
  footprint: {
    available: boolean;
    pid: number;
    cpu_percent: number;
    memory_bytes: number;
    virtual_memory_bytes: number;
  };
  timings: Record<string, TimingStat>;
  leak_analysis?: LeakAnalysis;
}

/** Frontend-measured poll round-trip summary (IPC + Rust work + React state). */
export interface PollTimingSummary {
  samples: number;
  lastMs: number | null;
  avgMs: number | null;
  p95Ms: number | null;
}

export interface MonitorDescriptor {
  index: number;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale_factor: number;
  is_primary: boolean;
}

export interface AlertItem {
  key: string;
  agent: Agent;
  severity: 'warning' | 'error';
  reason: 'permission-waiting' | 'tests-failed' | 'agent-error' | 'workspace-conflict';
  headline: string;
  detail: string;
  conflict?: WorkspaceConflict;
}

export interface ClaudeHookStatus {
  success: boolean;
  installed: boolean;
  hook_count: number;
  config_path: string;
  hook_path: string;
  backup_exists: boolean;
  backup_path: string;
  message: string;
}

/* ============================================================================
 * Extensible Subsystem Contracts (Future AI Providers, Tokens, PoW & Gaming)
 * ============================================================================ */

export interface AgentProviderCapabilities {
  lifecycle: boolean;
  tokenUsage: boolean;
  contextWindow: boolean;
  approvals: boolean;
  proofOfWork: boolean;
}

export interface AgentProviderAdapter {
  readonly id: Provider;
  readonly displayName: string;
  readonly bridgePath: string;
  readonly status: 'active' | 'planned';
  readonly capabilities: AgentProviderCapabilities;
  reduceEvents(events: AgentEvent[], options?: { nowMs?: number; staleMinutes?: number }): Agent[];
}

export interface TokenUsageContract {
  sessionId: string;
  provider: Provider;
  tokensUsed: number | null;
  contextPercent: number | null;
  provenance: 'hook' | 'session-log' | 'unavailable';
}

export interface ProofOfWorkVerifierContract {
  readonly id: string;
  verifyWorkspace(
    workspacePath: string,
    options?: { runTests?: boolean; testProfile?: string }
  ): Promise<ProofSummary | null>;
}

export interface CodexSessionTelemetry {
  session_id: string;
  workspace: string;
  status: string;
  total_tokens?: number;
  context_window?: number;
  context_percent?: number;
  last_seen: string;
  last_event: string;
}

export interface NotificationPolicyContract {
  evaluate(
    agents: Agent[],
    settings: Pick<UserSettings, 'alert_on_waiting' | 'alert_on_failure'>,
    acknowledgedKeys: ReadonlySet<string>
  ): AlertItem[];
}

export interface GamingTelemetryContract {
  available: boolean;
  fps: number | null;
  frameTimeMs: number | null;
  gpuPercent: number | null;
  vramUsedBytes: number | null;
  source: 'presentmon' | 'dxgi' | 'unavailable';
}
