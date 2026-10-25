"""Rebuild editable SVG brand assets, technical specification boards, and PNG/ICO icons.

Uses exact concentric polar geometry around (48, 48) on a 96x96 grid:
- Outer orbital arc: R=32, 312 deg span from -6 deg (79.82, 44.66) to -54 deg (66.81, 22.11)
- Inner datum arc: R=19, 60 deg span from 195 deg (29.65, 43.08) to 255 deg (43.08, 29.65)
- Sentinel node: r=5.25 at -30 deg (75.71, 32.00) on the R=32 orbit
- Workspace core: r=8.5 at (48.00, 48.00)
"""
from pathlib import Path
import io
import math
from PIL import Image, ImageDraw, ImageFont

try:
    import cairosvg  # type: ignore
    HAS_CAIRO = True
except Exception:
    HAS_CAIRO = False

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "assets/brand"
MOCKS = ROOT / "assets/mockups"
ICONS = ROOT / "src-tauri/icons"
PUBLIC = ROOT / "public"

for path in (BRAND, MOCKS, ICONS, PUBLIC):
    path.mkdir(parents=True, exist_ok=True)


def reticle_paths(stroke: str, accent: str) -> str:
    return (
        f'<path d="M 79.82 44.66 A 32 32 0 1 1 66.81 22.11" stroke="{stroke}" stroke-width="6.5" stroke-linecap="round" fill="none"/>'
        f'<path d="M 29.65 43.08 A 19 19 0 0 1 43.08 29.65" stroke="{accent}" stroke-width="3.5" stroke-linecap="round" fill="none"/>'
        f'<circle cx="75.71" cy="32" r="5.25" fill="{accent}"/>'
        f'<circle cx="48" cy="48" r="8.5" fill="{stroke}"/>'
    )


def svg_doc(width: int, height: int, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" fill="none">\n{body}\n</svg>\n'
    )


# 1. Core Mark & Monochrome Mark
mark_dark_svg = svg_doc(96, 96, reticle_paths("#F3F6F5", "#B5F5CD"))
mark_mono_svg = svg_doc(96, 96, reticle_paths("#0F1418", "#0F1418"))

(BRAND / "halo-mark.svg").write_text(mark_dark_svg, encoding="utf-8")
(PUBLIC / "halo-mark.svg").write_text(mark_dark_svg, encoding="utf-8")
(BRAND / "halo-monochrome.svg").write_text(mark_mono_svg, encoding="utf-8")

# 2. Horizontal Lockups (single <text> with <tspan> to guarantee zero glyph collision across OS fonts)
for variant, bg, border, fg, accent, sub in [
    ("dark", "#0B0E12", "#222B31", "#F3F6F5", "#B5F5CD", "#7A8B90"),
    ("light", "#F3F6F5", "#D5DFDC", "#0F1418", "#237B4B", "#526367"),
]:
    icon_markup = reticle_paths(fg, accent)
    lockup_body = f"""  <rect x="1" y="1" width="578" height="158" rx="24" fill="{bg}" stroke="{border}" stroke-width="2"/>
  <g transform="translate(32, 32)">
    {icon_markup}
  </g>
  <line x1="144" y1="44" x2="144" y2="116" stroke="{border}" stroke-width="1.5"/>
  <text x="168" y="96" font-family="'Segoe UI Variable Display', 'Segoe UI', Inter, system-ui, sans-serif" font-size="56" letter-spacing="-2.2">
    <tspan fill="{fg}" font-weight="700">stxic</tspan><tspan fill="{accent}" font-weight="500">halo</tspan>
  </text>
  <text x="170" y="122" font-family="'Cascadia Mono', 'Consolas', monospace" font-size="11" letter-spacing="1.8" fill="{sub}">LOCAL AGENT &amp; SYSTEM SENTINEL</text>"""
    (BRAND / f"halo-logo-horizontal-{variant}.svg").write_text(
        svg_doc(580, 160, lockup_body), encoding="utf-8"
    )

# 3. Main App Icon (512x512 Windows squircle with precision instrument bezel)
app_icon_body = f"""  <rect x="16" y="16" width="480" height="480" rx="108" fill="#0B0E12" stroke="#263238" stroke-width="8"/>
  <circle cx="256" cy="256" r="184" fill="#11181E" stroke="#1E2930" stroke-width="3"/>
  <circle cx="256" cy="256" r="122" stroke="#1B262C" stroke-width="2" stroke-dasharray="6 8"/>
  <g transform="translate(76.8, 76.8) scale(3.7333)">
    {reticle_paths('#F3F6F5', '#B5F5CD')}
  </g>"""
app_icon_svg = svg_doc(512, 512, app_icon_body)
(BRAND / "halo-app-icon.svg").write_text(app_icon_svg, encoding="utf-8")


