use crate::config::UserSettings;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow};

pub const ISLAND_WIDTH_LOGICAL: f64 = 460.0;
pub const NOTCH_COLLAPSED_WIDTH_LOGICAL: f64 = 340.0;
pub const NOTCH_COLLAPSED_HEIGHT_LOGICAL: f64 = 38.0;
pub const ISLAND_COLLAPSED_HEIGHT_LOGICAL: f64 = NOTCH_COLLAPSED_HEIGHT_LOGICAL;
pub const ISLAND_EXPANDED_HEIGHT_LOGICAL: f64 = 564.0;
pub const ISLAND_PREVIEW_HEIGHT_LOGICAL: f64 = 112.0;
pub const PEEK_WIDTH_LOGICAL: f64 = 120.0;
pub const PEEK_HEIGHT_LOGICAL: f64 = 5.0;

#[derive(Debug, Clone, Serialize)]
pub struct MonitorDescriptor {
    pub index: usize,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

pub fn enumerate_monitors<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<Vec<MonitorDescriptor>, String> {
    let monitors = window
        .available_monitors()
        .map_err(|_| "Could not query available displays".to_string())?;
    let primary_pos = window
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| (*m.position(), *m.size()));

    let mut list = Vec::with_capacity(monitors.len());
    for (index, monitor) in monitors.into_iter().enumerate() {
        let pos = *monitor.position();
        let size = *monitor.size();
        let is_primary = primary_pos
            .map(|(p_pos, p_size)| {
                p_pos.x == pos.x
                    && p_pos.y == pos.y
                    && p_size.width == size.width
                    && p_size.height == size.height
            })
            .unwrap_or(index == 0);
        let raw_name = monitor
            .name()
            .cloned()
            .unwrap_or_else(|| format!("Display {}", index + 1));
        let clean_name = raw_name.trim_start_matches(r"\\.\").to_string();

        list.push(MonitorDescriptor {
            index,
            name: if clean_name.is_empty() {
                format!("Display {}", index + 1)
            } else {
                clean_name
            },
            width: size.width,
            height: size.height,
            x: pos.x,
            y: pos.y,
            scale_factor: monitor.scale_factor(),
            is_primary,
        });
    }

    Ok(list)
}

/// Calculates the physical window size and clamped screen coordinates for the top-anchored notch / Dynamic Island.
/// Supports zero-inset top-bezel docking (`top_inset_px: 0`, `Y = 0` relative to monitor top),
/// compact notch dimensions (`340x38`), and expanded executive HUD dimensions (`460x564`).
pub fn calculate_clamped_bounds(
    expanded: bool,
    scale_factor: f64,
    mon_x: i32,
    mon_y: i32,
    mon_width: u32,
    mon_height: u32,
    horizontal_offset_px: i32,
    top_inset_px: i32,
) -> (i32, i32, i32, i32) {
    calculate_clamped_bounds_with_preview(
        expanded,
        false,
        scale_factor,
        mon_x,
        mon_y,
        mon_width,
        mon_height,
        horizontal_offset_px,
        top_inset_px,
    )
}

pub fn calculate_clamped_bounds_with_preview(
    expanded: bool,
    preview: bool,
    scale_factor: f64,
    mon_x: i32,
    mon_y: i32,
    mon_width: u32,
    mon_height: u32,
    horizontal_offset_px: i32,
    top_inset_px: i32,
) -> (i32, i32, i32, i32) {
    calculate_clamped_bounds_with_state(
        expanded,
        preview,
        false,
        scale_factor,
        mon_x,
        mon_y,
        mon_width,
        mon_height,
        horizontal_offset_px,
        top_inset_px,
    )
}

pub fn calculate_clamped_bounds_with_state(
    expanded: bool,
    preview: bool,
    peek: bool,
    scale_factor: f64,
    mon_x: i32,
    mon_y: i32,
    mon_width: u32,
    mon_height: u32,
    horizontal_offset_px: i32,
    top_inset_px: i32,
) -> (i32, i32, i32, i32) {
    let scale = scale_factor.max(0.5);
    let is_peek = !expanded && !preview && peek;
    let logical_width = if expanded {
        ISLAND_WIDTH_LOGICAL
    } else if is_peek {
        PEEK_WIDTH_LOGICAL
    } else {
        NOTCH_COLLAPSED_WIDTH_LOGICAL
    };
    let logical_height = if expanded {
        ISLAND_EXPANDED_HEIGHT_LOGICAL
    } else if preview {
        ISLAND_PREVIEW_HEIGHT_LOGICAL
    } else if is_peek {
        PEEK_HEIGHT_LOGICAL
    } else {
        NOTCH_COLLAPSED_HEIGHT_LOGICAL
    };

    let physical_width = (logical_width * scale).round() as i32;
    let physical_height = (logical_height * scale).round() as i32;
    let physical_offset_x = (f64::from(horizontal_offset_px) * scale).round() as i32;
    // Peek mode always docks flush at y = mon_y so it never dips into a maximized window's tab strip.
    let physical_top_inset = if is_peek {
        0
    } else {
        (f64::from(top_inset_px.clamp(0, 64)) * scale).round() as i32
    };

    let centered_x = mon_x + ((mon_width as i32 - physical_width) / 2) + physical_offset_x;
    let min_x = mon_x + 8;
    let max_x = (mon_x + mon_width as i32 - physical_width - 8).max(min_x);
    let clamped_x = centered_x.clamp(min_x, max_x);

    let desired_y = mon_y + physical_top_inset;
    let min_y = mon_y;
    let max_y = (mon_y + mon_height as i32 - physical_height - 8).max(min_y);
    let clamped_y = desired_y.clamp(min_y, max_y);

    (clamped_x, clamped_y, physical_width, physical_height)
}

/// Resizes and positions the floating island on the selected monitor with full DPI awareness
/// and off-screen clamping so monitor disconnects or resolution changes never strand the window.
pub fn apply_island_bounds<R: Runtime>(
    window: &WebviewWindow<R>,
    expanded: bool,
    target_monitor_index: usize,
    horizontal_offset_px: i32,
    top_inset_px: i32,
) -> Result<(), String> {
    apply_island_bounds_with_preview(
        window,
        expanded,
        false,
        target_monitor_index,
        horizontal_offset_px,
        top_inset_px,
    )
}

pub fn apply_island_bounds_with_preview<R: Runtime>(
    window: &WebviewWindow<R>,
    expanded: bool,
    preview: bool,
    target_monitor_index: usize,
    horizontal_offset_px: i32,
    top_inset_px: i32,
) -> Result<(), String> {
    apply_island_bounds_with_state(
        window,
        expanded,
        preview,
        false,
        target_monitor_index,
        horizontal_offset_px,
        top_inset_px,
    )
}

pub fn apply_island_bounds_with_state<R: Runtime>(
    window: &WebviewWindow<R>,
    expanded: bool,
    preview: bool,
    peek: bool,
    target_monitor_index: usize,
    horizontal_offset_px: i32,
    top_inset_px: i32,
) -> Result<(), String> {
    let is_peek = !expanded && !preview && peek;
    let logical_width = if expanded {
        ISLAND_WIDTH_LOGICAL
    } else if is_peek {
        PEEK_WIDTH_LOGICAL
    } else {
        NOTCH_COLLAPSED_WIDTH_LOGICAL
    };
    let logical_height = if expanded {
        ISLAND_EXPANDED_HEIGHT_LOGICAL
    } else if preview {
        ISLAND_PREVIEW_HEIGHT_LOGICAL
    } else if is_peek {
        PEEK_HEIGHT_LOGICAL
    } else {
        NOTCH_COLLAPSED_HEIGHT_LOGICAL
    };

    let monitors = window.available_monitors().unwrap_or_default();
    let chosen_monitor = monitors
        .get(target_monitor_index)
        .cloned()
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| monitors.into_iter().next());

