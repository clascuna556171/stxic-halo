# STXIC Halo — Design System

## Tokens

| Token | Hex | Application |
|---|---|---|
| `--bg` | `#0B0E12` | Desktop surround, marketing |
| `--panel` | `#171C20` | Cards and surfaces |
| `--panel-raised` | `#232C33` | Selected surfaces |
| `--mint` | `#B5F5CD` | Healthy/active state, brand accent |
| `--text` | `#F3F6F5` | Primary copy |
| `--muted` | `#9BA7AB` | Secondary copy |
| `--amber` | `#F5C875` | Waiting, review needed |
| `--coral` | `#F28B8F` | Error or failed verification |
| `--blue` | `#9DBFFD` | Neutral work in progress |
| `--stroke` | `#303A41` | Borders |

Dark-first, but a light palette should be added before GA. Colors must never be the only means of expressing state; status badges need readable labels or accessible names.

## Typography
Segoe UI Variable on Windows. Browser fallback: Segoe UI, Inter if installed, system-ui. For numeric counters use tabular numbers; monospace reserved for code paths and debugging logs. Avoid loading web fonts from third-party CDNs in the desktop runtime to preserve offline privacy.

Size scale: caption 10–11 px; small text 12 px; body 13–14 px; feature label 15–17 px; large heading 24–28 px. Favor line height 1.4–1.6.

## Shape and spacing
4 px base spacing grid: 4, 8, 12, 16, 20, 24, 32. Radius: 8 px for controls, 12–15 px cards, 24–26 px island. Borders 1 px low contrast, not excessive shadows. Small internal icons 14–18 px; app mark at least 20 px.

## State model
- **Idle:** compact, low emphasis, optional low-frequency system information.
- **Working:** healthy green indicator; count of active agent sessions.
- **Waiting:** amber with concise action label; do not auto-grab keyboard focus.
- **Completed:** only session ended/stopped (not verified).
- **Failed verification:** coral/amber depending severity; accompanied by evidence source.
- **Unknown/stale:** gray with last-update timestamp.

## Motion
- Expand/collapse target 180–220 ms; gentle easing.
- Data updates should not animate more than once per refresh.
- No pulsing idle animations. Respect Windows "Reduce motion" / CSS `prefers-reduced-motion`.
- Toasts should not cover full-screen presentations or games without opt-in.

## Accessibility
Tab through collapsed capsule, tabs, controls and dismiss actions. Icons paired with accessible names; high contrast option needed for GA. ARIA labels for data views; keyboard escape-to-collapse is a future acceptance criterion. Focus should not jump on background updates. Avoid color-only status.

## Screens and key views
1. **Collapsed:** brand mark, headline metric / actionable issue, optional secondary label.
2. **Overview:** single highest-priority attention card, agent sessions, compact system stats.
3. **Activity:** verified evidence, changed files, test results and provenance (future live integration).
4. **System:** CPU/RAM live values, later GPU/FPS with clear measurement origin.
5. **Settings:** demo toggle, local integration permissions and privacy settings.
6. **Onboarding (future):** choose sources → preview permissions → configure hooks → verify first event.

## What not to copy
Use Mac Dynamic Island as interaction inspiration, not its exact notch shape, fonts, marks or animation curves. Design should feel native to Windows and the STXIC identity. Copying screenshot layouts or artwork from competitors is prohibited.
