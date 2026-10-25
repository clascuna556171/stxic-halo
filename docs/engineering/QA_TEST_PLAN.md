# QA and Acceptance Test Plan

## Environment matrix
- Windows 10 22H2 x64 and Windows 11 current supported release, if feasible.
- Single monitor 1920x1080 100% scale; 2560x1440 125%; 4K 150–200%.
- Dual monitor with negative desktop coordinates, different scale factors; monitor unplug/replug.
- RDP session; sleep/resume; Windows theme and high contrast; reduced motion.

## Window tests
- [ ] Capsule starts visible; stays inside active screen bounds.
- [ ] No desktop-wide click blocker outside visible UI.
- [ ] Clicking island doesn't steal keyboard focus from editor unnecessarily.
- [ ] Expand/collapse can be used entirely by keyboard and via tray.
- [ ] Can recover when primary monitor is disconnected.
- [ ] Fullscreen game/browser policies obey user setting; no promise of exclusive-fullscreen overlay.
- [ ] Works when Windows text scaling is increased.

## Agent hook tests
- [ ] Existing Claude hooks preserved during manual merge.
- [ ] First event appears only after opt-in and session restart.
- [ ] Simultaneous sessions remain separate.
- [ ] Event log malformed lines ignored; oversized lines ignored; no crash.
- [ ] Missing log file results in empty state.
- [ ] `PermissionRequest` indicates waiting but no unauthorized action.
- [ ] `Stop` labelled as response stopped and never verified.
- [ ] Disconnected integration stops new writes and existing data can be erased.
- [ ] No prompt contents, commands or credentials in JSONL event log.

## Metrics tests
- [ ] Native CPU trends agree approximately with Windows Task Manager after warmup.
- [ ] RAM reported in GiB/GB consistently; division by zero guarded.
- [ ] Sample interval/power use suitable for battery laptops.
- [ ] Offline application does not make unsolicited network connections.

## Frontend tests
- [ ] Demo labels persist across navigation.
- [ ] No missing token/context data replaced by sample percentages in live mode.
- [ ] Attention cards take user to relevant activity view.
- [ ] All toggles and buttons have real state changes.
- [ ] Screen reader announces tab labels and button names.
- [ ] Reduced motion respected.

## Installation tests (pending)
- [ ] Unsigned internal build installs cleanly; signed Store candidate has valid signatures.
- [ ] Clean uninstallation removes scheduled tasks and startup entries created by app.
- [ ] Installed hooks are not removed without consent if user edited configuration.
- [ ] Update from previous version preserves settings and integration state.
- [ ] No administrator requirement for basic features.

## Existing automated checks
`npm test`: unit tests for event-to-session reducer. `npm run build`: TypeScript static check + Vite compile. Windows native compilation/e2e and actual Claude integration must be performed on a Windows test machine.