    if let Some(monitor) = chosen_monitor {
        let pos = monitor.position();
        let size = monitor.size();
        let scale = monitor.scale_factor();

        let (x, y, phys_w, phys_h) = calculate_clamped_bounds_with_state(
            expanded,
            preview,
            peek,
            scale,
            pos.x,
            pos.y,
            size.width,
            size.height,
            horizontal_offset_px,
            top_inset_px,
        );

        let size_matches = window
            .outer_size()
            .ok()
            .is_some_and(|cur| cur.width == phys_w as u32 && cur.height == phys_h as u32);
        let pos_matches = window
            .outer_position()
            .ok()
            .is_some_and(|cur| cur.x == x && cur.y == y);

        if size_matches && pos_matches {
            return Ok(());
        }

        if !pos_matches {
            window
                .set_position(PhysicalPosition::new(x, y))
                .map_err(|_| "Could not position Halo window".to_string())?;
        }

        if !size_matches {
            window
                .set_size(PhysicalSize::new(phys_w as u32, phys_h as u32))
                .map_err(|_| "Could not resize Halo window".to_string())?;
        }
    } else {
        window
            .set_size(LogicalSize::new(logical_width, logical_height))
            .map_err(|_| "Could not resize Halo window".to_string())?;
    }

    Ok(())
}

