# Changelog

## Unreleased — 2026-10-27

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

**Not a public release.**
