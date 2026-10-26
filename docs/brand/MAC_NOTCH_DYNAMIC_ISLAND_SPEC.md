# STXIC Halo — Mac Notch & Dynamic Island Architectural Specification
## Eliminating "AI Slop" via Apple Human Interface Guidelines & Liquid Glass

> **Document Version:** 1.0.0  
> **Status:** Approved Architecture Plan  
> **Frameworks:** Tauri 2 (Rust) + React 18 + TypeScript + Tailwind/CSS  
> **Design References:** Apple Human Interface Guidelines (*Liquid Glass*, *Materials*, *Motion*, *Layout*, *Typography*, *Accessibility*)

---

## 1. Executive Summary & Design Thesis

Modern AI tools suffer from a pervasive visual disease colloquially known as **"AI Slop"**:
- Oversaturated neon cyan and amber glows.
- Generic floating rounded rectangles detached awkwardly from screen bezels.
- Excessive drop shadows that muddy the workspace.
- Loud, redundant marketing labels ("Agent Active", "Session Verified", "Telemetry Online").
- Lack of physical grounding, tactile weight, or structural intention.

**STXIC Halo** is an intelligent desktop companion for local AI coding agents. To feel like an indispensable, premium OS-level instrument rather than a cheap electron wrapper, Halo must adopt **Apple's Human Interface Guidelines (HIG)** and **Dynamic Island** design philosophies:

1. **Physical Top-Bezel Grounding:** The capsule is not an arbitrary floating box. It is physically anchored to the top center of the display (`Y: 0`), seamlessly emerging from the monitor's top bezel like a hardware MacBook notch or iPhone Dynamic Island.
2. **Authentic Liquid Glass:** Deep obsidian translucency (`rgba(10, 10, 12, 0.78)`), high-radius Gaussian backdrop diffusion (`28px`), dynamic luminance adaptation, and sub-pixel specular rim lighting (`0.5px` border with vertical light gradient).
3. **Curvature Continuity (Squircles):** Eradicate pinched standard circular corners (`border-radius: 16px`) in favor of smooth G2 continuous superellipses.
4. **Dynamic Island Morphing Physics:** Fluid spring-driven transitions (`cubic-bezier(0.16, 1, 0.3, 1)`) between a resting **Compact Notch Capsule** (320px × 38px) and an **Expanded Executive HUD** (460px × 564px).
5. **Whisper-Quiet Typography & Density:** Monospaced tabular numerals, hierarchical opacity tiers (100% primary, 60% secondary, 35% tertiary), and hardware-like micro-indicators.

---

## 2. The Anti-AI-Slop Diagnostic Audit

| Aesthetic Element | The "AI Slop" Pattern (Current State) | Apple HIG / Dynamic Island Antidote |
|---|---|---|
| **Screen Positioning** | Arbitrary floating window at `Y: 10px` gap; looks like a random popup detached from screen geometry. | **Flush Top Bezel (`Y: 0`)**: Anchored to display edge with continuous notch geometry. |
| **Surface & Material** | Muddy opaque dark-gray `#0d1217` panels with flat 1px solid stroke borders and dark drop shadows. | **Liquid Glass Regular**: `rgba(10, 10, 14, 0.80)` with `backdrop-filter: blur(28px) saturate(180%)` and sub-pixel top rim highlight (`inset 0 1px 0 rgba(255,255,255,0.14)`). |
| **Corner Geometry** | Standard CSS `border-radius: 16px` with visible corner pinching and non-concentric inner child margins. | **Continuous Curvature (Squircle)**: Superellipse corner curvature with strictly concentric interior paddings. |
| **Color & Lighting** | Saturated neon mint/cyan and amber glows (`box-shadow: 0 0 25px rgba(...)`) and loud colored background chips. | **Monochromatic Restraint & Optical Vibrancy**: Neutral obsidian surfaces; color reserved exclusively for 6px micro-LED status dots and verified badges. |
| **Typography & Hierarchy** | Repetitive labels, uppercase tags, generic buzzwords ("Evidence", "Live Telemetry"), uneven numbers. | **Tabular Precision**: Segoe UI Variable / SF Pro text scale, `font-variant-numeric: tabular-nums`, concise sentence case, 60% opacity secondary details. |
| **Interaction States** | Abrupt CSS height snapping (`180ms ease-out`); clunky standard web button tabs. | **Dynamic Island Spring Physics**: Fluid dimensional morphing (`280ms cubic-bezier(0.16, 1, 0.3, 1)`) with macOS-native sliding segmented pill control. |

