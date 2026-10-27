pub mod claude_manager;
pub mod codex;
pub mod copilot_usage;
pub mod config;
pub mod diagnostics;
pub mod events;
pub mod paths;
pub mod providers;
pub mod usage;
pub mod retention;
pub mod permissions;
pub mod perf;
pub mod profiling;
pub mod proof_of_work;
pub mod telemetry;
pub mod window;

use config::{SettingsHealth, UserSettings};
use diagnostics::{create_diagnostic_bundle, DiagnosticBundleExport};
use events::{AgentEvent, EventLogReader, EventLogStatus, EventLogWatcher};
use perf::{PerfRegistry, TimingStat};
use profiling::{IdleProfiler, LeakAnalysis, MemorySample};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, WebviewWindow,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use telemetry::{Metrics, ProcessLifecycleSnapshot, SelfFootprint, TelemetryCollector};
use window::{apply_island_bounds, enumerate_monitors, show_and_focus_main, MonitorDescriptor};

/// Argument passed by the Windows Run-key entry so launches at login can be told apart.
pub const AUTOSTART_ARG: &str = "--autostart";

#[tauri::command]
fn read_metrics(
    state: State<'_, Mutex<TelemetryCollector>>,
    perf: State<'_, Arc<PerfRegistry>>,
) -> Result<Metrics, String> {
    let mut collector = state
        .lock()
        .map_err(|_| "System telemetry collector lock poisoned".to_string())?;
    Ok(perf.time("metrics_sample", || collector.sample()))
}

#[tauri::command]
fn read_agent_events(
    state: State<'_, Arc<Mutex<EventLogReader>>>,
    perf: State<'_, Arc<PerfRegistry>>,
) -> Result<Vec<AgentEvent>, String> {
    let mut reader = state
        .lock()
        .map_err(|_| "Event log reader lock poisoned".to_string())?;
    perf.time("event_log_read", || reader.read_recent())
}

#[tauri::command]
fn clear_agent_events(state: State<'_, Arc<Mutex<EventLogReader>>>) -> Result<(), String> {
    let mut reader = state
        .lock()
        .map_err(|_| "Event log reader lock poisoned".to_string())?;
    reader.clear()
}

/// Provider processes used to reconcile hook sessions with real process lifecycle.
#[tauri::command]
fn read_process_lifecycle(
    state: State<'_, Mutex<TelemetryCollector>>,
    perf: State<'_, Arc<PerfRegistry>>,
) -> Result<ProcessLifecycleSnapshot, String> {
    let mut collector = state
        .lock()
        .map_err(|_| "System telemetry collector lock poisoned".to_string())?;
    Ok(perf.time("process_lifecycle_scan", || collector.provider_processes()))
}

#[tauri::command]
fn load_settings(state: State<'_, Mutex<UserSettings>>) -> Result<UserSettings, String> {
    let guard = state
        .lock()
        .map_err(|_| "Settings store lock poisoned".to_string())?;
    Ok(guard.clone())
}

#[tauri::command]
fn save_settings(
    window: WebviewWindow,
    state: State<'_, Mutex<UserSettings>>,
    health: State<'_, Mutex<SettingsHealth>>,
    settings: UserSettings,
    expanded: bool,
) -> Result<UserSettings, String> {
    let result = settings.save_to_disk();
    if let Ok(mut h) = health.lock() {
        h.last_save_error = result.as_ref().err().cloned();
    }
    let persisted = result?;
    {
        let mut guard = state
            .lock()
            .map_err(|_| "Settings store lock poisoned".to_string())?;
        *guard = persisted.clone();
    }
    let _ = apply_island_bounds(
        &window,
        expanded,
        persisted.target_monitor_index,
        persisted.horizontal_offset_px,
        persisted.top_inset_px,
    );
    Ok(persisted)
}

#[tauri::command]
fn list_monitors(window: WebviewWindow) -> Result<Vec<MonitorDescriptor>, String> {
    enumerate_monitors(&window)
}

#[tauri::command]
fn sync_island_bounds(
    window: WebviewWindow,
    state: State<'_, Mutex<UserSettings>>,
    expanded: bool,
    preview: Option<bool>,
) -> Result<(), String> {
    let settings = state
        .lock()
        .map(|s| s.clone())
        .unwrap_or_else(|_| UserSettings::default());
    window::apply_island_bounds_with_preview(
        &window,
        expanded,
        preview.unwrap_or(false),
        settings.target_monitor_index,
        settings.horizontal_offset_px,
        settings.top_inset_px,
    )
}

/// Windows "start at login" state is read from the real Run-key entry, never cached in
/// settings, so the UI cannot drift from what Windows will actually do.
#[derive(Debug, Clone, Serialize)]
pub struct LaunchAtLoginStatus {
    pub supported: bool,
    pub enabled: bool,
    pub error: Option<String>,
}

