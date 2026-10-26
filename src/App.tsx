import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  House,
  PanelTop,
  Settings2,
  Trash2,
  Undo2,
  X,
  Zap,
} from 'lucide-react';
import HaloMark from './components/HaloMark';
import { Overview, SystemView } from './components/Dashboard';
import { ProviderConnections } from './components/ProviderConnections';
import { ActivityView } from './components/ActivityView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useHaloRuntime } from './hooks/useHaloRuntime';
import { usePermissions } from './hooks/usePermissions';
import { createHoverDisclosure } from './lib/hoverDisclosure';
import { contextBudget, currentSessions, providerName } from './lib/sessionSummary';
import { relativeTime } from './lib/format';
import { isDesktop } from './lib/desktop';
import type {
  ClaudeHookStatus,
  DiagnosticBundleExport,
  LaunchAtLoginStatus,
  MonitorDescriptor,
  Tab,
  UserSettings,
} from './types';

const TABS: Array<{ name: Tab; title: string; icon: typeof House }> = [
  { name: 'overview', title: 'Overview', icon: House },
  { name: 'activity', title: 'Activity', icon: Activity },
  { name: 'system', title: 'System', icon: Cpu },
  { name: 'settings', title: 'Settings', icon: Settings2 },
];

const POLL_OPTIONS = [
  { label: '1.5s', value: 1500 },
  { label: '2.5s', value: 2500 },
  { label: '5.0s', value: 5000 },
];