pub fn show_and_focus_main<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Checks whether a maximized or fullscreen window's bounding box meaningfully overlaps the top strip of a monitor.
/// Uses a 16px horizontal margin so a maximized window's 7–8px invisible resize border on an adjacent
/// monitor does not falsely trigger auto-hide on this monitor.
#[allow(clippy::too_many_arguments)]
pub fn rect_overlaps_monitor_top(
    win_left: i32,
    win_top: i32,
    win_right: i32,
    win_bottom: i32,
    mon_x: i32,
    mon_y: i32,
    mon_width: u32,
    mon_height: u32,
) -> bool {
    let mon_right = mon_x + mon_width as i32;
    let mon_bottom = mon_y + mon_height as i32;
    let horiz_overlap = win_right > mon_x + 16 && win_left < mon_right - 16;
    // Allow up to 120px top clearance so top-docked high-DPI taskbars don't defeat maximized detection.
    let touches_top_strip =
        win_top <= mon_y + 120 && win_bottom > mon_y + 120 && win_top < mon_bottom;
    horiz_overlap && touches_top_strip
}

pub fn rect_covers_monitor_fullscreen(
    win_left: i32,
    win_top: i32,
    win_right: i32,
    win_bottom: i32,
    mon_x: i32,
    mon_y: i32,
    mon_width: u32,
    mon_height: u32,
) -> bool {
    let mon_right = mon_x + mon_width as i32;
    let mon_bottom = mon_y + mon_height as i32;
    win_left <= mon_x + 2
        && win_top <= mon_y + 2
        && win_right >= mon_right - 2
        && win_bottom >= mon_bottom - 2
}

#[cfg(windows)]
pub fn is_foreground_maximized_on_monitor(
    mon_x: i32,
    mon_y: i32,
    mon_width: u32,
    mon_height: u32,
) -> bool {
    #[repr(C)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    extern "system" {
        fn GetForegroundWindow() -> isize;
        fn IsZoomed(hwnd: isize) -> i32;
        fn IsWindowVisible(hwnd: isize) -> i32;
        fn GetWindowRect(hwnd: isize, lp_rect: *mut Rect) -> i32;
        fn GetWindowThreadProcessId(hwnd: isize, lpdw_process_id: *mut u32) -> u32;
    }

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == 0 {
            return false;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == std::process::id() {
            return false;
        }
        if IsWindowVisible(hwnd) == 0 {
            return false;
        }
        let mut rect = Rect {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return false;
        }
        let is_zoomed = IsZoomed(hwnd) != 0;
        let is_fullscreen = rect_covers_monitor_fullscreen(
            rect.left,
            rect.top,
            rect.right,
            rect.bottom,
            mon_x,
            mon_y,
            mon_width,
            mon_height,
        );
        if !is_zoomed && !is_fullscreen {
            return false;
        }
        rect_overlaps_monitor_top(
            rect.left,
            rect.top,
            rect.right,
            rect.bottom,
            mon_x,
            mon_y,
            mon_width,
            mon_height,
        )
    }
}

