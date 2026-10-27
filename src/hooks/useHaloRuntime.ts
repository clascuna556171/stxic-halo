import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadLocalSettings, sanitizeSettings } from '../config/settings';
import { demoAgents, demoEvents, demoMetrics, demoMetricsHistory } from '../data/demo';
import {
  buildAlertKey,
  notificationPolicy,
  sessionsFromEvents,
} from '../lib/agentEvents';
import {
  approveWorkspace,
  checkClaudeHookStatus,
  clearEvents,
  disableClaudeHook,
  enableClaudeHook,
  exportDiagnosticBundle,
  fitIsland,
  getLaunchAtLogin,
  isDesktop,
  listMonitors,
  loadSettings,
  readCodexEvents,
  readCodexTelemetry,
  readEvents,
  readIntegrationStatus,
  readMetrics,
  readPerformanceStats,
  readProcessLifecycle,
  readUsageReports,
  revokeWorkspace,
  saveSettings,
  setLaunchAtLogin,
  subscribeEventsUpdated,
  subscribeTrayEvents,
} from '../lib/desktop';
import { reduceCodexSessions } from '../lib/codexAdapter';
import { localProofOfWorkVerifier } from '../lib/proofOfWork';
import { appendMetricsSample, EMPTY_METRICS_HISTORY } from '../lib/telemetryHistory';
import { reconcileSessions } from '../lib/sessionReconciliation';
import { applyWorkspaceChecks, workspaceIdentity } from '../lib/activity';
import { appendPollTiming, summarizePollTimings } from '../lib/perfTiming';
import type {
  Agent,
  AgentEvent,
  AlertItem,
  ClaudeHookStatus,
  DiagnosticBundleExport,
  IntegrationStatus,
  LaunchAtLoginStatus,
  Metrics,
  MetricsHistorySummary,
  MonitorDescriptor,
  PerformanceStats,
  PollTimingSummary,
  ProofSummary,
  ProcessLifecycleSnapshot,
  QuotaWindow,
  Tab,
  UserSettings,
  UsageReadResult,
} from '../types';

const TAB_ORDER: readonly Tab[] = ['overview', 'activity', 'system', 'settings'];

export function areMetricsEqual(a: Metrics | null, b: Metrics | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.cpu_percent - b.cpu_percent) < 0.2 &&
    a.memory_used_bytes === b.memory_used_bytes &&
    a.memory_total_bytes === b.memory_total_bytes &&
    a.process_count === b.process_count
  );
}

export function areProcessLifecyclesEqual(
  a: ProcessLifecycleSnapshot | null,
  b: ProcessLifecycleSnapshot | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.available !== b.available ||
    a.claude_processes !== b.claude_processes ||
    a.codex_processes !== b.codex_processes ||
    a.processes.length !== b.processes.length
  ) {
    return false;
  }
  for (let i = 0; i < a.processes.length; i++) {
    const pa = a.processes[i];
    const pb = b.processes[i];
    if (pa.pid !== pb.pid || pa.provider !== pb.provider || pa.cwd !== pb.cwd) {
      return false;
    }
  }
  return true;
}

export function areEventsEqual(a: AgentEvent[], b: AgentEvent[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.session_id !== y.session_id ||
      x.timestamp !== y.timestamp ||
      x.event !== y.event ||
      x.source !== y.source ||
      x.cwd !== y.cwd ||
      x.tool_name !== y.tool_name ||
      x.schema_version !== y.schema_version
    ) {
      return false;
    }
  }
  return true;
}

function areProofsEqual(a: ProofSummary | null | undefined, b: ProofSummary | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.verified === b.verified &&
    a.testsPassed === b.testsPassed &&
    a.tests_passed === b.tests_passed &&
    a.testsFailed === b.testsFailed &&
    a.tests_failed === b.tests_failed &&
    a.changedFiles === b.changedFiles &&
    a.changed_files === b.changed_files &&
    a.provenance === b.provenance &&
    a.evidence_timestamp === b.evidence_timestamp &&
    a.evidenceTimestamp === b.evidenceTimestamp
  );
}

