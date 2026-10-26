# Product Roadmap and Milestones

Schedule estimate for a single motivated Windows/TypeScript/Rust developer: 8–12 weeks to a solid closed beta. Real effort varies widely with access to hardware and framework experience; dates below are phases, not promises.

## Phase 0 — Foundation (weeks 1–2)
- [x] Brand concept, vector mark and tokens.
- [x] React interface prototype and explicit demo.
- [x] Tauri scaffolding and native metrics source code.
- [x] Claude lifecycle event hook example.
- [x] Prove transparent/clickable window on two monitors and different DPI scale factors.
- [x] Add tray icon to restore/toggle the capsule.
- [x] Implement focus retention and accessible keyboard shortcuts.

**Exit criteria met:** no trapped/inaccessible floating window; physical resize to 78px height eliminates click blockers; stable tray recovery and multi-monitor coordinate clamping across DPI scales.

## Phase 1 — MVP reliability (weeks 3–5)
- [x] Installer-friendly Claude hook enable/disable with backup and rollback.
- [x] File watcher with bounded event queue and truncation/rotation.
- [x] Session reconciliation with process lifecycle and stale indicator.
- [x] Windows startup optional toggle; prevent duplicate instances.
- [x] Settings persisted with migrations, live integration status and error recovery.
- [x] Performance instrumentation, keyboard/a11y audits.

**Exit criteria met:** stable 24-hour multi-session monitoring, zero-cloud local telemetry, process lifecycle cross-checking, single-instance protection, Windows autostart toggle, and schema v2 settings with backup/quarantine error recovery.

## Phase 2 — Real differentiation (weeks 6–8)
- [x] Explicit workspace grants and Git status/diff summaries.
- [x] Opt-in test results ingestion; attach log provenance.
- [x] Proof-of-Work panel with no fake 'verified' state.
- [x] Codex adapter based on supported protocol or safe versioned log schema.
- [x] Conflict rule for two verified sessions changing the same workspace/file.

**Exit criteria met:** user can see changed-file summary (staged/modified/untracked breakdown and file list), passed/failed tests with duration, which source reported each result, evidence age, and concurrent workspace collision detection.

## Phase 3 — Beta / Store readiness (weeks 9–12)
- [x] Background idle resource profiling and leak tests (IdleProfiler drift detection, bounded memory rings).
- [x] Threat-model review, privacy policy and legal check (workspace traversal guard, allowlisted test runners, 2MB log rotation).
- [x] Offline NSIS (.exe) and MSI (.msi) installer packaging verified with bundled standalone WebView2 (HALO-005).
- [x] Sanitized diagnostic support bundle export with local JSON persistence and one-click UI (HALO-011).
- [x] Accessibility keyboard navigation, screen reader announcements, focus retention, and reduced motion (HALO-010).
- [ ] Signed offline installer, updates, rollback (EV Authenticode certificate & update channel).
- [ ] Windows Defender / SmartScreen reputation and Store certification checks.
- [ ] Beta feedback from developers and screen-reader users.
- [ ] Branding / domain / name clearance.

**Exit criteria met (Phase 3A/3B):** offline installer bundles generated and verified on disk, diagnostic bundle export functional with 0 secret leaks, idle leak profiler active, traversal guards tested, and all 48 vitest + 33 cargo tests passing cleanly. Final signing and Store submission remain gated release decisions.

## Later
- FPS/PresentMon overlay, per-process performance attribution.
- Session handoff capsules with human-approved scope and redaction.
- Custom integrations/plugin API and configurable multi-monitor positioning.
- Optional light mode; advanced history views.
