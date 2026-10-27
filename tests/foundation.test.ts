import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/config/settings';
import { gib, percent, relativeTime } from '../src/lib/format';
import { exportDiagnosticBundle } from '../src/lib/desktop';
import {
  appendMetricsSample,
  EMPTY_METRICS_HISTORY,
  MAX_TELEMETRY_HISTORY,
  UNAVAILABLE_GAMING_TELEMETRY,
} from '../src/lib/telemetryHistory';

describe('settings persistence & sanitization', () => {
  it('returns default settings for null or undefined input', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps out-of-bounds numerical settings safely', () => {
    const sanitized = sanitizeSettings({
      poll_interval_ms: 100, // below 1000ms min
      target_monitor_index: -3,
      horizontal_offset_px: 9999,
      top_inset_px: -10,
      stale_minutes: 500,
      reduce_motion: true,
    });
    expect(sanitized.poll_interval_ms).toBe(1000);
    expect(sanitized.target_monitor_index).toBe(0);
    expect(sanitized.horizontal_offset_px).toBe(1600);
    expect(sanitized.top_inset_px).toBe(0);
    expect(sanitized.stale_minutes).toBe(120);
    expect(sanitized.reduce_motion).toBe(true);
  });

  it('migrates v1 schema and deduplicates workspaces case-insensitively', () => {
    const raw = {
      schema_version: 1,
      approved_workspaces: [
        'C:\\Projects\\App',
        'c:/projects/app/',
        'D:\\Other',
        'C:\\Projects\\App',
      ],
    };
    const sanitized = sanitizeSettings(raw as any);
    expect(sanitized.schema_version).toBe(3);
    expect(sanitized.process_reconciliation).toBe(true);
    expect(sanitized.enable_copilot_usage_logs).toBe(false);
    expect(sanitizeSettings({ enable_copilot_usage_logs: true }).enable_copilot_usage_logs).toBe(true);
    expect(sanitized.approved_workspaces).toEqual(['C:\\Projects\\App', 'D:\\Other']);
  });
});

describe('telemetry ring buffer & contracts', () => {
  it('caps history length at MAX_TELEMETRY_HISTORY and computes peak/avg', () => {
    let history = EMPTY_METRICS_HISTORY;
    for (let i = 1; i <= 30; i++) {
      history = appendMetricsSample(history, {
        cpu_percent: i * 2,
        memory_used_bytes: 8 * 1024 ** 3,
        memory_total_bytes: 16 * 1024 ** 3,
        process_count: 150,
        sampled_at: i * 1000,
      });
    }
    expect(history.cpuSamples).toHaveLength(MAX_TELEMETRY_HISTORY);
    expect(history.memorySamples).toHaveLength(MAX_TELEMETRY_HISTORY);
    expect(history.peakCpuPercent).toBe(60);
    expect(history.avgCpuPercent).toBeGreaterThan(0);
  });

  it('exposes honest unavailable gaming telemetry contract by default', () => {
    expect(UNAVAILABLE_GAMING_TELEMETRY.available).toBe(false);
    expect(UNAVAILABLE_GAMING_TELEMETRY.fps).toBeNull();
    expect(UNAVAILABLE_GAMING_TELEMETRY.source).toBe('unavailable');
  });
});

describe('formatting utilities', () => {
  it('formats percentages, gigabytes, and relative timestamps', () => {
    expect(percent(28.4)).toBe('28%');
    expect(percent(140)).toBe('100%');
    expect(percent(-5)).toBe('0%');
    expect(gib(8 * 1024 ** 3)).toBe('8.0 GB');
    expect(relativeTime(new Date().toISOString())).toBe('Just now');
    expect(relativeTime('invalid-date')).toBe('Unknown');
  });
});

describe('diagnostic bundle export contract (HALO-011)', () => {
  it('generates sanitized diagnostic bundle without prompt text or customer code', async () => {
    const bundle = await exportDiagnosticBundle();
    expect(bundle.app_version).toBe('0.1.0');
    expect(bundle.settings_schema).toBe(2);
    expect(bundle.approved_workspace_count).toBeGreaterThanOrEqual(0);
    expect(bundle.saved_to_file).toContain('support-bundle');
    expect((bundle as any).prompt).toBeUndefined();
    expect((bundle as any).apiKey).toBeUndefined();
    expect((bundle as any).code).toBeUndefined();
  });
});
