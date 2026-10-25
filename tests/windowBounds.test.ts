import { describe, expect, it } from 'vitest';
import { calculatePhysicalBounds, ISLAND_COLLAPSED_HEIGHT, ISLAND_EXPANDED_HEIGHT, ISLAND_WIDTH } from '../src/lib/desktop';

describe('Window bounds & multi-monitor DPI scaling', () => {
  it('correctly calculates collapsed and expanded physical dimensions on standard 1080p (1.0x scale)', () => {
    const monitor1080p = { x: 0, y: 0, width: 1920, height: 1080, scaleFactor: 1.0 };
    const settings = { horizontal_offset_px: 0, top_inset_px: 10 };

    const collapsed = calculatePhysicalBounds(false, monitor1080p, settings);
    expect(collapsed.width).toBe(ISLAND_WIDTH); // 460
    expect(collapsed.height).toBe(ISLAND_COLLAPSED_HEIGHT); // 78
    expect(collapsed.physicalWidth).toBe(460);
    expect(collapsed.physicalHeight).toBe(78);
    expect(collapsed.x).toBe(730); // (1920 - 460) / 2
    expect(collapsed.y).toBe(10);

    const expanded = calculatePhysicalBounds(true, monitor1080p, settings);
    expect(expanded.height).toBe(ISLAND_EXPANDED_HEIGHT); // 604
    expect(expanded.physicalHeight).toBe(604);
    expect(expanded.x).toBe(730);
    expect(expanded.y).toBe(10);
  });

  it('handles secondary monitors with negative virtual desktop coordinates', () => {
    // Secondary monitor positioned to the left of primary: x = -1920, y = 0
    const secondaryMonitor = { x: -1920, y: 0, width: 1920, height: 1080, scaleFactor: 1.0 };
    const settings = { horizontal_offset_px: 0, top_inset_px: 12 };

    const bounds = calculatePhysicalBounds(false, secondaryMonitor, settings);
    expect(bounds.x).toBe(-1920 + (1920 - 460) / 2); // -1190
    expect(bounds.y).toBe(12);
    expect(bounds.physicalWidth).toBe(460);
  });

  it('scales accurately on high-DPI 1440p (1.25x fractional) and 4K (2.0x integer) monitors', () => {
    // 1440p @ 1.25x
    const monitor1440p = { x: 0, y: 0, width: 2560, height: 1440, scaleFactor: 1.25 };
    const bounds125 = calculatePhysicalBounds(false, monitor1440p, { horizontal_offset_px: 0, top_inset_px: 10 });
    expect(bounds125.physicalWidth).toBe(575); // 460 * 1.25
    expect(bounds125.physicalHeight).toBe(98); // 78 * 1.25 = 97.5 rounded
    expect(bounds125.x).toBe(Math.round((2560 - 575) / 2)); // 992 or 993
    expect(bounds125.y).toBe(13); // 10 * 1.25 = 12.5 rounded

    // 4K @ 2.0x
    const monitor4k = { x: 0, y: 0, width: 3840, height: 2160, scaleFactor: 2.0 };
    const bounds200 = calculatePhysicalBounds(false, monitor4k, { horizontal_offset_px: 0, top_inset_px: 10 });
    expect(bounds200.physicalWidth).toBe(920); // 460 * 2
    expect(bounds200.physicalHeight).toBe(156); // 78 * 2
    expect(bounds200.x).toBe((3840 - 920) / 2); // 1460
    expect(bounds200.y).toBe(20);
  });

  it('strictly clamps offsets to ensure the capsule never gets trapped off-screen', () => {
    const monitor = { x: 0, y: 0, width: 1920, height: 1080, scaleFactor: 1.0 };

    // Off-screen right
    const pushedRight = calculatePhysicalBounds(false, monitor, { horizontal_offset_px: 9999, top_inset_px: 10 });
    expect(pushedRight.x).toBe(1920 - 460 - 8); // Clamped with 8px margin

    // Off-screen left
    const pushedLeft = calculatePhysicalBounds(false, monitor, { horizontal_offset_px: -9999, top_inset_px: 10 });
    expect(pushedLeft.x).toBe(8); // Clamped to 8px margin

    // Top inset clamp
    const insetTooSmall = calculatePhysicalBounds(false, monitor, { horizontal_offset_px: 0, top_inset_px: 0 });
    expect(insetTooSmall.y).toBe(4);

    const insetTooLarge = calculatePhysicalBounds(false, monitor, { horizontal_offset_px: 0, top_inset_px: 999 });
    expect(insetTooLarge.y).toBe(64);
  });
});
