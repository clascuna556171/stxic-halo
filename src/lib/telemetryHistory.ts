import type { GamingTelemetryContract, Metrics, MetricsHistorySummary } from '../types';

export const MAX_TELEMETRY_HISTORY = 24;

export const EMPTY_METRICS_HISTORY: MetricsHistorySummary = {
  cpuSamples: [],
  memorySamples: [],
  peakCpuPercent: 0,
  avgCpuPercent: 0,
};

/**
 * Appends a new metrics sample to a fixed-size ring history without mutating the previous state
 * or allowing unbounded memory growth.
 */
export function appendMetricsSample(
  previous: MetricsHistorySummary,
  sample: Metrics | null
): MetricsHistorySummary {
  if (!sample) return previous;

  const cpuVal = Math.max(0, Math.min(100, Math.round(sample.cpu_percent)));
  const memVal =
    sample.memory_total_bytes > 0
      ? Math.max(0, Math.min(100, Math.round((sample.memory_used_bytes / sample.memory_total_bytes) * 100)))
      : 0;

  const cpuSamples = [...previous.cpuSamples, cpuVal].slice(-MAX_TELEMETRY_HISTORY);
  const memorySamples = [...previous.memorySamples, memVal].slice(-MAX_TELEMETRY_HISTORY);

  let sum = 0;
  let peak = 0;
  for (const val of cpuSamples) {
    sum += val;
    if (val > peak) peak = val;
  }

  return {
    cpuSamples,
    memorySamples,
    peakCpuPercent: peak,
    avgCpuPercent: cpuSamples.length > 0 ? Math.round(sum / cpuSamples.length) : 0,
  };
}

/**
 * Extensible placeholder for future PresentMon / DXGI gaming telemetry.
 * Explicitly reports unavailable rather than fabricating FPS or GPU readings.
 */
export const UNAVAILABLE_GAMING_TELEMETRY: GamingTelemetryContract = {
  available: false,
  fps: null,
  frameTimeMs: null,
  gpuPercent: null,
  vramUsedBytes: null,
  source: 'unavailable',
};