# 4. Brand Specification Sheet (assets/mockups/halo-brand-board.svg)
board_body = f"""  <defs>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#151D22" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1600" height="1020" fill="#0B0E12"/>
  <rect width="1600" height="1020" fill="url(#grid)"/>

  <!-- Header bar -->
  <line x1="72" y1="88" x2="1528" y2="88" stroke="#222C32" stroke-width="1"/>
  <text x="72" y="64" font-family="'Cascadia Mono', Consolas, monospace" font-size="13" letter-spacing="1.5" fill="#8A9B9E">STXIC HALO // DESIGN SPECIFICATION SHEET v1.1</text>
  <text x="1528" y="64" text-anchor="end" font-family="'Cascadia Mono', Consolas, monospace" font-size="13" fill="#B5F5CD">96×96 CONCENTRIC RETICLE</text>

  <!-- Left column: Identity & Construction Geometry -->
  <text x="72" y="156" font-family="'Segoe UI Variable Display', 'Segoe UI', sans-serif" font-size="56" font-weight="700" letter-spacing="-2.2" fill="#F3F6F5">stxic<tspan fill="#B5F5CD" font-weight="500">halo</tspan></text>
  <text x="72" y="192" font-family="'Segoe UI', sans-serif" font-size="18" fill="#95A5A8">Top-edge Windows instrument for local AI agent sessions &amp; machine telemetry.</text>

  <!-- Geometric Construction Blueprint Card -->
  <rect x="72" y="228" width="680" height="410" rx="16" fill="#11161B" stroke="#263138"/>
  <text x="100" y="264" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" letter-spacing="1.2" fill="#8E9FA3">01 / ORBITAL RETICLE GEOMETRY (CENTER 48, 48)</text>

  <!-- Blueprint diagram inside card -->
  <g transform="translate(120, 290) scale(3.1)">
    <rect x="0" y="0" width="96" height="96" fill="#0B0E12" stroke="#222D33" stroke-width="0.5"/>
    <line x1="48" y1="0" x2="48" y2="96" stroke="#1E2930" stroke-width="0.4" stroke-dasharray="2 2"/>
    <line x1="0" y1="48" x2="96" y2="48" stroke="#1E2930" stroke-width="0.4" stroke-dasharray="2 2"/>
    <circle cx="48" cy="48" r="32" stroke="#24343B" stroke-width="0.4" stroke-dasharray="1.5 1.5"/>
    <circle cx="48" cy="48" r="19" stroke="#24343B" stroke-width="0.4" stroke-dasharray="1.5 1.5"/>
    <line x1="48" y1="48" x2="75.71" y2="32" stroke="#365947" stroke-width="0.5" stroke-dasharray="1.5 1.5"/>
    {reticle_paths('#F3F6F5', '#B5F5CD')}
  </g>

  <!-- Callout specs on right of blueprint -->
  <g font-family="'Cascadia Mono', Consolas, monospace" font-size="13" fill="#C7D4D6">
    <text x="456" y="332" fill="#B5F5CD" font-weight="700">OUTER ORBIT (R = 32)</text>
    <text x="456" y="354" fill="#8E9FA3" font-size="12">312° arc · stroke 6.5px</text>
    <text x="456" y="372" fill="#8E9FA3" font-size="12">Aperture: 48° at θ = -30°</text>

    <text x="456" y="420" fill="#B5F5CD" font-weight="700">INNER DATUM (R = 19)</text>
    <text x="456" y="442" fill="#8E9FA3" font-size="12">60° arc (195° → 255°)</text>
    <text x="456" y="460" fill="#8E9FA3" font-size="12">Balances upper-left mass</text>

    <text x="456" y="508" fill="#B5F5CD" font-weight="700">SENTINEL NODE (r = 5.25)</text>
    <text x="456" y="530" fill="#8E9FA3" font-size="12">Seated at (75.71, 32.00)</text>
    <text x="456" y="548" fill="#8E9FA3" font-size="12">5.06px cap clearance</text>

    <text x="456" y="592" fill="#F3F6F5" font-weight="700">CORE (r = 8.5 at 48,48)</text>
  </g>

  <!-- Right column: Semantic Palette & Contrast Tokens -->
  <rect x="784" y="116" width="744" height="522" rx="16" fill="#11161B" stroke="#263138"/>
  <text x="812" y="152" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" letter-spacing="1.2" fill="#8E9FA3">02 / SURFACE &amp; SIGNAL TOKENS (WCAG AA/AAA VERIFIED)</text>

  <g font-family="'Segoe UI', sans-serif">
    <rect x="812" y="176" width="220" height="136" rx="12" fill="#0B0E12" stroke="#2A353B"/>
    <text x="828" y="274" font-size="15" font-weight="600" fill="#F3F6F5">Obsidian Canvas</text>
    <text x="828" y="295" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" fill="#8E9FA3">--bg #0B0E12</text>

    <rect x="1046" y="176" width="220" height="136" rx="12" fill="#141A1F" stroke="#2A353B"/>
    <text x="1062" y="274" font-size="15" font-weight="600" fill="#F3F6F5">Instrument Panel</text>
    <text x="1062" y="295" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" fill="#8E9FA3">--panel #141A1F</text>

    <rect x="1280" y="176" width="220" height="136" rx="12" fill="#F3F6F5"/>
    <text x="1296" y="274" font-size="15" font-weight="600" fill="#0B0E12">Primary Readout</text>
    <text x="1296" y="295" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" fill="#374549">--text #F3F6F5 (17.4:1)</text>

    <rect x="812" y="330" width="220" height="136" rx="12" fill="#B5F5CD"/>
    <text x="828" y="428" font-size="15" font-weight="600" fill="#0B0E12">Nominal / Active</text>
    <text x="828" y="449" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" fill="#1E3F2B">--mint #B5F5CD (14.8:1)</text>

    <rect x="1046" y="330" width="220" height="136" rx="12" fill="#F5C875"/>
    <text x="1062" y="428" font-size="15" font-weight="600" fill="#0B0E12">Attention / Blocked</text>
    <text x="1062" y="449" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" fill="#47330E">--amber #F5C875 (12.1:1)</text>

    <rect x="1280" y="330" width="220" height="136" rx="12" fill="#F28B8F"/>
    <text x="1296" y="428" font-size="15" font-weight="600" fill="#0B0E12">Failed Verification</text>
    <text x="1296" y="449" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" fill="#4A1518">--coral #F28B8F (8.6:1)</text>
  </g>

  <text x="812" y="508" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" fill="#8E9FA3">SMALL-SCALE LEGIBILITY BENCHMARK: 48px / 28px / 20px / 16px</text>
  <g transform="translate(812, 526) scale(0.5)">{reticle_paths('#F3F6F5', '#B5F5CD')}</g>
  <g transform="translate(888, 536) scale(0.2916)">{reticle_paths('#F3F6F5', '#B5F5CD')}</g>
  <g transform="translate(944, 540) scale(0.2083)">{reticle_paths('#F3F6F5', '#B5F5CD')}</g>
  <g transform="translate(988, 542) scale(0.1667)">{reticle_paths('#F3F6F5', '#B5F5CD')}</g>
  <text x="1032" y="555" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" fill="#9FB0B3">Non-notched floating capsule · Tabular numerals · Always pairs color with text label</text>

  <!-- Bottom Row: Top-Edge Capsule State Specimens -->
  <rect x="72" y="668" width="1456" height="280" rx="16" fill="#11161B" stroke="#263138"/>
  <text x="100" y="706" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" letter-spacing="1.2" fill="#8E9FA3">03 / TOP-EDGE CAPSULE STATES (1:1 PROPORTION SPECIMENS)</text>

  <!-- Capsule 1: Nominal Working -->
  <rect x="100" y="736" width="680" height="64" rx="18" fill="#0B0E12" stroke="#2B383E" stroke-width="1.5"/>
  <g transform="translate(118, 752) scale(0.3333)">{reticle_paths('#F3F6F5', '#B5F5CD')}</g>
  <text x="164" y="773" font-family="'Segoe UI', sans-serif" font-size="16" font-weight="600" fill="#F3F6F5">2 sessions working</text>
  <text x="320" y="773" font-family="'Cascadia Mono', Consolas, monospace" font-size="13" fill="#8E9FA3">portfolio-app · Bash</text>
  <rect x="524" y="752" width="124" height="32" rx="8" fill="#141E1B" stroke="#284235"/>
  <text x="586" y="773" text-anchor="middle" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" fill="#B5F5CD">CPU 28% · 7.4G</text>
  <circle cx="752" cy="768" r="5" fill="#B5F5CD"/>

  <!-- Capsule 2: Blocked / Needs Review -->
  <rect x="816" y="736" width="680" height="64" rx="18" fill="#0B0E12" stroke="#594526" stroke-width="1.5"/>
  <g transform="translate(834, 752) scale(0.3333)">{reticle_paths('#F3F6F5', '#F5C875')}</g>
  <text x="880" y="773" font-family="'Segoe UI', sans-serif" font-size="16" font-weight="600" fill="#F3F6F5">Claude awaiting review</text>
  <text x="1064" y="773" font-family="'Cascadia Mono', Consolas, monospace" font-size="13" fill="#D5B887">2 tests failed · 8 files Δ</text>
  <rect x="1296" y="752" width="176" height="32" rx="8" fill="#2A2115" stroke="#634C27"/>
  <text x="1384" y="773" text-anchor="middle" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" font-weight="600" fill="#F5C875">PERMISSION REQUEST</text>

  <!-- Footer annotation -->
  <text x="100" y="852" font-family="'Segoe UI', sans-serif" font-size="16" font-weight="600" fill="#E3ECEA">Design discipline: specificity over decoration.</text>
  <text x="100" y="880" font-family="'Segoe UI', sans-serif" font-size="14" fill="#8E9FA3">No marketing slogans inside operational tabs. Every badge reflects a real local hook event or sysinfo reading.</text>
  <text x="1496" y="880" text-anchor="end" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" fill="#6F8185">STXIC // 2026</text>"""

