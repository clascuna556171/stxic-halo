import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
  primaryMonitor,
} from '@tauri-apps/api/window';
import { DEFAULT_SETTINGS, loadLocalSettings, sanitizeSettings, saveLocalSettings } from '../config/settings';
import type {
  AgentEvent,
  ClaudeHookStatus,
  CodexSessionTelemetry,
  DiagnosticBundleExport,
  IntegrationStatus,
  LaunchAtLoginStatus,
  Metrics,
  MonitorDescriptor,
  PerformanceStats,
  ProcessLifecycleSnapshot,
  ProofSummary,
  UserSettings,
} from '../types';

export const ISLAND_WIDTH = 460;
export const ISLAND_COLLAPSED_HEIGHT = 78;
export const ISLAND_EXPANDED_HEIGHT = 604;

export const isDesktop = (): boolean => isTauri();

export async function readMetrics(): Promise<Metrics> {
  return invoke<Metrics>('read_metrics');
}

export async function readEvents(): Promise<AgentEvent[]> {
  return invoke<AgentEvent[]>('read_agent_events');
}

export async function clearEvents(): Promise<void> {
  if (!isTauri()) return;
  await invoke('clear_agent_events');
}

export async function verifyProofOfWork(
  workspacePath: string,
  options?: { runTests?: boolean; testProfile?: string }
): Promise<ProofSummary> {
  if (!isTauri()) {
    throw new Error('Proof-of-Work inspection requires native desktop environment');
  }
  const raw = await invoke<Record<string, unknown>>('verify_proof_of_work', {
    workspacePath,
    runTests: options?.runTests ?? false,
    testProfile: options?.testProfile,
  });

  return {
    changedFiles: (raw.changed_files as number | null) ?? (raw.changedFiles as number | null) ?? null,
    changed_files: (raw.changed_files as number | null) ?? (raw.changedFiles as number | null) ?? null,
    testsPassed: (raw.tests_passed as number | null) ?? (raw.testsPassed as number | null) ?? null,
    tests_passed: (raw.tests_passed as number | null) ?? (raw.testsPassed as number | null) ?? null,
    testsFailed: (raw.tests_failed as number | null) ?? (raw.testsFailed as number | null) ?? null,
    tests_failed: (raw.tests_failed as number | null) ?? (raw.testsFailed as number | null) ?? null,
    verified: Boolean(raw.verified),
    git: (raw.git as ProofSummary['git']) ?? null,
    testSummary: (raw.test_summary as ProofSummary['testSummary']) ?? (raw.testSummary as ProofSummary['testSummary']) ?? null,
    test_summary: (raw.test_summary as ProofSummary['testSummary']) ?? (raw.testSummary as ProofSummary['testSummary']) ?? null,
    provenance: (raw.provenance as string) ?? undefined,
    evidenceTimestamp: (raw.evidence_timestamp as number) ?? (raw.evidenceTimestamp as number) ?? undefined,
    evidence_timestamp: (raw.evidence_timestamp as number) ?? (raw.evidenceTimestamp as number) ?? undefined,
  };
}

export async function approveWorkspace(workspacePath: string): Promise<UserSettings> {
  if (!isTauri()) {
    const local = loadLocalSettings();
    const approved = new Set(local.approved_workspaces ?? []);
    approved.add(workspacePath.trim());
    const next = { ...local, approved_workspaces: [...approved] };
    saveLocalSettings(next);
    return next;
  }
  const updated = await invoke<UserSettings>('approve_workspace', { workspacePath });
  return saveLocalSettings(updated);
}

export async function revokeWorkspace(workspacePath: string): Promise<UserSettings> {
  if (!isTauri()) {
    const local = loadLocalSettings();
    const approved = (local.approved_workspaces ?? []).filter((w) => w.trim() !== workspacePath.trim());
    const next = { ...local, approved_workspaces: approved };
    saveLocalSettings(next);
    return next;
  }
  const updated = await invoke<UserSettings>('revoke_workspace', { workspacePath });
  return saveLocalSettings(updated);
}

