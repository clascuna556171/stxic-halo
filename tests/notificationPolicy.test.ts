import { describe, expect, it } from 'vitest';
import { isQuietHour, quotaNotificationKey } from '../src/lib/notificationPolicy';
describe('quota notification boundaries', () => {
  it('respects overnight quiet hours', () => {
    expect([21,22,0,7,8].map(hour => isQuietHour(hour, true))).toEqual([false,true,true,true,false]);
    expect(isQuietHour(23, false)).toBe(false);
  });
  it('deduplicates by provider, window and reset; does not alert on missing resets', () => {
    expect(quotaNotificationKey('codex', 'weekly', 123)).toBe(quotaNotificationKey('codex', 'weekly', 123));
    expect(quotaNotificationKey('codex', 'weekly', 124)).not.toBe(quotaNotificationKey('codex', 'weekly', 123));
    expect(quotaNotificationKey('codex', 'weekly', null)).toBeNull();
  });
});
