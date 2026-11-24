# Halo feature plan

## Implementation checkpoint — 2026-11-24

- **One-click Claude Code CLI `statusLine`:** Safely checks `%USERPROFILE%\.claude\settings.json`, saves a `.halo-statusline-bak` backup, and installs or removes Halo's local `claude-statusline.ps1` script in one click when unset. Never overwrites an existing custom `statusLine` (falls back to manual JSON).
- **One-click Antigravity CLI (`agy`) `statusLine`:** Uses `agy`'s documented `statusLine` in `%USERPROFILE%\.gemini\antigravity-cli\settings.json` with `"stack_with_default": true` (preserving `agy`'s built-in status bar), automatic backup, and custom-config protection. Captures `quota` (`remaining_fraction`, `reset_time`/`reset_in_seconds`), `context_window` tokens, and `cost.total_usd` into `%LOCALAPPDATA%\STXICHalo\usage\antigravity-statusline\*.json` with zero credentials and zero network calls.
- **Persistent pill rings & multi-provider hover preview:** Retains recently completed sessions (within 1 hour) and token/context-reporting providers in the notch pill after `Stop`/`SessionEnd`, displays top providers side-by-side in hover preview when 2+ providers have usage, and clarifies in Settings & Overview that live `%` quota rings come from interactive CLI sessions (`claude` / `agy` via one-click status line, or `codex` automatically) while Desktop/IDE sessions report tokens only.
- **Auto-hide peek bar & MSIX Store packaging:** Adds `auto_hide_on_maximized` (120×5 top-edge peek bar over maximized windows with urgent-alert override) and local Windows SDK MSIX packaging (`scripts/package-msix.ps1`).
- **Data, Activity & Notifications:** Settings describes local sources and offers explicit preview/cleanup (including Halo's local status-line directories) without deleting provider-owned data. Activity filters persist locally, and optional per-provider desktop alerts respect quiet hours, reset-window deduplication, and fresh-quota checks.
- **Codex note:** App-server authentication remains unimplemented; distribution and authentication eligibility must be confirmed with OpenAI before enabling any authenticated Codex integration.
- **Interface & verification:** Frontend (`vitest`, `tsc`, `vite build`), Rust (`cargo test`), PowerShell smoke tests, and native Windows MSIX/NSIS packaging have been verified locally.

This plan prioritizes useful, transparent monitoring using documented integrations. Availability and provider terms must be rechecked before each integration ships. Halo must not reuse provider OAuth credentials, impersonate clients, scrape undocumented endpoints, or bypass limits.

## 1. Claude Code quota through its documented status line

**Goal:** Show Claude's reported five-hour and seven-day allowance without Halo making authenticated requests.

- Build an opt-in local status-line integration using the fields Claude supplies to a user-configured status command. Treat missing fields, expired windows, and unsupported versions as unavailable.
- Detect an existing user status line before setup. Never silently replace it; provide an explicit, reversible setup path that preserves and restores existing behavior, or offer manual integration when safe composition cannot be guaranteed.
- Save only the minimum quota metadata needed for Halo, use bounded files and atomic writes, and label the timestamp and source. Do not read credentials or send data to a server.
- Validate with fixture tests, concurrent sessions, existing custom status lines, disable/restore, missing fields, stale readings, and a real supported Claude Code session.
- Success: an opted-in user can see fresh values and safely revert the integration; a missing or stale value is never shown as current.

Reference: https://code.claude.com/docs/en/statusline

## 2. Provider data controls and transparency

**Goal:** Make every source and its effect understandable before it is enabled.

- Show each source, whether it is enabled, the data it accesses, last observed time, and whether it uses network access. Separate hooks, local session files, and local exports.
- Add a user-controlled retention policy for Halo-created event and usage files, with a preview and a narrowly scoped cleanup action. Never delete provider-owned logs.
- Verify settings survive restart, disabling stops the relevant reader, and clearing Halo data does not touch provider configuration or unrelated files.
- Success: users can disable each optional source and understand where historical data came from.

## 3. Codex supported integration feasibility

**Goal:** Assess a documented account/usage source before replacing the current local log adapter.

- Verify the installed Codex version, account mode, network behavior, supported event coverage, data minimization, and authentication conditions in the current official app-server and Sign in with ChatGPT documentation.
- Confirm Halo's intended distribution fits the applicable integration terms. The published app-server documentation restricts authentication for commercial or hosted services; do not assume eligibility.
- Prototype only after those checks. Do not reuse raw credentials, consume reset credits, or send emails. Keep local-log controls independent and preserve existing user choices.
- Test disconnected, signed-out, expired, stale, version-incompatible, rate-limited, and restart cases; display unavailable instead of inventing values.
- Success: a documented, permitted path is identified and tested, or the feature remains unavailable with a clear reason.

References: https://developers.openai.com/codex/app-server/ and https://openai.com/policies/terms-of-use/

## 4. Activity and notification polish

- Add saved provider/event filters and an accessible clear-filters action.
- Add optional desktop notifications only after reliable source data exists, with per-provider controls, deduplication, quiet hours, and a clear distinction between fresh and stale quota data.
- Verify keyboard navigation, notification permissions, restart behavior, and repeated or resetting quota windows.
- Success: important events are easy to find without repetitive alerts.
