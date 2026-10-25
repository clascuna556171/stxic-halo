# Agent Risk Radar — Proposed Capability

## Purpose
Proactively identify **actionable, evidence-backed** problems, not turn the island into a noisy alert feed.

## Risk signals
| Signal | Evidence | Severity | False positive mitigation |
|---|---|---|---|
| Agent waiting for permission | Provider approval event | Medium | Clear when provider changes state; show source and timestamp |
| Test failures | User-approved test exit code/report | High | Preserve log provenance and revision |
| Overlapping file edits | Scoped file change events and revision times | Medium | Only warn on same file and active overlap, not common workspace |
| Context nearly full | Provider-supplied context / max-context value | Medium | Label data source; never derive from total spend |
| Repeated retries | Multiple failure events attributable to same job | Medium | Debounce, cooldown, explain count |
| RAM pressure | Local system memory > user-configured threshold | Low/Medium | Sample over time; don't attribute to agent without process link |
| Session appears stale | Timestamp absent beyond provider-specific threshold | Low | Mark 'stale', don't guess crash or failure |

## Prioritization
P0 explicit security/critical failure, P1 user approval, P2 failed validation, P3 resource/context warning, P4 informational completion. One prioritized event in compact pill. Cooldown, do-not-disturb and fullscreen rules configurable.

## Interaction
Show concise claim, supporting evidence, and a **Review** action. The default is non-destructive; approvals or command execution remain in original provider until safely supported and explicitly opted in.

## QA
Test false positives during concurrent workspaces, clock drift, canceled hooks, sleep/wake, and noisy compilers. Measure alerted issue usefulness in consent-based research rather than uploading telemetry by default.
