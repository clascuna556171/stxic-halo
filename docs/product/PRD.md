# Product Requirements Document — STXIC Halo

**Version:** 1.0 proposal • **Date:** 2026-10-25 • **Platform:** Windows 10/11 desktop • **Owner:** STXIC

## Executive summary
STXIC Halo is a local-first, low-distraction floating Windows interface that answers: *What are my AI coding agents doing, is their work healthy, and what needs attention?* It blends agent signals, eventually evidence-backed verification, and local machine resources. The initial release is developer-first; gaming telemetry is a separate optional future mode.

## Problem
Developers juggle terminal sessions, editors, agents, test runners, and resource dashboards. Existing monitoring products often report that an agent is active but not whether it has produced useful, verifiable results. Checking status manually disrupts flow. A desktop capsule can surface concise actionable state without replacing primary IDEs.

## Target personas
**Solo builder:** 2–3 coding agents across projects. Needs who is blocked and whose tests failed.
**Agency developer:** parallel client projects. Needs which workspace requires review and concise handoffs.
**Power user (future):** performance telemetry during compilation/gaming, with strict control over intrusion.

## Jobs-to-be-done
- When I have multiple agent sessions running, show me which require action without tab switching.
- When an agent claims to be finished, differentiate completion of a response from verified results.
- When my machine slows down, help explain overall CPU/RAM pressure and, later, which processes are responsible.
- When context is missing or unavailable, do not invent a percentage.

## Non-goals for v0.1
- Autonomous AI agent orchestration.
- Controlling or auto-approving agent permissions.
- Cloud sync, team accounts, account auth or chat transcript collection.
- FPS overlays inside exclusive-fullscreen games.
- Reading Codex/Cursor/Antigravity usage without a validated adapter.
- Automatic execution of test commands without explicit consent.

## Release v0.1 functional requirements
| ID | Requirement | Priority | Prototype implementation |
|---|---|---|---|
| FR-01 | Top-center floating collapsed capsule | P0 | Tauri scaffold; Windows validation pending |
| FR-02 | Expand/collapse and navigate views | P0 | React UI implemented |
| FR-03 | System CPU/RAM memory telemetry every ~2.5s | P0 | Rust command implemented in source |
| FR-04 | Optional minimal Claude lifecycle events | P0 | PowerShell hook example + bounded JSONL reader |
| FR-05 | Distinguish demo from live | P0 | Implemented |
| FR-06 | Show data unavailability explicitly | P0 | Implemented for context/tokens |
| FR-07 | Track working/waiting/stopped from hooks | P0 | Initial adapter implemented; real provider validation pending |
| FR-08 | Keyboard, tray, start-on-login, fullscreen | P1 | Planned |
| FR-09 | Proof-of-Work Git diff and tests | P1 | Specification only |
| FR-10 | Codex adapter | P1 | Specification only |
| FR-11 | Offline, no hidden user-data upload | P0 | Local-only prototype design; audit before GA |

## Functional acceptance criteria (GA target)
- Installed on Windows 10/11 x64 without admin rights for normal features.
- Closing panel never hijacks focused editor. Window is recoverable from system tray.
- No invisible desktop-wide click blocker.
- With Claude hook disconnected, UI shows a helpful empty state; no fake tokens/context.
- Agent event updates show within a few seconds and persist through temporary inactivity.
- Status source, timestamp and data freshness are explainable.
- Alert priority never triggers repeated popups for the same unchanged event.
- CPU idle overhead measured and documented; target under 1% average on a representative PC, subject to profiling.
- Privacy and permission prompts are accurate, reversible and limited.

## Success measures
- Setup completion rate (% users seeing their first real event).
- Median time from agent needing approval to user awareness (opt-in instrumentation only; do not collect telemetry by default).
- Daily number of helpful alerts vs dismissed alerts in opt-in user studies.
- 7-day retention in consented beta cohorts.
- Crash-free local sessions and median resident RAM consumption.

## MVP differentiation and commercial path
v0.1 is a trusted ambient observer; v0.2 adds **Proof-of-Work**; v0.3 adds **Agent Risk Radar**. The integrated combination is the proposed differentiator; each subfeature can already exist elsewhere. Do not claim originality or verification without evidence.

## Risks
- Hooks and log formats change: version adapters, provide manual repair.
- Privacy of agent files: collect lifecycle metadata only with opt-in.
- Resource overhead: event-driven design; throttled polling.
- Windows window management complexity: test per monitor and fullscreen state.
- Store distribution: code signing, offline installer, privacy disclosure and certification.
- Market overlap: avoid merely adding media/music widgets.
