# Ready-to-paste implementation prompt for Codex / coding agent

You are implementing **STXIC Halo**, a Windows 10/11 local-first floating AI agent and system monitor.

Read README.md, PROJECT_STATUS.md, docs/product/PRD.md, docs/engineering/ARCHITECTURE.md, docs/engineering/SECURITY_PRIVACY.md, docs/brand/DESIGN_SYSTEM.md and docs/product/BACKLOG.md before writing code. The repository already contains a Tauri 2 + React/TypeScript + Rust scaffold. Do NOT start over, replace branding, or silently add a cloud backend.

First priority: stabilize the actual Windows overlay with tested transparent hit regions, focus preservation, mixed-DPI monitor positioning, system tray show/hide/quit, and safe recovery on monitor disconnect. Validate with manual Windows smoke tests. Keep the DEMO label and separate sample values from live data. Never fake context window, tokens, quota, test status or provider presence.

Second priority: improve the explicitly opted-in Claude Code lifecycle bridge with low overhead, bounded event retention, loss-safe parsing, configuration backup/restore and exact provider-state reconciliation. No prompts, transcripts, source contents, tool arguments or credentials should be stored. Only ask permission before making configuration changes.

Third priority: implement a real Proof-of-Work design that links Git status and test outcomes to a user-approved workspace, records evidence provenance, and never treats an agent Stop event as verified completion. Test commands must be allowlisted and explicitly opted in; never auto-execute model suggestions.

Run the repository tests, build steps and security checks you can. If a platform-specific environment is missing, say what is unverified. Add focused tests and update PROJECT_STATUS.md whenever a planned item becomes real. Don't claim Microsoft Store readiness until signed/offline installer and acceptance tests pass.
