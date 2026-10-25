# STXIC Halo — Quick Start

## 1. Explore first (5-minute overview)

- Read `README.md` and `PROJECT_STATUS.md` for what works and what does not.
- Open `assets/brand/halo-logo-horizontal-dark.svg` and `assets/mockups/halo-brand-board.svg` for the identity.
- Open `marketing/index.html` for a standalone landing-page mockup.
- To experience the app, install npm dependencies and run `npm run dev`.

## 2. Development on Windows

```powershell
.\scripts\check-environment.ps1
npm install
npm run desktop:dev
```

Expected: a small top-center capsule. Click to expand. Use Preview mode for fake agent sessions; turn it off to see real CPU/RAM and empty live sessions.

## 3. Enable Claude lifecycle events (optional)

See `docs/engineering/CLAUDE_INTEGRATION.md`. Merge the hook JSON manually, using an absolute path. Relaunch Claude Code. Event records are local only. No source code or prompt text is captured.

## 4. What to implement next

First, confirm Windows overlay behavior (DPI, click targeting, multiple monitors, fullscreen, focus). Second, implement real tray/startup. Third, robust Claude lifecycle and cancellation handling. Then implement verifiable Git/test evidence and Codex provider adapter.

## Important limitations

- No installer or Store package is included in the ZIP.
- The existing project is source code and designs, not an installed executable.
- A first-time `npm install` requires dependency access; Rust compilation requires its toolchain and crate access.
- React/browser preview can run without Windows telemetry; Windows native behavior must be tested on a Windows PC.
- Front-end preview source includes an explicit DEMO indicator to prevent confusion.
