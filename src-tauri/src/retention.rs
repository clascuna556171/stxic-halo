use serde::Serialize;
use std::{fs, path::{Path, PathBuf}, time::{Duration, SystemTime}};

#[derive(Serialize)]
pub struct RetentionPreview { pub files: usize, pub bytes: u64, pub errors: usize }

// Only Halo's rotated event backup and generated per-session usage snapshots.
fn candidates(root: &Path, days: u64) -> Result<Vec<PathBuf>, String> {
    if ![7, 30, 90].contains(&days) { return Err("Choose 7, 30, or 90 days".into()); }
    let cutoff = SystemTime::now().checked_sub(Duration::from_secs(days * 86400)).ok_or("Invalid retention period")?;
    let canonical_root = match root.canonicalize() { Ok(path) => path, Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]), Err(_) => return Err("Cannot inspect Halo data folder".into()) };
    let mut paths = vec![root.join("events.jsonl.bak")];
    for relative in ["usage/opencode-sessions", "usage/claude-statusline"] {
        let dir = root.join(relative);
        let Ok(meta) = fs::symlink_metadata(&dir) else { continue };
        if !meta.is_dir() || meta.file_type().is_symlink() || !dir.canonicalize().is_ok_and(|p| p.starts_with(&canonical_root)) { continue }
        for entry in fs::read_dir(dir).map_err(|_| "Cannot inspect Halo usage history")?.take(1024) {
            let entry = entry.map_err(|_| "Cannot inspect Halo usage history")?;
            if entry.path().extension().and_then(|e| e.to_str()) == Some("json") { paths.push(entry.path()); }
        }
    }
    Ok(paths.into_iter().filter(|path| fs::symlink_metadata(path).is_ok_and(|m| m.is_file() && !m.file_type().is_symlink() && m.modified().is_ok_and(|t| t < cutoff) && path.canonicalize().is_ok_and(|p| p.starts_with(&canonical_root)))).collect())
}
fn preview(root: &Path, days: u64, remove: bool) -> Result<RetentionPreview, String> {
    let paths = candidates(root, days)?;
    let mut report = RetentionPreview { files: 0, bytes: 0, errors: 0 };
    for path in paths {
        let Ok(meta) = fs::symlink_metadata(&path) else { report.errors += 1; continue };
        if !meta.is_file() || meta.file_type().is_symlink() { report.errors += 1; continue }
        if remove && fs::remove_file(&path).is_err() { report.errors += 1; continue }
        report.files += 1; report.bytes += meta.len();
    }
    Ok(report)
}
#[tauri::command]
pub fn preview_halo_retention(days: u64) -> Result<RetentionPreview, String> { preview(&crate::paths::app_data_dir()?, days, false) }
#[tauri::command]
pub fn clean_halo_retention(days: u64) -> Result<RetentionPreview, String> { preview(&crate::paths::app_data_dir()?, days, true) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retention_ignores_provider_and_unrelated_files() {
        let root = std::env::temp_dir().join(format!("halo-retention-{}", std::process::id()));
        fs::create_dir_all(root.join("usage/opencode-sessions")).unwrap();
        fs::write(root.join("usage/opencode-sessions/new.json"), "{}").unwrap();
        fs::write(root.join("unrelated.json"), "x").unwrap();
        assert_eq!(preview(&root, 7, true).unwrap().files, 0);
        assert!(root.join("unrelated.json").exists());
        assert!(preview(&root, 1, false).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
