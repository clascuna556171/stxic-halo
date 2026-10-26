# STXIC Halo — Agent Master Handoff & Improvement Blueprint

> **Instructions for the AI Agent**: You are inheriting the **STXIC Halo** codebase. Read this document thoroughly before writing any code. It outlines the project vision, existing architecture, shipped milestones, and an prioritized improvement blueprint to take Halo from a solid v0.1 MVP to an industry-defining desktop companion.

---

## 1. Executive Context

- **Product Name**: STXIC Halo
- **Repo Root**: `D:\Tech\Projects\staxichalo\STXIC_Halo_Full_Project_Package\stxic-halo`
- **Core Purpose**: A native, zero-cloud desktop companion for Windows (and macOS/Linux) styled after the **Mac Notch & Apple Dynamic Island**. It anchors flush against the top monitor bezel to provide real-time telemetry, tool visibility, permission approval, and code verification for local AI coding agents (Claude Code, OpenAI Codex, Antigravity, Cursor, etc.).
- **Tech Stack**:
  - **Frontend**: React 18, TypeScript, Vite, Lucide Icons, Vanilla CSS (Apple Liquid Glass design tokens).
  - **Backend / Desktop Runtime**: Tauri v2, Rust 2021 edition, `sysinfo`, `windows-sys`, `serde`, `tokio`.
  - **Testing**: Vitest (48 frontend tests) + Cargo test (33 native Rust tests). 100% passing.
- **Design Standard**: Authentic Apple Human Interface Guidelines (HIG) & Liquid Glass (`rgba(12, 13, 16, 0.82)`, Gaussian blur `28px`, saturation `190%`, continuous squircles, sub-pixel specular top-rim lighting, and Apple spring physics `cubic-bezier(0.16, 1, 0.3, 1)`).

---

## 2. Current State (What Is Already Shipped up to `eaf1560`)

1. **Window Engine & Top-Bezel Docking (`src-tauri/src/window.rs`, `src/lib/desktop.ts`)**:
   - Zero-inset flush docking (`top_inset_px: 0` allowed and defaulted; window pinned to physical monitor `Y: 0`).
   - Compact Notch Capsule: `340px × 38px`.
   - Expanded Dynamic Island HUD: `460px × 564px`.
   - DPI-aware coordinate clamping across single, multi-monitor, and negative virtual desktop coordinates.
   - Physical resize elimination of transparent click-blocking zones.
2. **Apple Liquid Glass CSS System (`src/styles.css`)**:
   - Deep obsidian translucent glass tokens (`--liquid-glass-bg`, `--liquid-glass-border`, `--liquid-glass-top-rim`).
   - Continuous squircle bottom radii: `0 0 20px 20px` for notch, `0 0 22px 22px` for expanded HUD.
   - Sliding segmented pill control (`.tabs.segmented-control` + `.segmented-slider`) driven by GPU-composited CSS transforms.
   - Zero saturated neon glows or harsh 1px borders; fully compliant with Apple HIG contrast ratios.
3. **Core Runtime & Local Integrations (`src/hooks/useHaloRuntime.ts`, `src-tauri/src/`)**:
   - 100% real mode default (`demo: false`).
   - Claude Code 1-click lifecycle hook injector in `~/.claude/settings.json` with automatic backup and rollback.
   - Codex session rollout log parser reading `~/.codex/sessions`.
   - OS process lifecycle reconciliation cross-checking provider CLIs with active system processes.
   - Bounded memory profiler verifying zero memory leaks over extended runtime.
4. **Clean UI & Information Architecture (`src/App.tsx`, `src/components/Dashboard.tsx`)**:
   - 4 standard tabs: **`Overview`**, **`Activity`**, **`System`**, **`Settings`**.
   - Overview empty state displays immediate bridge status with a 1-Click Connect button.
   - Human-readable event timeline: converts raw hook codes (`PreToolUse`, `PermissionRequest`) into readable actions (`Tool: Bash`, `Approval required`, `Session started`).
   - Zero dummy cards: eliminated all placeholder gaming FPS boxes and internal developer debug tables.

---

## 3. "Improve Everything" Master Plan

Below is the concrete roadmap to transform STXIC Halo from an observational telemetry viewer into an essential interactive cockpit.

### Track 1: Two-Way Interactive Agent Controls (Highest Value)
Currently, Halo observes events passively. Upgrading to a 2-way control center will elevate the UX dramatically:
- [ ] **Direct Permission Approval in the Notch**:
  - When Claude Code or another agent emits `PermissionRequest` (e.g. executing a shell script or writing to disk), the collapsed notch should turn amber with a breathing pulse.
  - Expanding the notch or pressing `Enter`/`Space` should present a prominent **[Approve]** / **[Deny]** action bar that sends the decision back to the agent CLI via IPC or named pipe.
- [ ] **Live Terminal Output Drawer**:
  - Add an expandable mini-terminal console inside the Activity tab showing the trailing 15 lines of agent stdout/stderr.
  - Syntax highlighting for shell output and diff previews.
- [ ] **Emergency Halt / Interrupt Button**:
  - A prominent, protected stop button (`Ctrl+C` signal to the agent process) to immediately halt runaway loops or erroneous tool executions without digging through terminal tabs.

### Track 2: Expanded Agent Ecosystem & Multi-Agent Matrix
Support the entire modern developer agent stack:
- [ ] **Universal Workspace File-Watcher Adapter**:
  - Add a lightweight filesystem watcher in Rust (`notify` crate) watching authorized project folders.
  - Detect file mutations from **Cursor**, **Windsurf**, **Aider**, **Antigravity**, and **GitHub Copilot CLI** even without dedicated hooks.