function areQuotasEqual(a?: QuotaWindow[], b?: QuotaWindow[]): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const qa = a[i];
    const qb = b[i];
    if (
      qa.label !== qb.label ||
      qa.used_percent !== qb.used_percent ||
      qa.resets_at !== qb.resets_at ||
      qa.observed_at !== qb.observed_at ||
      qa.window_minutes !== qb.window_minutes
    ) {
      return false;
    }
  }
  return true;
}

export function areAgentsEqual(a: Agent[], b: Agent[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.provider !== y.provider ||
      x.name !== y.name ||
      x.task !== y.task ||
      x.workspace !== y.workspace ||
      x.workspacePath !== y.workspacePath ||
      x.status !== y.status ||
      x.lastSeen !== y.lastSeen ||
      x.tokenUsage !== y.tokenUsage ||
      x.contextTokens !== y.contextTokens ||
      x.contextPercent !== y.contextPercent ||
      x.contextWindow !== y.contextWindow ||
      x.usageObservedAt !== y.usageObservedAt ||
      x.isStale !== y.isStale ||
      x.isDemo !== y.isDemo ||
      x.liveness !== y.liveness ||
      !areProofsEqual(x.proof, y.proof) ||
      !areQuotasEqual(x.quotaWindows, y.quotaWindows)
    ) {
      return false;
    }
  }
  return true;
}

