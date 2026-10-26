import { describe, expect, it } from 'vitest';
import {
  calculatePhysicalBounds,
  ISLAND_COLLAPSED_HEIGHT,
  ISLAND_EXPANDED_HEIGHT,
  ISLAND_WIDTH,
  NOTCH_COLLAPSED_WIDTH,
} from '../src/lib/desktop';

describe('Window bounds & multi-monitor DPI scaling', () => {
  it('correctly calculates collapsed notch (340x38) and expanded island (460x564) physical dimensions on standard 1080p (1.0x scale)', () => {
    const monitor1080p = { x: 0, y: 0, width: 1920, height: 1080, scaleFactor: 1.0 };
    const settings = { horizontal_offset_px: 0, top_inset_px: 0 };

    const collapsed = calculatePhysicalBounds(false, monitor1080p, settings);
    expect(collapsed.width).toBe(NOTCH_COLLAPSED_WIDTH); // 340
    expect(collapsed.height).toBe(ISLAND_COLLAPSED_HEIGHT); // 38
    expect(collapsed.physicalWidth).toBe(340);
    expect(collapsed.physicalHeight).toBe(38);
    expect(collapsed.x).toBe(790); // (1920 - 340) / 2
    expect(collapsed.y).toBe(0); // Flush top-bezel docking

    const expanded = calculatePhysicalBounds(true, monitor1080p, settings);
    expect(expanded.width).toBe(ISLAND_WIDTH); // 460
    expect(expanded.height).toBe(ISLAND_EXPANDED_HEIGHT); // 564
    expect(expanded.physicalWidth).toBe(460);
    expect(expanded.physicalHeight).toBe(564);
    expect(expanded.x).toBe(730);
    expect(expanded.y).toBe(0);
  });

  it('handles secondary monitors with negative virtual desktop coordinates', () => {
    // Secondary monitor positioned to the left of primary: x = -1920, y = 0
    const secondaryMonitor = { x: -1920, y: 0, width: 1920, height: 1080, scaleFactor: 1.0 };
    const settings = { horizontal_offset_px: 0, top_inset_px: 12 };

    const bounds = calculatePhysicalBounds(false, secondaryMonitor, settings);
    expect(bounds.x).toBe(-1920 + (1920 - 340) / 2); // -1130
    expect(bounds.y).toBe(12);
    expect(bounds.physicalWidth).toBe(340);
  });

  it('scales accurately on high-DPI 1440p (1.25x fractional) and 4K (2.0x integer) monitors', () => {
    // 1440p @ 1.25x
    const monitor1440p = { x: 0, y: 0, width: 2560, height: 1440, scaleFactor: 1.25 };
    const bounds125 = calculatePhysicalBounds(false, monitor1440p, { horizontal_offset_px: 0, top_inset_px: 10 });
    expect(bounds125.physicalWidth).toBe(425); // 340 * 1.25
    expect(bounds125.physicalHeight).toBe(48); // 38 * 1.25 = 47.5 rounded
    expect(bounds125.x).toBe(Math.round((2560 - 425) / 2)); // 1068
    expect(bounds125.y).toBe(13); // 10 * 1.25 = 12.5 rounded

    // 4K @ 2.0x
    const monitor4k = { x: 0, y: 0, width: 3840, height: 2160, scaleFactor: 2.0 };
    const bounds200 = calculatePhysicalBounds(false, monitor4k, { horizontal_offset_px: 0, top_inset_px: 10 });
    expect(bounds200.physicalWidth).toBe(680); // 340 * 2
    expect(bounds200.physicalHeight).toBe(76); // 38 * 2
    expect(bounds200.x).toBe((3840 - 680) / 2); // 1580
    expect(bounds200.y).toBe(20);
  });

  it('strictly clamps offsets to ensure the capsule never gets trapped off-screen while permitting Y: 0 top bezel docking', () => {
    const monitor = { x: 0, y: 0, width: 1920, height: 1080, scaleFactor: 1.0 };

    // Off-screen right
    const pushedRight = calculatePhysicalBounds(false, monitor, { horizontal_offset_px: 9999, top_inset_px: 10 });
    expect(pushedRight.x).toBe(1920 - 340 - 8); // Clamped with 8px margin

    // Off-screen left
    const pushedLeft = calculatePhysicalBounds(false, monitor, { horizontal_offset_px: -9999, top_inset_px: 10 });
    expect(pushedLeft.x).toBe(8); // Clamped to 8px margin

    // Top inset clamp allows 0 for flush top bezel
    const insetZero = calculatePhysicalBounds(false, monitor, { horizontal_offset_px: 0, top_inset_px: 0 });
    expect(insetZero.y).toBe(0);

    const insetNegative = calculatePhysicalBounds(false, monitor, { horizontal_offset_px: 0, top_inset_px: -15 });
    expect(insetNegative.y).toBe(0);

    const insetTooLarge = calculatePhysicalBounds(false, monitor, { horizontal_offset_px: 0, top_inset_px: 999 });
    expect(insetTooLarge.y).toBe(64);
  });
});
