# SOT / Frontend — UI/UX Layer

## Product: AI Jobs Globe

> "Everyone knows AI jobs are booming. Nobody knows *how* booming."

A 3D interactive globe visualizing 15,000+ AI job openings across 1,800 companies and 4,700+ office sites worldwide. Real satellite imagery of Earth with glowing data overlays — Palantir-style analytical aesthetic. Users spin the globe, see luminous spikes and heat auras erupting from cities, zoom into specific offices, hover for details, and click through to actual job listings.

**Platform: Desktop-first** (1280px+ viewport). Mobile is out of scope for MVP.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Bundler | **Vite** | Fastest DX for a 1-2 day MVP. No SSR needed for a showcase. |
| Framework | **Vanilla JS + Three.js** | Maximum control over WebGL rendering. No React overhead for a single-view app. |
| 3D Engine | **Three.js r160+** | Industry standard. GitHub Globe was built with it. |
| Styling | **CSS (single file)** | Minimal UI chrome — the globe IS the UI. |
| Database | **Supabase (PostgreSQL)** | Stores all jobs + companies. Frontend queries via `supabase-js` client. |
| Deployment | **Vercel / Netlify (static)** | Zero-config deploy, global CDN, free tier. |

### Key Dependencies

```json
{
  "three": "^0.160.0",
  "vite": "^5.0.0",
  "@supabase/supabase-js": "^2.0.0"
}
```

---

## Design System — "SIGINT Terminal" Aesthetic

### Design Philosophy

The look is a **classified intelligence monitoring terminal** — the kind of screen you'd see in a SCIF at the NSA or a Palantir Gotham deployment. Not sleek consumer SaaS. Not a pretty marketing page. This is an **operational tool** that happens to be beautiful.

**Core principles:**
- Monospace everything. No sans-serif. No emoji. No rounded corners.
- Text is ALL-CAPS for labels, mixed-case for data values
- Borders are 1px solid lines, not shadows or gradients
- Panels have hard edges, subtle scanline texture overlay
- Colors are functional: cyan = data, amber/gold = warnings/highlights, red = critical, green = active
- The UI feels like it was built in the 1980s but runs on 2026 hardware

**Primary reference:** WORLDVIEW app (uploaded screenshot) — CRT mode with satellite globe, monospace labels, data layer toggles, dark panel UI with colored accents.

---

### Typography

**No proportional fonts anywhere in the UI.** Everything is monospace.

| Token | Font | Weight | Size | Usage |
|-------|------|--------|------|-------|
| `--font-mono` | `"JetBrains Mono", "Fira Code", "SF Mono", "Cascadia Code", monospace` | 400 | -- | Base font stack |
| `--text-title` | mono | 700 | 20px | Page title ("AI JOBS GLOBE") |
| `--text-header` | mono | 600 | 14px | Section headers ("DATA LAYERS", "LOCATIONS") |
| `--text-label` | mono | 500 | 11px | Field labels, always UPPERCASE, letter-spacing: 0.12em |
| `--text-body` | mono | 400 | 13px | Data values, job titles, company names |
| `--text-stat` | mono | 700 | 28px | Big numbers (job count, stats) |
| `--text-micro` | mono | 400 | 10px | Timestamps, coordinates, metadata |
| `--text-ticker` | mono | 400 | 10px | Scrolling status bar text |

**Google Fonts import:**
```css
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
```

**Fallback stack:** `"JetBrains Mono"` > `"Fira Code"` > `"SF Mono"` > `"Cascadia Code"` > `monospace`

**Rules:**
- NO emoji anywhere. Use text symbols or nothing: `[x]` not checkmark emoji, `//` as separator not bullet
- ALL-CAPS for labels and headers with `letter-spacing: 0.08-0.15em`
- Numbers use tabular figures (`font-variant-numeric: tabular-nums`)
- Timestamps in military format: `2026-04-26 14:32:07Z`
- Coordinates shown as: `LAT: 37.3861 LON: -122.0839`

---

### Color System