export async function readCodexTelemetry(limit = 8): Promise<CodexSessionTelemetry[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<CodexSessionTelemetry[]>('read_codex_telemetry', { limit });
  } catch {
    return [];
  }
}

export async function readCodexEvents(limit = 8): Promise<AgentEvent[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<AgentEvent[]>('read_codex_events', { limit });
  } catch {
    return [];
  }
}

export async function loadSettings(): Promise<UserSettings> {
  const local = loadLocalSettings();
  if (!isTauri()) return local;
  try {
    const nativeSettings = await invoke<UserSettings>('load_settings');
    const merged = sanitizeSettings(nativeSettings);
    saveLocalSettings(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function saveSettings(
  next: UserSettings,
  expanded: boolean
): Promise<UserSettings> {
  const sanitized = saveLocalSettings(next);
  if (!isTauri()) return sanitized;
  try {
    const persisted = await invoke<UserSettings>('save_settings', {
      settings: sanitized,
      expanded,
    });
    return saveLocalSettings(persisted);
  } catch {
    return sanitized;
  }
}

export async function listMonitors(): Promise<MonitorDescriptor[]> {
  if (!isTauri()) {
    return [
      {
        index: 0,
        name: 'Primary Display (Browser Preview)',
        width: typeof window !== 'undefined' ? window.screen.width : 1920,
        height: typeof window !== 'undefined' ? window.screen.height : 1080,
        x: 0,
        y: 0,
        scale_factor: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
        is_primary: true,
      },
    ];
  }
  try {
    return await invoke<MonitorDescriptor[]>('list_monitors');
  } catch {
    return [];
  }
}

let lastBoundsSignature = '';

export function calculatePhysicalBounds(
  expanded: boolean,
  monitor: { x: number; y: number; width: number; height: number; scaleFactor: number },
  settings: Pick<UserSettings, 'horizontal_offset_px' | 'top_inset_px'>
): { x: number; y: number; width: number; height: number; physicalWidth: number; physicalHeight: number } {
  const logicalWidth = ISLAND_WIDTH;
  const logicalHeight = expanded ? ISLAND_EXPANDED_HEIGHT : ISLAND_COLLAPSED_HEIGHT;
  const scale = Math.max(0.5, monitor.scaleFactor);
  const physicalWidth = Math.round(logicalWidth * scale);
  const physicalHeight = Math.round(logicalHeight * scale);
  const physicalOffsetX = Math.round(settings.horizontal_offset_px * scale);
  const topInset = Math.round(Math.max(4, Math.min(64, settings.top_inset_px)) * scale);

  const rawX = monitor.x + Math.round((monitor.width - physicalWidth) / 2) + physicalOffsetX;
  const minX = monitor.x + 8;
  const maxX = Math.max(minX, monitor.x + monitor.width - physicalWidth - 8);
  const x = Math.max(minX, Math.min(maxX, rawX));

  const rawY = monitor.y + topInset;
  const minY = monitor.y + 4;
  const maxY = Math.max(minY, monitor.y + monitor.height - physicalHeight - 8);
  const y = Math.max(minY, Math.min(maxY, rawY));

  return { x, y, width: logicalWidth, height: logicalHeight, physicalWidth, physicalHeight };
}

/**
 * Keeps the desktop window tightly fitted to the capsule in collapsed (78px) or expanded (604px)
 * states so there is never an invisible desktop-wide click blocker, while honoring multi-monitor
 * selection, DPI scaling, and off-screen coordinate clamping.
 */
export async function fitIsland(
  expanded: boolean,
  settings: UserSettings = DEFAULT_SETTINGS,
  force = false
): Promise<void> {
  if (!isTauri()) return;

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const sig = `${expanded ? 1 : 0}:${settings.target_monitor_index}:${settings.horizontal_offset_px}:${settings.top_inset_px}:${dpr.toFixed(2)}`;
  if (!force && sig === lastBoundsSignature) {
    return;
  }
  lastBoundsSignature = sig;

  try {
    await invoke('sync_island_bounds', { expanded });
    return;
  } catch {
    // Fallback to frontend window positioning if native command is unavailable.
  }

  const win = getCurrentWindow();
  const width = ISLAND_WIDTH;
  const height = expanded ? ISLAND_EXPANDED_HEIGHT : ISLAND_COLLAPSED_HEIGHT;
  await win.setSize(new LogicalSize(width, height));

  const monitors = await availableMonitors().catch(() => []);
  const targetMonitor =
    monitors[settings.target_monitor_index] ??
    (await currentMonitor().catch(() => null)) ??
    (await primaryMonitor().catch(() => null)) ??
    monitors[0] ??
    null;

  if (targetMonitor) {
    const { x, y } = calculatePhysicalBounds(
      expanded,
      {
        x: targetMonitor.position.x,
        y: targetMonitor.position.y,
        width: targetMonitor.size.width,
        height: targetMonitor.size.height,
        scaleFactor: targetMonitor.scaleFactor,
      },
      settings
    );

    await win.setPosition(new PhysicalPosition(x, y));
  }
}

export async function subscribeTrayEvents(handlers: {
  onToggleExpand: () => void;
  onPositionReset: () => void;
  onSecondInstance?: () => void;
}): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }
  const unlisteners: UnlistenFn[] = [];
  try {
    unlisteners.push(await listen('halo://toggle-expand', () => handlers.onToggleExpand()));
    unlisteners.push(await listen('halo://position-reset', () => handlers.onPositionReset()));
    if (handlers.onSecondInstance) {
      unlisteners.push(await listen('halo://second-instance', () => handlers.onSecondInstance?.()));
    }
  } catch {
    // Event subscription unavailable in non-desktop environments.
  }
  return () => {
    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}

export async function readProcessLifecycle(): Promise<ProcessLifecycleSnapshot> {
  if (!isTauri()) {
    return {
      available: false,
      refreshed_at: Date.now(),
      processes: [],
      claude_processes: 0,
      codex_processes: 0,
    };
  }
  return invoke<ProcessLifecycleSnapshot>('read_process_lifecycle');
}

export async function getLaunchAtLogin(): Promise<LaunchAtLoginStatus> {
  if (!isTauri()) {
    return {
      supported: false,
      enabled: false,
      error: 'Browser preview: Windows startup requires desktop environment',
    };
  }
  return invoke<LaunchAtLoginStatus>('get_launch_at_login');
}

export async function setLaunchAtLogin(enabled: boolean): Promise<LaunchAtLoginStatus> {
  if (!isTauri()) {
    return {
      supported: false,
      enabled,
      error: 'Browser preview: simulated startup state updated',
    };
  }
  return invoke<LaunchAtLoginStatus>('set_launch_at_login', { enabled });
}

export async function readIntegrationStatus(): Promise<IntegrationStatus> {
  if (!isTauri()) {
    return {
      settings: {
        source: 'disk',
        path: '%LOCALAPPDATA%\\STXICHalo\\settings.json (simulated)',
        schema_version: 2,
        migrated_from: null,
        quarantined_path: null,
        warning: null,
        last_save_error: null,
      },
      event_log: {
        path: '%LOCALAPPDATA%\\STXICHalo\\events.jsonl (simulated)',
        exists: true,
        size_bytes: 4096,
        modified_ms: Date.now(),
        buffered_events: 12,
        last_error: null,
      },
      codex: {
        enabled: true,
        sessions_dir: '~/.codex/sessions (simulated)',
        sessions_dir_exists: true,
      },
      launch_at_login: {
        supported: false,
        enabled: false,
        error: null,
      },
      single_instance: true,
      launched_at_login: false,
    };
  }
  return invoke<IntegrationStatus>('read_integration_status');
}

export async function readPerformanceStats(): Promise<PerformanceStats> {
  if (!isTauri()) {
    return {
      uptime_secs: 120,
      footprint: {
        available: false,
        pid: 0,
        cpu_percent: 0.2,
        memory_bytes: 42 * 1024 * 1024,
        virtual_memory_bytes: 128 * 1024 * 1024,
      },
      timings: {
        metrics_sample: { count: 48, last_ms: 0.8, avg_ms: 0.9, max_ms: 2.1 },
        event_log_read: { count: 48, last_ms: 0.3, avg_ms: 0.4, max_ms: 1.0 },
      },
    };
  }
  return invoke<PerformanceStats>('read_performance_stats');
}

export async function checkClaudeHookStatus(): Promise<ClaudeHookStatus> {
  if (!isTauri()) {
    return {
      success: true,
      installed: false,
      hook_count: 0,
      config_path: '~/.claude/settings.json (simulated)',
      hook_path: 'scripts/claude-hook.ps1 (simulated)',
      backup_exists: false,
      backup_path: '',
      message: 'Browser preview: native Claude hook manager requires desktop environment',
    };
  }
  return invoke<ClaudeHookStatus>('check_claude_hook_status');
}

export async function enableClaudeHook(): Promise<ClaudeHookStatus> {
  if (!isTauri()) {
    return {
      success: true,
      installed: true,
      hook_count: 6,
      config_path: '~/.claude/settings.json (simulated)',
      hook_path: 'scripts/claude-hook.ps1 (simulated)',
      backup_exists: true,
      backup_path: '~/.claude/settings.json.halo-bak',
      message: 'Browser preview: simulated 6 Claude hooks enabled',
    };
  }
  return invoke<ClaudeHookStatus>('enable_claude_hook');
}

export async function disableClaudeHook(rollback = false): Promise<ClaudeHookStatus> {
  if (!isTauri()) {
    return {
      success: true,
      installed: false,
      hook_count: 0,
      config_path: '~/.claude/settings.json (simulated)',
      hook_path: 'scripts/claude-hook.ps1 (simulated)',
      backup_exists: false,
      backup_path: '',
      message: rollback
        ? 'Browser preview: simulated rollback to backup'
        : 'Browser preview: simulated Claude hooks disabled',
    };
  }
  return invoke<ClaudeHookStatus>('disable_claude_hook', { rollback });
}

export async function subscribeEventsUpdated(
  onEvents: (events: AgentEvent[]) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }
  try {
    return await listen<AgentEvent[]>('halo://events-updated', (event) => {
      onEvents(event.payload);
    });
  } catch {
    return () => {};
  }
}

export async function exportDiagnosticBundle(): Promise<DiagnosticBundleExport> {
  if (!isTauri()) {
    return {
      exported_at_unix_secs: Math.floor(Date.now() / 1000),
      app_version: '0.1.0',
      os_family: 'windows (browser mock)',
      os_arch: 'x86_64',
      halo_pid: 0,
      settings_source: 'defaults',
      settings_schema: 2,
      approved_workspace_count: 0,
      event_log_status: {
        path: '%LOCALAPPDATA%\\STXICHalo\\events.jsonl',
        exists: false,
        size_bytes: 0,
        modified_ms: null,
        buffered_events: 0,
        last_error: null,
      },
      leak_analysis: {
        sample_count: 0,
        baseline_memory_bytes: 0,
        current_memory_bytes: 0,
        drift_bytes: 0,
        drift_rate_kb_per_min: 0,
        suspected_leak: false,
        status: 'Uninitialized (mock)',
      },
      timings: {},
      saved_to_file: '%LOCALAPPDATA%\\STXICHalo\\support-bundle-mock.json',
    };
  }
  return invoke<DiagnosticBundleExport>('export_diagnostic_bundle');
}
