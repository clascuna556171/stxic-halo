import { memo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock,
  Cpu,
  FileCode2,
  Gauge,
  GitBranch,
  HardDrive,
  ShieldCheck,
  TerminalSquare,
  Zap,
} from 'lucide-react';
import type {
  Agent,
  AgentEvent,
  AlertItem,
  ClaudeHookStatus,
  Metrics,
  MetricsHistorySummary,
  PerformanceStats,
  PollTimingSummary,
  ProcessLifecycleSnapshot,
} from '../types';
import { gib, percent, relativeTime } from '../lib/format';
import { displayPath } from '../lib/agentEvents';

const statusLabel: Record<Agent['status'], string> = {
  working: 'Working',
  waiting: 'Awaiting review',
  completed: 'Stopped',
  error: 'Error',
  unknown: 'Unknown',
};

const providerBadge: Record<Agent['provider'], string> = {
  'claude-code': 'Claude',
  codex: 'Codex',
  other: 'Agent',
};

function formatEventLabel(ev: AgentEvent): { title: string; isWarning?: boolean } {
  switch (ev.event) {
    case 'PermissionRequest':
      return { title: 'Approval required', isWarning: true };
    case 'PreToolUse':
      return { title: ev.tool_name ? `Tool: ${ev.tool_name}` : 'Tool invoked' };
    case 'PostToolUse':
      return { title: ev.tool_name ? `Tool finished: ${ev.tool_name}` : 'Tool finished' };
    case 'SessionStart':
      return { title: 'Session started' };
    case 'SessionEnd':
      return { title: 'Session completed' };
    case 'Stop':
      return { title: 'Agent paused' };
    default:
      return { title: ev.event };
  }
}

export const AgentCard = memo(function AgentCard({ agent }: { agent: Agent }) {
  const Icon = agent.provider === 'codex' ? TerminalSquare : Bot;
  return (
    <article className={`agent-card ${agent.status === 'waiting' ? 'is-waiting' : ''}`}>
      <div className="agent-head">
        <div className="agent-identity">
          <span className={`provider-chip ${agent.provider}`}>
            <Icon size={12} />
            {providerBadge[agent.provider]}
          </span>
          <strong className="agent-name">{agent.name}</strong>
          <span className="workspace-tag" title={agent.workspace}>
            {agent.workspace}
          </span>
          {agent.liveness === 'alive' && (
            <span className="live-tag tabular" title="Matching provider process confirmed active">
              Alive
            </span>
          )}
          {agent.liveness === 'exited' && (
            <span className="exited-tag tabular" title="Provider process exited without Stop hook">
              Exited
            </span>
          )}
          {agent.isStale && (
            <span className="stale-tag tabular" title="No recent hook events received">
              Stale
            </span>
          )}
        </div>
        <span className={`status ${agent.status}`}>
          <span className="status-dot" />
          {statusLabel[agent.status]}
        </span>
      </div>

      <p className="task-description" title={agent.task}>
        {agent.task}
      </p>

      {agent.contextPercent !== null ? (
        <div className="telemetry-bar-row">
          <div className="progress-track" aria-label="Context window usage">
            <div
              className={`progress-fill ${agent.contextPercent > 84 ? 'warning' : agent.status === 'waiting' ? 'amber' : ''}`}
              style={{ width: `${agent.contextPercent}%` }}
            />
          </div>
          <div className="telemetry-stats tabular">
            <span>
              <strong>{percent(agent.contextPercent)}</strong> ctx
            </span>
            <span className="sep">·</span>
            <span>
              {agent.tokenUsage === null ? '— tok' : `${agent.tokenUsage.toLocaleString()} tok`}
            </span>
            <span className="sep">·</span>
            <span>{agent.isDemo ? 'fixture' : relativeTime(agent.lastSeen)}</span>
          </div>
        </div>
      ) : (
        <div className="telemetry-bar-row unknown-row">
          <span className="unknown-metric">
            <CircleHelp size={12} /> Context &amp; token metrics not supplied by hook
          </span>
          <span className="tabular">{agent.isDemo ? 'fixture' : relativeTime(agent.lastSeen)}</span>
        </div>
      )}
    </article>
  );
});