const SettingsView = memo(function SettingsView({
  demo,
  setDemo,
  settings,
  updateSettings,
  monitors,
  eventCount,
  onClearEvents,
  onApproveWorkspace,
  onRevokeWorkspace,
  liveError,
  claudeHookStatus,
  hookLoading = false,
  onEnableClaudeHook,
  onDisableClaudeHook,
  onRollbackClaudeHook,
  launchAtLogin,
  onToggleLaunchAtLogin,
  onExportDiagnosticBundle,
  exportingBundle = false,
  exportResult,
  exportError,
  suggestedWorkspace,
}: {
  demo: boolean;
  setDemo: (value: boolean) => void;
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  monitors: MonitorDescriptor[];
  eventCount: number;
  onClearEvents: () => void;
  onApproveWorkspace?: (path: string) => Promise<void>;
  onRevokeWorkspace?: (path: string) => Promise<void>;
  liveError: string | null;
  claudeHookStatus?: ClaudeHookStatus | null;
  hookLoading?: boolean;
  onEnableClaudeHook?: () => Promise<ClaudeHookStatus>;
  onDisableClaudeHook?: () => Promise<ClaudeHookStatus>;
  onRollbackClaudeHook?: () => Promise<ClaudeHookStatus>;
  launchAtLogin?: LaunchAtLoginStatus | null;
  onToggleLaunchAtLogin?: (enabled: boolean) => Promise<LaunchAtLoginStatus>;
  onExportDiagnosticBundle?: () => Promise<DiagnosticBundleExport | null>;
  exportingBundle?: boolean;
  exportResult?: DiagnosticBundleExport | null;
  exportError?: string | null;
  suggestedWorkspace?: string;
}) {
  const [workspaceInput, setWorkspaceInput] = useState(suggestedWorkspace ?? '');
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceAuthorizing, setWorkspaceAuthorizing] = useState(false);
  const workspaceInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!suggestedWorkspace) return;
    setWorkspaceInput(suggestedWorkspace);
    workspaceInputRef.current?.focus();
    workspaceInputRef.current?.scrollIntoView({ block: 'center' });
  }, [suggestedWorkspace]);
  return (
    <div className="section-scroll" aria-label="Settings and preferences">
      {/* 1. AGENT INTEGRATIONS */}
      <div className="section-heading first-heading">
        <h2>Agent integrations</h2>
        <span className="subtle-label">
          {claudeHookStatus?.installed ? 'Claude Code active' : 'Setup'}
        </span>
      </div>

      <div className="settings-card">
        <div className="setting-row" style={{ alignItems: 'flex-start' }}>
          <div className="setting-description">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong>Claude Code Lifecycle Bridge</strong>
              <span
                className={`integration-tag ${
                  claudeHookStatus?.installed
                    ? ''
                    : claudeHookStatus?.hook_count
                    ? 'warning-tag'
                    : 'muted-tag'
                }`}
                style={{ fontSize: '10px', padding: '2px 6px' }}
              >
                {claudeHookStatus?.installed
                  ? 'Active (6/6 hooks)'
                  : claudeHookStatus?.hook_count
                  ? `${claudeHookStatus.hook_count}/6 partial`
                  : 'Disabled'}
              </span>
            </div>
            <p style={{ marginTop: '4px' }}>
              Connects lifecycle events and permission decisions via <code>~/.claude/settings.json</code>.
              Requested tool input is held locally only while awaiting your decision (up to 45 seconds).
            </p>
            {claudeHookStatus?.backup_exists && (
              <p className="mono-path" style={{ marginTop: '3px', fontSize: '10px', color: 'var(--mint)' }}>
                Backup ready: {claudeHookStatus.backup_path}
              </p>
            )}
          </div>
        </div>

        <div className="setting-divider" />

        <div className="setting-row" style={{ justifyContent: 'flex-end', gap: '8px' }}>
          {claudeHookStatus?.backup_exists && onRollbackClaudeHook && (
            <button
              type="button"
              className="inline-action subtle-action"
              disabled={hookLoading}
              onClick={() => void onRollbackClaudeHook()}
              title="Rollback ~/.claude/settings.json to previous backup"
            >
              <Undo2 size={12} />
              {hookLoading ? 'Working...' : 'Rollback'}
            </button>
          )}

          {claudeHookStatus?.installed ? (
            onDisableClaudeHook && (
              <button
                type="button"
                className="inline-action subtle-action"
                disabled={hookLoading}
                onClick={() => void onDisableClaudeHook()}
                title="Remove Halo lifecycle hooks from Claude settings"
              >
                {hookLoading ? 'Working...' : 'Disable'}
              </button>
            )
          ) : (
            onEnableClaudeHook && (
              <button
                type="button"
                className="inline-action"
                disabled={hookLoading}
                onClick={() => void onEnableClaudeHook()}
                title="Safely inject Halo lifecycle hooks with backup"
              >
                <Zap size={12} />
                {hookLoading ? 'Working...' : 'Enable (1-Click)'}
              </button>
            )
          )}
        </div>

        <div className="setting-divider" />

        <div className="setting-row">
          <div className="setting-description">
            <strong>OpenAI Codex log adapter</strong>
            <p>Ingest local Codex rollout logs from ~/.codex/sessions.</p>
          </div>
          <button
            type="button"
            className={`toggle ${settings.enable_codex_logs !== false ? 'on' : ''}`}
            aria-label="Toggle Codex session logs adapter"
            aria-pressed={settings.enable_codex_logs !== false}
            onClick={() =>
              updateSettings({ enable_codex_logs: settings.enable_codex_logs === false })
            }
          >
            <span />
          </button>
        </div>

        <div className="setting-divider" />

        <div className="setting-row">
          <div className="setting-description">
            <strong>Process lifecycle reconciliation</strong>
            <p>Monitor active CLI processes to detect background completions.</p>
          </div>
          <button
            type="button"
            className={`toggle ${settings.process_reconciliation !== false ? 'on' : ''}`}
            aria-label="Toggle process lifecycle reconciliation"
            aria-pressed={settings.process_reconciliation !== false}
            onClick={() =>
              updateSettings({
                process_reconciliation: settings.process_reconciliation === false,
              })
            }
          >
            <span />
          </button>
        </div>
      </div>

      <div className="section-heading"><h2>More coding agents</h2><span className="subtle-label">Opt-in connections</span></div>
      <div className="settings-card"><ProviderConnections /></div>

      {/* 2. AUTHORIZED WORKSPACES */}
      <div className="section-heading">
        <h2>Authorized project folders</h2>
        <span className="subtle-label">Allowed boundaries</span>
      </div>

      <div className="settings-card">
        <div style={{ display: 'flex', gap: '8px', padding: '12px 14px' }}>
          <input
            ref={workspaceInputRef}
            type="text"
            aria-label="Workspace folder path"
            className="workspace-input"
            placeholder="C:\path\to\project"
            value={workspaceInput}
            onChange={(e) => setWorkspaceInput(e.target.value)}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px',
              color: '#fff',
              padding: '6px 10px',
              fontSize: '12px',
            }}
          />
          <button
            type="button"
            className="inline-action"
            disabled={workspaceAuthorizing || !workspaceInput.trim()}
            onClick={async () => {
              if (workspaceInput.trim() && onApproveWorkspace) {
                setWorkspaceAuthorizing(true);
                setWorkspaceError('');
                try {
                  await onApproveWorkspace(workspaceInput.trim());
                  setWorkspaceInput('');
                } catch (error) {
                  setWorkspaceError(error instanceof Error ? error.message : String(error));
                } finally { setWorkspaceAuthorizing(false); }
              }
            }}
          >
            {workspaceAuthorizing ? 'Authorizing…' : 'Authorize'}
          </button>
        </div>

        {workspaceError && <p className="activity-check-error" role="alert">{workspaceError}</p>}
        {settings.approved_workspaces && settings.approved_workspaces.length > 0 ? (
          settings.approved_workspaces.map((ws) => (
            <div key={ws} className="setting-row" style={{ padding: '8px 14px' }}>
              <span className="mono-path" style={{ fontSize: '12px' }}>
                {ws}
              </span>
              {onRevokeWorkspace && (
                <button
                  type="button"
                  className="inline-action subtle-action"
                  onClick={() => void onRevokeWorkspace(ws)}
                  title="Revoke approval"
                >
                  <Trash2 size={12} /> Revoke
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="no-proof" style={{ padding: '8px 14px' }}>
            No project folders authorized yet. Add a workspace path above to allow git diff and test verification.
          </div>
        )}
      </div>

      {/* 3. WINDOW & BEHAVIOR PREFERENCES */}
      <div className="section-heading">
        <h2>Window &amp; display preferences</h2>
        <span className="subtle-label">Interface behavior</span>
      </div>

      <div className="settings-card">
        <div className="setting-row">
          <div className="setting-description">
            <strong>Auto-collapse on focus loss</strong>
            <p>Collapse back to the compact Dynamic Island notch when clicking into other apps.</p>
          </div>
          <button
            type="button"
            className={`toggle ${settings.auto_collapse_on_blur ? 'on' : ''}`}
            aria-label="Toggle auto-collapse on focus loss"
            aria-pressed={settings.auto_collapse_on_blur}
            onClick={() =>
              updateSettings({ auto_collapse_on_blur: !settings.auto_collapse_on_blur })
            }
          >
            <span />
          </button>
        </div>

        <div className="setting-divider" />

        <div className="setting-row">
          <div className="setting-description">
            <strong>Start at Windows login</strong>
            <p>Automatically launch STXIC Halo in background at system startup.</p>
            {launchAtLogin?.error && (
              <p style={{ marginTop: '2px', fontSize: '10.5px', color: 'var(--amber)' }}>
                {launchAtLogin.error}
              </p>
            )}
          </div>
          <button
            type="button"
            className={`toggle ${launchAtLogin?.enabled ? 'on' : ''}`}
            aria-label="Toggle start at Windows login"
            aria-pressed={Boolean(launchAtLogin?.enabled)}
            onClick={() => onToggleLaunchAtLogin?.(!launchAtLogin?.enabled)}
          >
            <span />
          </button>
        </div>

        <div className="setting-divider" />

        <div className="setting-row">
          <div className="setting-description">
            <strong>Permission &amp; failure alerts</strong>
            <p>Notify on blocking approval requests and failed test runs.</p>
          </div>
          <button
            type="button"
            className={`toggle ${settings.alert_on_waiting ? 'on' : ''}`}
            aria-label="Toggle permission and failure alerts"
            aria-pressed={settings.alert_on_waiting}
            onClick={() => {
              const next = !settings.alert_on_waiting;
              updateSettings({ alert_on_waiting: next, alert_on_failure: next });
            }}
          >
            <span />
          </button>
        </div>

        <div className="setting-divider" />

        <div className="setting-row">
          <div className="setting-description">
            <strong>Reduce motion</strong>
            <p>Disable spring transitions and smooth animations.</p>
          </div>
          <button
            type="button"
            className={`toggle ${settings.reduce_motion ? 'on' : ''}`}
            aria-label="Toggle reduced motion"
            aria-pressed={settings.reduce_motion}
            onClick={() => updateSettings({ reduce_motion: !settings.reduce_motion })}
          >
            <span />
          </button>
        </div>

        <div className="setting-divider" />

        <div className="setting-row">
          <div className="setting-description">
            <strong>Refresh interval</strong>
            <p>Background cadence for hardware and agent telemetry polling.</p>
          </div>
          <div className="segmented-pills tabular" role="group" aria-label="Poll cadence">
            {POLL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`seg-pill ${settings.poll_interval_ms === opt.value ? 'active' : ''}`}
                onClick={() => updateSettings({ poll_interval_ms: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {monitors.length > 1 && (
          <>
            <div className="setting-divider" />
            <div className="setting-row">
              <div className="setting-description">
                <strong>Target display</strong>
                <p>Pin notch capsule to a specific monitor.</p>
              </div>
              <select
                className="monitor-select tabular"
                aria-label="Target display"
                value={settings.target_monitor_index}
                onChange={(e) => updateSettings({ target_monitor_index: Number(e.target.value) })}
              >
                {monitors.map((m) => (
                  <option key={m.index} value={m.index}>
                    {m.name} ({m.width}×{m.height})
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* 4. DIAGNOSTICS & TESTING (ADVANCED) */}
      <div className="section-heading">
        <h2>Diagnostics &amp; maintenance</h2>
        <span className="subtle-label">Support</span>
      </div>

      <div className="settings-card">
        <div className="setting-row" style={{ padding: '10px 14px' }}>
          <div className="setting-description">
            <strong>Diagnostic support bundle</strong>
            <p>Export sanitized JSON diagnostics (OS, health metrics, zero code or keys).</p>
          </div>
          {onExportDiagnosticBundle && (
            <button
              type="button"
              className="inline-action"
              disabled={exportingBundle}
              onClick={() => void onExportDiagnosticBundle()}
              title="Export sanitized diagnostic bundle"
            >
              <Download size={12} /> {exportingBundle ? 'Exporting...' : 'Export'}
            </button>
          )}
        </div>
        {exportResult && (
          <div style={{ padding: '4px 14px 10px', fontSize: '11px', color: 'var(--mint)' }}>
            ✓ Bundle saved: <code className="mono-path">{exportResult.saved_to_file}</code>
          </div>
        )}
        {exportError && (
          <div style={{ padding: '4px 14px 10px', fontSize: '11px', color: 'var(--coral)' }}>
            ⚠️ Export failed: {exportError}
          </div>
        )}

        {!demo && isDesktop() && eventCount > 0 && (
          <>
            <div className="setting-divider" />
            <div className="setting-row" style={{ padding: '10px 14px' }}>
              <div className="setting-description">
                <strong>Local event log ({eventCount} records)</strong>
                <p>Reset local activity history on disk.</p>
              </div>
              <button type="button" className="inline-action subtle-action" onClick={onClearEvents}>
                <Trash2 size={12} /> Clear
              </button>
            </div>
          </>
        )}

        <div className="setting-divider" />

        <div className="setting-row" style={{ padding: '10px 14px' }}>
          <div className="setting-description">
            <strong>Diagnostic telemetry simulation</strong>
            <p>Simulate synthetic multi-agent sessions for UI inspection.</p>
          </div>
          <button
            type="button"
            className={`toggle ${demo ? 'on' : ''}`}
            aria-label="Toggle developer telemetry simulation"
            aria-pressed={demo}
            onClick={() => setDemo(!demo)}
          >
            <span />
          </button>
        </div>
      </div>

      {liveError && <div className="error-note">Local bridge error: {liveError}</div>}
    </div>
  );
});

export default function App() {
  const {
    expanded,
    setExpanded,
    preview,
    setPreview,
    tab,
    setTab,
    openTab,
    demo,
    setDemo,
    settings,
    updateSettings,
    monitors,
    shownAgents,
    usageResult,
    workspaceChecks,
    shownMetrics,
    shownHistory,
    shownEvents,
    activeAlerts,
    acknowledgeAlert,
    liveError,
    handleClearEvents,
    handleApproveWorkspace,
    handleRevokeWorkspace,
    handleVerifyWorkspace,
    claudeHookStatus,
    hookLoading,
    handleEnableClaudeHook,
    handleDisableClaudeHook,
    handleRollbackClaudeHook,
    processLifecycle,
    pollSummary,
    launchAtLogin,
    handleToggleLaunchAtLogin,
    perfStats,
    secondInstancePing,
    handleExportDiagnosticBundle,
    exportingBundle,
    exportResult,
    exportError,
  } = useHaloRuntime();

  const [workspaceSetup, setWorkspaceSetup] = useState('');
  useEffect(() => { if (tab !== 'settings') setWorkspaceSetup(''); }, [tab]);

  const collapsedPillRef = useRef<HTMLButtonElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const permissions = usePermissions(!demo);
  const pendingPermission = permissions.requests[0];
  const hover = useMemo(() => createHoverDisclosure(
    () => { if (!expanded) setPreview(true); },
    () => setPreview(false),
    () => true,
  ), [expanded, setPreview]);
  useEffect(() => () => hover.cancel(), [hover]);
  useEffect(() => {
    if (expanded) setPreview(false);
  }, [expanded, setPreview]);

  // Accessible focus retention: return focus to collapsed pill when closing,
  // and focus the active tab when expanding.
  const wasExpandedRef = useRef(expanded);
  useEffect(() => {
    if (wasExpandedRef.current && !expanded) {
      collapsedPillRef.current?.focus();
    } else if (!wasExpandedRef.current && expanded) {
      activeTabRef.current?.focus();
    }
    wasExpandedRef.current = expanded;
  }, [expanded]);

  const sessions = currentSessions(shownAgents);
  const activeWorking = sessions.filter((a) => a.status === 'working').length;
  const leadWorkingAgent = sessions[0];
  const previewAgent = leadWorkingAgent ?? [...shownAgents].sort((a, b) => Date.parse(b.lastSeen) - Date.parse(a.lastSeen))[0];
  const budget = contextBudget(previewAgent);
  const leadAlert = activeAlerts[0];
  const leadAttention = leadAlert?.agent;
  const failedCount = leadAttention?.proof?.testsFailed ?? 0;

  const ledStatusClass = pendingPermission || activeAlerts.length > 0
    ? 'waiting'
    : activeWorking > 0
      ? 'working'
      : 'idle';

  const pillHeadline = leadWorkingAgent ? providerName(leadWorkingAgent) : 'STXIC Halo';

  const pillSub = pendingPermission ? 'Approval required' : leadAttention
    ? failedCount > 0
      ? `${failedCount} test fail`
      : 'Awaiting review'
    : leadWorkingAgent
      ? `${sessions.length} active`
      : activeWorking > 0
        ? `${activeWorking} active`
        : 'Ready';

  const activeTabIndex = Math.max(0, TABS.findIndex((t) => t.name === tab));
  const isFloatingBezel = settings.top_inset_px > 0;

  return (
    <ErrorBoundary onReset={() => setExpanded(false)}>
      <div
        className={`app-frame ${expanded ? 'expanded' : preview ? 'preview' : 'collapsed'} ${settings.reduce_motion ? 'reduce-motion' : ''}`}
      >
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {secondInstancePing ? 'STXIC Halo instance already running; focused floating console.' : ''}
        </div>
        <div className="island" role="region" aria-label="STXIC Halo floating monitor"
          onPointerEnter={(event) => { if (event.pointerType !== 'touch') hover.enter(); }}
          onPointerLeave={() => hover.leave()}
        >
          {!expanded ? (
            <button
              ref={collapsedPillRef}
              type="button"
              className={`collapsed-pill ${preview ? 'token-preview' : ''} ${pendingPermission || activeAlerts.length ? 'has-warning' : ''} ${isFloatingBezel ? 'floating-bezel' : ''}`}
              onClick={() => { hover.cancel(); setPreview(false); setExpanded(true); }}
              aria-expanded={false}
              aria-label="Open Halo dashboard"
              title="Hover for tokens · Click to open dashboard"
            >
              <span className="notch-summary">
              <span className="notch-left">
                <span className={`notch-led ${ledStatusClass}`} aria-hidden="true" />
                <span className="pill-main">
                  <span className="pill-title">{pillHeadline}</span>
                  <span className="pill-sep" aria-hidden="true">·</span>
                  <span className="pill-subtitle tabular">{pillSub}</span>
                </span>
              </span>

              <span className="notch-right">
                <span
                  className={`pill-telemetry tabular ${activeAlerts.length ? 'warning' : 'healthy'}`}
                >
                  {pendingPermission ? 'Review' : budget ? `${budget.percentRemaining}% left` : 'Local'}
                </span>
                <ChevronDown size={13} className="pill-chevron" />
              </span>
              </span>
              {preview && <span className="token-preview-body">
                <span className="token-preview-value tabular">{budget ? `${budget.remaining.toLocaleString()} tokens left` : 'Token count unavailable'}</span>
                <span className="token-preview-detail">{previewAgent ? `${previewAgent.workspace} · ` : ''}{budget ? `${leadWorkingAgent ? 'Context' : 'Last report'} · ${relativeTime(previewAgent!.lastSeen)}` : 'Waiting for provider data'}</span>
                <span className="token-preview-hint">Click to open dashboard</span>
              </span>}
            </button>
          ) : (
            <div className={`expanded-card ${isFloatingBezel ? 'floating-bezel' : ''}`}>
              <header className="island-header">
                <div className="brand-header">
                  <div className="brand-square">
                    <HaloMark size={18} />
                  </div>
                  <div className="stack-tight">
                    <strong className="brand-wordmark">
                      STXIC <span className="mint-text">Halo</span>
                    </strong>
                    <span className="tiny muted tabular">
                      Agent Monitor
                    </span>
                  </div>
                </div>

                <div className="header-actions">
                  {demo && (
                    <span className="demo-badge tabular">Simulation</span>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setExpanded(false)}
                    aria-label="Collapse island (Escape)"
                    title="Collapse (Esc)"
                  >
                    <ChevronUp size={15} />
                  </button>
                </div>
              </header>

              <nav
                className="tabs segmented-control"
                role="tablist"
                aria-label="Console views"
                onKeyDown={(e) => {
                  const idx = TABS.findIndex((t) => t.name === tab);
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const next = (idx + 1) % TABS.length;
                    setTab(TABS[next].name);
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const prev = (idx - 1 + TABS.length) % TABS.length;
                    setTab(TABS[prev].name);
                  } else if (e.key === 'Home') {
                    e.preventDefault();
                    setTab(TABS[0].name);
                  } else if (e.key === 'End') {
                    e.preventDefault();
                    setTab(TABS[TABS.length - 1].name);
                  }
                }}
              >
                <div
                  className="segmented-slider"
                  style={{ transform: `translateX(${activeTabIndex * 100}%)` }}
                  aria-hidden="true"
                />
                {TABS.map(({ name, title, icon: Icon }) => (
                  <button
                    type="button"
                    key={name}
                    ref={tab === name ? activeTabRef : undefined}
                    role="tab"
                    id={`halo-tab-${name}`}
                    aria-selected={tab === name}
                    aria-controls={`halo-panel-${name}`}
                    tabIndex={tab === name ? 0 : -1}
                    className={`tab segmented-item ${tab === name ? 'active' : ''}`}
                    onClick={() => setTab(name)}
                  >
                    <Icon size={12.5} />
                    <span>{title}</span>
                    {name === 'activity' && activeAlerts.length > 0 && (
                      <span className="tab-count tabular">{activeAlerts.length}</span>
                    )}
                  </button>
                ))}
              </nav>

              <main
                className="main-area"
                role="tabpanel"
                id={`halo-panel-${tab}`}
                aria-labelledby={`halo-tab-${tab}`}
              >
                {pendingPermission && (
                  <section className="permission-card" aria-label="Claude Code permission request">
                    <strong>Approval required · {pendingPermission.tool_name}</strong>
                    <p className="permission-workspace">{pendingPermission.cwd}</p>
                    <p className="permission-workspace">Session {pendingPermission.session_id}</p>
                    <pre tabIndex={0} aria-label="Requested tool input">{pendingPermission.tool_input}</pre>
                    <div className="permission-actions">
                      <span className="tabular">{permissions.requests.length} pending</span>
                      <button type="button" className="inline-action subtle-action" disabled={permissions.busy}
                        onClick={() => void permissions.decide(pendingPermission.id, 'deny')}>Deny</button>
                      <button type="button" className="inline-action" disabled={permissions.busy || Date.now() >= pendingPermission.expires_at}
                        onClick={() => void permissions.decide(pendingPermission.id, 'allow')}>Approve once</button>
                    </div>
                    <p>Expires after 45 seconds; then review in Claude Code.</p>
                  </section>
                )}
                {permissions.error && <p className="permission-message" role="alert">{permissions.error}</p>}
                {permissions.notice && <p className="permission-message" role="status">{permissions.notice}</p>}
                {tab === 'overview' && (
                  <Overview
                    usageResult={usageResult}
                    agents={shownAgents}
                    alerts={activeAlerts.filter(alert => alert.agent.id !== pendingPermission?.session_id)}
                    onReview={() => openTab('activity')}
                    onAcknowledgeAlert={acknowledgeAlert}
                    onConnect={() => openTab('settings')}
                    claudeHookStatus={claudeHookStatus}
                  />
                )}
                {tab === 'activity' && (
                  <ActivityView
                    agents={shownAgents}
                    events={shownEvents}
                    demo={demo}
                    onVerifyWorkspace={handleVerifyWorkspace}
                    approvedWorkspaces={settings.approved_workspaces ?? []}
                    checks={workspaceChecks}
                    onWorkspaceSettings={(path) => { setWorkspaceSetup(path); openTab('settings'); }}
                  />
                )}
                {tab === 'system' && (
                  <SystemView
                    metrics={shownMetrics}
                    history={shownHistory}
                    demo={demo}
                    pollIntervalMs={settings.poll_interval_ms}
                    pollSummary={pollSummary}
                    perfStats={perfStats}
                    processLifecycle={processLifecycle}
                  />
                )}
                {tab === 'settings' && (
                  <SettingsView
                    suggestedWorkspace={workspaceSetup}
                    demo={demo}
                    setDemo={setDemo}
                    settings={settings}
                    updateSettings={updateSettings}
                    monitors={monitors}
                    eventCount={shownEvents.length}
                    onClearEvents={() => void handleClearEvents()}
                    onApproveWorkspace={handleApproveWorkspace}
                    onRevokeWorkspace={handleRevokeWorkspace}
                    liveError={liveError}
                    claudeHookStatus={claudeHookStatus}
                    hookLoading={hookLoading}
                    onEnableClaudeHook={handleEnableClaudeHook}
                    onDisableClaudeHook={handleDisableClaudeHook}
                    onRollbackClaudeHook={handleRollbackClaudeHook}
                    launchAtLogin={launchAtLogin}
                    onToggleLaunchAtLogin={handleToggleLaunchAtLogin}
                    onExportDiagnosticBundle={handleExportDiagnosticBundle}
                    exportingBundle={exportingBundle}
                    exportResult={exportResult}
                    exportError={exportError}
                  />
                )}
              </main>

              <footer className="island-footer tabular">
                <span>
                  <span className={`online-dot ${activeAlerts.length ? 'amber' : ''}`} />
                  {demo ? 'Simulation' : `On this device · ${sessions.length} active`}
                </span>
                <span className="footer-right">Esc to close</span>
              </footer>
            </div>
          )}
        </div>

        {!isDesktop() && !expanded && (
          <div className="browser-help">
            <PanelTop size={15} />
            <span>Hover for tokens. Click for the full dashboard.</span>
          </div>
        )}
        {!isDesktop() && expanded && (
          <button type="button" className="floating-close" onClick={() => setExpanded(false)}>
            <ArrowLeft size={13} /> Collapse HUD <X size={12} />
          </button>
        )}
      </div>
    </ErrorBoundary>
  );
}