---

## 3. Window Architecture & Top-Edge Anchoring

### 3.1 Zero-Inset Bezel Pinning (`window.rs`)
In the current implementation, `calculate_clamped_bounds` enforces `top_inset_px.clamp(4, 64)`. This forces a minimum 4px–10px gap between the window and the display bezel.

**Required Rust Refactoring:**
```rust
// src-tauri/src/window.rs
pub const ISLAND_WIDTH_LOGICAL: f64 = 460.0;
pub const NOTCH_COLLAPSED_WIDTH_LOGICAL: f64 = 340.0;
pub const NOTCH_COLLAPSED_HEIGHT_LOGICAL: f64 = 38.0;
pub const ISLAND_EXPANDED_HEIGHT_LOGICAL: f64 = 564.0;

/// Clamps window bounds to top display edge (Y = 0) with zero bezel gap.
pub fn calculate_clamped_bounds(
    expanded: bool,
    scale_factor: f64,
    mon_x: i32,
    mon_y: i32,
    mon_width: u32,
    mon_height: u32,
    horizontal_offset_px: i32,
    top_inset_px: i32, // Allow 0 for true top-edge notch anchoring
) -> (i32, i32, i32, i32) {
    let scale = scale_factor.max(0.5);
    let logical_width = if expanded { ISLAND_WIDTH_LOGICAL } else { NOTCH_COLLAPSED_WIDTH_LOGICAL };
    let logical_height = if expanded { ISLAND_EXPANDED_HEIGHT_LOGICAL } else { NOTCH_COLLAPSED_HEIGHT_LOGICAL };

    let physical_width = (logical_width * scale).round() as i32;
    let physical_height = (logical_height * scale).round() as i32;
    let physical_offset_x = (f64::from(horizontal_offset_px) * scale).round() as i32;
    // Allow top_inset_px to be 0 for flush notch docking
    let physical_top_inset = (f64::from(top_inset_px.clamp(0, 64)) * scale).round() as i32;

    let centered_x = mon_x + ((mon_width as i32 - physical_width) / 2) + physical_offset_x;
    let min_x = mon_x;
    let max_x = (mon_x + mon_width as i32 - physical_width).max(min_x);
    let clamped_x = centered_x.clamp(min_x, max_x);
    let y = mon_y + physical_top_inset;

    (clamped_x, y, physical_width, physical_height)
}
```

### 3.2 Display Bezel Integration
When `top_inset_px == 0`, the top edge of the notch seamlessly meets the screen frame:
- The top corners can either sit flush against the physical bezel or transition into smooth concave ears (`fillets`) using SVG path clipping or specialized border-radius curves.
- Bottom corners feature an expansive `20px` continuous squircle curve.

---

## 4. Materials & Lighting: Authentic Liquid Glass

Apple HIG specifies that Liquid Glass must establish a functional floating layer with clear separation from the desktop content underneath.

```
+---------------------------------------------------------------+
|                      SCREEN TOP BEZEL                         |
|  +---------------------------------------------------------+  |
|  | [Specular Hairline: 0.5px top rim highlight]            |  |
|  |                                                         |  |
|  |           LIQUID GLASS LAYER (Obsidian Translucent)     |  |
|  |           background: rgba(10, 10, 14, 0.82)            |  |
|  |           backdrop-filter: blur(28px) saturate(190%)    |  |
|  |                                                         |  |
|  |   +-------------------------------------------------+   |  |
|  |   | CONTENT LAYER: Vibrancy Primary & Secondary     |   |  |
|  |   +-------------------------------------------------+   |  |
|  |                                                         |  |
|  +---\                                                 /---+  |
|       \_________________ SQUIRCLE ____________________/       |
|                                                               |
+---------------------------------------------------------------+
```