- [ ] **Multi-Agent Split & Dependency Visualizer**:
  - When 2+ agents run concurrently in a workspace (e.g. Lead agent implementing + QA agent reviewing), show a visual status bar indicating agent roles, current tasks, and file collision warnings if both touch the same file.

### Track 3: Visual & Sensory Polish (Apple HIG Mastery)
Refine the sensory experience to feel indistinguishable from macOS Sequoia / iOS 18:
- [ ] **Active Tool Shimmer in Compact Notch**:
  - When an agent is actively running a bash command or LLM inference, the 6px notch LED should transition to a smooth pulsing indeterminate progress track or mini wave animation.
- [ ] **Micro-Audio & Haptic Feedback**:
  - Add optional, ultra-subtle synthesized audio cues (using Web Audio API or native Win32 audio):
    - Soft glass snap when the island expands or collapses.
    - Subtle double-click when an agent completes a tool.
    - Gentle chime when all unit tests pass; muted thud if a test fails.
  - Include an immediate master toggle in Settings: `Sound effects: Enabled / Muted`.
- [ ] **Inline Code Diff Viewer**:
  - Clicking a modified file in the Activity tab should expand an inline side-by-side or unified diff viewer with syntax highlighting (using Prism or lightweight tokenization) instead of only listing file names.
- [ ] **Wallpaper Tinting / Native Windows Mica Support**:
  - Integrate Windows 11 `DwmSetWindowAttribute` (`DWMA_SYSTEMBACKDROP_TYPE = 2` for Mica or `3` for Acrylic) via `windows-sys` in `src-tauri` so the background naturally refracts the user's actual Windows desktop wallpaper.

### Track 4: Performance, Power & Desktop Integration
Make Halo the lightest, most unobtrusive utility on the user's machine:
- [ ] **Adaptive Polling / Deep Sleep**:
  - When 0 agent processes are detected and the window is collapsed, throttle polling to 15 seconds to achieve 0.0% CPU and preserve laptop battery.
  - Burst instantly to 1-second polling the moment a filesystem write or CLI process starts.
- [ ] **Enhanced System Tray Quick Menu**:
  - Right-clicking the system tray icon should provide a rich native context menu:
    - `Toggle Halo HUD (Alt+H)`
    - `Active Agent: Claude Code (Working)`
    - `Approve Pending Action`
    - `Run Allowlisted Tests`
    - `Authorized Workspaces...`
    - `Exit`
- [ ] **Custom Global Hotkeys**:
  - Allow user-configurable hotkeys in Settings (e.g. `Ctrl+Space`, `Alt+Space`, `Win+H`).

### Track 5: Release Engineering & Distribution
- [ ] **Code Signing & Auto-Update Pipeline**:
  - Integrate `tauri-plugin-updater` with GitHub Releases.
  - Setup GitHub Actions CI/CD to build, sign, and release tagged versions.
- [ ] **Installer Refinement**:
  - Verified NSIS `.exe` installer with clean desktop shortcut and optional autostart registry entry.
  - Store certification readiness (Windows App SDK / MSIX package).

---

## 4. Key Codebase Files & Responsibilities

| File | Responsibility |
|------|----------------|
| `src-tauri/src/window.rs` | Native window management, multi-monitor coordinate math, DPI scaling, zero-inset top-bezel docking |
| `src-tauri/src/config.rs` | Settings persistence, schema migration, backup restoration, quarantine logic |
| `src-tauri/src/telemetry.rs` | Hardware telemetry sampling via `sysinfo`, provider CLI classification |
| `src-tauri/src/events.rs` | Ring buffer for agent events, log rotation, sanitization |
| `src-tauri/src/proof_of_work.rs`| Git diff execution, allowlisted test runners (`npm test`, `cargo test`, `pytest`) |
| `src-tauri/src/profiling.rs` | Background idle profiler and memory ceiling verification |
| `src/App.tsx` | Main HUD shell, Notch Capsule, sliding segmented tabs, brand header, settings view |
| `src/components/Dashboard.tsx` | Overview, Activity (Diffs & Verifications), System (Hardware & Processes) views |
| `src/hooks/useHaloRuntime.ts` | Central frontend state hook, IPC poll loop, reconciliation |
| `src/styles.css` | Authentic Apple Liquid Glass tokens, animations, continuous squircle geometry |
| `src/lib/desktop.ts` | Tauri IPC invoke wrappers with browser fallback simulation |

---

## 5. Engineering Standards & Strict Guidelines

When implementing features:
1. **Zero Dummy Data**: Never introduce fake metrics, mock testimonials, or placeholder roadmap cards ("Planned for v0.2"). All displays must represent genuine machine state.
2. **Never Break Test Coverage**:
   - Before finishing any change, run:
     ```powershell
     npm test
     cargo test --manifest-path src-tauri/Cargo.toml
     npm run build
     ```
   - If UI contracts change, update corresponding test files in `tests/`.
3. **Preserve Apple HIG & Liquid Glass Aesthetics**:
   - Maintain obsidian translucency (`rgba(12, 13, 16, 0.82)` + `blur(28px) saturate(190%)`).
   - Use continuous squircles (`border-radius: 0 0 20px 20px` for notch, `0 0 22px 22px` for expanded island).
   - Use `tabular-nums` for all dynamic numbers and telemetry to prevent visual layout shifts.
   - Use Apple spring physics (`cubic-bezier(0.16, 1, 0.3, 1)`).
4. **Safe Process Launching**:
   - In tool execution environments, remember that the desktop GUI runs on `WinSta0\Default`. Launch native release binaries via the user's interactive terminal session.
