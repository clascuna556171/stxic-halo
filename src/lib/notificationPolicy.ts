export function isQuietHour(hour: number, enabled: boolean) {
  return enabled && (hour >= 22 || hour < 8);
}
export function quotaNotificationKey(provider: string, label: string, resetsAt: number | null | undefined) {
  return resetsAt && Number.isFinite(resetsAt) && resetsAt > 0 ? JSON.stringify([provider, label, resetsAt]) : null;
}
