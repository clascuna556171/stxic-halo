# STXIC Halo — Brand Guidelines v1.0

## Brand architecture
- Parent identity: **STXIC** (the maker's signature across software projects).
- Product: **Halo**.
- Official display name: **STXIC Halo**.
- Short app wordmark: **stxic**halo (lowercase styling is optional, never change searchable app name).
- Category: AI agent and workspace intelligence for Windows.
- Tagline: **Stay in flow. Halo keeps watch.**

## Brand belief
A monitoring tool should protect the user's attention. Most dashboards require a visit. Halo offers ambient awareness: remain quiet when work is healthy; provide concise, evidence-backed information when intervention is needed.

## Audience
1. **Core:** Windows developers running multiple AI coding agents.
2. **Adjacent:** Solo builders, agency developers and engineering leads reviewing parallel tasks.
3. **Future:** Windows power users interested in GPU/FPS without introducing noise into the developer experience.

## Promise
*Know what needs your attention without constantly checking.* Halo makes it immediately clear which sessions are running, what changed, whether evidence supports completion, and what resource pressure could disrupt work.

## Voice and copy
- Concise and technical without jargon theater.
- Helpful, calm, direct. Never shout with unnecessary animations, all caps, or FOMO language.
- Show limitations honestly: "Not available" or "No verification yet" rather than fake precision.
- Avoid saying "Verified" unless corresponding test/diff evidence is present.
- Do not say "Your agents are done" for a single Claude Stop event: it only indicates the response stopped.

Examples:
- Good: "Claude needs approval · 1 request"
- Good: "2 tests failed · Review results"
- Good: "Context data unavailable for this provider"
- Avoid: "AI agents optimized to perfection!"
- Avoid: "Full agent control" when only read-only lifecycle data exists.

## Logo concept
The **Halo Reticle** uses mathematically concentric polar geometry around `(48, 48)` on a `96×96` grid:
- **Outer Orbital Arc (`R = 32`):** A `312°` clockwise contour from `-6°` (`79.82, 44.66`) to `-54°` (`66.81, 22.11`), leaving a `48°` upper-right sentinel aperture centered at `-30°`.
- **Inner Datum Arc (`R = 19`):** A `60°` concentric balance arc (`195°` to `255°`) across the upper-left quadrant (`29.65, 43.08` to `43.08, 29.65`).
- **Sentinel Node (`r = 5.25`):** Seated cleanly at `(75.71, 32.00)` on the `R = 32` orbit inside the aperture with `5.06 px` of symmetrical clearance from both stroke caps.
- **Workspace Core (`r = 8.5`):** Centered at `(48, 48)`. It is original vector work, deliberately **not** an Apple notch silhouette.

### Brand asset files
- `assets/brand/halo-mark.svg` — scalable dark/light-friendly vector symbol.
- `assets/brand/halo-logo-horizontal-dark.svg` — white/green horizontal lockup on dark ground.
- `assets/brand/halo-logo-horizontal-light.svg` — dark lockup for white backgrounds.
- `assets/brand/halo-monochrome.svg` — solid-color artwork for high contrast contexts.
- `src-tauri/icons/icon.png` and `icon.ico` — starter raster app icons for Windows builds.
- `assets/mockups/halo-brand-board.svg` — editable overview presentation board.

### Safe usage
Minimum symbol size: 20 px for ordinary UI, 16 px only after small-size QA. Preserve roughly 25% of mark diameter as clear space. Do not stretch, apply heavy gradient glow, rotate, add bevels, or place on busy photography. Always make the accent discernible or use the mono version.

## Product positioning
STXIC Halo is a local-first Windows companion for the outcomes of AI-assisted development, not just a floating status widget. The long-term differentiator is Proof-of-Work and Agent Risk Radar. Both are planned, not implemented in v0.1.

## Naming cautions
STXIC Halo may be unique as a combination but has not received trademark clearance. Before a public release, search the relevant trademark classes/territories, Microsoft's Store name inventory, domains and GitHub usernames. Do not use Apple's marks or imply affiliation with Apple, Anthropic or OpenAI.