export const AttentionCard = memo(function AttentionCard({
  alert,
  onReview,
  onAcknowledge,
}: {
  alert: AlertItem;
  onReview: () => void;
  onAcknowledge?: (key: string) => void;
}) {
  const { agent, headline, detail, key } = alert;

  return (
    <section className="attention-card" aria-label="Action required">
      <div className="attention-top">
        <div className="attention-heading">
          <AlertTriangle size={13} />
          <span>{alert.reason === 'workspace-conflict' ? 'Workspace collision' : 'Action required'}</span>
        </div>
        <span className="attention-source tabular">
          {agent.workspace} · {agent.isDemo ? 'fixture' : 'live hook'}
        </span>
      </div>
      <div className="attention-body">
        <div className="attention-copy">
          <strong>{headline}</strong>
          <p className="attention-meta tabular">{detail}</p>
        </div>
        <div className="attention-actions">
          {onAcknowledge && (
            <button
              type="button"
              className="inline-action subtle-action"
              onClick={() => onAcknowledge(key)}
              title="Acknowledge and mute this alert until state changes"
              aria-label="Acknowledge alert"
            >
              <Check size={12} />
            </button>
          )}
          <button type="button" className="inline-action" onClick={onReview}>
            Inspect <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
    </section>
  );
});

export const MetricStrip = memo(function MetricStrip({
  metrics,
  demo,
  pollIntervalMs = 2500,
}: {
  metrics: Metrics | null;
  demo: boolean;
  pollIntervalMs?: number;
}) {
  const memoryPct =
    metrics && metrics.memory_total_bytes > 0
      ? Math.round((metrics.memory_used_bytes / metrics.memory_total_bytes) * 100)
      : null;

  const pollSec = (pollIntervalMs / 1000).toFixed(1).replace(/\.0$/, '');

  return (
    <div
      className="metric-strip tabular"
      role="group"
      aria-label={demo ? 'Demo host metrics' : 'Local host metrics'}
    >
      <div className="metric-tile">
        <div className="metric-label">
          <Cpu size={12.5} />
          <span>CPU load</span>
        </div>
        <div className="metric-value-row">
          <strong>{metrics ? percent(metrics.cpu_percent) : '—'}</strong>
          <span className="metric-sub">
            {metrics && metrics.cpu_percent > 80 ? 'elevated' : 'nominal'}
          </span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div
            className={`progress-fill ${metrics && metrics.cpu_percent > 80 ? 'warning' : 'blue'}`}
            style={{ width: `${Math.min(100, Math.max(0, metrics?.cpu_percent ?? 0))}%` }}
          />
        </div>
      </div>

      <div className="metric-tile">
        <div className="metric-label">
          <HardDrive size={12.5} />
          <span>Memory</span>
        </div>
        <div className="metric-value-row">
          <strong>{metrics ? gib(metrics.memory_used_bytes) : '—'}</strong>
          <span className="metric-sub">{memoryPct !== null ? `${memoryPct}%` : ''}</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div
            className={`progress-fill ${memoryPct !== null && memoryPct > 85 ? 'warning' : ''}`}
            style={{ width: `${Math.min(100, Math.max(0, memoryPct ?? 0))}%` }}
          />
        </div>
      </div>

      <div className="metric-tile">
        <div className="metric-label">
          <Gauge size={12.5} />
          <span>Processes</span>
        </div>
        <div className="metric-value-row">
          <strong>{metrics ? metrics.process_count : '—'}</strong>
          <span className="metric-sub">{pollSec}s poll</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div
            className="progress-fill"
            style={{
              width: `${metrics ? Math.min(100, Math.round((metrics.process_count / 400) * 100)) : 0}%`,
              opacity: 0.55,
            }}
          />
        </div>
      </div>
    </div>
  );
});

