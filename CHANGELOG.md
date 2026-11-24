# Changelog

## 0.1.0 — Pre-Release (2026-11-24)

### CLI Status Lines & Persistent Usage Rings
- Add one-click Claude Code CLI `statusLine` Enable/Disable (`src-tauri/src/usage.rs`, `ClaudeStatuslineSetup.tsx`): checks `%USERPROFILE%\.claude\settings.json`, backs up to `.halo-statusline-bak`, installs/removes `claude-statusline.ps1` cleanly, and refuses to overwrite existing custom `statusLine` commands.
- Add one-click Antigravity CLI (`agy`) `statusLine` Enable/Disable (`scripts/antigravity-statusline.ps1`, `AntigravityStatuslineSetup.tsx`, `retention.rs`): configures `%USERPROFILE%\.gemini\antigravity-cli\settings.json` with `"stack_with_default": true`, automatic backup, and custom-config protection, capturing local-only `quota`, `context_window` tokens, and `cost.total_usd` under `%LOCALAPPDATA%\STXICHalo\usage\antigravity-statusline\*.json` (covered by local retention cleanup).
- Retain recently completed sessions (within 1 hour) and token/context providers in the notch pill (`PillUsageRings.tsx`, `App.tsx`), show top multiple providers in hover preview when 2+ providers have usage, and clarify in Settings & Overview that live `%` quota rings come from interactive CLI sessions (`claude` / `agy` / `codex`) while Desktop/IDE sessions report tokens only.

### Auto-Hide Peek Bar & Microsoft Store Packaging
- Add `auto_hide_on_maximized` (settings schema v4) with Win32 maximized/fullscreen foreground detection and a `120×5` top-edge peek strip that reveals on hover/`Alt+H` and pops open automatically on urgent alerts (`Approval required` / `Test fail`).
- Add Microsoft Store MSIX packaging pipeline (`scripts/package-msix.ps1`, `src-tauri/msix/AppxManifest.template.xml`, `desktop:build:msix`) and updated privacy/release documentation.

### Release & Desktop Hardening (2026-11-23)
- Embed `manage-claude-hook.ps1` and `claude-hook.ps1` directly into the Rust binary and materialize them into `%LOCALAPPDATA%\STXICHalo\integrations\`, so standalone `.exe` and NSIS/MSI installs work outside the dev repository.
- Suppress console window flashes (`CREATE_NO_WINDOW`) when spawning PowerShell, Git, and allowlisted test runners from release GUI builds.
- Gate permission mailbox polling on active Claude Code hook installation so idle/non-Claude setups respect deep-sleep backoff without background disk writes.
- Position before resizing using target-monitor physical dimensions on mixed-DPI multi-monitor switches, and register `tauri-plugin-single-instance` first.
- Add updated brand favicon and Tauri desktop icons.

### Runtime Performance & UI
- Offload heavy disk/polling Tauri commands to `spawn_blocking` and cache Codex/usage file metadata for smoother UI and lower CPU usage.
- Add deep-sleep polling backoff when collapsed and idle, waking immediately on activity or expand.
- Add smooth hover preview morphing (`340×38` collapsed → `340×112` preview → `460×564` expanded) and cross-project Activity feed with glanceable usage cards.
- Add Claude status line setup, data retention controls, quota notifications, provider connection health, and activity filters.
- Add Windows CI workflow (`Halo CI`) running Vitest, TypeScript, Vite build, `cargo check`, and `cargo test`.

## Earlier Development Snapshots (2026-10-26 – 2026-10-27)

- Show all five providers directly in Overview without a dropdown, with specific explanations for missing readings.
- Read existing Copilot CLI usage checkpoints/shutdowns for cumulative token and premium-request totals without fabricating USD costs or subscription allowance.

- Add opt-in Antigravity and GitHub Copilot CLI hooks, and an OpenCode plugin, with Connect/Disconnect controls that preserve other hooks.
- Add provider usage alongside context: Codex logged quota/reset snapshots and session tokens, OpenCode session tokens/reported cost, and validated local exports for other metrics.
- Keep unknown values unavailable, flag stale reports, and wait for a fresh report after a quota reset rather than assuming replenishment.
- Test real PowerShell payload sanitization, plugin resume/deduplication, safe installation/removal, and usage rendering.

## Unreleased — 2026-10-26

- Organize Activity by workspace with a readable timeline and optional Files & tests checks; add a direct setup path to folder authorization.
- Use full workspace paths for checks, retain result snapshots through polling, and show errors beside the action.

- Start compact; hover for a small token preview and click for a persistent full dashboard, retaining keyboard access.
- Simplify Overview to current sessions and action requests; keep hardware telemetry in System and history in Activity.
- Calculate remaining context from the latest token sample instead of cumulative session usage.
- Add Claude permission review with complete tool input, single-request Approve/Deny responses, 45-second expiry, and offline fallback.
- Add mailbox and real PowerShell hook integration tests; document temporary tool-input storage and crash cleanup.
- Fix blank standalone releases by building with Tauri's embedded UI protocol; add `desktop:build:exe` and reject development-mode release binaries.

## 0.1.0 — Initial developer starter (2026-10-25)

- Brand: STXIC Halo name, logo direction, design tokens, brand collateral and positioning.
- React browser prototype and Tauri 2/Rust Windows desktop scaffold.
- Demo agent flows, local CPU/RAM/process metrics command and Claude Code sanitized hook bridge.
- Product, security, Microsoft Store and engineering planning documents.