export function areUsageResultsEqual(a: UsageReadResult, b: UsageReadResult): boolean {
  if (a === b) return true;
  if (a.reports.length !== b.reports.length || a.errors.length !== b.errors.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useHaloRuntime() {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [demo, setDemo] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(() => loadLocalSettings());
  const [monitors, setMonitors] = useState<MonitorDescriptor[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricsHistorySummary>(EMPTY_METRICS_HISTORY);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [usageResult, setUsageResult] = useState<UsageReadResult>({ reports: [], errors: [] });
  const [workspaceChecks, setWorkspaceChecks] = useState<Record<string, ProofSummary>>({});
  const workspaceChecksRef = useRef(workspaceChecks);
  workspaceChecksRef.current = workspaceChecks;
  const verificationInFlight = useRef(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [acknowledgedAlertKeys, setAcknowledgedAlertKeys] = useState<Set<string>>(() => new Set());
  const [claudeHookStatus, setClaudeHookStatus] = useState<ClaudeHookStatus | null>(null);
  const [hookLoading, setHookLoading] = useState(false);
  const [processLifecycle, setProcessLifecycle] = useState<ProcessLifecycleSnapshot | null>(null);
  const [pollTimings, setPollTimings] = useState<number[]>([]);
  const [launchAtLogin, setLaunchAtLoginState] = useState<LaunchAtLoginStatus | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [perfStats, setPerfStats] = useState<PerformanceStats | null>(null);
  const [secondInstancePing, setSecondInstancePing] = useState<number | null>(null);

  const processLifecycleRef = useRef(processLifecycle);
  processLifecycleRef.current = processLifecycle;

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  // Background telemetry refs are updated by polling and never overwritten by render passes
  const metricsRef = useRef<Metrics | null>(metrics);
  const metricsHistoryRef = useRef<MetricsHistorySummary>(metricsHistory);
  const pollTimingsRef = useRef<number[]>(pollTimings);

  const usageResultRef = useRef(usageResult);
  usageResultRef.current = usageResult;

  const tabRef = useRef(tab);
  tabRef.current = tab;

  const refreshClaudeHookStatus = useCallback(async () => {
    try {
      const status = await checkClaudeHookStatus();
      setClaudeHookStatus(status);
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const refreshIntegrationStatus = useCallback(async () => {
    try {
      const status = await readIntegrationStatus();
      setIntegrationStatus(status);
    } catch {
      // Non-fatal background refresh
    }
  }, []);

  const refreshPerfStats = useCallback(async () => {
    try {
      const stats = await readPerformanceStats();
      setPerfStats(stats);
    } catch {
      // Non-fatal background refresh
    }
  }, []);

  const refreshLaunchAtLogin = useCallback(async () => {
    try {
      const status = await getLaunchAtLogin();
      setLaunchAtLoginState(status);
    } catch {
      // Non-fatal background refresh
    }
  }, []);

  const handleToggleLaunchAtLogin = useCallback(
    async (enabled: boolean) => {
      try {
        const updated = await setLaunchAtLogin(enabled);
        setLaunchAtLoginState(updated);
        void refreshIntegrationStatus();
        return updated;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setLiveError(msg);
        throw error;
      }
    },
    [refreshIntegrationStatus]
  );

  useEffect(() => {
    void refreshClaudeHookStatus();
    void refreshLaunchAtLogin();
    void refreshIntegrationStatus();
    void refreshPerfStats();
  }, [refreshClaudeHookStatus, refreshLaunchAtLogin, refreshIntegrationStatus, refreshPerfStats]);

  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const previewRef = useRef(preview);
  previewRef.current = preview;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Load persisted native settings and available monitors on startup.
  useEffect(() => {
    let active = true;
    void (async () => {
      const [loadedSettings, available] = await Promise.all([loadSettings(), listMonitors()]);
      if (!active) return;
      setSettings(loadedSettings);
      setMonitors(available);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Keep native desktop window tightly fitted to capsule state & monitor DPI.
  useEffect(() => {
    void fitIsland(expanded, settings, false, preview).catch(() => {
      /* Browser preview or unavailable window API */
    });
  }, [
    expanded,
    preview,
    settings.target_monitor_index,
    settings.horizontal_offset_px,
    settings.top_inset_px,
  ]);

  // Re-fit window if monitor DPI scale factor or display geometry changes.
  useEffect(() => {
    if (!isDesktop()) return;
    const onResize = () => {
      void fitIsland(expandedRef.current, settingsRef.current, true, previewRef.current).catch(() => {});
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Subscribe to native system tray recovery events.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void subscribeTrayEvents({
      onToggleExpand: () => setExpanded((prev) => !prev),
      onPositionReset: () => {
        setExpanded(false);
        setPreview(false);
        setSettings((prev) =>
          sanitizeSettings({
            ...prev,
            target_monitor_index: 0,
            horizontal_offset_px: 0,
            top_inset_px: 0,
          })
        );
      },
      onSecondInstance: () => {
        setSecondInstancePing(Date.now());
      },
    }).then((unlisten) => {
      cleanup = unlisten;
    });
    return () => {
      cleanup?.();
    };
  }, []);

  // Subscribe to real-time push events from native background file watcher
  useEffect(() => {
    if (demo || !isDesktop()) return;
    let cleanup: (() => void) | undefined;
    void subscribeEventsUpdated(() => {
      // Immediate poll pass when events file changes on disk
      void pollNow();
    }).then((unlisten) => {
      cleanup = unlisten;
    });
    return () => {
      cleanup?.();
    };
  }, [demo]);

  // Keyboard navigation:
  // - `Alt+H` or `Ctrl+Shift+H`: Toggle expand / collapse capsule
  // - `Escape`: Collapse capsule
  // - `Alt+1..4`: Switch console tab (and expand if collapsed)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Global toggle shortcut: Alt+H or Ctrl+Shift+H
      if (
        (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 'h' || event.key === 'H')) ||
        (event.ctrlKey && event.shiftKey && (event.key === 'h' || event.key === 'H'))
      ) {
        event.preventDefault();
        setExpanded((prev) => !prev);
        return;
      }

      // Escape key to collapse expanded console
      if (event.key === 'Escape' && (expanded || preview)) {
        event.preventDefault();
        setExpanded(false);
        setPreview(false);
        return;
      }

      // Alt+1..4 to navigate tabs directly and expand
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const idx = Number(event.key) - 1;
        if (idx >= 0 && idx < TAB_ORDER.length) {
          event.preventDefault();
          setTab(TAB_ORDER[idx]);
          setExpanded(true);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded, preview]);

  // Optional auto-collapse when floating window loses focus.
  useEffect(() => {
    if (!expanded || !settings.auto_collapse_on_blur) return;
    const onBlur = () => {
      setExpanded(false);
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [expanded, settings.auto_collapse_on_blur]);

  // Keep local proof-of-work verifier in sync with approved workspaces.
  useEffect(() => {
    if (settings.approved_workspaces) {
      for (const w of settings.approved_workspaces) {
        localProofOfWorkVerifier.approveWorkspace(w);
      }
    }
  }, [settings.approved_workspaces]);

  // Core polling execution engine with content-equality guards to eliminate state thrashing
  const executePoll = useCallback(async (tickCount = 0) => {
    if (demo || !isDesktop()) return;
    try {
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const isExpanded = expandedRef.current;
      const currentTab = tabRef.current;
      const isSystemTabActive = isExpanded && currentTab === 'system';

      // Throttling sysinfo sampling when collapsed and idle to avoid waking the CPU to measure the CPU
      const shouldSampleMetrics = isSystemTabActive || metricsRef.current === null || tickCount % 4 === 0;

      const [nextMetrics, nextEvents, codexEvents, codexTelemetry, processSnapshot, usage] = await Promise.all([
        shouldSampleMetrics ? readMetrics() : Promise.resolve(metricsRef.current),
        readEvents(),
        settingsRef.current.enable_codex_logs !== false ? readCodexEvents() : Promise.resolve([]),
        settingsRef.current.enable_codex_logs !== false ? readCodexTelemetry() : Promise.resolve([]),
        readProcessLifecycle(),
        readUsageReports(),
      ]);

      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      pollTimingsRef.current = appendPollTiming(pollTimingsRef.current, elapsed);
      if (isSystemTabActive) {
        setPollTimings([...pollTimingsRef.current]);
      }

      // Update metrics & metricsHistory
      if (nextMetrics) {
        metricsRef.current = nextMetrics;
        metricsHistoryRef.current = appendMetricsSample(metricsHistoryRef.current, nextMetrics);
        if (isSystemTabActive) {
          setMetrics(nextMetrics);
          setMetricsHistory(metricsHistoryRef.current);
        }
      }

      // Guard events update
      const combinedEvents = [...nextEvents, ...codexEvents];
      const eventsChanged = !areEventsEqual(eventsRef.current, combinedEvents);
      if (eventsChanged) {
        eventsRef.current = combinedEvents;
        setEvents(combinedEvents);
      }

      // Guard usage update
      if (!areUsageResultsEqual(usageResultRef.current, usage)) {
        usageResultRef.current = usage;
        setUsageResult(usage);
      }

      // Guard process lifecycle update
      const lifecycleChanged = !areProcessLifecyclesEqual(processLifecycleRef.current, processSnapshot);
      if (lifecycleChanged) {
        processLifecycleRef.current = processSnapshot;
        setProcessLifecycle(processSnapshot);
      }

      // Guard agents update: only rebuild and reconcile sessions if events or lifecycle changed, or if list is empty
      if (eventsChanged || lifecycleChanged || agentsRef.current.length === 0) {
        const claudeAgents = sessionsFromEvents(nextEvents.filter((e) => e.source !== 'codex'), {
          staleMinutes: settingsRef.current.stale_minutes,
        });
        const codexAgents = reduceCodexSessions(codexEvents, {
          staleMinutes: settingsRef.current.stale_minutes,
          telemetry: codexTelemetry,
        });
        const raw = [...claudeAgents, ...codexAgents];
        const reconciled = reconcileSessions(raw, processSnapshot, {
          enabled: settingsRef.current.process_reconciliation !== false,
        });
        const nextAgents = applyWorkspaceChecks(reconciled, workspaceChecksRef.current);
        if (!areAgentsEqual(agentsRef.current, nextAgents)) {
          agentsRef.current = nextAgents;
          setAgents(nextAgents);
        }
      }

      setLiveError(null);
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : String(error));
    }
  }, [demo]);

  const pollNow = useCallback(async () => {
    await executePoll(0);
  }, [executePoll]);

  // Synchronize system tab metrics and timings on-demand when user opens System tab
  useEffect(() => {
    if (expanded && tab === 'system') {
      if (metricsRef.current && !areMetricsEqual(metrics, metricsRef.current)) {
        setMetrics(metricsRef.current);
      }
      setMetricsHistory(metricsHistoryRef.current);
      setPollTimings([...pollTimingsRef.current]);
    }
  }, [expanded, tab, metrics]);

  // When expanding or previewing, trigger an immediate fast refresh
  useEffect(() => {
    if (expanded || preview) {
      void pollNow();
    }
  }, [expanded, preview, pollNow]);

  // Adaptive background polling timer: throttles cadence when collapsed and idle
  useEffect(() => {
    if (demo || !isDesktop()) return;
    let disposed = false;
    let inFlight = false;
    let tickCount = 0;
    let timerId: number | undefined;

    const scheduleNext = () => {
      if (disposed) return;
      const isExpanded = expandedRef.current || previewRef.current;
      const hasActiveProcesses =
        (processLifecycleRef.current?.claude_processes ?? 0) > 0 ||
        (processLifecycleRef.current?.codex_processes ?? 0) > 0;
      const hasWorkingAgents = agentsRef.current.some((a) => a.status === 'working');

      const activeRate = Math.max(1000, Math.min(15000, settingsRef.current.poll_interval_ms));
      // In idle collapsed state, conserve CPU and disk I/O with an eco cadence (~6s)
      const ecoRate = Math.max(5000, Math.min(15000, activeRate * 2.5));
      const nextInterval = isExpanded || hasActiveProcesses || hasWorkingAgents ? activeRate : ecoRate;

      timerId = window.setTimeout(() => {
        void tick();
      }, nextInterval);
    };

    const tick = async () => {
      if (disposed || inFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        scheduleNext();
        return;
      }
      inFlight = true;
      try {
        tickCount++;
        await executePoll(tickCount);
        if (disposed) return;

        // Every 12 ticks (~30s-60s), refresh integration status and performance stats
        if (tickCount % 12 === 0) {
          void refreshIntegrationStatus();
          void refreshPerfStats();
        }
      } catch (error) {
        if (!disposed) {
          setLiveError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        inFlight = false;
        scheduleNext();
      }
    };

    void tick();

    return () => {
      disposed = true;
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, [demo, executePoll, refreshIntegrationStatus, refreshPerfStats]);

  const updateSettings = useCallback(
    (patch: Partial<UserSettings>) => {
      setSettings((prev) => {
        const merged = sanitizeSettings({ ...prev, ...patch });
        void saveSettings(merged, expandedRef.current);
        return merged;
      });
    },
    []
  );

  const acknowledgeAlert = useCallback((agentOrKey: Agent | string) => {
    const key = typeof agentOrKey === 'string' ? agentOrKey : buildAlertKey(agentOrKey);
    setAcknowledgedAlertKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const handleClearEvents = useCallback(async () => {
    await clearEvents();
    setEvents([]);
    setAgents([]);
    setWorkspaceChecks({});
  }, []);

  const shownAgents = demo ? demoAgents : agents;
  const shownMetrics = demo ? demoMetrics : metrics;
  const shownHistory = demo ? demoMetricsHistory : metricsHistory;
  const shownEvents = demo ? demoEvents : events;

  const activeAlerts: AlertItem[] = useMemo(
    () => notificationPolicy.evaluate(shownAgents, settings, acknowledgedAlertKeys),
    [shownAgents, settings, acknowledgedAlertKeys]
  );

  const openTab = useCallback((nextTab: Tab) => {
    setTab(nextTab);
    setExpanded(true);
  }, []);

  const handleApproveWorkspace = useCallback(async (path: string) => {
    localProofOfWorkVerifier.approveWorkspace(path);
    const updated = await approveWorkspace(path);
    setSettings(updated);
  }, []);

  const handleRevokeWorkspace = useCallback(async (path: string) => {
    localProofOfWorkVerifier.revokeWorkspace(path);
    const updated = await revokeWorkspace(path);
    setSettings(updated);
  }, []);

  const handleVerifyWorkspace = useCallback(
    async (workspacePath: string, runTests = false, testProfile?: string) => {
      if (verificationInFlight.current) throw new Error('A workspace check is already running. Wait for it to finish.');
      verificationInFlight.current = true;
      try {
        const result = await localProofOfWorkVerifier.verifyWorkspace(workspacePath, {
          runTests,
          testProfile,
        });
        if (result) {
          const key = workspaceIdentity(workspacePath);
          const entries = Object.entries(workspaceChecksRef.current).filter(([existing]) => existing !== key);
          const next = Object.fromEntries([...entries.slice(-31), [key, result]]);
          workspaceChecksRef.current = next;
          setWorkspaceChecks(next);
          setAgents(prev => applyWorkspaceChecks(prev, next));
        }
        return result;
      } catch (err) {
        setLiveError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        verificationInFlight.current = false;
      }
    },
    []
  );

  const handleEnableClaudeHook = useCallback(async () => {
    setHookLoading(true);
    try {
      const updated = await enableClaudeHook();
      setClaudeHookStatus(updated);
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLiveError(msg);
      throw err;
    } finally {
      setHookLoading(false);
    }
  }, []);

  const handleDisableClaudeHook = useCallback(async () => {
    setHookLoading(true);
    try {
      const updated = await disableClaudeHook(false);
      setClaudeHookStatus(updated);
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLiveError(msg);
      throw err;
    } finally {
      setHookLoading(false);
    }
  }, []);

  const handleRollbackClaudeHook = useCallback(async () => {
    setHookLoading(true);
    try {
      const updated = await disableClaudeHook(true);
      setClaudeHookStatus(updated);
      return updated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLiveError(msg);
      throw err;
    } finally {
      setHookLoading(false);
    }
  }, []);

  const [exportingBundle, setExportingBundle] = useState(false);
  const [exportResult, setExportResult] = useState<DiagnosticBundleExport | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportDiagnosticBundle = useCallback(async () => {
    setExportingBundle(true);
    setExportError(null);
    try {
      const bundle = await exportDiagnosticBundle();
      setExportResult(bundle);
      return bundle;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExportError(msg);
      throw err;
    } finally {
      setExportingBundle(false);
    }
  }, []);

  const pollSummary: PollTimingSummary = useMemo(
    () => summarizePollTimings(pollTimings),
    [pollTimings]
  );

  return {
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
    usageResult: demo ? { reports: [], errors: [] } : usageResult,
    workspaceChecks,
    shownMetrics,
    shownHistory,
    shownEvents,
    activeAlerts,
    acknowledgeAlert,
    liveError,
    pollNow,
    handleClearEvents,
    handleApproveWorkspace,
    handleRevokeWorkspace,
    handleVerifyWorkspace,
    claudeHookStatus,
    hookLoading,
    refreshClaudeHookStatus,
    handleEnableClaudeHook,
    handleDisableClaudeHook,
    handleRollbackClaudeHook,
    processLifecycle,
    pollSummary,
    launchAtLogin,
    handleToggleLaunchAtLogin,
    integrationStatus,
    refreshIntegrationStatus,
    perfStats,
    refreshPerfStats,
    secondInstancePing,
    handleExportDiagnosticBundle,
    exportingBundle,
    exportResult,
    exportError,
  };
}