(MOCKS / "halo-brand-board.svg").write_text(
    svg_doc(1600, 1020, board_body), encoding="utf-8"
)


# 5. Anatomical Product Specimen (assets/mockups/halo-hero.svg)
hero_body = f"""  <defs>
    <pattern id="hgrid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#141C21" stroke-width="1"/>
    </pattern>
    <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#13191F"/>
      <stop offset="100%" stop-color="#0D1217"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="780" rx="20" fill="#090C10" stroke="#222C32" stroke-width="2"/>
  <rect x="2" y="2" width="1196" height="776" rx="18" fill="url(#hgrid)"/>

  <!-- Simulated Windows 11 Display Top Edge & IDE Background Context -->
  <rect x="24" y="20" width="1152" height="34" rx="8" fill="#10151A" stroke="#1E272E"/>
  <text x="44" y="41" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#68787D">WIN11 DISPLAY TOP-EDGE // WORKSPACE: C:\\Projects\\portfolio-app</text>
  <text x="1156" y="41" text-anchor="end" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#8A9B9E">LOCAL JSONL BRIDGE · 2.5s POLL</text>

  <!-- Left Specimen: Collapsed Top-Edge Capsule (1:1 Concept) -->
  <text x="48" y="96" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" letter-spacing="1.4" fill="#8E9FA3">STATE A // COLLAPSED TOP-EDGE HUD (440×54px)</text>
  <rect x="48" y="112" width="460" height="58" rx="16" fill="#0E1419" stroke="#574426" stroke-width="1.5"/>
  <g transform="translate(64, 125) scale(0.3333)">{reticle_paths('#F3F6F5', '#F5C875')}</g>
  <text x="108" y="139" font-family="'Segoe UI', sans-serif" font-size="14" font-weight="600" fill="#F3F6F5">1 session awaiting review</text>
  <text x="108" y="156" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#95A5A8">Claude Code · portfolio-app</text>
  <rect x="332" y="126" width="116" height="30" rx="8" fill="#272015" stroke="#5E4826"/>
  <text x="390" y="145" text-anchor="middle" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" font-weight="600" fill="#F5C875">2 FAIL · 28% CPU</text>
  <path d="M 474 138 L 480 144 L 486 138" stroke="#8E9FA3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- Event Pipeline Schematic under Collapsed Specimen -->
  <rect x="48" y="204" width="460" height="252" rx="14" fill="#10161B" stroke="#222D34"/>
  <text x="72" y="236" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" letter-spacing="1.2" fill="#B5F5CD">LOCAL TELEMETRY &amp; HOOK PIPELINE</text>

  <rect x="72" y="256" width="412" height="50" rx="9" fill="#0B0E12" stroke="#243037"/>
  <text x="88" y="278" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" font-weight="600" fill="#F3F6F5">1. scripts/claude-hook.ps1</text>
  <text x="88" y="295" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#86979B">Opt-in hook · No prompt or transcript capture</text>

  <rect x="72" y="320" width="412" height="50" rx="9" fill="#0B0E12" stroke="#243037"/>
  <text x="88" y="342" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" font-weight="600" fill="#F3F6F5">2. %LOCALAPPDATA%\\STXICHalo\\events.jsonl</text>
  <text x="88" y="359" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#86979B">Bounded tail reader · PermissionRequest / PostToolUse / Stop</text>

  <rect x="72" y="384" width="412" height="50" rx="9" fill="#0B0E12" stroke="#243037"/>
  <text x="88" y="406" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" font-weight="600" fill="#F3F6F5">3. Rust sysinfo + Verification Ledger</text>
  <text x="88" y="423" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#86979B">Separates "response stopped" from verified test/git evidence</text>

  <!-- Provenance & Honesty Callout Card -->
  <rect x="48" y="480" width="460" height="252" rx="14" fill="#10161B" stroke="#222D34"/>
  <text x="72" y="512" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" letter-spacing="1.2" fill="#8E9FA3">SIGNAL INTEGRITY GUARANTEES</text>
  <g font-family="'Segoe UI', sans-serif" font-size="13" fill="#C7D4D6">
    <circle cx="78" cy="544" r="4" fill="#B5F5CD"/>
    <text x="94" y="549"><tspan font-weight="600" fill="#F3F6F5">Zero fabricated metrics:</tspan> missing context shows as —</text>
    <circle cx="78" cy="582" r="4" fill="#F5C875"/>
    <text x="94" y="587"><tspan font-weight="600" fill="#F3F6F5">Explicit verification state:</tspan> Stop ≠ tests passing</text>
    <circle cx="78" cy="620" r="4" fill="#9DBFFD"/>
    <text x="94" y="625"><tspan font-weight="600" fill="#F3F6F5">100% offline execution:</tspan> zero cloud telemetry</text>
    <circle cx="78" cy="658" r="4" fill="#F28B8F"/>
    <text x="94" y="663"><tspan font-weight="600" fill="#F3F6F5">Sample vs Live labeling:</tspan> prototype fixtures badged</text>
  </g>
  <text x="72" y="706" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#6F8185">CONCEPT SPECIMEN // SIMULATED DEMO SESSION DATA</text>

  <!-- Right Specimen: Expanded Telemetry Console -->
  <text x="548" y="96" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" letter-spacing="1.4" fill="#8E9FA3">STATE B // EXPANDED TELEMETRY CONSOLE</text>
  <rect x="548" y="112" width="604" height="620" rx="20" fill="url(#panelGrad)" stroke="#2E3B42" stroke-width="1.5"/>

  <!-- Console Header -->
  <g transform="translate(572, 132) scale(0.3125)">{reticle_paths('#F3F6F5', '#B5F5CD')}</g>
  <text x="612" y="150" font-family="'Segoe UI Variable Display', 'Segoe UI', sans-serif" font-size="17" font-weight="700" fill="#F3F6F5">stxic<tspan fill="#B5F5CD" font-weight="500">halo</tspan></text>
  <text x="696" y="150" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#829397">LOCAL SENTINEL</text>
  <rect x="1012" y="133" width="92" height="24" rx="6" fill="#262118" stroke="#5B4829"/>
  <text x="1058" y="149" text-anchor="middle" font-family="'Cascadia Mono', Consolas, monospace" font-size="10" font-weight="600" fill="#F5C875">DEMO FIXTURE</text>
  <rect x="1112" y="133" width="24" height="24" rx="6" fill="#1B242A" stroke="#2D3940"/>
  <path d="M 1119 147 L 1124 142 L 1129 147" stroke="#C5D2D4" stroke-width="1.6" stroke-linecap="round"/>

  <!-- Console Navigation Bar -->
  <line x1="548" y1="172" x2="1152" y2="172" stroke="#222D33"/>
  <rect x="568" y="182" width="136" height="32" rx="7" fill="#1B2B24" stroke="#2F4D3E"/>
  <text x="636" y="202" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-size="12" font-weight="600" fill="#B5F5CD">Overview</text>
  <text x="776" y="202" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-size="12" fill="#8E9FA3">Evidence (2)</text>
  <text x="916" y="202" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-size="12" fill="#8E9FA3">System</text>
  <text x="1056" y="202" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-size="12" fill="#8E9FA3">Hooks</text>
  <line x1="548" y1="224" x2="1152" y2="224" stroke="#222D33"/>

  <!-- Blocking Action Alert -->
  <rect x="572" y="242" width="556" height="104" rx="12" fill="#231D15" stroke="#5E4827"/>
  <circle cx="594" cy="266" r="5" fill="#F5C875"/>
  <text x="608" y="270" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" font-weight="700" fill="#F5C875">ACTION REQUIRED · PERMISSION REQUEST</text>
  <text x="1108" y="270" text-anchor="end" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#B8A382">portfolio-app</text>
  <text x="594" y="296" font-family="'Segoe UI', sans-serif" font-size="14" font-weight="600" fill="#F3F6F5">Claude Code paused on Bash · 2 sample tests failed</text>
  <text x="594" y="320" font-family="'Cascadia Mono', Consolas, monospace" font-size="12" fill="#C4B399">8 files Δ · 6 passed · 2 failed (unverified fixture)</text>
  <rect x="992" y="302" width="118" height="28" rx="6" fill="#3A2E1D" stroke="#6E5530"/>
  <text x="1051" y="320" text-anchor="middle" font-family="'Segoe UI', sans-serif" font-size="11" font-weight="600" fill="#F5D9A0">Inspect diff →</text>

  <!-- Active Sessions Ledger Header -->
  <text x="572" y="376" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" letter-spacing="1" fill="#8E9FA3">ACTIVE SESSIONS (2)</text>
  <text x="1128" y="376" text-anchor="end" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#8E9FA3">CONTEXT / TOKENS</text>

  <!-- Session Row 1 -->
  <rect x="572" y="388" width="556" height="96" rx="12" fill="#151C22" stroke="#28343B"/>
  <rect x="588" y="404" width="64" height="22" rx="5" fill="#2A242D"/>
  <text x="620" y="419" text-anchor="middle" font-family="'Cascadia Mono', Consolas, monospace" font-size="10" font-weight="600" fill="#F5B48B">CLAUDE</text>
  <text x="664" y="419" font-family="'Segoe UI', sans-serif" font-size="14" font-weight="600" fill="#F3F6F5">Authentication refactor</text>
  <text x="1112" y="419" text-anchor="end" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#F5C875">● Awaiting review</text>
  <text x="588" y="444" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#8E9FA3">cwd: C:\\Projects\\portfolio-app · event: PermissionRequest (Bash)</text>
  <rect x="588" y="458" width="340" height="6" rx="3" fill="#263137"/>
  <rect x="588" y="458" width="231" height="6" rx="3" fill="#F5C875"/>
  <text x="942" y="465" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#D5E0E2">68% ctx · 18,420 tok</text>

  <!-- Session Row 2 -->
  <rect x="572" y="496" width="556" height="96" rx="12" fill="#151C22" stroke="#28343B"/>
  <rect x="588" y="512" width="64" height="22" rx="5" fill="#1D2A3A"/>
  <text x="620" y="527" text-anchor="middle" font-family="'Cascadia Mono', Consolas, monospace" font-size="10" font-weight="600" fill="#9DBFFD">CODEX</text>
  <text x="664" y="527" font-family="'Segoe UI', sans-serif" font-size="14" font-weight="600" fill="#F3F6F5">Optimizing database queries</text>
  <text x="1112" y="527" text-anchor="end" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#B5F5CD">● Working</text>
  <text x="588" y="552" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#8E9FA3">cwd: C:\\Projects\\portfolio-app · adapter: preview fixture</text>
  <rect x="588" y="566" width="340" height="6" rx="3" fill="#263137"/>
  <rect x="588" y="566" width="143" height="6" rx="3" fill="#B5F5CD"/>
  <text x="942" y="573" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#D5E0E2">42% ctx · 8,260 tok</text>

  <!-- Local Host Telemetry Readout Bar -->
  <rect x="572" y="610" width="178" height="68" rx="10" fill="#13191F" stroke="#253037"/>
  <text x="588" y="632" font-family="'Cascadia Mono', Consolas, monospace" font-size="10" fill="#8E9FA3">HOST CPU LOAD</text>
  <text x="588" y="660" font-family="'Cascadia Mono', Consolas, monospace" font-size="20" font-weight="700" fill="#F3F6F5">28%</text>
  <text x="650" y="660" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#9DBFFD">nominal</text>

  <rect x="761" y="610" width="178" height="68" rx="10" fill="#13191F" stroke="#253037"/>
  <text x="777" y="632" font-family="'Cascadia Mono', Consolas, monospace" font-size="10" fill="#8E9FA3">MEMORY COMMIT</text>
  <text x="777" y="660" font-family="'Cascadia Mono', Consolas, monospace" font-size="20" font-weight="700" fill="#F3F6F5">7.4 GiB</text>
  <text x="866" y="660" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#8E9FA3">/ 16.0 (46%)</text>

  <rect x="950" y="610" width="178" height="68" rx="10" fill="#13191F" stroke="#253037"/>
  <text x="966" y="632" font-family="'Cascadia Mono', Consolas, monospace" font-size="10" fill="#8E9FA3">PROCESS TABLE</text>
  <text x="966" y="660" font-family="'Cascadia Mono', Consolas, monospace" font-size="20" font-weight="700" fill="#F3F6F5">192</text>
  <text x="1018" y="660" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#8E9FA3">active procs</text>

  <!-- Console Footer -->
  <line x1="548" y1="694" x2="1152" y2="694" stroke="#222D33"/>
  <circle cx="576" cy="712" r="4" fill="#B5F5CD"/>
  <text x="588" y="716" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#8E9FA3">events.jsonl bridge ready · Esc to collapse</text>
  <text x="1128" y="716" text-anchor="end" font-family="'Cascadia Mono', Consolas, monospace" font-size="11" fill="#B5F5CD">LOCAL-ONLY</text>"""