### 4.1 Liquid Glass Design Tokens (`styles.css`)
```css
:root {
  /* Apple Liquid Glass Foundation */
  --liquid-glass-bg: rgba(12, 13, 16, 0.82);
  --liquid-glass-clear: rgba(8, 9, 11, 0.65);
  --liquid-glass-blur: 28px;
  --liquid-glass-saturate: 190%;
  
  /* Specular Rim Lighting */
  --liquid-glass-top-rim: inset 0 1px 0 0 rgba(255, 255, 255, 0.16);
  --liquid-glass-border: rgba(255, 255, 255, 0.08);
  --liquid-glass-border-subtle: rgba(255, 255, 255, 0.04);
  --liquid-glass-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.65), 0 2px 6px rgba(0, 0, 0, 0.4);

  /* Apple Vibrancy Tiers */
  --vibrancy-primary: #ffffff;
  --vibrancy-secondary: rgba(255, 255, 255, 0.68);
  --vibrancy-tertiary: rgba(255, 255, 255, 0.42);
  --vibrancy-quaternary: rgba(255, 255, 255, 0.22);

  /* Semantic Hardware Accents (Subtle & Tactile, not Neon) */
  --indicator-active: #30d158;       /* Apple System Green */
  --indicator-active-glow: rgba(48, 209, 88, 0.35);
  --indicator-warning: #ff9f0a;      /* Apple System Orange */
  --indicator-warning-glow: rgba(255, 159, 10, 0.35);
  --indicator-error: #ff453a;        /* Apple System Red */
  --indicator-idle: rgba(255, 255, 255, 0.35);

  /* Precision Typography */
  --font-system: -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'SF Pro Text', system-ui, sans-serif;
  --font-mono: 'SF Mono', 'Segoe UI Variable Display', 'Cascadia Code', monospace;
}
```

---

## 5. Dynamic Island Morphing States

STXIC Halo operates in three distinct physical manifestations:

```
=============================================================================
STATE 1: COMPACT NOTCH (Resting / Top Bezel Pill)
Dimensions: 340px × 38px
[ (o) Claude • agent:build               | 34% CPU • 4.1GB | [v] ]
=============================================================================
                                  |
               Spring Expansion   |  (User Click / Hotkey / Event Trigger)
               280ms cubic-bezier |
                                  v
=============================================================================
STATE 2: EXPANDED DYNAMIC ISLAND HUD
Dimensions: 460px × 564px
+---------------------------------------------------------------------------+
| [Halo Glyph]  STXIC HALO                    [Live] (o) Claude  [^]        |
|---------------------------------------------------------------------------|
|  [ Overview ]     [ Evidence ]     [ Telemetry ]     [ Hooks ]            |
|  (Sliding Segmented Pill Control)                                         |
|---------------------------------------------------------------------------|
|  ACTIVE VERIFICATION CARD                                                 |
|  +---------------------------------------------------------------------+  |
|  | SHA-256: 7d4a...b3e9  •  Workspace: D:/AgentTeam                     |  |
|  | [Check] 12 Proof Claims Verified  •  0 Violations                   |  |
|  +---------------------------------------------------------------------+  |
|                                                                           |
|  SYSTEM HEALTH SPARKBARS                                                  |
|  CPU: [||||||||||..........] 34.2%  •  RAM: [|||||||||||||......] 4.1 GB  |
|                                                                           |
|  RECENT AGENT ACTIVITY STREAM                                             |
|  * 14:02:11  git commit -m "feat: complete Phase 3B"                      |
|  * 14:02:45  cargo check --all-targets (0 errors)                         |
+---------------------------------------------------------------------------+
=============================================================================
```

### 5.1 Dynamic Island State Machine

#### State A: Compact Notch (Resting Capsule)
- **Geometry:** `340px` wide, `38px` high. Direct top-edge anchor (`border-top-left-radius: 0; border-top-right-radius: 0; border-bottom-left-radius: 20px; border-bottom-right-radius: 20px;`).
- **Left Element:** Hardware breathing LED (6px) indicating agent lifecycle:
  - Pulsing emerald (`#30d158`): Active agent tool execution.
  - Steady amber (`#ff9f0a`): Awaiting user input / confirmation.
  - Muted platinum (`rgba(255,255,255,0.4)`): Idle standby.
- **Center Element:** Active Session / Scope (`Claude • agent:build`). Tabular micro-font (11.5px, medium weight).
- **Right Element:** Compact Telemetry Pill (`34% • 4.1GB`) with subtle chevron toggle.

#### State B: Expanded Executive Island (Active HUD)
- **Geometry:** Fluidly morphs to `460px` wide, `564px` high.
- **Header:** Tactile app wordmark, active provider badge, and collapse trigger.
- **Navigation:** Native macOS/iOS style **Sliding Segmented Pill Control** (not separate web buttons):
  - 4 segments: `Overview`, `Evidence`, `System`, `Hooks`.
  - Active segment has a smooth sliding white-translucent backdrop (`rgba(255, 255, 255, 0.12)`).
