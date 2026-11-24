# STXIC Halo — Privacy Policy

**Effective / Last updated:** 2026-11-24  
**Publisher:** STXIC Labs (Individual Developer Account — Microsoft Partner Center Seller ID `97576040`)  
**Contact:** `christianlascuna098@gmail.com`

STXIC Halo ("Halo") is a local-first Windows desktop companion for monitoring AI coding agent sessions, verification evidence, and system telemetry. All monitoring, parsing, and storage happen strictly on your Windows device.

## 1. Information processed locally on your device
Depending on the features you enable, Halo reads or writes the following local data:

- **System & process telemetry:** Local CPU utilization, memory usage, process count, and running AI-agent process names/command-line indicators (to reconcile active sessions with live processes).
- **Optional AI provider hooks & local session logs:**
  - **Claude Code** (when you click Connect / Enable): Halo installs a local hook script and/or one-click CLI `statusLine` (`claude-statusline.ps1`) in `%USERPROFILE%\.claude\settings.json` (saving backups such as `.halo-statusline-bak` before changes and never overwriting an existing custom `statusLine`) and may read `%USERPROFILE%\.claude\projects\` or status-line quota metadata.
  - **Claude Code permission requests (temporary mailbox):** When Claude Code hooks are active and an action requires approval, Halo temporarily writes `PermissionRequest` metadata—including `session_id`, `cwd`, `tool_name`, and `tool_input` (capped at 16 KiB, which may contain command arguments or file paths)—to `%LOCALAPPDATA%\STXICHalo\permissions\*.request.json`. Files expire after 45 seconds and are cleaned up automatically once resolved or expired.
  - **Codex CLI** (enabled by default; toggleable in Settings): Reads local rollout logs and quota/token metadata from `%USERPROFILE%\.codex\sessions\`.
  - **Antigravity CLI (`agy`) & Desktop / GitHub Copilot CLI / OpenCode** (when enabled or connected by you): Reads local session/usage metadata under `%USERPROFILE%\.copilot\`, `%USERPROFILE%\.gemini\antigravity\brain\`, or OpenCode data directories, and writes provider hook/plugin configurations only when you explicitly connect them. For Antigravity CLI (`agy`), one-click `statusLine` setup configures `%USERPROFILE%\.gemini\antigravity-cli\settings.json` with `"stack_with_default": true` (saving an automatic backup and never overwriting an existing custom `statusLine`), writing only `quota` (`remaining_fraction`, `reset_time`/`reset_in_seconds`), `context_window` tokens, and `cost.total_usd` into `%LOCALAPPDATA%\STXICHalo\usage\antigravity-statusline\*.json` with zero credentials and zero network calls.
- **User-approved workspace Proof-of-Work:** Only for workspace directories you explicitly approve, Halo runs local `git status` and allowlisted test commands (`npm test`, `cargo test`, `pnpm test`, `yarn test`, `vitest run`, `pytest`) to display diff summaries and pass/fail counts.
- **Foreground window state:** When "Auto-hide on maximized windows" is enabled, Halo checks whether the active Windows foreground window is maximized and overlaps your selected monitor's top edge so Halo can tuck into a 5px peek bar without reading window contents or keystrokes.

## 2. What Halo does NOT collect or transmit
- Halo does **not** require an account, login, or subscription.
- Halo does **not** transmit telemetry, analytics, crash reports, prompts, source code, tokens, or `tool_input` over the internet. Its Content Security Policy (`default-src 'self'; connect-src ipc: http://ipc.localhost`) blocks remote network requests from the UI.
- Preview / Demo mode displays simulated data and does not read from your workspace or provider files.

## 3. Local storage, retention & user controls
- **App data directory:** Settings (`settings.json` + `settings.json.bak`), rotated hook event metadata (`events.jsonl` / `events.jsonl.bak`, capped at 2 MiB), local status-line snapshots (such as `usage\antigravity-statusline\*.json`), and embedded integration scripts are stored locally under `%LOCALAPPDATA%\STXICHalo\`.
- **Diagnostic bundles:** Clicking "Export Diagnostic Bundle" creates a local `support-bundle-*.json` file in `%LOCALAPPDATA%\STXICHalo\` containing settings health, timing stats, and approved workspace counts (no prompts, code, or credentials). Nothing is uploaded unless you manually share that file.
- **Your controls:** You can toggle Codex/Copilot log readers, enable or disable one-click Claude Code CLI and Antigravity CLI (`agy`) `statusLine` integrations (with backup restore), revoke approved workspaces, disconnect provider hooks, clear event logs, or run retention cleanup directly from Halo's Settings and Data Controls panels at any time.

## 4. Third-party tools
Halo interoperates locally with third-party AI coding tools (such as Claude Code, Codex, GitHub Copilot CLI, OpenCode, and Antigravity) installed on your machine. Those tools are governed by their respective providers' terms and privacy policies.

## 5. Contact & Privacy Requests
For support, questions, or privacy inquiries regarding STXIC Halo, contact **STXIC Labs** at **`christianlascuna098@gmail.com`**.

## 6. Policy updates
If future versions introduce any remote features, cloud sync, or optional telemetry, this Privacy Policy will be updated prior to release.