export const Overview = memo(function Overview({
  agents,
  alerts,
  metrics,
  demo,
  pollIntervalMs,
  onReview,
  onAcknowledgeAlert,
  onConnect,
  claudeHookStatus,
  onEnableClaudeHook,
  hookLoading,
}: {
  agents: Agent[];
  alerts: AlertItem[];
  metrics: Metrics | null;
  demo: boolean;
  pollIntervalMs?: number;
  onReview: () => void;
  onAcknowledgeAlert?: (key: string) => void;
  onConnect: () => void;
  claudeHookStatus?: ClaudeHookStatus | null;
  onEnableClaudeHook?: () => Promise<unknown>;
  hookLoading?: boolean;
}) {
  const leadAlert = alerts[0];
  const working = agents.filter((a) => a.status === 'working').length;

  return (
    <div className="section-scroll" aria-label="Workspace overview">
      {leadAlert && (
        <AttentionCard
          alert={leadAlert}
          onReview={onReview}
          onAcknowledge={onAcknowledgeAlert}
        />
      )}

      <div className="section-heading first-heading">
        <h2>Active sessions</h2>
        <span className="subtle-label tabular">
          {working > 0 ? `${working} active` : 'Standby'} · {agents.length} monitored
        </span>
      </div>

      {agents.length ? (
        <div className="session-list">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Bot size={24} />
          <strong>Waiting for agent session</strong>
          {claudeHookStatus?.installed ? (
            <p>
              Claude Code bridge is <strong>ready</strong>. Run a task in your terminal (<code>claude</code>) to see live progress, tool calls, and test results stream here.
            </p>
          ) : (
            <>
              <p>
                Connect Claude Code to stream live agent progress, tool calls, and approval prompts into this Dynamic Island.
              </p>
              {onEnableClaudeHook ? (
                <button
                  type="button"
                  disabled={hookLoading}
                  onClick={() => void onEnableClaudeHook()}
                >
                  <Zap size={13} /> {hookLoading ? 'Connecting...' : 'Connect Claude Code (1-Click)'}
                </button>
              ) : (
                <button type="button" onClick={onConnect}>
                  Open Settings <ArrowUpRight size={13} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="section-heading">
        <h2>Host telemetry</h2>
        <span className="subtle-label tabular">
          {demo ? 'Diagnostic simulation' : 'Local hardware'}
        </span>
      </div>

      <MetricStrip metrics={metrics} demo={demo} pollIntervalMs={pollIntervalMs} />
    </div>
  );
});

export const SystemView = memo(function SystemView({
  metrics,
  history,
  demo,
  pollIntervalMs = 2500,
  pollSummary,
  perfStats,
  processLifecycle,
}: {
  metrics: Metrics | null;
  history?: MetricsHistorySummary;
  demo: boolean;
  pollIntervalMs?: number;
  pollSummary?: PollTimingSummary;
  perfStats?: PerformanceStats | null;
  processLifecycle?: ProcessLifecycleSnapshot | null;
}) {
  const memPct =
    metrics && metrics.memory_total_bytes > 0
      ? (metrics.memory_used_bytes / metrics.memory_total_bytes) * 100
      : 0;

  const cpuBars = history?.cpuSamples ?? [];

  return (
    <div className="section-scroll" aria-label="System telemetry">
      <div className="section-heading first-heading">
        <h2>Machine resources</h2>
        <span className="subtle-label tabular">
          {demo ? 'Sample data' : `${pollIntervalMs}ms interval`}
        </span>
      </div>

      <div className="stat-panel tabular">
        <div className="stat-top">
          <Cpu size={15} />
          <span>Processor utilization</span>
          <strong>{metrics ? percent(metrics.cpu_percent) : '—'}</strong>
        </div>
        <div className="progress-track">
          <div className="progress-fill blue" style={{ width: `${metrics?.cpu_percent ?? 0}%` }} />
        </div>
        {cpuBars.length > 1 && (
          <div className="spark-row" aria-label="Recent CPU utilization trend">
            <div className="spark-bars">
              {cpuBars.map((val, idx) => (
                <span
                  key={idx}
                  className="spark-bar"
                  style={{ height: `${Math.max(12, val)}%` }}
                />
              ))}
            </div>
            <span className="spark-caption">
              avg {history?.avgCpuPercent ?? 0}% · peak {history?.peakCpuPercent ?? 0}%
            </span>
          </div>
        )}
        <p className="stat-secondary">
          {demo
            ? 'Simulated workload sample'
            : `Hardware sysinfo sample (${metrics?.sample_duration_ms ?? 1}ms latency)`}
        </p>
      </div>

      <div className="stat-panel tabular">
        <div className="stat-top">
          <HardDrive size={15} />
          <span>Physical memory commit</span>
          <strong>{metrics ? gib(metrics.memory_used_bytes) : '—'}</strong>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${memPct}%` }} />
        </div>
        <p className="stat-secondary">
          {metrics
            ? `${percent(memPct)} of ${gib(metrics.memory_total_bytes)} allocated`
            : 'Memory reading unavailable'}
        </p>
      </div>

      <div className="section-heading">
        <h2>Process &amp; CLI monitors</h2>
        <span className="subtle-label tabular">
          {metrics ? `${metrics.process_count} OS processes` : 'Active'}
        </span>
      </div>

      <div className="stat-panel tabular">
        <div className="stat-top">
          <TerminalSquare size={15} />
          <span>Detected AI Agent CLIs</span>
          <strong>
            {(processLifecycle?.claude_processes ?? 0) + (processLifecycle?.codex_processes ?? 0) > 0
              ? `${(processLifecycle?.claude_processes ?? 0) + (processLifecycle?.codex_processes ?? 0)} running`
              : 'Idle'}
          </strong>
        </div>
        <p className="stat-secondary">
          Claude Code: <strong>{processLifecycle?.claude_processes ?? 0} active</strong> · Codex: <strong>{processLifecycle?.codex_processes ?? 0} active</strong>
        </p>
      </div>

      <div className="section-heading">
        <h2>Halo sentinel health</h2>
        <span className="subtle-label tabular">
          {perfStats ? `Uptime ${perfStats.uptime_secs}s` : 'Local audit'}
        </span>
      </div>

      <div className="stat-panel tabular">
        <div className="stat-top">
          <ShieldCheck size={15} className="mint-text" />
          <span>Sentinel footprint</span>
          <strong>
            {perfStats?.footprint.available
              ? `${gib(perfStats.footprint.memory_bytes)} RAM`
              : 'Local sentinel'}
          </strong>
        </div>
        <p className="stat-secondary">
          {perfStats?.footprint.available && (
            <span>
              Native PID {perfStats.footprint.pid} · {percent(perfStats.footprint.cpu_percent)} CPU
              <br />
            </span>
          )}
          {pollSummary && pollSummary.samples > 0 ? (
            <span>
              IPC response latency: avg {pollSummary.avgMs}ms · p95 {pollSummary.p95Ms}ms
            </span>
          ) : (
            <span>Collecting IPC round-trip latency...</span>
          )}
          {perfStats?.leak_analysis && (
            <span
              style={{
                display: 'block',
                marginTop: '4px',
                color: perfStats.leak_analysis.suspected_leak ? '#cf222e' : 'var(--status-working, #3fb950)',
              }}
            >
              ✓ {perfStats.leak_analysis.status}
            </span>
          )}
        </p>
      </div>
    </div>
  );
});

export const ActivityView = memo(function ActivityView({
  agents,
  events,
  demo,
  onVerifyWorkspace,
}: {
  agents: Agent[];
  events: AgentEvent[];
  demo: boolean;
  onVerifyWorkspace?: (workspace: string, runTests: boolean) => Promise<unknown>;
}) {
  const [expandedFileAgentId, setExpandedFileAgentId] = useState<string | null>(null);
  const [verifyingAction, setVerifyingAction] = useState<string | null>(null);

  const handleVerify = async (workspace: string, runTests: boolean) => {
    if (!onVerifyWorkspace) return;
    const actionKey = `${workspace}:${runTests ? 'test' : 'git'}`;
    setVerifyingAction(actionKey);
    try {
      await onVerifyWorkspace(workspace, runTests);
    } finally {
      setVerifyingAction(null);
    }
  };

  return (
    <div className="section-scroll" aria-label="Verification and event log">
      <div className="section-heading first-heading">
        <h2>Code changes &amp; verifications</h2>
        <span className="subtle-label tabular">
          {demo ? 'Sample verification' : 'Verified tasks'}
        </span>
      </div>

      {agents.length ? (
        agents.map((agent) => {
          const proof = agent.proof;
          const git = proof?.git;
          const test = proof?.testSummary ?? proof?.test_summary;
          const timestamp = proof?.evidenceTimestamp ?? proof?.evidence_timestamp;
          const changedCount = proof?.changedFiles ?? proof?.changed_files;
          const passedCount = proof?.testsPassed ?? proof?.tests_passed;
          const failedCount = proof?.testsFailed ?? proof?.tests_failed;
          const isFilesExpanded = expandedFileAgentId === agent.id;
          const isVerifyingGit = verifyingAction === `${agent.workspace}:git`;
          const isVerifyingTest = verifyingAction === `${agent.workspace}:test`;

          const badgeLabel = agent.isDemo
            ? 'Sample'
            : proof?.verified
              ? 'All Tests Passed'
              : failedCount && failedCount > 0
                ? `${failedCount} Failed`
                : 'Git Changes';

          return (
            <div className="activity-card" key={agent.id}>
              <div className="agent-head">
                <div className="agent-identity">
                  <FileCode2 size={15} />
                  <strong>{agent.name}</strong>
                  <span className="workspace-tag" title={agent.workspace}>
                    {agent.workspace}
                  </span>
                  {git?.branch && (
                    <span className="workspace-tag tabular" title={`Git branch: ${git.branch}`}>
                      <GitBranch size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                      {git.branch}
                    </span>
                  )}
                </div>
                <span
                  className={`verify-badge ${agent.isDemo ? 'fixture' : proof?.verified ? 'verified' : failedCount && failedCount > 0 ? 'failed' : 'unverified'}`}
                >
                  {!agent.isDemo && proof?.verified && <ShieldCheck size={11} />}
                  {badgeLabel}
                </span>
              </div>

              <p className="task-description">{agent.task}</p>

              {proof ? (
                <>
                  {!proof.verified && (
                    <p
                      style={{
                        margin: '3px 0 7px',
                        fontSize: '10.5px',
                        color: failedCount && failedCount > 0 ? 'var(--amber)' : 'var(--muted)',
                      }}
                    >
                      {failedCount && failedCount > 0
                        ? `Failure: ${failedCount} test(s) failed in allowlisted verification`
                        : passedCount === null
                          ? 'Git changes detected · No allowlisted test profile executed'
                          : 'Test suite inconclusive or 0 tests evaluated'}
                    </p>
                  )}

                  <div className="verification-grid tabular">
                    <div>
                      <span>Files Δ</span>
                      <strong>{changedCount ?? '—'}</strong>
                      {git && (
                        <span style={{ fontSize: '9px', color: 'var(--muted)' }}>
                          {git.modified_count}M · {git.staged_count}S · {git.untracked_count}U
                        </span>
                      )}
                    </div>
                    <div>
                      <span>Tests passed</span>
                      <strong className="mint-text">{passedCount ?? '—'}</strong>
                      {test?.duration_ms && (
                        <span style={{ fontSize: '9px', color: 'var(--muted)' }}>
                          {(test.duration_ms / 1000).toFixed(2)}s
                        </span>
                      )}
                    </div>
                    <div>
                      <span>Tests failed</span>
                      <strong className={failedCount && failedCount > 0 ? 'amber-text' : ''}>
                        {failedCount ?? '—'}
                      </strong>
                      {test?.runner && (
                        <span
                          style={{
                            fontSize: '9px',
                            color: 'var(--muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {test.runner}
                        </span>
                      )}
                    </div>
                  </div>

                  {git?.files && git.files.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        className="inline-action subtle-action"
                        style={{ fontSize: '10.5px', padding: '3px 7px' }}
                        onClick={() =>
                          setExpandedFileAgentId(isFilesExpanded ? null : agent.id)
                        }
                      >
                        {isFilesExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        <span>
                          {isFilesExpanded
                            ? 'Hide changed files'
                            : `View changed files (${git.files.length})`}
                        </span>
                      </button>

                      {isFilesExpanded && (
                        <div
                          className="changed-files-box"
                          role="region"
                          aria-label="Changed files list"
                        >
                          {git.files.map((f) => (
                            <div className="file-row" key={f.path}>
                              <span
                                className={`file-tag ${
                                  f.status.includes('staged')
                                    ? 'staged'
                                    : f.status.includes('untracked')
                                      ? 'untracked'
                                      : 'modified'
                                }`}
                              >
                                {f.status}
                              </span>
                              <span className="file-path" title={f.path}>
                                {f.path}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="evidence-provenance-bar">
                    <span
                      title={proof.provenance ?? ''}
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '75%',
                      }}
                    >
                      {proof.provenance ??
                        (agent.isDemo ? 'Sample provenance' : 'Local inspection')}
                    </span>
                    {timestamp ? (
                      <span className="tabular" style={{ flexShrink: 0 }}>
                        <Clock size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                        {relativeTime(new Date(timestamp).toISOString())}
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="no-proof">
                  Lifecycle hook active — no Git diff or test runner attached to this session.
                </div>
              )}

              {onVerifyWorkspace && !agent.isDemo && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    className="inline-action subtle-action"
                    disabled={Boolean(verifyingAction)}
                    onClick={() => handleVerify(agent.workspace, false)}
                    title="Inspect git status --porcelain for changes"
                  >
                    {isVerifyingGit ? 'Inspecting...' : 'Verify Git Δ'}
                  </button>
                  <button
                    type="button"
                    className="inline-action subtle-action"
                    disabled={Boolean(verifyingAction)}
                    onClick={() => handleVerify(agent.workspace, true)}
                    title="Run allowlisted test profile (npm test)"
                  >
                    {isVerifyingTest ? 'Running...' : 'Run Tests'}
                  </button>
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="empty-state">
          <FileCode2 size={22} />
          <strong>No verifications recorded yet</strong>
          <p>When agents modify files or run test suites in authorized folders, diffs and test results appear here.</p>
        </div>
      )}

      <div className="section-heading">
        <h2>Recent agent activity</h2>
        <span className="subtle-label tabular">{events.length} actions</span>
      </div>

      {events.length ? (
        <div className="event-log tabular" role="log" aria-label="Recent agent activity">
          {events.slice(0, 8).map((ev, idx) => {
            const formatted = formatEventLabel(ev);
            return (
              <div className="event-row" key={`${ev.session_id}-${ev.event}-${idx}`}>
                <span className={`event-type ${formatted.isWarning ? 'amber' : ''}`}>
                  {formatted.title}
                </span>
                <span className="event-cwd">{ev.cwd ? displayPath(ev.cwd) : ev.source}</span>
                <span className="event-time">{demo ? 'sample' : relativeTime(ev.timestamp)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="no-proof">No recent agent actions recorded. When an agent runs, tool calls and timeline events appear here.</div>
      )}
    </div>
  );
});
