# Security & Privacy Threat Model

**Security stance:** local-first and opt-in. A small floating monitoring tool still has access to potentially sensitive workspace names, agent lifecycle events and hardware telemetry. Minimize scope before expanding features.

## What v0.1 collects
When hook manually installed: Claude session ID, event name, tool name and working directory from the hook payload. Locally sampled CPU, RAM and process count. Demo data is synthetic. There is no backend, sign-in, remote analytics or telemetry upload in the app source.

## What it does not collect
The lifecycle log does not collect prompts, source file contents, code diffs, tool arguments, credential stores, browser activity, clipboard, screenshots, typed keys or network traffic. Permission review temporarily stores tool arguments locally; these may contain source code or secrets present in the requested command. The hook removes them after a response, 45-second timeout, or missing UI heartbeat. Crash leftovers are cleaned on the next mailbox poll. They are never included in the event log or diagnostic exports. Marketing website is static, and desktop CSS should not depend on third-party resources.

## Additional provider metadata and usage

Opt-in Antigravity and Copilot CLI hooks collect the same sanitized lifecycle fields.
The OpenCode plugin additionally writes session token counts and reported USD cost
from its session SDK; message parts and tool arguments are not persisted. Codex
rollouts provide numeric token and quota/reset snapshots. Copilot session-state
logs provide numeric cumulative usage from bounded, cached local tails; messages
and tool arguments are never forwarded to the UI. Fixed-path local usage exports
are limited to 64 KiB, 16 sessions and 8 quota windows, with provider and
numeric validation. Missing data remains unavailable. None of these integrations
introduces outbound requests or reads credential stores. See
[provider integrations](PROVIDER_INTEGRATIONS.md) for availability and retention.

## Threats and controls
1. **Sensitive paths and project names:** treat cwd as private; don't send on network; redact in support bundles.
2. **Malicious JSONL input:** parse a strict schema; bound bytes/record counts, escape all UI text by React rendering; don't interpret strings as HTML.
3. **Path traversal:** read only fixed local event location; workspace monitoring restricted to explicit user-approved canonical paths via `normalize_canonical_path` and `is_workspace_approved`; relative traversal escapes (`..`) are strictly rejected.
4. **Arbitrary command execution:** no execute-from-agent-text feature. Test execution is strictly restricted to allowlisted profiles (`cargo test`, `npm test`, `vitest run`, `pytest`) without shell interpolation.
5. **Hook hijacking:** preserve other settings and hooks; require opt-in and support rollback. Permission outcomes change only after explicit Approve once/Deny actions. Random request IDs, expiry validation, fixed mailbox paths and exclusive response creation prevent request mixups, traversal and repeated decisions. The bridge trusts the local user account; it does not defend against malicious processes running as that account.
6. **Localhost API risks:** none in MVP. If future API added, bind loopback, authenticate messages, validate origin/CSRF and rate limits; do not trust localhost blindly.
7. **Dependency/supply chain:** pin after compatibility test, generate SBOM, audit libraries and signing secrets, review license obligations.
8. **Accessibility/focus denial:** tray escape route, shortcuts and overlay bounds tests to avoid obstructing Windows inputs.
9. **Log retention:** bounded event logs with 2 MiB automatic rotation (`MAX_LOG_FILE_BYTES`), in-memory bounded queue (`MAX_BOUNDED_EVENTS` = 250), and user-triggered event clearing (`clear_agent_events`).
10. **Resource leak prevention:** runtime idle profiler (`IdleProfiler`) tracks memory drift rate and flags warnings if sustained growth exceeds 512 KB/min over continuous background sessions.
11. **Privacy claims:** do not promise end-to-end secrecy if user later opts into remote connectors. Privacy copy must match actual behavior.

## Explicit permissions roadmap
- `system.read.basic` (local CPU/RAM, default)
- `claude.hooks.read.lifecycle` (manual opt-in)
- `codex.session.read.metadata` (future opt-in)
- `workspace.git.read` (future folder-scoped)
- `workspace.tests.execute` (future per-project explicit grant)
- `hardware.gpu.fps` (future opt-in/compatibility disclosure)

## Operational security before GA
Windows Defender scanning, signed binary, log redaction and retention, dependency audit, documented update authenticity, no credential material in diagnostics, privacy policy legal review, no hidden remote requests. Add vulnerability disclosure contact once publishing domain is owned.
