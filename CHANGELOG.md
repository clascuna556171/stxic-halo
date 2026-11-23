# Changelog

## 0.1.0 — Pre-Release (2026-11-23)

### Release & Desktop Hardening
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
