# Halo feature plan

## Implementation checkpoint — 2026-10-28

- Claude quota: a manually configured status-line capture is available in Settings. It prepares a Halo-owned script and does not modify existing Claude configuration. Real Claude Code compatibility remains to be tested.
- Data: Settings describes local sources and offers an explicit preview and cleanup of aged Halo-generated session snapshots and the rotated activity backup. It does not provide automatic retention or delete provider-owned data.
- Activity: provider and event filters persist locally and can be cleared.
- Notifications: optional per-provider desktop alerts with fixed quiet hours, deduplication by reset window, and fresh quota requirements are implemented. Real Windows delivery and packaged Store behavior remain to be tested.
- Codex: version `0.164.0-alpha.11.1` was observed on the development machine. App-server authentication remains unimplemented because the owner intends to distribute to friends and potentially the Microsoft Store; distribution and authentication eligibility must be confirmed with OpenAI first. Listing in a store does not establish provider permission.
- Interface: overview and settings styling refined; browser preview checked. Native window and accessibility verification remain outstanding.

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
