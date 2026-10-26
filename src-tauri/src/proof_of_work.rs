use crate::config::UserSettings;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitFileChange {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GitStatusSummary {
    pub branch: Option<String>,
    pub clean: bool,
    pub total_changed: usize,
    pub staged_count: usize,
    pub modified_count: usize,
    pub untracked_count: usize,
    pub files: Vec<GitFileChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TestRunSummary {
    pub runner: String,
    pub passed: usize,
    pub failed: usize,
    pub total: usize,
    pub duration_ms: Option<u64>,
    pub summary_line: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProofSummary {
    pub changed_files: Option<usize>,
    pub tests_passed: Option<usize>,
    pub tests_failed: Option<usize>,
    pub verified: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git: Option<GitStatusSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub test_summary: Option<TestRunSummary>,
    pub provenance: String,
    pub evidence_timestamp: u64,
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
        .filter(|l| !l.is_empty() && !l.starts_with("##"))
        .count()
}

pub fn parse_git_status_porcelain_summary(output: &str) -> GitStatusSummary {
    let mut branch = None;
    let mut files = Vec::new();
    let mut staged_count = 0;
    let mut modified_count = 0;
    let mut untracked_count = 0;

    for line in output.lines() {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            continue;
        }

        if trimmed.starts_with("## ") {
            let b = trimmed[3..].trim();
            let branch_name = if let Some(idx) = b.find("...") {
                &b[..idx]
            } else if let Some(idx) = b.find(' ') {
                &b[..idx]
            } else {
                b
            };
            branch = Some(branch_name.to_string());
            continue;
        }

        if trimmed.len() < 3 {
            continue;
        }

        let x = trimmed.chars().next().unwrap_or(' ');
        let y = trimmed.chars().nth(1).unwrap_or(' ');
        let path = trimmed[3..].trim().trim_matches('"').to_string();

        let is_untracked = x == '?' && y == '?';
        let is_staged = x != ' ' && x != '?';
        let is_unstaged = y != ' ' && y != '?';

        let status_desc = if is_untracked {
            untracked_count += 1;
            "untracked".to_string()
        } else {
            if is_staged {
                staged_count += 1;
            }
            if is_unstaged {
                modified_count += 1;
            }
            match (is_staged, is_unstaged) {
                (true, true) => "staged+modified".to_string(),
                (true, false) => format!("staged ({x})"),
                (false, true) => format!("modified ({y})"),
                (false, false) => "unchanged".to_string(),
            }
        };

        files.push(GitFileChange {
            path,
            status: status_desc,
            staged: is_staged,
        });
    }

    let total_changed = files.len();
    let clean = total_changed == 0;

    GitStatusSummary {
        branch,
        clean,
        total_changed,
        staged_count,
        modified_count,
        untracked_count,
        files,
    }
}

pub fn inspect_git_status(workspace_dir: &Path) -> Result<GitStatusSummary, String> {
    let output = Command::new("git")
        .arg("status")
        .arg("--porcelain=v1")
        .arg("-b")
        .current_dir(workspace_dir)
        .output()
        .map_err(|e| format!("Failed to execute git status: {e}"))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git status failed: {}", err.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_git_status_porcelain_summary(&stdout))
}

pub fn count_git_changed_files(workspace_dir: &Path) -> Result<usize, String> {
    inspect_git_status(workspace_dir).map(|s| s.total_changed)
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

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::NpmTest => "npm test",
            Self::CargoTest => "cargo test",
            Self::PnpmTest => "pnpm test",
            Self::YarnTest => "yarn test",
            Self::VitestRun => "vitest run",
            Self::Pytest => "pytest",
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

fn extract_number_before(text: &str, marker: &str) -> Option<usize> {
    if let Some(idx) = text.find(marker) {
        let prefix = text[..idx].trim_end();
        let digits: String = prefix
            .chars()
            .rev()
            .skip_while(|c| !c.is_ascii_digit())
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if !digits.is_empty() {
            let num_str: String = digits.chars().rev().collect();
            return num_str.parse::<usize>().ok();
        }
    }
    None
}

pub fn parse_test_runner_output(
    runner_profile: &str,
    stdout: &str,
    stderr: &str,
    success: bool,
    duration_ms: u64,
) -> TestRunSummary {
    let combined = format!("{stdout}\n{stderr}");
    let mut passed = 0;
    let mut failed = 0;
    let mut parsed = false;
    let mut summary_line = None;

    for line in combined.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // vitest / jest output: "Tests  42 passed (42)" or "Tests: 42 passed, 42 total"
        if trimmed.contains("Tests") && (trimmed.contains("passed") || trimmed.contains("failed")) {
            if let Some(p) = extract_number_before(trimmed, "passed") {
                passed = p;
                parsed = true;
            }
            if let Some(f) = extract_number_before(trimmed, "failed") {
                failed = f;
                parsed = true;
            }
            summary_line = Some(trimmed.to_string());
            break;
        }

        // cargo test output: "test result: ok. 23 passed; 0 failed; 0 ignored; ..."
        if trimmed.starts_with("test result:") {
            if let Some(p) = extract_number_before(trimmed, "passed") {
                passed = p;
                parsed = true;
            }
            if let Some(f) = extract_number_before(trimmed, "failed") {
                failed = f;
                parsed = true;
            }
            summary_line = Some(trimmed.to_string());
            break;
        }

        // pytest output: "=== 10 passed, 2 failed in 0.5s ==="
        if (trimmed.starts_with('=') || trimmed.starts_with("---"))
            && (trimmed.contains("passed") || trimmed.contains("failed"))
        {
            if let Some(p) = extract_number_before(trimmed, "passed") {
                passed = p;
                parsed = true;
            }
            if let Some(f) = extract_number_before(trimmed, "failed") {
                failed = f;
                parsed = true;
            }
            summary_line = Some(trimmed.to_string());
            break;
        }
    }

    if !parsed {
        if success {
            passed = 1;
            failed = 0;
            summary_line = Some("Test suite passed with zero errors".to_string());
        } else {
            passed = 0;
            failed = 1;
            summary_line = Some("Test runner reported failure (non-zero exit)".to_string());
        }
    }

    let total = passed + failed;

    TestRunSummary {
        runner: runner_profile.to_string(),
        passed,
        failed,
        total,
        duration_ms: Some(duration_ms),
        summary_line,
    }
}

pub fn run_allowlisted_test(
    workspace_dir: &Path,
    profile: AllowlistedTestProfile,
) -> Result<TestRunSummary, String> {
    let (prog, args) = profile.command_and_args();
    let start = Instant::now();
    let output = Command::new(prog)
        .args(args)
        .current_dir(workspace_dir)
        .output()
        .map_err(|e| format!("Failed to spawn test runner '{prog}': {e}"))?;

    let duration_ms = start.elapsed().as_millis() as u64;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let success = output.status.success();

    let summary = parse_test_runner_output(profile.as_str(), &stdout, &stderr, success, duration_ms);
    Ok(summary)
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
            "Workspace path '{workspace_path}' does not exist or is not a directory"
        ));
    }

    if !is_workspace_approved(workspace_path, approved_workspaces) {
        return Err(format!(
            "Workspace '{workspace_path}' has not been approved by the user for Proof-of-Work inspection."
        ));
    }

    let canonical_dir = normalize_canonical_path(path)
        .ok_or_else(|| format!("Cannot canonicalize path '{workspace_path}'"))?;

    let git_summary = match inspect_git_status(&canonical_dir) {
        Ok(summary) => Some(summary),
        Err(err) => {
            eprintln!("Proof-of-work git warning: {err}");
            None
        }
    };

    let changed_files = git_summary.as_ref().map(|g| g.total_changed);

    let mut tests_passed = None;
    let mut tests_failed = None;
    let mut test_summary = None;
    let mut verified = false;

    if run_tests {
        let profile_str = test_profile.unwrap_or("npm test");
        let profile = AllowlistedTestProfile::from_str(profile_str).ok_or_else(|| {
            format!(
                "Test profile '{profile_str}' is not allowlisted. Allowed profiles: 'npm test', 'cargo test', 'pnpm test', 'yarn test', 'vitest run', 'pytest'"
            )
        })?;

        let test_res = run_allowlisted_test(&canonical_dir, profile)?;
        tests_passed = Some(test_res.passed);
        tests_failed = Some(test_res.failed);
        verified = test_res.failed == 0 && test_res.passed > 0;
        test_summary = Some(test_res);
    }

    let evidence_timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let provenance = if run_tests {
        format!(
            "Local git inspect + test runner: {} (workspace: {})",
            test_profile.unwrap_or("npm test"),
            canonical_dir.display()
        )
    } else {
        format!(
            "Local git status --porcelain (workspace: {})",
            canonical_dir.display()
        )
    };

    Ok(ProofSummary {
        changed_files,
        tests_passed,
        tests_failed,
        verified,
        git: git_summary,
        test_summary,
        provenance,
        evidence_timestamp,
    })
}

