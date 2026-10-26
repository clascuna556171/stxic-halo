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
  ProcessLifecycleSnapshot,
  Tab,
  UserSettings,
} from '../types';

const TAB_ORDER: readonly Tab[] = ['overview', 'activity', 'system', 'settings'];

export function useHaloRuntime() {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [demo, setDemo] = useState(() => !isDesktop());
  const [settings, setSettings] = useState<UserSettings>(() => loadLocalSettings());
  const [monitors, setMonitors] = useState<MonitorDescriptor[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricsHistorySummary>(EMPTY_METRICS_HISTORY);
  const [agents, setAgents] = useState<Agent[]>([]);
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
    void fitIsland(expanded, settings).catch(() => {
      /* Browser preview or unavailable window API */
    });
  }, [
    expanded,
    settings.target_monitor_index,
    settings.horizontal_offset_px,
    settings.top_inset_px,
  ]);

  // Re-fit window if monitor DPI scale factor or display geometry changes.
  useEffect(() => {
    if (!isDesktop()) return;
    const onResize = () => {
      void fitIsland(expandedRef.current, settingsRef.current, true).catch(() => {});
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
        setSettings((prev) =>
          sanitizeSettings({
            ...prev,
            target_monitor_index: 0,
            horizontal_offset_px: 0,
            top_inset_px: 10,
          })
        );
      },
      onSecondInstance: () => {
        setSecondInstancePing(Date.now());
        setExpanded(true);
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
    void subscribeEventsUpdated((newEvents) => {
      setEvents((prev) => {
        const codexEvents = prev.filter((e) => e.source === 'codex');
        return [...newEvents, ...codexEvents];
      });
      const claudeAgents = sessionsFromEvents(newEvents, {
        staleMinutes: settingsRef.current.stale_minutes,
      });
      setAgents((prev) => {
        const codexAgents = prev.filter((a) => a.provider === 'codex');
        const raw = [...claudeAgents, ...codexAgents];
        return reconcileSessions(raw, processLifecycleRef.current, {
          enabled: settingsRef.current.process_reconciliation !== false,
        });
      });
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
      if (event.key === 'Escape' && expanded) {
        event.preventDefault();
        setExpanded(false);
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
  }, [expanded]);

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

  // Background polling with single-flight lock and visibility pause.
  const pollNow = useCallback(async () => {
    if (demo || !isDesktop()) return;
    try {
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const [nextMetrics, nextEvents, codexEvents, codexTelemetry, processSnapshot] = await Promise.all([
        readMetrics(),
        readEvents(),
        settingsRef.current.enable_codex_logs !== false ? readCodexEvents() : Promise.resolve([]),
        settingsRef.current.enable_codex_logs !== false ? readCodexTelemetry() : Promise.resolve([]),
        readProcessLifecycle(),
      ]);
      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      setPollTimings((prev) => appendPollTiming(prev, elapsed));

      const combinedEvents = [...nextEvents, ...codexEvents];
      setMetrics(nextMetrics);
      setMetricsHistory((prev) => appendMetricsSample(prev, nextMetrics));
      setEvents(combinedEvents);

      const claudeAgents = sessionsFromEvents(nextEvents, {
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
      setAgents(reconciled);
      setProcessLifecycle(processSnapshot);
      setLiveError(null);
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : String(error));
    }
  }, [demo]);

  useEffect(() => {
    if (demo || !isDesktop()) return;
    let disposed = false;
    let inFlight = false;
    let tickCount = 0;

    const tick = async () => {
      if (disposed || inFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      inFlight = true;
      try {
        const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const [nextMetrics, nextEvents, codexEvents, codexTelemetry, processSnapshot] = await Promise.all([
          readMetrics(),
          readEvents(),
          settingsRef.current.enable_codex_logs !== false ? readCodexEvents() : Promise.resolve([]),
          settingsRef.current.enable_codex_logs !== false ? readCodexTelemetry() : Promise.resolve([]),
          readProcessLifecycle(),
        ]);
        const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
        setPollTimings((prev) => appendPollTiming(prev, elapsed));

        if (disposed) return;
        const combinedEvents = [...nextEvents, ...codexEvents];
        setMetrics(nextMetrics);
        setMetricsHistory((prev) => appendMetricsSample(prev, nextMetrics));
        setEvents(combinedEvents);

        const claudeAgents = sessionsFromEvents(nextEvents, {
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
        setAgents(reconciled);
        setProcessLifecycle(processSnapshot);
        setLiveError(null);

        // Every 12 ticks (~30s at 2.5s poll), refresh integration status and performance stats
        tickCount++;
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
      }
    };

    void tick();
    const intervalMs = Math.max(1000, Math.min(15000, settings.poll_interval_ms));
    const timer = window.setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [
    demo,
    settings.poll_interval_ms,
    settings.stale_minutes,
    settings.enable_codex_logs,
    settings.process_reconciliation,
    refreshIntegrationStatus,
    refreshPerfStats,
  ]);

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
      try {
        const result = await localProofOfWorkVerifier.verifyWorkspace(workspacePath, {
          runTests,
          testProfile,
        });
        if (result) {
          setAgents((prev) =>
            prev.map((a) =>
              a.workspace === workspacePath ? { ...a, proof: result } : a
            )
          );
        }
        return result;
      } catch (err) {
        setLiveError(err instanceof Error ? err.message : String(err));
        return null;
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
    tab,
    setTab,
    openTab,
    demo,
    setDemo,
    settings,
    updateSettings,
    monitors,
    shownAgents,
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