```css
:root {
  /* Background layers */
  --bg-space:        #000000;    /* Pure black, behind globe */
  --bg-panel:        #080c14;    /* Panel background (near-black navy) */
  --bg-panel-hover:  #0f1520;    /* Panel item hover */
  --bg-input:        #0a0f1a;    /* Input field background */

  /* Borders */
  --border-default:  #1a2235;    /* Subtle panel borders */
  --border-active:   #2a3a55;    /* Active/focused element border */
  --border-accent:   #00cccc;    /* Highlighted border (cyan) */

  /* Text */
  --text-primary:    #c8d0dc;    /* Primary text (cool grey-white) */
  --text-secondary:  #6b7a8d;    /* Secondary text (muted) */
  --text-dim:        #3a4a5c;    /* Very muted (disabled, decorative) */

  /* Accent colors — functional, not decorative */
  --cyan:            #00ffff;    /* Primary data color, active states */
  --cyan-dim:        #007a7a;    /* Cyan at 50% for less emphasis */
  --amber:           #fcd34d;    /* Warnings, highlights, important labels */
  --amber-dim:       #92400e;    /* Amber emissive undertone */
  --green:           #22c55e;    /* Active / ON states */
  --red:             #ef4444;    /* Critical / errors */
  --blue:            #3b82f6;    /* Secondary data color */
  --purple:          #8b5cf6;    /* Tertiary data, tier 3 */

  /* Globe data overlays */
  --heat-core:       #ffffff;    /* Center of heat aura */
  --heat-mid:        #00ffff;    /* Mid-ring of heat aura */
  --heat-edge:       #004466;    /* Outer edge, fading */
  --spike-t1:        #00ffff;    /* Tier 1 spike base color */
  --spike-t2:        #3b82f6;    /* Tier 2 spike base color */
  --spike-t3:        #8b5cf6;    /* Tier 3 spike base color */
}
```

**Usage rules:**
- Cyan is for DATA and ACTIVE states only. Not decorative.
- Amber/gold is for EMPHASIS and LABELS that need attention.
- Background is always near-black. Never grey. Never blue-tinted.
- No gradients on UI elements. Flat colors with 1px borders.
- Opacity overlays: panels use `background: rgba(8, 12, 20, 0.92)` — NO `backdrop-filter: blur()`. That's consumer SaaS. Government terminals don't blur.

---

### Spacing & Layout

```css
:root {
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md:  12px;
  --space-lg:  16px;
  --space-xl:  24px;
  --space-2xl: 32px;

  --panel-padding: 16px;
  --panel-gap:     12px;
  --border-width:  1px;
  --border-radius: 0px;   /* NO rounded corners. Ever. */
}
```

**Rules:**
- `border-radius: 0` on everything. Hard edges. Rectangles.
- Panel borders: `1px solid var(--border-default)`
- No box-shadows. No drop-shadows. No elevation.
- Padding is tight: 12-16px. This is a dense information display, not a landing page.

---

### Panel Style

All UI panels follow this pattern (reference: WORLDVIEW "DATA LAYERS" panel):

```css
.panel {
  background: var(--bg-panel);
  border: var(--border-width) solid var(--border-default);
  border-radius: 0;
  padding: var(--panel-padding);
  font-family: var(--font-mono);
  color: var(--text-primary);
  position: relative;
}

/* Optional: CRT scanline overlay for extra authenticity */
.panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0, 0, 0, 0.03) 2px,
    rgba(0, 0, 0, 0.03) 4px
  );
  pointer-events: none;
}
```

**Panel header pattern:**
```
┌─────────────────────────────────────┐
│  DATA LAYERS                    [-] │  ← ALL-CAPS, 11px, letter-spacing, collapse button
├─────────────────────────────────────┤
│  Live Jobs       15,352       [ON]  │  ← label left, count right, toggle
│  Companies       1,177        [ON]  │
│  Tier 1 Only     --           [OFF] │
└─────────────────────────────────────┘
```

---

### Globe Surface: Real Satellite Imagery

**Primary texture: NASA Earth at Night (city lights)**

