# STXIC Halo

**Stay in flow. Halo keeps watch.**

STXIC Halo is a local-first **Windows 10/11 top-edge floating workspace companion** that monitors AI coding agent sessions (via opt-in local lifecycle hooks) and host CPU/RAM telemetry in a compact, non-intrusive HUD capsule.

> **Status: v0.1 Foundation Ready.** The modular React/TypeScript frontend, extensible subsystem interfaces, persistent settings store, hardened PowerShell hook bridge, and modular Tauri 2 / Rust backend (`paths`, `telemetry`, `events`, `config`, `window` + system tray recovery) are implemented and unit-tested. Compiling the native `.exe`/`.msi` requires installing the Rust toolchain (`rustup`) on your Windows machine.

## Architecture Overview

| Layer | Path | Responsibility |
|---|---|---|
| **Domain & Contracts** | `src/types.ts` | Core models plus extensible interfaces (`AgentProviderAdapter`, `TokenUsageContract`, `ProofOfWorkVerifierContract`, `NotificationPolicyContract`, `GamingTelemetryContract`) |
| **Configuration Store** | `src/config/settings.ts` & `src-tauri/src/config.rs` | Validated, clamped user preferences persisted to `%LOCALAPPDATA%\STXICHalo\settings.json` (atomic write) and mirrored to `localStorage` |
| **Agent Event Pipeline** | `src/lib/agentEvents.ts` & `src-tauri/src/events.rs` | Metadata-cached bounded 256 KiB JSONL tail reader, 2 MiB auto-rotation, session staleness detection, and deterministic alert deduplication |
| **System Telemetry** | `src/lib/telemetryHistory.ts` & `src-tauri/src/telemetry.rs` | Targeted `sysinfo` CPU/RAM sampling with 10s throttled process count enumeration and a bounded 24-sample history ring buffer |
| **Window & Tray Management** | `src/lib/desktop.ts` & `src-tauri/src/window.rs` | Frameless always-on-top capsule (`460×78` collapsed, `460×604` expanded), multi-monitor DPI positioning with off-screen clamping, and Windows system tray recovery menu |
| **Runtime Controller & UI** | `src/hooks/useHaloRuntime.ts`, `src/App.tsx`, `src/components/` | Single-flight background polling (paused when hidden), `React.memo` view isolation, keyboard navigation (`Escape`, `Alt+1..4`), and `ErrorBoundary` fault recovery |
| **Claude Hook Bridge** | `scripts/claude-hook.ps1` | Opt-in PowerShell script with 2 MiB log rotation and 3-attempt shared-lock retry |

## Quick Start (Web Preview & Tests)

Requirements: Node.js 20.19+ or 22.12+ and npm.

```powershell
cd stxic-halo
npm install
npm test
npm run build
npm run dev
```

Open `http://127.0.0.1:1420` to inspect the interactive console in **DEMO** fixture mode.

## Run & Package as a Native Windows Desktop App

Requirements: Windows 10/11, Node.js, Rust (`rustup` with `x86_64-pc-windows-msvc`), Microsoft Visual C++ Build Tools, and WebView2 Runtime. Run `powershell -ExecutionPolicy Bypass -File .\scripts\check-environment.ps1` to verify prerequisites.

```powershell
# Launch native floating desktop island in dev mode
npm run desktop:dev

# Build standard Windows NSIS/MSI installers
npm run desktop:build

# Build a standalone executable with the UI embedded (no dev server needed)
npm run desktop:build:exe

# Build Microsoft Store candidate with offline WebView2 installer configuration
npm run desktop:build:store
```

Use the Tauri build commands for release binaries. A plain `cargo build --release` is rejected because it leaves Tauri in development mode without embedded UI assets.

## Claude Code Hook Opt-In

Antigravity, GitHub Copilot CLI, and OpenCode can be connected from **Settings → More coding agents**.
**Overview → Usage & limits** separates reported session tokens/cost from subscription quota and context.
All five providers appear together in Overview. Codex reads logged quota snapshots; Copilot CLI reads recorded token/premium-request totals; OpenCode reports tokens/cost after its plugin is connected. Other missing metrics have an explanation and require a separate local usage source.
See [provider setup, availability, and usage exports](docs/engineering/PROVIDER_INTEGRATIONS.md).

1. Read `docs/engineering/CLAUDE_INTEGRATION.md`.
2. Back up `%USERPROFILE%\.claude\settings.json` if present.
3. Merge `scripts/claude-hooks.example.json` into your Claude settings using the **absolute path** to `scripts/claude-hook.ps1`.
4. Start a Claude Code session; sanitized lifecycle events stream to `%LOCALAPPDATA%\STXICHalo\events.jsonl`.

## Security & Privacy Guarantees

- **Zero cloud backend:** Halo makes no outbound network requests and collects no analytics.
- **No prompt or transcript capture:** The hook bridge records only `schema_version`, `source`, `session_id`, `timestamp`, `event`, `cwd`, and `tool_name`.
- **Honest telemetry:** Missing context window or token metrics are rendered explicitly as unavailable (`null`), and an agent `Stop` event is never marked as verified without Proof-of-Work evidence.

## Documentation Index

- **Architecture & Contracts:** [`docs/engineering/ARCHITECTURE.md`](docs/engineering/ARCHITECTURE.md), [`docs/engineering/EVENT_CONTRACT.md`](docs/engineering/EVENT_CONTRACT.md), [`docs/engineering/SECURITY_PRIVACY.md`](docs/engineering/SECURITY_PRIVACY.md)
- **Product & Backlog:** [`docs/product/PRD.md`](docs/product/PRD.md), [`docs/product/BACKLOG.md`](docs/product/BACKLOG.md), [`PROJECT_STATUS.md`](PROJECT_STATUS.md)
- **Microsoft Store Packaging:** [`docs/release/STORE_PUBLISHING.md`](docs/release/STORE_PUBLISHING.md), [`src-tauri/tauri.store.conf.json`](src-tauri/tauri.store.conf.json)
