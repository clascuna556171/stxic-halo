use crate::config::SettingsHealth;
use crate::events::EventLogStatus;
use crate::perf::TimingStat;
use crate::profiling::LeakAnalysis;
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, path::Path};

/// Sanitized diagnostic support bundle (HALO-011).
/// Contains zero customer code, transcripts, secrets, or prompt texts.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DiagnosticBundleExport {
    pub exported_at_unix_secs: u64,
    pub app_version: String,
    pub os_family: String,
    pub os_arch: String,
    pub halo_pid: u32,
    pub settings_source: String,
    pub settings_schema: u32,
    pub approved_workspace_count: usize,
    pub event_log_status: EventLogStatus,
    pub leak_analysis: LeakAnalysis,
    pub timings: BTreeMap<String, TimingStat>,
    pub saved_to_file: String,
}

pub fn create_diagnostic_bundle(
    settings_health: &SettingsHealth,
    approved_workspace_count: usize,
    event_log_status: EventLogStatus,
    leak_analysis: LeakAnalysis,
    timings: BTreeMap<String, TimingStat>,
    export_dir: &Path,
) -> Result<DiagnosticBundleExport, String> {
    if !export_dir.exists() {
        fs::create_dir_all(export_dir)
            .map_err(|e| format!("Could not create export directory: {e}"))?;
    }

    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default();

    let export_filename = format!("support-bundle-{now_secs}.json");
    let export_path = export_dir.join(&export_filename);

    let export = DiagnosticBundleExport {
        exported_at_unix_secs: now_secs,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os_family: std::env::consts::FAMILY.to_string(),
        os_arch: std::env::consts::ARCH.to_string(),
        halo_pid: std::process::id(),
        settings_source: format!("{:?}", settings_health.source),
        settings_schema: settings_health.schema_version,
        approved_workspace_count,
        event_log_status,
        leak_analysis,
        timings,
        saved_to_file: export_path.to_string_lossy().to_string(),
    };

    let json_bytes = serde_json::to_vec_pretty(&export)
        .map_err(|e| format!("Could not serialize diagnostic bundle: {e}"))?;
    fs::write(&export_path, json_bytes)
        .map_err(|e| format!("Could not write diagnostic bundle file: {e}"))?;

    Ok(export)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::SettingsSource;

    #[test]
    fn test_create_diagnostic_bundle() {
        let temp_dir = std::env::temp_dir().join(format!("stxic_diag_test_{}", std::process::id()));
        let _ = fs::create_dir_all(&temp_dir);

        let health = SettingsHealth {
            source: SettingsSource::Disk,
            path: "C:\\mock\\settings.json".to_string(),
            schema_version: 2,
            migrated_from: None,
            quarantined_path: None,
            warning: None,
            last_save_error: None,
        };

        let event_log_status = EventLogStatus {
            path: "C:\\mock\\events.jsonl".to_string(),
            exists: true,
            size_bytes: 1024,
            modified_ms: Some(123456789),
            buffered_events: 10,
            last_error: None,
        };

        let leak = LeakAnalysis::default();
        let mut timings = BTreeMap::new();
        timings.insert("test_op".to_string(), TimingStat::default());

        let result = create_diagnostic_bundle(
            &health,
            3,
            event_log_status,
            leak,
            timings,
            &temp_dir,
        );

        assert!(result.is_ok());
        let bundle = result.unwrap();
        assert_eq!(bundle.approved_workspace_count, 3);
        assert_eq!(bundle.settings_schema, 2);
        assert_eq!(bundle.app_version, "0.1.0");
        assert!(Path::new(&bundle.saved_to_file).exists());

        // Verify file is readable and valid JSON
        let content = fs::read_to_string(&bundle.saved_to_file).unwrap();
        let parsed: DiagnosticBundleExport = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed.approved_workspace_count, 3);
        assert_eq!(parsed.event_log_status.buffered_events, 10);

        let _ = fs::remove_file(&bundle.saved_to_file);
        let _ = fs::remove_dir(&temp_dir);
    }
}