- **Body Content:** Clean cards using ultra-thin translucent surfaces (`rgba(255, 255, 255, 0.03)`), eliminating heavy borders.

#### State C: Ambient Event Ping (Transient Notification)
- When a critical agent event arrives (e.g. Test Run Passed, Policy Block, or Workspace Hook Fired):
- The Notch temporarily widens by `24px` for `2.4s`, displays an animated glyph and notification summary, then gently springs back to resting dimensions.

### 5.2 Motion Physics
- **Spring Curve:** `cubic-bezier(0.16, 1, 0.3, 1)` (Apple HIG fluid responsiveness).
- **Duration:** `260ms` for collapse, `290ms` for expansion.
- **Accessibility:** Strictly obeys `@media (prefers-reduced-motion: reduce)` by substituting instant cross-fades (`90ms`).

---

## 6. Component-Level Anti-Slop Upgrades

### 6.1 Native Segmented Control (Replacing Clunky Web Tabs)
```tsx
// Apple-style sliding pill segmented control
<div className="segmented-control" role="tablist">
  <div 
    className="segmented-slider" 
    style={{ transform: `translateX(${tabIndex * 100}%)`, width: '25%' }} 
  />
  {TABS.map((tab) => (
    <button
      key={tab.name}
      role="tab"
      aria-selected={activeTab === tab.name}
      onClick={() => setActiveTab(tab.name)}
      className="segmented-item"
    >
      <tab.icon className="segmented-icon" />
      <span>{tab.title}</span>
    </button>
  ))}
</div>
```

### 6.2 Proof-of-Work Evidence Card
Instead of loud neon badges and busy borders, present cryptographic proof data with restrained Apple precision:
- Monospaced hash snippet with click-to-copy tooltip.
- Clean verification shield icon in muted emerald (`#30d158`).
- Strict tabular timestamps (`14:02:11.849`).

### 6.3 System Telemetry Micro-Bars
- Replace generic text percentages with sleek 3px micro-sparkbars.
- Smooth spring-eased width transitions.
- Real-time CPU, RAM, and swap indicators rendered with sub-pixel clarity.

---

## 7. Implementation Roadmap & Milestones

### Phase 1: Window Architecture & Zero-Inset Engine (Rust/Tauri)
- [x] Update `src-tauri/src/window.rs` to allow `top_inset_px: 0` for notch docking.
- [x] Support dual collapsed/expanded logical bounds:
  - Collapsed: `340px × 38px` (Notch)
  - Expanded: `460px × 564px` (Island HUD)
- [x] Add smooth window resize animation sync in Windows win32 API / Tauri window event loop.

### Phase 2: Liquid Glass & Squircle CSS Engine (`styles.css`)
- [x] Refactor `:root` tokens to Apple Liquid Glass palette and typography scale.
- [x] Implement squircle continuous border curves and top-bezel flush anchoring.
- [x] Replace harsh box shadows with specular rim lighting (`inset 0 1px 0 rgba(255,255,255,0.16)`).
- [x] Eradicate all neon glow effects and harsh borders.

### Phase 3: Dynamic Island Morphing Component Hierarchy (`App.tsx`)
- [x] Redesign `.collapsed-pill` into the **Notch Capsule** with hardware breathing LED, session title, and micro-telemetry.
- [x] Implement the **Sliding Segmented Control** in place of the generic tab buttons.
- [x] Re-engineer the expanded view into a cohesive, content-first executive HUD.

### Phase 4: Quality & Independent QA Verification
- [x] Verify accessibility: Contrast ratio > 7:1 for primary text, full keyboard navigation, `prefers-reduced-motion`.
- [x] Validate DPI scaling across 100%, 125%, 150%, and 200% Windows scaling factors.
- [x] Run full cargo and vitest suites to guarantee zero regression on core telemetry and hook features.
- [x] Perform live interactive desktop verification using `launch-halo-desktop.ps1`.

---

## 8. Verification & Acceptance Criteria
1. **Bezel Alignment:** When collapsed, the capsule touches the top monitor edge seamlessly with zero gap.
2. **Material Authenticity:** Liquid Glass material blurs background desktop content with smooth specular reflections; no opaque flat rectangles.
3. **Typography:** Zero neon text or saturated glow shadows; all figures use tabular numbers; micro-copy is concise and sentence-cased.
4. **Fluid Motion:** Expand/collapse transitions feel springy, tactile, and instantaneous without stutter or layout snapping.
