use std::{env, fs, path::PathBuf};

const APP_DATA_FOLDER: &str = "STXICHalo";
const EVENT_LOG_FILENAME: &str = "events.jsonl";
const EVENT_LOG_BACKUP_FILENAME: &str = "events.jsonl.bak";
const SETTINGS_FILENAME: &str = "settings.json";
const SETTINGS_BACKUP_FILENAME: &str = "settings.json.bak";

/// Resolves the local application data directory (`%LOCALAPPDATA%\STXICHalo` on Windows).
/// Never uses roaming profiles or network shares.
pub fn app_data_dir() -> Result<PathBuf, String> {
    let root = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| {
            env::var_os("USERPROFILE")
                .map(|profile| PathBuf::from(profile).join("AppData").join("Local"))
        })
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
        .ok_or_else(|| "Could not determine the local app data directory".to_string())?;

    Ok(root.join(APP_DATA_FOLDER))
}

/// Ensures the `%LOCALAPPDATA%\STXICHalo` directory exists before writing local files.
pub fn ensure_app_data_dir() -> Result<PathBuf, String> {
    let dir = app_data_dir()?;
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|_| "Could not create the STXIC Halo local data directory".to_string())?;
    }
    Ok(dir)
}

pub fn event_log_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join(EVENT_LOG_FILENAME))
}

pub fn event_log_backup_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join(EVENT_LOG_BACKUP_FILENAME))
}

pub fn settings_file_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join(SETTINGS_FILENAME))
}

/// Last-known-good copy written before each settings save (`settings.json.bak`).
pub fn settings_backup_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join(SETTINGS_BACKUP_FILENAME))
}
