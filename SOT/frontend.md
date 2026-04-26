# SOT / Frontend — UI/UX Layer

## Recent Changes
- 2026-04-26 — **PIVOT to Cesium + Google Photorealistic 3D Tiles** (away from the original Three.js + NASA-texture plan). The Bilawal-WORLDVIEW visual quality wasn't reachable with Three.js; Cesium + Google's photoreal tiles is the same stack he uses. Vanilla JS + Vite kept. Added scope-mode (close-up auto-focus camera per building) using `data/building_focus.json` (53 entries for top-30 employers; rank 31-80 currently being researched in background). Replaced cylinder spikes with hybrid (always-visible polylines + cyan `[ ]` bracket markers per office). Removed top-left HUD; consolidated scope chrome into a single horizontal bar. Job panel narrowed to 340 px with text wrapping. Live deploy: https://ai-jobs-globe.vercel.app — Vercel auto-deploys from `main`.

---

## Product: AI Jobs Globe

> "Everyone knows AI jobs are booming. Nobody knows *how* booming."

A 3D interactive globe visualizing 15,000+ AI job openings across 1,800 companies and 4,700+ office sites worldwide. Real satellite imagery of Earth with glowing data overlays — Palantir-style analytical aesthetic. Users spin the globe, see luminous spikes and heat auras erupting from cities, zoom into specific offices, hover for details, and click through to actual job listings.

**Platform: Desktop-first** (1280px+ viewport). Mobile is out of scope for MVP.

---

## Tech Stack (current)

| Layer | Choice | Why |
|-------|--------|-----|
| Bundler | **Vite 5** | Fastest DX, zero-config, ships clean ESM build (~62 KB gzipped JS). |
| Framework | **Vanilla JS** (no React/Vue) | Single-view app, Cesium is huge already, no framework overhead needed. |
| 3D Engine | **CesiumJS 1.124** | Same stack Bilawal Sidhu's WORLDVIEW uses. Built-in geographic projection + camera + scope/orbit primitives. |
| Globe imagery | **Google Photorealistic 3D Tiles** (primary), **Cesium Ion / Bing** (fallback) | Real photogrammetric 3D earth — the entire visual reason we picked Cesium. Google API key on `.env` + Vercel envs. |
| Bracket markers | `Entity.label` with text "[ ]" + screen-space `scaleByDistance` | Bilawal-style "scopable" markers floating over each office. |
| Spike rendering | `Entity.polyline` with `PolylineGlowMaterialProperty` | Tall thin glowing column per office, height = log2(jobs). 4-px wide for hover-pickability. |
| Building data | `data/building_focus.json` (static, frontend-bundled) | 53 entries (top-30 employers) compiled by background agent; rank 31-80 in flight. NOT in Supabase — keep it as a frontend asset for now (can migrate to a `buildings` table if we later need user editing). |
| Styling | **Single `src/style.css`** with CSS variables | SIGINT terminal aesthetic, monospace, hard edges, cyan + amber accents. |
| Database | **Supabase (PostgreSQL)** | Companies / offices / jobs queried via `supabase-js`. RLS public-read. |
| Deployment | **Vercel** auto-deploy from GitHub `main` | 1-min build, global CDN, all `VITE_*` env vars wired (Supabase URL + anon key + Google Maps key). |

### Key Dependencies (actual `package.json`)

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.45.4",
    "cesium": "^1.124.0"
  },
  "devDependencies": {
    "vite": "^5.4.10",
    "vite-plugin-cesium": "^1.2.23"
  }
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

### Globe Surface: Google Photorealistic 3D Tiles

We stream the actual photogrammetric 3D earth — same source Bilawal Sidhu's WORLDVIEW uses. Cesium loads the tileset on demand from Google Maps Platform.

