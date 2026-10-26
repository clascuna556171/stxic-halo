import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHoverDisclosure } from '../src/lib/hoverDisclosure';
import { listPermissionRequests, respondToPermission } from '../src/lib/desktop';

afterEach(() => vi.useRealTimers());
describe('notch hover disclosure', () => {
  it('opens on hover and gives the pointer a grace period before collapsing', () => {
    vi.useFakeTimers();
    const open = vi.fn(), close = vi.fn();
    const hover = createHoverDisclosure(open, close, () => true);
    hover.enter();
    expect(open).toHaveBeenCalledOnce();
    hover.leave();
    vi.advanceTimersByTime(349);
    expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(close).toHaveBeenCalledOnce();
  });
  it('cancels collapse when reentering and cancels timers on disposal', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    const hover = createHoverDisclosure(vi.fn(), close, () => true);
    hover.leave();
    vi.advanceTimersByTime(200);
    hover.enter();
    vi.advanceTimersByTime(500);
    expect(close).not.toHaveBeenCalled();
    hover.leave();
    hover.cancel();
    vi.runAllTimers();
    expect(close).not.toHaveBeenCalled();
  });
  it('keeps the HUD open while sending an approval, then collapses', () => {
    vi.useFakeTimers();
    let busy = true;
    const close = vi.fn();
    const hover = createHoverDisclosure(vi.fn(), close, () => !busy);
    hover.leave();
    vi.advanceTimersByTime(700);
    expect(close).not.toHaveBeenCalled();
    busy = false;
    vi.advanceTimersByTime(350);
    expect(close).toHaveBeenCalledOnce();
  });
});

it('never fabricates pending approvals or successful decisions in browser preview', async () => {
  expect(await listPermissionRequests()).toEqual([]);
  await expect(respondToPermission('a'.repeat(32), 'allow')).rejects.toThrow('desktop bridge');
});