(MOCKS / "halo-hero.svg").write_text(svg_doc(1200, 780, hero_body), encoding="utf-8")


def load_font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (
        f"C:/Windows/Fonts/{name}",
        "C:/Windows/Fonts/segoeui.ttf",
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def draw_reticle_on(
    draw: ImageDraw.ImageDraw,
    origin_x: float,
    origin_y: float,
    box_size: float,
    stroke_col: tuple[int, int, int, int],
    accent_col: tuple[int, int, int, int],
) -> None:
    sc = box_size / 96.0
    cx = origin_x + 48.0 * sc
    cy = origin_y + 48.0 * sc

    def arc(radius: float, deg0: float, deg1: float, w: float, col: tuple[int, int, int, int]) -> None:
        steps = 200
        rw = (w * sc) / 2.0
        r_px = radius * sc
        for i in range(steps + 1):
            ang = math.radians(deg0 + (deg1 - deg0) * (i / steps))
            x = cx + r_px * math.cos(ang)
            y = cy + r_px * math.sin(ang)
            draw.ellipse([x - rw, y - rw, x + rw, y + rw], fill=col)

    arc(32.0, -6.0, 306.0, 6.5, stroke_col)
    arc(19.0, 195.0, 255.0, 3.5, accent_col)
    sx, sy, sr = origin_x + 75.71 * sc, origin_y + 32.0 * sc, 5.25 * sc
    draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=accent_col)
    cr = 8.5 * sc
    draw.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=stroke_col)