| Source | Endpoint | Notes |
|--------|----------|-------|
| **Google Photorealistic 3D Tiles** | `https://tile.googleapis.com/v1/3dtiles/root.json?key=<KEY>` | Primary surface. API key in `VITE_GOOGLE_MAPS_API_KEY`. Map Tiles API enabled on GCP project 669037656528. Pay-as-you-go (~$0.02-$0.05 per casual session). |
| Cesium Ion / Bing imagery | `IonImageryProvider.fromAssetId(2)` | Automatic fallback if Google tiles fail to load (e.g. API quota exceeded). |

**Implementation** (`src/globe.js`):
```javascript
const tileset = await Cesium3DTileset.fromUrl(
  `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_KEY}`,
  { showCreditsOnScreen: true, maximumScreenSpaceError: 16 }
);
scene.primitives.add(tileset);
scene.globe.show = false;  // photoreal tiles ARE the surface now
```

---

### Data Visualization Layers (current implementation)

**Layer 1 — Photoreal globe surface** — Google 3D Tiles. Renders actual buildings down to street level in major metros.

**Layer 2 — Spike polylines** (`src/spikes.js`)
- One `Entity.polyline` per office, base at office lat/lon, tip `400 km + log2(jobs+1) * 150 km` overhead
- 4 px wide, `PolylineGlowMaterialProperty`, tier-coloured (cyan T1 / blue T2 / purple T3)
- For top-30 offices that have a `building_focus.json` entry, the polyline base sits ON the actual building (e.g. 1455 Mission for OpenAI). For the rest, base is in a small ring around the city geocode to avoid stacking.

**Layer 3 — Bracket markers** (`src/spikes.js`)
- One `Entity.label` with text `[ ]` per office, positioned at the polyline tip
- Screen-space sized via `NearFarScalar` (1.4× near, 0.55× far)
- `LabelStyle.FILL_AND_OUTLINE` with tier-coloured fill + black outline
- The "Bilawal WORLDVIEW" scopable-marker look

**Layer 4 — Scope highlight ring** (`src/scope.js`, only visible in scope mode)
- One `Entity.ellipse` (id `__scope_highlight__`) at the active building's lat/lon
- Currently 40 m radius, ground-clamped, cyan with 0.45 alpha
- Repositioned on cycle, hidden on exit
- **Known issue (2026-04-26):** ring at altitude 0 gets occluded by tall photoreal buildings from the camera's typical -30° pitch — needs to grow to 80–100 m radius and possibly add a vertical halo.

**Layer 5 — Hover state**
- Hovered polyline pumps width 4 → 7 px and material → white glow
- Tooltip DOM element follows cursor with `[Company] / [Location] · [N jobs] · T[tier]`

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

## File Structure (current)

```
ai-jobs-globe/
├── index.html                       # Single-page shell + DOM mounts (HUD, topbar, panels, scope-bar)
├── vite.config.js                   # Vite + vite-plugin-cesium (CESIUM_BASE_URL, asset copy)
├── package.json                     # Cesium 1.124, supabase-js, vite, vite-plugin-cesium
├── .env / .env.local                # Supabase keys + VITE_GOOGLE_MAPS_API_KEY (gitignored)
├── public/
│   └── logos/                       # 1,594 company logo PNGs (128px) — served by Vercel CDN
├── data/                            # NOT in Supabase — frontend-bundled static data
│   ├── building_focus.json          # 53 entries for top-30 employers (Apple Park, Googleplex, etc.)
│   ├── building_focus_extended.json # 75 entries for ranks 31-80 (Meta, Salesforce, Tesla, etc.)
│   ├── _research_brief.md           # Top-30 brief used by background agent (audit log)
│   └── _research_brief_v2.md        # Rank-31-80 brief
├── src/
│   ├── main.js                      # Entry: init Cesium, fetch data, wire interaction
│   ├── globe.js                     # Cesium Viewer + Google 3D Tiles + camera limits
│   ├── data.js                      # Supabase client + paginated fetchGlobeData/Stats/Jobs/Companies
│   ├── spikes.js                    # Polylines + bracket markers per office
│   ├── buildings.js                 # Loads building_focus*.json; findBuildingForOffice + buildingsNear + nearestBuilding
│   ├── scope.js                     # Scope-mode state machine: enter / exit / cycle / highlight ring
│   ├── panel.js                     # Right-edge detail panel with job listings
│   ├── topbar.js                    # Search input + Supabase autocomplete (slated for replacement — see Open Items)
│   ├── companies-rail.js            # Left-rail TARGETS list (top 30 by jobs, with logos)
│   └── style.css                    # Single CSS file, all design-system tokens + components
└── (no shaders, no utils — Cesium handles geo math + camera animation)
```

