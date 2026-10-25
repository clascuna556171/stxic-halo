# Engineering Backlog

## P0 — Critical

**HALO-001 Window safety:** Test transparent regions, rounded hitbox, resize behavior, Win10/11 and all scale factors. Acceptance: no off-screen trap, no phantom click blocking, clean focus return.

**HALO-002 Tray rescue:** Implement show/hide/quit tray menu, icon assets, one instance. Acceptance: recover after app hidden; quit terminates monitors.

**HALO-003 Claude event lifecycle:** Harden bounded local bridge; handle new sessions, permission state, cancellation, Stop/SessionEnd nuance, file race/rotation. Acceptance: correct status after intentionally testing hooks; no prompt leakage.

**HALO-004 Measurement truthfulness:** Differentiate live/demo/stale/unavailable; never derive context from total tokens. Acceptance: unknown values always render as unavailable.

**HALO-005 Windows packaging:** Produce signed x64 offline installer; test clean install/uninstall/update; test WebView2 offline dependency.

## P1 — Important

**HALO-006 Proof-of-Work:** Display Git workspace diffs and test outcomes with explicit user-granted project folder.

**HALO-007 Codex adapter:** Support session presence and usage only from verified supported data sources; label estimates.

**HALO-008 Risk Radar:** Detect 2 sessions touching the same tracked file, stalled output, high memory and failed tests; avoid over-alerting.

**HALO-009 Settings:** Persist opt-in sources, poll interval, alert rules, monitor selection, autostart.

**HALO-010 A11y:** Keyboard shortcut for expand/collapse, screen reader accessible summary, reduce motion, color contrast tests.

**HALO-011 Observability:** Local diagnostic logs (no sensitive data), rotate files, manually export support bundle with confirmation.

## P2 — Expansion

**HALO-012 Session recovery:** Human-approved handoff Markdown with decisions and verified files; no hidden memory transfer claims.

**HALO-013 Hardware telemetry:** GPU and process association with elevated privilege warnings.

**HALO-014 FPS:** Investigate PresentMon/ETW, performance overhead, fullscreen and anti-cheat compatibility.

**HALO-015 Provider SDK:** Versioned local read-only event adapter contract.

## Definition of done
Code + unit test + Windows smoke test + keyboard navigation + security review + honest data label + docs + screenshots. Native integrations additionally require install/uninstall/rollback verification.