def render_app_icon_pil(size: int = 512) -> Image.Image:
    scale = 4
    S = size * scale
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def px(val: float) -> float:
        return val * (S / 512.0)

    draw.rounded_rectangle(
        [px(16), px(16), px(496), px(496)],
        radius=int(px(108)),
        fill=(11, 14, 18, 255),
        outline=(38, 50, 56, 255),
        width=int(px(8)),
    )
    draw.ellipse(
        [px(256 - 184), px(256 - 184), px(256 + 184), px(256 + 184)],
        fill=(17, 24, 30, 255),
        outline=(30, 41, 48, 255),
        width=int(px(3)),
    )
    draw_reticle_on(
        draw,
        px(76.8),
        px(76.8),
        px(96 * 3.733333),
        (243, 246, 245, 255),
        (181, 245, 205, 255),
    )
    return img.resize((size, size), Image.Resampling.LANCZOS)


def render_brand_board_pil() -> Image.Image:
    img = Image.new("RGBA", (1600, 1020), (11, 14, 18, 255))
    draw = ImageDraw.Draw(img)
    for x in range(0, 1600, 32):
        draw.line([(x, 0), (x, 1020)], fill=(21, 29, 34, 255), width=1)
    for y in range(0, 1020, 32):
        draw.line([(0, y), (1600, y)], fill=(21, 29, 34, 255), width=1)

    f_mono_sm = load_font("CascadiaMono.ttf", 13)
    f_mono_xs = load_font("CascadiaMono.ttf", 12)
    f_title = load_font("segoeuib.ttf", 52)
    f_sub = load_font("segoeui.ttf", 18)
    f_card_b = load_font("segoeuib.ttf", 16)

    draw.line([(72, 88), (1528, 88)], fill=(34, 44, 50, 255), width=1)
    draw.text((72, 52), "STXIC HALO // DESIGN SPECIFICATION SHEET v1.1", font=f_mono_sm, fill=(138, 155, 158, 255))
    draw.text((1260, 52), "96x96 CONCENTRIC RETICLE", font=f_mono_sm, fill=(181, 245, 205, 255))

    draw.text((72, 112), "stxic", font=f_title, fill=(243, 246, 245, 255))
    draw.text((196, 112), "halo", font=f_title, fill=(181, 245, 205, 255))
    draw.text((72, 182), "Top-edge Windows instrument for local AI agent sessions & machine telemetry.", font=f_sub, fill=(149, 165, 168, 255))

    # Left card: Reticle Blueprint
    draw.rounded_rectangle([72, 228, 752, 638], radius=16, fill=(17, 22, 27, 255), outline=(38, 49, 56, 255), width=1)
    draw.text((100, 252), "01 / ORBITAL RETICLE GEOMETRY (CENTER 48, 48)", font=f_mono_xs, fill=(142, 159, 163, 255))
    draw.rectangle([120, 290, 418, 588], fill=(11, 14, 18, 255), outline=(34, 45, 51, 255), width=1)
    draw_reticle_on(draw, 120, 290, 298, (243, 246, 245, 255), (181, 245, 205, 255))

    draw.text((450, 315), "OUTER ORBIT (R = 32)", font=f_mono_sm, fill=(181, 245, 205, 255))
    draw.text((450, 340), "312 deg arc · stroke 6.5px", font=f_mono_xs, fill=(142, 159, 163, 255))
    draw.text((450, 360), "Aperture: 48 deg at -30 deg", font=f_mono_xs, fill=(142, 159, 163, 255))
    draw.text((450, 410), "INNER DATUM (R = 19)", font=f_mono_sm, fill=(181, 245, 205, 255))
    draw.text((450, 435), "60 deg arc (195 -> 255 deg)", font=f_mono_xs, fill=(142, 159, 163, 255))
    draw.text((450, 490), "SENTINEL NODE (r = 5.25)", font=f_mono_sm, fill=(181, 245, 205, 255))
    draw.text((450, 515), "Seated at (75.71, 32.00)", font=f_mono_xs, fill=(142, 159, 163, 255))
    draw.text((450, 565), "CORE (r = 8.5 at 48, 48)", font=f_mono_sm, fill=(243, 246, 245, 255))

    # Right card: Tokens
    draw.rounded_rectangle([784, 116, 1528, 638], radius=16, fill=(17, 22, 27, 255), outline=(38, 49, 56, 255), width=1)
    draw.text((812, 140), "02 / SURFACE & SIGNAL TOKENS (WCAG AA/AAA VERIFIED)", font=f_mono_xs, fill=(142, 159, 163, 255))
    swatches = [
        (812, 176, (11, 14, 18, 255), "Obsidian Canvas", "--bg #0B0E12", (243, 246, 245, 255)),
        (1046, 176, (20, 26, 31, 255), "Instrument Panel", "--panel #141A1F", (243, 246, 245, 255)),
        (1280, 176, (243, 246, 245, 255), "Primary Readout", "--text #F3F6F5", (11, 14, 18, 255)),
        (812, 330, (181, 245, 205, 255), "Nominal / Active", "--mint #B5F5CD", (11, 14, 18, 255)),
        (1046, 330, (245, 200, 117, 255), "Attention / Blocked", "--amber #F5C875", (11, 14, 18, 255)),
        (1280, 330, (242, 139, 143, 255), "Failed Verification", "--coral #F28B8F", (11, 14, 18, 255)),
    ]
    for sx, sy, col, name, hex_str, fg in swatches:
        draw.rounded_rectangle([sx, sy, sx + 220, sy + 136], radius=12, fill=col, outline=(42, 53, 59, 255))
        draw.text((sx + 16, sy + 78), name, font=f_card_b, fill=fg)
        draw.text((sx + 16, sy + 104), hex_str, font=f_mono_xs, fill=fg)

    # Bottom row: Capsule specimens
    draw.rounded_rectangle([72, 668, 1528, 948], radius=16, fill=(17, 22, 27, 255), outline=(38, 49, 56, 255), width=1)
    draw.text((100, 694), "03 / TOP-EDGE CAPSULE STATES (1:1 PROPORTION SPECIMENS)", font=f_mono_xs, fill=(142, 159, 163, 255))
    draw.rounded_rectangle([100, 736, 780, 800], radius=16, fill=(11, 14, 18, 255), outline=(43, 56, 62, 255), width=2)
    draw_reticle_on(draw, 116, 752, 32, (243, 246, 245, 255), (181, 245, 205, 255))
    draw.text((164, 757), "2 sessions working", font=f_card_b, fill=(243, 246, 245, 255))
    draw.text((336, 760), "portfolio-app · CPU 28% · 7.4G", font=f_mono_xs, fill=(181, 245, 205, 255))

    draw.rounded_rectangle([816, 736, 1496, 800], radius=16, fill=(11, 14, 18, 255), outline=(89, 69, 38, 255), width=2)
    draw_reticle_on(draw, 832, 752, 32, (243, 246, 245, 255), (245, 200, 117, 255))
    draw.text((880, 757), "Claude awaiting review", font=f_card_b, fill=(243, 246, 245, 255))
    draw.text((1084, 760), "2 tests failed · PERMISSION REQUEST", font=f_mono_xs, fill=(245, 200, 117, 255))
    draw.text((100, 845), "Design discipline: specificity over decoration. No marketing slogans inside operational tabs.", font=f_sub, fill=(227, 236, 234, 255))
    return img


