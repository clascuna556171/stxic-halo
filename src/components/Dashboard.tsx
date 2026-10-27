import { memo } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Cpu,
  HardDrive,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';
import type {
  Agent,
  AlertItem,
  ClaudeHookStatus,
  Metrics,
  MetricsHistorySummary,
  PerformanceStats,
  PollTimingSummary,
  ProcessLifecycleSnapshot,
} from '../types';
import { gib, percent, relativeTime } from '../lib/format';
import { contextBudget, currentSessions, PROVIDER_NAMES } from '../lib/sessionSummary';
import { UsageOverview } from './UsageOverview';
import { ProviderIcon } from './ProviderIcon';
import type { UsageReadResult } from '../types';

const statusLabel: Record<Agent['status'], string> = {
  working: 'Working',
  waiting: 'Awaiting review',
  completed: 'Stopped',
  error: 'Error',
  unknown: 'Unknown',
};

const providerBadge = PROVIDER_NAMES;

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

export const Overview = memo(function Overview({
  agents, alerts, onReview, onAcknowledgeAlert, onConnect, claudeHookStatus, usageResult,
}: {
  agents: Agent[];
  alerts: AlertItem[];
  onReview: () => void;
  onAcknowledgeAlert?: (key: string) => void;
  onConnect: () => void;
  claudeHookStatus?: ClaudeHookStatus | null;
  usageResult: UsageReadResult;
}) {
  const sessions = currentSessions(agents);
  return (
    <div className="section-scroll overview-simple" aria-label="Workspace overview">
      {alerts[0] && <AttentionCard alert={alerts[0]} onReview={onReview} onAcknowledge={onAcknowledgeAlert} />}
      <UsageOverview agents={agents} result={usageResult} />
      <div className="section-heading session-heading">
        <h2>Current sessions</h2>
        <span className="subtle-label tabular">{sessions.length} active</span>
      </div>
      {sessions.length ? sessions.map(agent => {
        const budget = contextBudget(agent);
        return <button className="session-row" type="button" key={agent.id} onClick={onReview}>
          <span className="session-row-heading">
            <strong className="provider-label"><ProviderIcon provider={agent.provider} />{providerBadge[agent.provider]}</strong>
            <span className={`session-state ${agent.status}`}>{statusLabel[agent.status]}</span>
          </span>
          <span className="session-row-workspace">{agent.workspace}</span>
          <span className="session-row-detail">
            <span>{budget ? `${budget.remaining.toLocaleString()} context tokens left` : agent.task}</span>
            <span>{relativeTime(agent.lastSeen)}</span>
          </span>
        </button>;
      }) : <div className="overview-empty session-empty">
        <strong>No active sessions</strong>
        {!agents.length && !claudeHookStatus?.installed && <button type="button" className="inline-action" onClick={onConnect}>Manage connections</button>}
        {agents.length > 0 && <button type="button" className="inline-action subtle-action" onClick={onReview}>View recent activity</button>}
      </div>}

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