#[cfg(not(windows))]
pub fn is_foreground_maximized_on_monitor(
    _mon_x: i32,
    _mon_y: i32,
    _mon_width: u32,
    _mon_height: u32,
) -> bool {
    false
}

pub fn is_foreground_maximized_for_window<R: Runtime>(
    window: &WebviewWindow<R>,
    target_monitor_index: usize,
) -> bool {
    let monitors = window.available_monitors().unwrap_or_default();
    let chosen = monitors
        .get(target_monitor_index)
        .cloned()
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| monitors.into_iter().next());

    if let Some(monitor) = chosen {
        let pos = monitor.position();
        let size = monitor.size();
        is_foreground_maximized_on_monitor(pos.x, pos.y, size.width, size.height)
    } else {
        false
    }
}

/// Polls Windows foreground maximized state at 250ms and emits `halo://maximized-foreground`
/// only when the boolean transitions.
pub fn start_maximized_foreground_watcher<R: Runtime>(app: tauri::AppHandle<R>) {
    std::thread::spawn(move || {
        let mut last_state: Option<bool> = None;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(250));
            let Some(window) = app.get_webview_window("main") else {
                continue;
            };
            let target_monitor_index = app
                .try_state::<Mutex<UserSettings>>()
                .and_then(|s| s.lock().ok().map(|g| g.target_monitor_index))
                .unwrap_or(0);
            let maximized = is_foreground_maximized_for_window(&window, target_monitor_index);
            if last_state != Some(maximized) {
                last_state = Some(maximized);
                let _ = app.emit("halo://maximized-foreground", maximized);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preview_is_small_and_full_dashboard_takes_precedence() {
        let (_, y, w, h) =
            calculate_clamped_bounds_with_preview(false, true, 1.25, -2560, 0, 2560, 1440, 0, 0);
        assert_eq!((y, w, h), (0, 425, 140));
        let (_, _, w, h) =
            calculate_clamped_bounds_with_preview(true, true, 1.0, 0, 0, 1920, 1080, 0, 0);
        assert_eq!((w, h), (460, 564));
    }

    #[test]
    fn test_single_monitor_1080p_100_percent_dpi() {
        // 1920x1080 @ 1.0 scale factor, centered with 0px top inset (flush notch)
        let (x, y, w, h) = calculate_clamped_bounds(false, 1.0, 0, 0, 1920, 1080, 0, 0);
        assert_eq!(w, 340);
        assert_eq!(h, 38);
        assert_eq!(x, (1920 - 340) / 2); // 790
        assert_eq!(y, 0);
    }

    #[test]
    fn test_expanded_bounds_calculation() {
        let (x, y, w, h) = calculate_clamped_bounds(true, 1.0, 0, 0, 1920, 1080, 0, 0);
        assert_eq!(w, 460);
        assert_eq!(h, 564);
        assert_eq!(x, 730);
        assert_eq!(y, 0);
    }

    #[test]
    fn test_dual_monitor_negative_coordinates() {
        // Secondary monitor to the left: x = -1920, y = 0, 1920x1080 @ 1.0 scale
        let (x, y, w, h) = calculate_clamped_bounds(false, 1.0, -1920, 0, 1920, 1080, 0, 10);
        assert_eq!(w, 340);
        assert_eq!(h, 38);
        assert_eq!(x, -1920 + (1920 - 340) / 2); // -1130
        assert_eq!(y, 10);
    }

    #[test]
    fn test_1440p_125_percent_fractional_dpi() {
        // 2560x1440 @ 1.25 scale factor
        let (x, y, w, h) = calculate_clamped_bounds(false, 1.25, 0, 0, 2560, 1440, 0, 10);
        assert_eq!(w, 425); // (340 * 1.25)
        assert_eq!(h, 48); // (38 * 1.25 = 47.5 rounded)
        assert_eq!(x, (2560 - 425) / 2); // 1067
        assert_eq!(y, 13); // 10 * 1.25 = 12.5 rounded 13
    }

    #[test]
    fn test_4k_200_percent_high_dpi() {
        // 3840x2160 @ 2.0 scale factor
        let (x, y, w, h) = calculate_clamped_bounds(false, 2.0, 0, 0, 3840, 2160, 0, 10);
        assert_eq!(w, 680); // 340 * 2
        assert_eq!(h, 76); // 38 * 2
        assert_eq!(x, (3840 - 680) / 2); // 1580
        assert_eq!(y, 20); // 10 * 2
    }

    #[test]
    fn test_offscreen_clamping_prevents_lost_window() {
        // Excessive positive horizontal offset
        let (x_right, _, w, _) = calculate_clamped_bounds(false, 1.0, 0, 0, 1920, 1080, 9999, 10);
        assert_eq!(x_right, 1920 - w - 8);

        // Excessive negative horizontal offset
        let (x_left, _, _, _) = calculate_clamped_bounds(false, 1.0, 0, 0, 1920, 1080, -9999, 10);
        assert_eq!(x_left, 8);

        // Top inset clamped to [0, 64] for flush top-bezel docking
        let (_, y_min, _, _) = calculate_clamped_bounds(false, 1.0, 0, 0, 1920, 1080, 0, -20);
        assert_eq!(y_min, 0);

        let (_, y_zero, _, _) = calculate_clamped_bounds(false, 1.0, 0, 0, 1920, 1080, 0, 0);
        assert_eq!(y_zero, 0);

        let (_, y_max, _, _) = calculate_clamped_bounds(false, 1.0, 0, 0, 1920, 1080, 0, 500);
        assert_eq!(y_max, 64);
    }

    #[test]
    fn peek_bar_bounds_are_compact_and_flush_top() {
        // 1080p @ 1.0x: peek ignores top_inset_px and docks flush at y = 0
        let (x, y, w, h) =
            calculate_clamped_bounds_with_state(false, false, true, 1.0, 0, 0, 1920, 1080, 0, 24);
        assert_eq!((x, y, w, h), (900, 0, 120, 5));

        // 1440p @ 1.25x on left secondary monitor
        let (x2, y2, w2, h2) = calculate_clamped_bounds_with_state(
            false, false, true, 1.25, -2560, 0, 2560, 1440, 0, 12,
        );
        assert_eq!((w2, h2, y2), (150, 6, 0));
        assert_eq!(x2, -2560 + (2560 - 150) / 2);

        // Preview and expanded always take precedence over peek
        let (_, _, pw, ph) =
            calculate_clamped_bounds_with_state(false, true, true, 1.0, 0, 0, 1920, 1080, 0, 0);
        assert_eq!((pw, ph), (340, 112));

        let (_, _, ew, eh) =
            calculate_clamped_bounds_with_state(true, false, true, 1.0, 0, 0, 1920, 1080, 0, 0);
        assert_eq!((ew, eh), (460, 564));
    }

    #[test]
    fn maximized_overlap_ignores_adjacent_monitor_resize_borders() {
        // Maximized window on primary monitor (with -8px invisible Windows border)
        assert!(rect_overlaps_monitor_top(-8, -8, 1928, 1048, 0, 0, 1920, 1080));
        // Same window's 8px border bleeding into left monitor (-1920..0) should NOT trigger left monitor
        assert!(!rect_overlaps_monitor_top(-8, -8, 1928, 1048, -1920, 0, 1920, 1080));
        // Maximized window on left monitor should trigger left monitor, not primary
        assert!(rect_overlaps_monitor_top(-1928, -8, 8, 1048, -1920, 0, 1920, 1080));
        assert!(!rect_overlaps_monitor_top(-1928, -8, 8, 1048, 0, 0, 1920, 1080));
    }
}
