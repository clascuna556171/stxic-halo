use serde::Serialize;
use tauri::{LogicalSize, Manager, PhysicalPosition, Runtime, WebviewWindow};

pub const ISLAND_WIDTH_LOGICAL: f64 = 460.0;
pub const NOTCH_COLLAPSED_WIDTH_LOGICAL: f64 = 340.0;
pub const NOTCH_COLLAPSED_HEIGHT_LOGICAL: f64 = 38.0;
pub const ISLAND_COLLAPSED_HEIGHT_LOGICAL: f64 = NOTCH_COLLAPSED_HEIGHT_LOGICAL;
pub const ISLAND_EXPANDED_HEIGHT_LOGICAL: f64 = 564.0;

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
    let scale = scale_factor.max(0.5);
    let logical_width = if expanded {
        ISLAND_WIDTH_LOGICAL
    } else {
        NOTCH_COLLAPSED_WIDTH_LOGICAL
    };
    let logical_height = if expanded {
        ISLAND_EXPANDED_HEIGHT_LOGICAL
    } else {
        NOTCH_COLLAPSED_HEIGHT_LOGICAL
    };

    let physical_width = (logical_width * scale).round() as i32;
    let physical_height = (logical_height * scale).round() as i32;
    let physical_offset_x = (f64::from(horizontal_offset_px) * scale).round() as i32;
    // Allow top_inset_px = 0 for flush top-bezel Mac Notch docking
    let physical_top_inset = (f64::from(top_inset_px.clamp(0, 64)) * scale).round() as i32;

    let centered_x =
        mon_x + ((mon_width as i32 - physical_width) / 2) + physical_offset_x;
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
    let logical_width = if expanded {
        ISLAND_WIDTH_LOGICAL
    } else {
        NOTCH_COLLAPSED_WIDTH_LOGICAL
    };
    let logical_height = if expanded {
        ISLAND_EXPANDED_HEIGHT_LOGICAL
    } else {
        NOTCH_COLLAPSED_HEIGHT_LOGICAL
    };

    window
        .set_size(LogicalSize::new(logical_width, logical_height))
        .map_err(|_| "Could not resize Halo window".to_string())?;

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

        let (x, y, _, _) = calculate_clamped_bounds(
            expanded,
            scale,
            pos.x,
            pos.y,
            size.width,
            size.height,
            horizontal_offset_px,
            top_inset_px,
        );

        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|_| "Could not position Halo window".to_string())?;
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