/// Async + `spawn_blocking`: git/test runs can take time and must never block the
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
    fn test_parse_git_status_summary() {
        let sample = "## main...origin/main [ahead 1]\n M src/App.tsx\nM  src-tauri/src/lib.rs\n?? new_file.ts\n";
        let summary = parse_git_status_porcelain_summary(sample);
        assert_eq!(summary.branch.as_deref(), Some("main"));
        assert_eq!(summary.total_changed, 3);
        assert_eq!(summary.staged_count, 1);
        assert_eq!(summary.modified_count, 1);
        assert_eq!(summary.untracked_count, 1);
        assert!(!summary.clean);
        assert_eq!(summary.files.len(), 3);
        assert_eq!(summary.files[0].path, "src/App.tsx");
        assert!(!summary.files[0].staged);
        assert_eq!(summary.files[1].path, "src-tauri/src/lib.rs");
        assert!(summary.files[1].staged);
    }

    #[test]
    fn test_parse_test_runner_output() {
        let sample_vitest = " RUN  v2.1.9\n\n Tests  42 passed (42)\n Duration  2.88s\n";
        let res = parse_test_runner_output("vitest run", sample_vitest, "", true, 2880);
        assert_eq!(res.passed, 42);
        assert_eq!(res.failed, 0);
        assert_eq!(res.total, 42);
        assert_eq!(res.duration_ms, Some(2880));

        let sample_cargo = "test result: ok. 23 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.41s";
        let res_cargo = parse_test_runner_output("cargo test", sample_cargo, "", true, 410);
        assert_eq!(res_cargo.passed, 23);
        assert_eq!(res_cargo.failed, 0);
        assert_eq!(res_cargo.total, 23);
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