fn launch_at_login_status(app: &AppHandle) -> LaunchAtLoginStatus {
    match app.autolaunch().is_enabled() {
        Ok(enabled) => LaunchAtLoginStatus { supported: true, enabled, error: None },
        Err(e) => LaunchAtLoginStatus {
            supported: true,
            enabled: false,
            error: Some(format!("Could not read startup entry: {e}")),
        },
    }
}

#[tauri::command]
fn get_launch_at_login(app: AppHandle) -> LaunchAtLoginStatus {
    launch_at_login_status(&app)
}

#[tauri::command]
fn set_launch_at_login(app: AppHandle, enabled: bool) -> Result<LaunchAtLoginStatus, String> {
    let manager = app.autolaunch();
    let result = if enabled { manager.enable() } else { manager.disable() };
    result.map_err(|e| {
        format!(
            "Could not {} launch at login: {e}",
            if enabled { "enable" } else { "disable" }
        )
    })?;
    Ok(launch_at_login_status(&app))
}

#[derive(Debug, Clone, Serialize)]
pub struct CodexSourceStatus {
    pub enabled: bool,
    pub sessions_dir: Option<String>,
    pub sessions_dir_exists: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct IntegrationStatus {
    pub settings: SettingsHealth,
    pub event_log: EventLogStatus,
    pub codex: CodexSourceStatus,
    pub launch_at_login: LaunchAtLoginStatus,
    pub single_instance: bool,
    pub launched_at_login: bool,
}

/// Live integration health. Cheap: metadata reads + one registry query; does not spawn
/// PowerShell (Claude hook status is queried separately).
#[tauri::command]
fn read_integration_status(
    app: AppHandle,
    settings: State<'_, Mutex<UserSettings>>,
    health: State<'_, Mutex<SettingsHealth>>,
    reader: State<'_, Arc<Mutex<EventLogReader>>>,
) -> Result<IntegrationStatus, String> {
    let settings_health = health
        .lock()
        .map(|h| h.clone())
        .map_err(|_| "Settings health lock poisoned".to_string())?;
    let codex_enabled = settings.lock().map(|s| s.enable_codex_logs).unwrap_or(false);
    let event_log = reader
        .lock()
        .map(|r| r.status())
        .map_err(|_| "Event log reader lock poisoned".to_string())?;
    let sessions_dir = codex::codex_home_dir().map(|h| h.join("sessions"));

    Ok(IntegrationStatus {
        settings: settings_health,
        event_log,
        codex: CodexSourceStatus {
            enabled: codex_enabled,
            sessions_dir_exists: sessions_dir.as_ref().is_some_and(|d| d.exists()),
            sessions_dir: sessions_dir.map(|d| d.display().to_string()),
        },
        launch_at_login: launch_at_login_status(&app),
        single_instance: true,
        launched_at_login: std::env::args().any(|a| a == AUTOSTART_ARG),
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct PerformanceStats {
    pub uptime_secs: u64,
    pub footprint: SelfFootprint,
    pub timings: BTreeMap<String, TimingStat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub leak_analysis: Option<LeakAnalysis>,
}

#[tauri::command]
fn read_performance_stats(
    collector: State<'_, Mutex<TelemetryCollector>>,
    perf: State<'_, Arc<PerfRegistry>>,
    profiler: State<'_, Mutex<IdleProfiler>>,
) -> Result<PerformanceStats, String> {
    let footprint = collector
        .lock()
        .map(|mut c| c.self_footprint())
        .map_err(|_| "System telemetry collector lock poisoned".to_string())?;

    let leak_analysis = if footprint.available {
        if let Ok(mut p) = profiler.lock() {
            p.record(MemorySample {
                timestamp_ms: telemetry::epoch_ms(),
                memory_bytes: footprint.memory_bytes,
                virtual_memory_bytes: footprint.virtual_memory_bytes,
                cpu_percent: footprint.cpu_percent,
            });
            Some(p.analyze())
        } else {
            None
        }
    } else {
        None
    };

    Ok(PerformanceStats {
        uptime_secs: perf.uptime_secs(),
        footprint,
        timings: perf.snapshot(),
        leak_analysis,
    })
}

#[tauri::command]
fn read_idle_profile(profiler: State<'_, Mutex<IdleProfiler>>) -> Result<LeakAnalysis, String> {
    let guard = profiler
        .lock()
        .map_err(|_| "Idle profiler lock poisoned".to_string())?;
    Ok(guard.analyze())
}

#[tauri::command]
fn export_diagnostic_bundle(
    settings: State<'_, Mutex<UserSettings>>,
    health: State<'_, Mutex<SettingsHealth>>,
    reader: State<'_, Arc<Mutex<EventLogReader>>>,
    perf: State<'_, Arc<PerfRegistry>>,
    profiler: State<'_, Mutex<IdleProfiler>>,
) -> Result<DiagnosticBundleExport, String> {
    let health_snapshot = health
        .lock()
        .map(|h| h.clone())
        .map_err(|_| "Settings health lock poisoned".to_string())?;

    let approved_count = settings
        .lock()
        .map(|s| s.approved_workspaces.len())
        .unwrap_or(0);

    let event_log_status = reader
        .lock()
        .map(|r| r.status())
        .map_err(|_| "Event log reader lock poisoned".to_string())?;

    let leak_analysis = profiler
        .lock()
        .map(|p| p.analyze())
        .unwrap_or_else(|_| LeakAnalysis::default());

    let timings = perf.snapshot();
    let export_dir = paths::ensure_app_data_dir()?;

    create_diagnostic_bundle(
        &health_snapshot,
        approved_count,
        event_log_status,
        leak_analysis,
        timings,
        &export_dir,
    )
}

fn setup_system_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Show STXIC Halo", true, None::<&str>)?;
    let toggle_item =
        MenuItem::with_id(app, "toggle", "Expand / Collapse Capsule", true, None::<&str>)?;
    let reset_item =
        MenuItem::with_id(app, "reset_pos", "Reset Position to Primary Display", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit STXIC Halo", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show_item, &toggle_item, &reset_item, &separator, &quit_item],
    )?;

    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("STXIC Halo — Local Agent & System Companion")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                show_and_focus_main(app);
            }
            "toggle" => {
                show_and_focus_main(app);
                let _ = app.emit("halo://toggle-expand", ());
            }
            "reset_pos" => {
                if let Some(state) = app.try_state::<Mutex<UserSettings>>() {
                    if let Ok(mut guard) = state.lock() {
                        guard.target_monitor_index = 0;
                        guard.horizontal_offset_px = 0;
                        guard.top_inset_px = 0;
                        let _ = guard.save_to_disk();
                    }
                }
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = apply_island_bounds(&window, false, 0, 0, 0);
                }
                let _ = app.emit("halo://position-reset", ());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                show_and_focus_main(app);
                let _ = app.emit("halo://toggle-expand", ());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    let _ = tray_builder.build(app)?;
    Ok(())
}

pub fn run() {
    let (initial_settings, settings_health) = UserSettings::load_with_health();
    let event_reader = Arc::new(Mutex::new(EventLogReader::new()));
    let event_reader_watcher = event_reader.clone();
    let perf = Arc::new(PerfRegistry::default());
    let perf_watcher = perf.clone();

    tauri::Builder::default()
        // Must be registered first: a second launch (e.g. Start menu click while Halo is
        // already running from login) focuses the existing capsule instead of stacking
        // a duplicate always-on-top window and duplicate watchers.
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_and_focus_main(app);
            let _ = app.emit("halo://second-instance", ());
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))
        .manage(Mutex::new(TelemetryCollector::new()))
        .manage(event_reader)
        .manage(Mutex::new(initial_settings.clone()))
        .manage(Mutex::new(settings_health))
        .manage(perf)
        .manage(Mutex::new(IdleProfiler::default()))
        .setup(move |app| {
            // Best-effort system tray registration so borderless skipTaskbar window is always recoverable.
            let _ = setup_system_tray(app);

            // Active background file watcher (pushes halo://events-updated on modifications)
            EventLogWatcher::start(
                app.handle().clone(),
                event_reader_watcher,
                perf_watcher,
                std::time::Duration::from_millis(250),
            );

            if let Some(window) = app.get_webview_window("main") {
                let _ = apply_island_bounds(
                    &window,
                    false,
                    initial_settings.target_monitor_index,
                    initial_settings.horizontal_offset_px,
                    initial_settings.top_inset_px,
                );
                show_and_focus_main(app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_metrics,
            permissions::list_permission_requests,
            permissions::respond_to_permission,
            read_agent_events,
            clear_agent_events,
            read_process_lifecycle,
            load_settings,
            save_settings,
            list_monitors,
            sync_island_bounds,
            get_launch_at_login,
            set_launch_at_login,
            read_integration_status,
            read_performance_stats,
            read_idle_profile,
            export_diagnostic_bundle,
            proof_of_work::verify_proof_of_work,
            proof_of_work::approve_workspace,
            proof_of_work::revoke_workspace,
            codex::read_codex_events,
            codex::read_codex_telemetry,
            claude_manager::check_claude_hook_status,
            claude_manager::enable_claude_hook,
            claude_manager::disable_claude_hook,
            providers::provider_connections,
            providers::set_provider_connection,
            usage::read_usage_reports,
            usage::prepare_claude_statusline,
            retention::preview_halo_retention,
            retention::clean_halo_retention,
        ])
        .run(tauri::generate_context!())
        .expect("Could not launch STXIC Halo");
}