---

## Current State (2026-04-26)

| Layer | Status |
|---|---|
| Vite + Cesium + Supabase scaffold | ✅ shipped |
| Google Photorealistic 3D Tiles loaded with Cesium Ion fallback | ✅ shipped |
| Polyline spike per office (city-ring fallback for offices without building data) | ✅ shipped |
| Cyan `[ ]` bracket markers per office | ✅ shipped (known issue: appearing at polyline TIP not building base — fix in flight) |
| Hover tooltip with company / location / job count / tier | ✅ shipped |
| Click → opens right-side detail panel with real job listings | ✅ shipped |
| TARGETS rail (top 30 by jobs, with logos, click-to-fly) | ✅ shipped |
| Scope mode (close-up auto-focus on photoreal building) | ✅ shipped — manual entry only |
| `data/building_focus.json` (top 30, 53 entries) | ✅ shipped |
| `data/building_focus_extended.json` (ranks 31-80, 75 entries) | ✅ shipped — buildings.js loader needs to merge it (1-line change) |
| Camera limits: 200m floor, 30,000km ceiling, no inertia, collision detection | ✅ shipped |
| HUD top-right with timestamp + camera lat/lon | ✅ shipped (slated for removal — see Open Items) |
| EMERGENCES LABS HUD top-left | ❌ deleted (was overlapping scope bar) |
| Bottom stats bar with animated count-up | ✅ shipped |
| Bottom city pills (SF / NYC / London / Tokyo / Beijing / Tel Aviv) | ✅ shipped — slated for "enter scope on top company" upgrade |
| Search bar in topbar | ✅ shipped (slated for replacement with scope-only dropdown) |

---

## Open Items (post-shipping cleanup)

These are items Charles flagged in the 2026-04-26 review session but aren't yet in `main`. Each links to its corresponding implementation thread.

1. **Building highlight ring invisible in scope view** — current 40 m ground-clamped ellipse gets occluded by the photoreal building geometry from the camera's typical -30° pitch. Fix: enlarge to 80–100 m + raise to 5 m above ground + `disableDepthTestDistance` so it shows through walls within scope range.
2. **Bracket markers anchored to polyline tip (in space) instead of building base** — they appear "stuck on screen" because they're at altitude 400 km–1900 km. Fix: position them at `basePos` (the office building) with a small `pixelOffset`.
3. **Cycle order is alphabetical (Amazon ↔ Microsoft only in SF)** — needs to sort by job count (or another meaningful priority) and the rank-31-80 data needs to be loaded so SF actually has more than 2 buildings to cycle through.
4. **Detail panel UX** — Charles wants the right panel to behave more like a hover-triggered TARGETS-style component instead of a sticky modal. Semantics TBD.
5. **City pills → enter scope on top-jobs company in that city** instead of `flyTo(city center)`.
6. **Replace search bar + REC HUD with a scope-only dropdown** — scope-able companies only (those with building data).

These are tracked in the corresponding thread + plan file; implementation is incremental.

---

## Reference Visuals

Bilawal Sidhu's WORLDVIEW remains the primary visual target (see `Reference Visuals & Inspiration` section above). The bracket markers `[ ]`, the close-up camera-orbit-per-building, and the cyan/amber colour palette are all tracking that reference.
