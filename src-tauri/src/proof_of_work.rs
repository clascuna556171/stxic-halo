use crate::config::UserSettings;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProofSummary {
    pub changed_files: Option<usize>,
    pub tests_passed: Option<usize>,
    pub tests_failed: Option<usize>,
    pub verified: bool,
}

pub fn normalize_canonical_path(p: &Path) -> Option<PathBuf> {
    fs::canonicalize(p).ok()
}

pub fn is_workspace_approved(workspace_path: &str, approved_workspaces: &[String]) -> bool {
    let path = Path::new(workspace_path);
    let canonical = match normalize_canonical_path(path) {
        Some(p) => p,
        None => return false,
    };

    for approved in approved_workspaces {
        if let Some(approved_canonical) = normalize_canonical_path(Path::new(approved)) {
            if canonical == approved_canonical {
                return true;
            }
        }
    }
    false
}

pub fn parse_git_status_porcelain_lines(output: &str) -> usize {
    output
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .count()
}

pub fn count_git_changed_files(workspace_dir: &Path) -> Result<usize, String> {
    let output = Command::new("git")
        .arg("status")
        .arg("--porcelain")
        .current_dir(workspace_dir)
        .output()
        .map_err(|e| format!("Failed to execute git status: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git status failed: {}", err.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_git_status_porcelain_lines(&stdout))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AllowlistedTestProfile {
    NpmTest,
    CargoTest,
    PnpmTest,
    YarnTest,
    VitestRun,
    Pytest,
}

impl AllowlistedTestProfile {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim() {
            "npm test" => Some(Self::NpmTest),
            "cargo test" => Some(Self::CargoTest),
            "pnpm test" => Some(Self::PnpmTest),
            "yarn test" => Some(Self::YarnTest),
            "vitest run" => Some(Self::VitestRun),
            "pytest" => Some(Self::Pytest),
            _ => None,
        }
    }

    pub fn command_and_args(&self) -> (&'static str, &'static [&'static str]) {
        #[cfg(windows)]
        match self {
            Self::NpmTest => ("npm.cmd", &["test"]),
            Self::CargoTest => ("cargo.exe", &["test"]),
            Self::PnpmTest => ("pnpm.cmd", &["test"]),
            Self::YarnTest => ("yarn.cmd", &["test"]),
            Self::VitestRun => ("npx.cmd", &["vitest", "run"]),
            Self::Pytest => ("pytest.exe", &[]),
        }
        #[cfg(not(windows))]
        match self {
            Self::NpmTest => ("npm", &["test"]),
            Self::CargoTest => ("cargo", &["test"]),
            Self::PnpmTest => ("pnpm", &["test"]),
            Self::YarnTest => ("yarn", &["test"]),
            Self::VitestRun => ("npx", &["vitest", "run"]),
            Self::Pytest => ("pytest", &[]),
        }
    }
}

pub fn run_allowlisted_test(
    workspace_dir: &Path,
    profile: AllowlistedTestProfile,
) -> Result<(usize, usize, bool), String> {
    let (prog, args) = profile.command_and_args();
    let output = Command::new(prog)
        .args(args)
        .current_dir(workspace_dir)
        .output()
        .map_err(|e| format!("Failed to spawn test runner '{}': {}", prog, e))?;

    let success = output.status.success();
    if success {
        Ok((1, 0, true))
    } else {
        Ok((0, 1, false))
    }
}

pub fn verify_workspace_pow(
    workspace_path: &str,
    run_tests: bool,
    test_profile: Option<&str>,
    approved_workspaces: &[String],
) -> Result<ProofSummary, String> {
    let path = Path::new(workspace_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!(
            "Workspace path '{}' does not exist or is not a directory",
            workspace_path
        ));
    }

    if !is_workspace_approved(workspace_path, approved_workspaces) {
        return Err(format!(
            "Workspace '{}' has not been approved by the user for Proof-of-Work inspection.",
            workspace_path
        ));
    }

    let canonical_dir = normalize_canonical_path(path)
        .ok_or_else(|| format!("Cannot canonicalize path '{}'", workspace_path))?;

    let changed_files = match count_git_changed_files(&canonical_dir) {
        Ok(count) => Some(count),
        Err(err) => {
            eprintln!("Proof-of-work git warning: {}", err);
            None
        }
    };

    let mut tests_passed = None;
    let mut tests_failed = None;
    let mut verified = false;

    if run_tests {
        let profile_str = test_profile.unwrap_or("npm test");
        let profile = AllowlistedTestProfile::from_str(profile_str).ok_or_else(|| {
            format!(
                "Test profile '{}' is not allowlisted. Allowed profiles: 'npm test', 'cargo test', 'pnpm test', 'yarn test', 'vitest run', 'pytest'",
                profile_str
            )
        })?;

        let (passed, failed, ok) = run_allowlisted_test(&canonical_dir, profile)?;
        tests_passed = Some(passed);
        tests_failed = Some(failed);
        verified = ok;
    }

    Ok(ProofSummary {
        changed_files,
        tests_passed,
        tests_failed,
        verified,
    })
}

/// Async + `spawn_blocking`: git/test runs can take minutes and must never block the
/// Tauri main thread (which would freeze the floating window).
#[tauri::command]
pub async fn verify_proof_of_work(
    state: State<'_, Mutex<UserSettings>>,
    workspace_path: String,
    run_tests: bool,
    test_profile: Option<String>,
) -> Result<ProofSummary, String> {
    let approved = state
        .lock()
        .map_err(|_| "Settings lock poisoned".to_string())?
        .approved_workspaces
        .clone();

    tauri::async_runtime::spawn_blocking(move || {
        verify_workspace_pow(&workspace_path, run_tests, test_profile.as_deref(), &approved)
    })
    .await
    .map_err(|e| format!("Proof-of-Work worker failed: {e}"))?
}

#[tauri::command]
pub fn approve_workspace(
    state: State<'_, Mutex<UserSettings>>,
    workspace_path: String,
) -> Result<UserSettings, String> {
    let mut guard = state
        .lock()
        .map_err(|_| "Settings lock poisoned".to_string())?;

    let trimmed = workspace_path.trim().to_string();
    if !trimmed.is_empty() && !guard.approved_workspaces.contains(&trimmed) {
        guard.approved_workspaces.push(trimmed);
        *guard = guard.save_to_disk()?;
    }
    Ok(guard.clone())
}

#[tauri::command]
pub fn revoke_workspace(
    state: State<'_, Mutex<UserSettings>>,
    workspace_path: String,
) -> Result<UserSettings, String> {
    let mut guard = state
        .lock()
        .map_err(|_| "Settings lock poisoned".to_string())?;

    guard
        .approved_workspaces
        .retain(|w| w.trim() != workspace_path.trim());
    *guard = guard.save_to_disk()?;
    Ok(guard.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_git_status_porcelain_lines() {
        let sample = " M src/index.ts\n?? new_file.rs\nD  deleted.txt\n\n";
        assert_eq!(parse_git_status_porcelain_lines(sample), 3);
        assert_eq!(parse_git_status_porcelain_lines(""), 0);
        assert_eq!(parse_git_status_porcelain_lines("   \n\n"), 0);
    }

    #[test]
    fn test_allowlisted_profiles() {
        assert_eq!(
            AllowlistedTestProfile::from_str("npm test"),
            Some(AllowlistedTestProfile::NpmTest)
        );
        assert_eq!(
            AllowlistedTestProfile::from_str("cargo test"),
            Some(AllowlistedTestProfile::CargoTest)
        );
        assert_eq!(
            AllowlistedTestProfile::from_str("vitest run"),
            Some(AllowlistedTestProfile::VitestRun)
        );
        assert_eq!(AllowlistedTestProfile::from_str("malicious command"), None);
        assert_eq!(AllowlistedTestProfile::from_str("rm -rf /"), None);
    }

    #[test]
    fn test_workspace_approval_guard() {
        let approved = vec![".".to_string()];
        assert!(is_workspace_approved(".", &approved));
        assert!(!is_workspace_approved(
            "C:\\nonexistent_unapproved_workspace_path",
            &approved
        ));
    }
}
