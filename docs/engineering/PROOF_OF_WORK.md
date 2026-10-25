# Proof-of-Work — Proposed Signature Capability

**Status:** design specification only. The React prototype displays clearly marked example test data, not real verification.

## User value
Agent response completion != successful implementation. Surface evidence: changed files, diff summary, build/test result, revision scope and provenance.

## Minimal pipeline
1. User grants a specific workspace folder; show canonical path, no hidden discovery.
2. Capture a baseline Git HEAD + working tree status at grant/start event.
3. Capture a post-run status and changed file list. Protect against symlink and path traversal attacks.
4. Only when user opts in, run a predefined allowlisted test profile or ingest a trustworthy existing test result. Do **not** execute commands copied from arbitrary agent output.
5. Store evidence linked to workspace, `session_id` (where supported), timestamps, commit SHA, command identifier and exit status.
6. Render **Verified** only when selected required checks passed for the captured revision; otherwise show "No verification", "Test failed", or "Partial evidence".

## Data model (planned)
```json
{
  "workspace_id":"local-hash",
  "revision":"abcdef1234",
  "session_id":"provider-id",
  "collected_at":"2026-10-25T10:00:00Z",
  "changed_files_count":8,
  "tests":{"name":"npm test","run_by":"user-approved-profile","exit_code":1,"passed":6,"failed":2},
  "verification_state":"failed",
  "evidence_provenance":"local-exit-code"
}
```

## Guardrails
- Git working tree state can contain changes by the user or other processes. Do **not** attribute a changed file to Claude solely because the working directory is the same.
- Different agents editing the same file is only a possible conflict, not proof of overwriting; compare timestamps, revisions and ownership before alerting.
- Never claim a test suite passes if you only parsed text saying "tests passed" without verifying the executed command.
- Never run arbitrary build scripts in silent background mode. Clear prompt: command, workspace, expected duration/permissions, result handling.
- Treat path names and logs as sensitive; redact exports and keep them local.

## UX states
Not configured / Collecting evidence / Evidence found / Passed / Failed / Stale / Unavailable. Display exact test command and when evidence was collected in expanded view.
