# Architecture Decision Records

## ADR-001: Tauri 2 / React / Rust
**Status:** provisional. Tauri offers a lightweight Windows shell, React permits polished interface iteration, Rust is suitable for native data sources. Reevaluate C# WPF/WinUI if overlay hit testing, tray integration or packaging becomes disproportionately difficult.

## ADR-002: Local-first and no backend
**Status:** accepted. No mandatory cloud account, no remote collection, source files never read without opt-in. Security and product differentiation both benefit from minimization.

## ADR-003: Hook event bridge for Claude
**Status:** prototype. A minimal PowerShell script bridges permitted lifecycle metadata into a file. Not a production event transport; migrate to bounded local IPC or robust watcher before beta.

## ADR-004: Explicit demo mode
**Status:** accepted. Users and reviewers must be able to preview the full concept without agents installed, while being unable to mistake sample tokens/tests/context for real measurements.

## ADR-005: Proof-of-Work before gaming FPS
**Status:** proposed. Verifiable agent work makes the app distinct; FPS is technically demanding, potentially elevated, and a different market segment. Protect v0.1 focus.

## ADR-006: Plain CSS rather than adding a styling framework immediately
**Status:** accepted for starter. Explicit design tokens and few dependencies are easier to audit. Tailwind or a component library can be introduced when product density justifies it.
