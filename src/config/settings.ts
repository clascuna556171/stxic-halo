import type { UserSettings } from '../types';

/**
 * localStorage key for the browser/WebView mirror. The key name is historical; the schema
 * version lives inside the payload (`schema_version`) and is migrated by `sanitizeSettings`.
 */
export const SETTINGS_STORAGE_KEY = 'stxic.halo.settings.v1';

/** Keep in sync with `CURRENT_SCHEMA_VERSION` in `src-tauri/src/config.rs`. */
export const CURRENT_SETTINGS_SCHEMA = 3;

export const DEFAULT_SETTINGS: UserSettings = {
  schema_version: CURRENT_SETTINGS_SCHEMA,
  poll_interval_ms: 2500,
  target_monitor_index: 0,
  horizontal_offset_px: 0,
  top_inset_px: 0,
  auto_collapse_on_blur: false,
  reduce_motion: false,
  alert_on_waiting: true,
  alert_on_failure: true,
  stale_minutes: 15,
  approved_workspaces: [],
  enable_codex_logs: true,
  enable_copilot_usage_logs: false,
  process_reconciliation: true,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(Math.max(min, Math.min(max, num)));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Windows path identity: separators unified, trailing separator dropped, case-insensitive. */
function workspaceKey(path: string): string {
  let s = path.trim().replace(/\//g, '\\');
  while (s.length > 3 && s.endsWith('\\')) s = s.slice(0, -1);
  return s.toLowerCase();
}

export function dedupeWorkspaces(list: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const trimmed = String(item).trim();
    if (!trimmed) continue;
    const key = workspaceKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Sanitizes and migrates settings of any schema version to the current one.
 * - v1 → v2: adds `process_reconciliation` (default on); workspace list de-duplicated
 *   case-insensitively.
 * - v2 → v3: Copilot session usage reading is opt-in.
 * - Newer versions: known fields are kept, unknown fields dropped.
 */
export function sanitizeSettings(raw?: Partial<UserSettings> | null): UserSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_SETTINGS };
  }
  return {
    schema_version: CURRENT_SETTINGS_SCHEMA,
    poll_interval_ms: clampInt(raw.poll_interval_ms, 1000, 15000, DEFAULT_SETTINGS.poll_interval_ms),
    target_monitor_index: clampInt(raw.target_monitor_index, 0, 16, DEFAULT_SETTINGS.target_monitor_index),
    horizontal_offset_px: clampInt(raw.horizontal_offset_px, -1600, 1600, DEFAULT_SETTINGS.horizontal_offset_px),
    top_inset_px: clampInt(raw.top_inset_px, 0, 64, DEFAULT_SETTINGS.top_inset_px),
    auto_collapse_on_blur: bool(raw.auto_collapse_on_blur, DEFAULT_SETTINGS.auto_collapse_on_blur),
    reduce_motion: bool(raw.reduce_motion, DEFAULT_SETTINGS.reduce_motion),
    alert_on_waiting: bool(raw.alert_on_waiting, DEFAULT_SETTINGS.alert_on_waiting),
    alert_on_failure: bool(raw.alert_on_failure, DEFAULT_SETTINGS.alert_on_failure),
    stale_minutes: clampInt(raw.stale_minutes, 5, 120, DEFAULT_SETTINGS.stale_minutes),
    approved_workspaces: Array.isArray(raw.approved_workspaces)
      ? dedupeWorkspaces(raw.approved_workspaces)
      : [],
    enable_codex_logs: bool(raw.enable_codex_logs, DEFAULT_SETTINGS.enable_codex_logs!),
    enable_copilot_usage_logs: bool(raw.enable_copilot_usage_logs, DEFAULT_SETTINGS.enable_copilot_usage_logs!),
    process_reconciliation: bool(
      raw.process_reconciliation,
      DEFAULT_SETTINGS.process_reconciliation!
    ),
  };
}

export function loadLocalSettings(): UserSettings {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ...DEFAULT_SETTINGS };
    }
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw) as Partial<UserSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveLocalSettings(next: Partial<UserSettings>): UserSettings {
  const sanitized = sanitizeSettings(next);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
    }
  } catch {
    // Ignore storage quota or sandbox restrictions in restricted preview contexts.
  }
  return sanitized;
}