| Texture | Source | Resolution | License |
|---------|--------|------------|---------|
| Earth at Night (primary) | [NASA VIIRS](https://svs.gsfc.nasa.gov/30003/) | 8192x4096 | Public domain |
| Earth Day (alt) | [Solar System Scope](https://www.solarsystemscope.com/textures/) | 4096x2048 | CC BY 4.0 |
| Bump map | Solar System Scope | 4096x2048 | CC BY 4.0 |
| Specular map | Solar System Scope | 4096x2048 | CC BY 4.0 |

**Implementation:**
```javascript
const nightTexture = textureLoader.load('textures/earth-night-8k.jpg');
const bumpTexture = textureLoader.load('textures/earth-bump-4k.jpg');
const specularTexture = textureLoader.load('textures/earth-specular-4k.jpg');

const globeMaterial = new THREE.MeshPhongMaterial({
  map: nightTexture,
  bumpMap: bumpTexture,
  bumpScale: 0.05,
  specularMap: specularTexture,
  specular: new THREE.Color(0x333333),
  shininess: 15,
});
```

---

### Data Visualization Layers

**Layer 1 -- Globe Base (satellite texture)**
- Real NASA Earth at Night texture on a sphere
- Bump map for terrain relief, specular map for ocean sheen
- Slightly desaturated so data overlays pop

**Layer 2 -- Heat Auras (surface glow)**
- Circular gradient discs on the globe surface at each office location
- Additive blending for glow that bleeds outward
- Radius scales with `sqrt(job_count)`, color: white core > cyan > blue > transparent
- Overlapping auras merge into brighter hotspots naturally (SF Bay Area, NYC corridor)

**Layer 3 -- Spikes (3D columns)**
- Tapered columns: `CylinderGeometry(radiusTop: 0.003, radiusBottom: 0.008, height)`
- Height = `log2(job_count + 1) * 0.03`, max ~0.3 globe radii
- Material: emissive + semi-transparent, Fresnel edge glow
- Color by tier: cyan (T1), blue (T2), purple (T3)
- Each spike has a subtle volumetric glow billboard behind it

**Layer 4 -- Hover Effects**
- Spike scales 1.3x, emissive cranks to white, sonar ring pulses from base
- Stretch goal: thin arc lines to other offices of the same company

**Layer 5 -- Atmosphere**
- Outer glow sphere (1.02x radius), Fresnel shader
- Second subtle atmosphere at 1.05x for depth

---

### HUD Overlay Elements

Inspired by the WORLDVIEW screenshot — metadata readouts positioned at screen edges.

**Top-left corner (classification header):**
```
EMERGENCES LABS // AI-JOBS-GLOBE // V1.0
SRC:1177  PINS:4759  DENS:0.26  12.4ms
```
- `--text-micro` size (10px), `--cyan` color
- Shows source count, pin count, density, frame time

**Top-right corner (timestamp + coordinates):**
```
REC 2026-04-26 14:32:07Z
LAT: 37.39  LON: -122.08  ALT: 4.2
```
- Updates in real-time as camera moves
- Shows current camera target lat/lon and zoom distance as "altitude"

**Bottom center (location pills):**
```
[ San Francisco ]  [ New York ]  [ London ]  [ Tokyo ]  [ Beijing ]  [ Tel Aviv ]
```
- Quick-jump city buttons, styled as bordered rectangles (`border-radius: 0`)
- Click flies camera to that city
- Active city gets `--cyan` border

---

### Component States

| Element | Default | Hover | Active | Disabled |
|---------|---------|-------|--------|----------|
| Panel border | `--border-default` | `--border-active` | `--border-accent` | `--border-default` at 50% opacity |
| Label text | `--text-secondary` | `--text-primary` | `--cyan` | `--text-dim` |
| Data value | `--text-primary` | `--text-primary` | `--cyan` | `--text-dim` |
| Toggle OFF | `--text-dim` bg, "OFF" text | `--border-active` | -- | -- |
| Toggle ON | `--green` bg, "ON" text | brighter green | -- | -- |
| Spike (3D) | base emissive 0.1 | emissive 0.5, scale 1.15x | emissive 1.0, scale 1.3x | emissive 0, opacity 0.2 |
| Button | `--bg-input` bg, `--border-default` | `--border-active` | `--cyan` border + text | opacity 0.3 |
| Job link | `--text-primary` | `--cyan`, underline | -- | -- |

**Transitions:** all state changes use `transition: all 150ms linear`. No ease-in-out. Linear feels more mechanical/technical.

---

### Reference Visuals & Inspiration

| Reference | URL | What to take from it |
|-----------|-----|---------------------|
| **WORLDVIEW (CRT mode)** | *(uploaded screenshot)* | PRIMARY REFERENCE: monospace labels, data layer panel, satellite globe, HUD overlay, location pills, scanline texture |
| **Palantir Gotham** | [palantir.com](https://www.palantir.com/) | Dark analytical dashboard, dense data layout, operational feel |
| **@bilawalsidhu globe** | [x.com/bilawalsidhu/status/2024672151949766950](https://x.com/bilawalsidhu/status/2024672151949766950) | Satellite imagery + glowing data points, professional intelligence feel |
| **@om_patel5 globe** | [x.com/om_patel5/status/2047849798162682260](https://x.com/om_patel5/status/2047849798162682260) | Realistic earth + data visualization overlay |
| **@DannyLimanseta globe** | [x.com/DannyLimanseta/status/2048045369335148840](https://x.com/DannyLimanseta/status/2048045369335148840) | Polished 3D globe with professional data layer |
| GitHub Globe blog | [How we built the GitHub Globe](https://github.blog/engineering/engineering-principles/how-we-built-the-github-globe/) | Architecture patterns (5-layer scene), performance techniques |
| GitHub Globe clone | [github.com/janarosmonaliev/github-globe](https://github.com/janarosmonaliev/github-globe) | Open-source Three.js implementation reference |
| NASA Earth at Night | [svs.gsfc.nasa.gov/30003](https://svs.gsfc.nasa.gov/30003/) | Primary globe texture source |
| Solar System Scope textures | [solarsystemscope.com/textures](https://www.solarsystemscope.com/textures/) | Day/night/bump/specular texture pack |
| Three.js Earth Shaders | [threejs-journey.com/lessons/earth-shaders](https://threejs-journey.com/lessons/earth-shaders) | Production-quality earth rendering tutorial |
| globe.gl | [github.com/vasturiano/globe.gl](https://github.com/vasturiano/globe.gl) | Alternative library with built-in layers |
| deck.gl | [github.com/visgl/deck.gl](https://github.com/visgl/deck.gl) | Uber's framework for massive point clouds |

---

## Screen Architecture (Desktop Only)

Single-screen app. Minimum viewport: 1280x720.

```
┌──────────────────────────────────────────────────────────────────┐
│  [Logo]  AI Jobs Globe          [Search...]  [Filters ▾]  [?]   │  ← Top bar
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                                                                  │
│                    ┌───────────────────┐                          │
│                    │                   │                          │
│                    │    3D Globe       │                          │
│                    │   (full viewport) │          ┌────────────┐  │
│                    │                   │          │  Detail     │  │
│                    │                   │          │  Panel      │  │
│                    └───────────────────┘          │  (right)    │  │
│                                                  │  420px wide │  │
│                                                  └────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  15,352 AI jobs  •  1,177 companies  •  47 countries        │  │  ← Stats bar
│  └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Globe Viewport (`globe.js`)
- Full-screen `<canvas>` filling the viewport behind all UI
- Three.js scene with OrbitControls:
  - Left-drag = rotate
  - Scroll = zoom
  - Right-drag = pan (disabled — keep globe centered)
- Auto-rotation when idle (stops on interaction, resumes after 5s)
- Zoom range: min 1.5 (full globe) → max 8.0 (city-level)
- Camera starts aimed at North America (where most data is)
- **Stars background**: 8,000 point particles in a large sphere around the scene

#### 2. Top Bar (`topbar.js`)
- `background: var(--bg-panel); border-bottom: 1px solid var(--border-default);`
- Logo (left): "AI Jobs Globe" + Emergences Labs mark
- Search (center): text input with autocomplete → matches company names, flies camera to result
- Filter dropdown (right): checkboxes for AI type (A1/A2/A3/B), tier (1/2/3), country
- Help button: "?" → modal explaining the visualization

#### 3. Detail Panel (`panel.js`)
- Slides in from right edge on spike click, 420px wide
- `background: var(--bg-panel); border-left: 1px solid var(--border-default);`
- Content:
  - Company logo (128px from `/logos/`, fallback to CSS initials circle)
  - Company name, HQ country code (`US`, `DE`, `CN`), tier label (`T1` / `T2` / `T3` in `--cyan` / `--blue` / `--purple`)
  - Location name + job count at this specific office
  - AI type breakdown bar (colored segments: A1/A2/A3/B)
  - Scrollable job list (each title is a clickable link → `job_url` in new tab)
  - "View all {company} offices" button → highlights all spikes for that company
- Close: X button or Escape key

#### 4. Stats Bar (`stats.js`)
- Fixed bottom, `background: var(--bg-panel); border-top: 1px solid var(--border-default);`
- Animated counters (count up from 0 on page load, 1.5s duration)
- Shows: total jobs • companies • countries • "Powered by Emergences Labs"
- Updates live when filters change

#### 5. Hover Tooltip (`tooltip.js`)
- CSS2DRenderer overlay positioned at spike tip
- Content: `[logo] Company Name — X AI jobs — Location`
- Appears on hover with 150ms fade-in
- Follows spike position as globe rotates

---

## Interaction Design (Desktop)

### Hover States
1. **Cursor approaches spike**: spike begins to glow (emissive ramp 0 → 0.5 over 200ms)
2. **Cursor enters spike hitbox**: spike scales 1.3x, full glow, tooltip appears, sonar ring pulses from base
3. **Cursor leaves**: spike returns to base state over 300ms

**Performance**: raycasting against 4,700 spike geometries is expensive. Instead:
- Create an invisible `InstancedMesh` of spheres at each spike base (radius = spike hitbox)
- Raycast against spheres only (much cheaper)
- Map sphere instance index → spike data

### Click Actions
1. **Click spike**: camera orbits smoothly to face location (Tween.js, 1200ms ease-in-out), detail panel opens
2. **Click globe surface** (no spike): close panel, resume idle rotation
3. **Click job title in panel**: `window.open(job_url, '_blank')`
4. **Click "View all offices"**: all spikes for that company pulse bright, others dim to 20% opacity

### Zoom Behavior
| Distance | Behavior |
|----------|----------|
| > 5 (far) | All spikes visible, heat auras merge into regional glow, no labels |
| 2-5 (mid) | Individual spikes distinct, top-10 companies show persistent labels |
| < 2 (close) | All spike labels visible, heat auras show exact position, satellite terrain detail visible |

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Escape` | Close detail panel |
| `R` | Reset camera to default position |
| `Space` | Toggle auto-rotation |
| `/` | Focus search input |

---

## Performance Budget

| Metric | Target | Notes |
|--------|--------|-------|
| Initial load | < 5s (cable) | Satellite textures are the bottleneck (~4MB for 4K) |
| FPS | 60fps (desktop) | Key constraint for 4,700 spikes |
| Globe texture | 4096x2048 (4K) | Balance quality vs load time. 8K optional for retina. |
| Data payload | < 500KB gzipped | Pre-aggregated JSON from Supabase, or direct query |
| Spike count | 4,759 | InstancedMesh = 1 draw call |
| Memory | < 300MB | Textures + Three.js scene |

### Performance Strategies

1. **InstancedMesh** for all spikes — one draw call for 4,700 cylinders
2. **InstancedMesh** for heat aura discs — one draw call
3. **Texture compression**: use basis/ktx2 compressed textures for the satellite imagery
4. **Progressive loading**: show globe with simple dark sphere immediately, swap in satellite texture once loaded
5. **Frustum culling**: automatic in Three.js
6. **LOD**: at zoom > 5, skip rendering spikes with < 3 jobs (reduces to ~2,000 visible)
7. **Lazy logo loading**: only fetch company logo PNG when tooltip/panel is shown

---

## File Structure

```
ai-jobs-globe/
├── index.html
├── vite.config.js
├── package.json
├── public/
│   ├── textures/
│   │   ├── earth-night-4k.jpg       # NASA Earth at Night (primary)
│   │   ├── earth-day-4k.jpg         # Solar System Scope day texture (alt)
│   │   ├── earth-bump-4k.jpg        # Terrain bump map
│   │   ├── earth-specular-4k.jpg    # Ocean specular map
│   │   └── earth-clouds-4k.png      # Cloud layer (optional, transparent)
│   ├── logos/                        # 1,594 company logo PNGs (128px)
│   └── sprites/
│       └── glow.png                  # Soft circle sprite for spike glow
├── src/
│   ├── main.js                       # Entry: init, load textures, start render
│   ├── globe.js                      # Globe mesh with satellite texture + atmosphere
│   ├── spikes.js                     # InstancedMesh for spikes + heat auras
│   ├── interaction.js                # Raycaster, hover, click
│   ├── panel.js                      # Detail panel (DOM)
│   ├── tooltip.js                    # CSS2DRenderer tooltip
│   ├── controls.js                   # OrbitControls, zoom limits
│   ├── filters.js                    # Filter state, spike visibility
│   ├── data.js                       # Supabase client, data fetching
│   ├── shaders/
│   │   ├── atmosphere.vert           # Atmosphere vertex shader
│   │   ├── atmosphere.frag           # Fresnel halo fragment shader
│   │   ├── heat-aura.vert            # Heat disc vertex shader
│   │   └── heat-aura.frag            # Additive glow fragment shader
│   └── utils/
│       ├── geo.js                    # lat/lon → 3D vector
│       ├── colors.js                 # Color ramp / lerp
│       └── tween.js                  # Camera animation helpers
└── style.css
```

---

## Milestone Plan (1-2 day MVP, Desktop Only)

### Day 1 (8 hours)
| Hour | Task |
|------|------|
| 0-1 | Vite setup, Three.js scene, camera, OrbitControls, starfield background |
| 1-2 | Download NASA Earth at Night texture. Globe sphere with satellite texture + bump map |
| 2-3 | Atmosphere halo (Fresnel shader) |
| 3-4 | Load data from Supabase (or static JSON fallback). Convert lat/lon → 3D positions |
| 4-6 | InstancedMesh for spikes (tapered cones, height = job count, tier color gradient) |
| 6-7 | InstancedMesh for heat auras (additive blend discs) |
| 7-8 | Raycaster + hover: spike glow + tooltip |

### Day 2 (8 hours)
| Hour | Task |
|------|------|
| 0-1 | Click → camera fly-to + detail panel with job list |
| 1-2 | Top bar: search with autocomplete, filter dropdowns |
| 2-3 | Stats bar with animated counters |
| 3-4 | Logo loading in tooltip + panel (with favicon fallback) |
| 4-5 | Polish: hover ring pulse, spike glow sprites, smooth transitions |
| 5-6 | Progressive texture loading (dark sphere → satellite swap) |
| 6-7 | Loading screen, deploy to Vercel |
| 7-8 | Test, screenshot, record demo video for submission |

---

## Open Questions

1. **Earth at Night vs Earth Day**: night texture is inherently dark-themed and gorgeous, but terrain detail is low (it's mostly black with city lights). Day texture shows geography but needs to be darkened. Could also do a hybrid: day texture with low brightness + city lights as emissive overlay.
2. **globe.gl shortcut**: globe.gl has built-in satellite textures, hex bins, and point layers. Faster to ship but less visual control. Worth prototyping both approaches in hour 1 to compare.
3. **Spike vs bar shape**: tapered cones look more organic, but rectangular bars (like the population density example) read more clearly as "data". Test both.
4. **Connection arcs**: showing lines between offices of the same company (like GitHub's PR arcs) would be stunning but is a Day 3 feature.
