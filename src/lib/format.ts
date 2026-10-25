export const percent = (value: number) => `${Math.round(Math.max(0, Math.min(100, value)))}%`;
export const gib = (bytes: number) => `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
export function relativeTime(timestamp: string): string {
  const elapsed = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(elapsed)) return 'Unknown';
  if (elapsed < 60000) return 'Just now';
  if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}m ago`;
  if (elapsed < 86400000) return `${Math.floor(elapsed / 3600000)}h ago`;
  return `${Math.floor(elapsed / 86400000)}d ago`;
}
