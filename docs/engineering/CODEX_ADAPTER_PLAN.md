# Codex Adapter — Future Implementation Plan

**No Codex reader is included in v0.1.** Preview cards are simulated and clearly labelled.

## Candidate sources
1. **Codex app-server protocol**: official documented interface for managed client sessions, streamed events and usage notifications. Starting a new app-server does **not** imply visibility into arbitrary already-running Codex processes. Reference: https://learn.chatgpt.com/docs/app-server .
2. **Local CLI JSONL session files**: version-sensitive local state under `CODEX_HOME` (often `~/.codex`). Community adapters support it but the format is subject to change. Reference: https://github.com/ccusage/ccusage/blob/main/docs/guide/codex/index.md .

## Decision sequence
- Prefer a documented supported data plane that applies to the user's actual Codex entry point.
- Ask for consent before reading `CODEX_HOME`. Never read `auth.json`, API keys, prompt transcripts, or message content if all that is needed is live state/usage.
- Parse an allowlist of event shapes in an isolated adapter with fixtures from several Codex releases.
- Distinguish `token_count` updates, plan/quota windows and context percentages; do not combine them.
- Observe performance and log rotation behavior.
- If session provenance is uncertain, state **Unknown** and make it easy to disconnect.

## Definition of done
Two simultaneous Codex sessions report separate IDs; stale readings are marked, session closure is handled, no credential or prompt content is retained, every exposed metric declares provenance, version checks and integration rollback are tested.