def render_hero_pil() -> Image.Image:
    img = Image.new("RGBA", (1200, 780), (9, 12, 16, 255))
    draw = ImageDraw.Draw(img)
    for x in range(0, 1200, 28):
        draw.line([(x, 0), (x, 780)], fill=(20, 28, 33, 255), width=1)
    for y in range(0, 780, 28):
        draw.line([(0, y), (1200, y)], fill=(20, 28, 33, 255), width=1)

    f_mono = load_font("CascadiaMono.ttf", 11)
    f_mono_b = load_font("CascadiaMono.ttf", 12)
    f_ui_b = load_font("segoeuib.ttf", 14)
    f_ui = load_font("segoeui.ttf", 13)
    f_stat = load_font("segoeuib.ttf", 20)

    draw.rounded_rectangle([24, 20, 1176, 54], radius=8, fill=(16, 21, 26, 255), outline=(30, 39, 46, 255))
    draw.text((44, 31), "WIN11 DISPLAY TOP-EDGE // WORKSPACE: C:\\Projects\\portfolio-app", font=f_mono, fill=(138, 155, 158, 255))

    # Left: Collapsed state + pipeline
    draw.text((48, 82), "STATE A // COLLAPSED TOP-EDGE HUD (440x56px)", font=f_mono, fill=(142, 159, 163, 255))
    draw.rounded_rectangle([48, 108, 508, 166], radius=16, fill=(14, 20, 25, 255), outline=(87, 68, 38, 255), width=2)
    draw_reticle_on(draw, 64, 121, 32, (243, 246, 245, 255), (245, 200, 117, 255))
    draw.text((108, 118), "1 session awaiting review", font=f_ui_b, fill=(243, 246, 245, 255))
    draw.text((108, 139), "Claude Code · portfolio-app", font=f_mono, fill=(149, 165, 168, 255))
    draw.rounded_rectangle([354, 122, 490, 152], radius=8, fill=(39, 32, 21, 255), outline=(94, 72, 38, 255))
    draw.text((370, 131), "2 FAIL · 28% CPU", font=f_mono_b, fill=(245, 200, 117, 255))

    draw.rounded_rectangle([48, 198, 508, 456], radius=14, fill=(16, 22, 27, 255), outline=(34, 45, 52, 255))
    draw.text((72, 220), "LOCAL TELEMETRY & HOOK PIPELINE", font=f_mono_b, fill=(181, 245, 205, 255))
    steps = [
        (252, "1. scripts/claude-hook.ps1", "Opt-in hook · No prompt or transcript capture"),
        (316, "2. %LOCALAPPDATA%\\STXICHalo\\events.jsonl", "Bounded tail reader · PermissionRequest / Stop"),
        (380, "3. Rust sysinfo + Verification Ledger", "Separates Stop from verified test/git evidence"),
    ]
    for sy, t1, t2 in steps:
        draw.rounded_rectangle([72, sy, 484, sy + 52], radius=9, fill=(11, 14, 18, 255), outline=(36, 48, 55, 255))
        draw.text((88, sy + 10), t1, font=f_mono_b, fill=(243, 246, 245, 255))
        draw.text((88, sy + 29), t2, font=f_mono, fill=(134, 151, 155, 255))

    draw.rounded_rectangle([48, 480, 508, 732], radius=14, fill=(16, 22, 27, 255), outline=(34, 45, 52, 255))
    draw.text((72, 504), "SIGNAL INTEGRITY GUARANTEES", font=f_mono_b, fill=(142, 159, 163, 255))
    guarantees = [
        (542, "Zero fabricated metrics: missing context shows as —"),
        (578, "Explicit verification state: Stop != tests passing"),
        (614, "100% offline execution: zero cloud telemetry"),
        (650, "Sample vs Live labeling: prototype fixtures badged"),
    ]
    for gy, gtext in guarantees:
        draw.text((78, gy), "•  " + gtext, font=f_ui, fill=(215, 226, 228, 255))

    # Right: Expanded Console
    draw.text((548, 82), "STATE B // EXPANDED TELEMETRY CONSOLE", font=f_mono, fill=(142, 159, 163, 255))
    draw.rounded_rectangle([548, 108, 1152, 732], radius=20, fill=(15, 21, 26, 255), outline=(46, 59, 66, 255), width=2)
    draw_reticle_on(draw, 572, 126, 30, (243, 246, 245, 255), (181, 245, 205, 255))
    draw.text((612, 132), "stxichalo", font=f_ui_b, fill=(243, 246, 245, 255))
    draw.text((702, 135), "LOCAL SENTINEL", font=f_mono, fill=(130, 147, 151, 255))
    draw.rounded_rectangle([1012, 129, 1126, 155], radius=6, fill=(38, 33, 24, 255), outline=(91, 72, 41, 255))
    draw.text((1026, 136), "DEMO FIXTURE", font=f_mono, fill=(245, 200, 117, 255))

    # Navigation bar inside expanded console
    draw.line([(548, 172), (1152, 172)], fill=(34, 45, 51, 255), width=1)
    draw.rounded_rectangle([568, 182, 704, 214], radius=7, fill=(27, 43, 36, 255), outline=(47, 77, 62, 255))
    draw.text((606, 190), "Overview", font=f_ui_b, fill=(181, 245, 205, 255))
    draw.text((742, 191), "Evidence (2)", font=f_ui, fill=(142, 159, 163, 255))
    draw.text((898, 191), "System", font=f_ui, fill=(142, 159, 163, 255))
    draw.text((1034, 191), "Hooks", font=f_ui, fill=(142, 159, 163, 255))
    draw.line([(548, 224), (1152, 224)], fill=(34, 45, 51, 255), width=1)

    draw.rounded_rectangle([572, 240, 1128, 344], radius=12, fill=(35, 29, 21, 255), outline=(94, 72, 39, 255))
    draw.text((592, 252), "ACTION REQUIRED · PERMISSION REQUEST", font=f_mono_b, fill=(245, 200, 117, 255))
    draw.text((592, 278), "Claude Code paused on Bash · 2 sample tests failed", font=f_ui_b, fill=(243, 246, 245, 255))
    draw.text((592, 304), "8 files delta · 6 passed · 2 failed (unverified fixture)", font=f_mono, fill=(196, 179, 153, 255))

    draw.rounded_rectangle([572, 384, 1128, 480], radius=12, fill=(21, 28, 34, 255), outline=(40, 52, 59, 255))
    draw.text((592, 402), "CLAUDE · Authentication refactor", font=f_ui_b, fill=(243, 246, 245, 255))
    draw.text((592, 428), "cwd: C:\\Projects\\portfolio-app · 68% ctx · 18,420 tok", font=f_mono, fill=(142, 159, 163, 255))
    draw.rounded_rectangle([592, 452, 920, 460], radius=3, fill=(38, 49, 55, 255))
    draw.rounded_rectangle([592, 452, 815, 460], radius=3, fill=(245, 200, 117, 255))

    draw.rounded_rectangle([572, 494, 1128, 590], radius=12, fill=(21, 28, 34, 255), outline=(40, 52, 59, 255))
    draw.text((592, 512), "CODEX · Optimizing database queries", font=f_ui_b, fill=(243, 246, 245, 255))
    draw.text((592, 538), "cwd: C:\\Projects\\portfolio-app · 42% ctx · 8,260 tok", font=f_mono, fill=(142, 159, 163, 255))
    draw.rounded_rectangle([592, 562, 920, 570], radius=3, fill=(38, 49, 55, 255))
    draw.rounded_rectangle([592, 562, 730, 570], radius=3, fill=(181, 245, 205, 255))

    tiles = [
        (572, "HOST CPU LOAD", "28%"),
        (761, "MEMORY COMMIT", "7.4 GiB"),
        (950, "PROCESS TABLE", "192"),
    ]
    for tx, tlabel, tval in tiles:
        draw.rounded_rectangle([tx, 608, tx + 178, 678], radius=10, fill=(19, 25, 31, 255), outline=(37, 48, 55, 255))
        draw.text((tx + 16, 622), tlabel, font=f_mono, fill=(142, 159, 163, 255))
        draw.text((tx + 16, 642), tval, font=f_stat, fill=(243, 246, 245, 255))

    return img


if HAS_CAIRO:
    png_bytes = cairosvg.svg2png(
        bytestring=app_icon_svg.encode("utf-8"), output_width=512, output_height=512
    )
    icon_img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    for filename, size in [
        ("halo-brand-board.svg", (1600, 1020)),
        ("halo-hero.svg", (1200, 780)),
    ]:
        cairosvg.svg2png(
            url=str(MOCKS / filename),
            write_to=str(MOCKS / filename.replace(".svg", ".png")),
            output_width=size[0],
            output_height=size[1],
        )
else:
    icon_img = render_app_icon_pil(512)
    render_brand_board_pil().save(MOCKS / "halo-brand-board.png")
    render_hero_pil().save(MOCKS / "halo-hero.png")

icon_img.save(ICONS / "icon.png")
icon_img.save(
    ICONS / "icon.ico",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
icon_img.resize((256, 256), Image.Resampling.LANCZOS).save(
    BRAND / "halo-app-icon-256.png"
)
print(f"Generated SVG and raster assets (cairosvg={HAS_CAIRO})")
