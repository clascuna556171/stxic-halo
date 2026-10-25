# Claude Code Hook Integration — Opt-In Setup

**Prototype status:** first-pass, read-only lifecycle metadata; tested logic still needs verification with the installed Claude Code version on Windows. Never auto-replace a user's existing Claude settings.

## What it collects
`session_id`, `hook_event_name`, current working directory and tool name. It does **not** save prompts, output, source code, model credentials, token counts, context window percentages or tool arguments.

## Prerequisites
Windows PowerShell 5.1 or later, Claude Code CLI with lifecycle hooks and the STXIC Halo project folder at a fixed absolute path. Review official Anthropic documentation first: https://code.claude.com/docs/en/hooks and https://code.claude.com/docs/en/statusline .

## Safe manual installation
1. Open `%USERPROFILE%\.claude\settings.json` if it exists. Back it up to a timestamped file outside this ZIP.
2. Open `scripts/claude-hooks.example.json` from the ZIP.
3. Replace each `C:\\ABSOLUTE\\PATH\\stxic-halo\\scripts\\claude-hook.ps1` with the real absolute PowerShell path, preserving JSON backslash escaping.
4. **Merge** each event's new hook entry into the existing `hooks.<Event>` array. Do not replace existing hooks, authorization rules, status line, permissions, or extensions.
5. Save valid JSON and restart the Claude session. Use the Claude Code hooks diagnostic commands documented by Anthropic as appropriate for your installed version.
6. Turn Preview mode OFF in STXIC Halo Settings; new events will be read from local app data.

This example is deliberately a manual opt-in. Automated configuration backup/restore is a future feature.

## Test event directly (PowerShell)
The command below sends a deliberately fake, non-sensitive event; it does not communicate with Claude or edit its settings:

```powershell
'{"session_id":"halo-test","hook_event_name":"SessionStart","cwd":"C:\\Demo","tool_name":""}' | powershell.exe -NoProfile -NonInteractive -File ".\scripts\claude-hook.ps1"
Get-Content "$env:LOCALAPPDATA\STXICHalo\events.jsonl" -Tail 1
```

If Windows policy restricts scripts, follow your administrator's policy; do not lower organization-wide execution policies to install Halo. The example settings use process-scoped `-ExecutionPolicy Bypass`, which may be disallowed and must not be treated as security permission.

## Uninstall / disconnect
Remove **only** the hook entries pointing to `claude-hook.ps1` from your Claude `settings.json` and restore other entries exactly. Restart Claude Code. Delete `%LOCALAPPDATA%\STXICHalo\events.jsonl` if desired. The app does not modify CLI settings automatically.

## Data limitations
Lifecycle hooks do not automatically provide full context usage or token counters. A future separate status-line adapter may provide some values; preserve any existing user's statusline, and do not interfere with provider UI. Subscriptions/quotas require a distinct authorized source. If unsupported, display "Unavailable".

## Troubleshooting
- No sessions: verify absolute script path, actual Claude hook shape, configured event and restart.
- Log missing: verify PowerShell can run script, check `$env:LOCALAPPDATA`, test using fake event.
- Missing permissions: do not run as admin by default; use your local user's app data path.
- Stale session states: hook-only view has limited lifecycle data and can miss status transitions; this is expected in the starter.
- JSON setting parse errors: restore backup then merge entries with a JSON-aware editor.
