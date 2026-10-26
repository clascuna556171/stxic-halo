# Claude Code Hook Integration — Opt-In Setup

**Current status:** lifecycle metadata plus explicit, single-request Approve/Deny responses. The PowerShell-to-Rust mailbox is integration tested; a live session with the installed Claude Code version still needs manual verification. Never auto-replace a user's existing Claude settings.

## What it collects
The lifecycle log contains `session_id`, `hook_event_name`, current working directory and tool name. It does **not** contain prompts, output, source code, model credentials, token counts, context window percentages or tool arguments.

Permission requests temporarily store the complete tool input (up to 16 KiB) in `%LOCALAPPDATA%\STXICHalo\permissions` so you can review the actual action. It may include commands or source code. Input is removed after a decision, timeout (45 seconds), or loss of Halo's heartbeat. After a crash, stale mailbox files are removed when Halo next polls. Mailbox contents are excluded from diagnostic exports. This is a same-user local bridge, not an isolation boundary against other programs running as your account.

The notch starts compact. Hover shows a 340 × 112 token preview that hides 350 ms after pointer exit; click opens the full dashboard and keeps it open. Enter/Space and existing keyboard shortcuts open the full dashboard. Context tokens use the latest reported context occupancy, never cumulative billing tokens. Missing provider data is shown as unavailable; inactive sessions show the age of the last report. A pending request changes the notch indicator and text without automatically expanding it. Approve once sends only an `allow` decision for that request; Deny sends `deny`. Neither creates a permanent permission rule. Offline Halo, oversized input, or expiry leaves Claude's normal permission flow in control. Claude's own hook timeout may shorten the available time; use at least 60 seconds for this hook.

## Prerequisites
Windows PowerShell 5.1 or later, Claude Code CLI with lifecycle hooks and the STXIC Halo project folder at a fixed absolute path. Review official Anthropic documentation first: https://code.claude.com/docs/en/hooks and https://code.claude.com/docs/en/statusline .

## Safe manual installation
1. Open `%USERPROFILE%\.claude\settings.json` if it exists. Back it up to a timestamped file outside this ZIP.
2. Open `scripts/claude-hooks.example.json` from the ZIP.
3. Replace each `C:\\ABSOLUTE\\PATH\\stxic-halo\\scripts\\claude-hook.ps1` with the real absolute PowerShell path, preserving JSON backslash escaping.
4. **Merge** each event's new hook entry into the existing `hooks.<Event>` array. Do not replace existing hooks, authorization rules, status line, permissions, or extensions.
5. Save valid JSON and restart the Claude session. Use the Claude Code hooks diagnostic commands documented by Anthropic as appropriate for your installed version.
6. Turn Preview mode OFF in STXIC Halo Settings; new events will be read from local app data.

Alternatively, use Settings → Claude Code Lifecycle Bridge → Enable for the existing hook manager with backup and rollback. Restart Claude after changing its hook configuration.

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
