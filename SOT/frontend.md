# SOT / Frontend — UI/UX Layer

## Recent Changes
- 2026-04-26 — **PIVOT to Cesium + Google Photorealistic 3D Tiles** (away from the original Three.js + NASA-texture plan). The Bilawal-WORLDVIEW visual quality wasn't reachable with Three.js; Cesium + Google's photoreal tiles is the same stack he uses. Vanilla JS + Vite kept. Added scope-mode (close-up auto-focus camera per building) using `data/building_focus.json` (53 entries for top-30 employers; rank 31-80 researched in background). Replaced cylinder spikes with hybrid (always-visible polylines + cyan `[ ]` bracket markers per office). Removed top-left HUD; consolidated scope chrome into a single horizontal bar. Job panel narrowed to 340 px with text wrapping. Live deploy: https://ai-jobs-globe.vercel.app — Vercel auto-deploys from `main`.
- 2026-04-26 (afternoon) — Cycle order in scope mode is now **GLOBAL by longitude** instead of "neighbours within 5 km". Cycling 500+ NEXT now walks the world (SF → LA → Vegas → Denver → Chicago → NYC → Dublin → London → Berlin → Beijing → Tokyo → wrap). Brackets are now **scope-only** (not rendered on the globe view). Polylines anchor to building lat/lon when available; otherwise to office's own Nominatim city geocode (no longer fall back to company HQ — fixes Amazon-Paris-stacks-on-Seattle bug). Topbar restacked: branding row at very top, scope-bar slots BELOW it when active. Search input replaced with `// JUMP TO COMPANY (SCOPE)` dropdown listing only scopable companies. Right panel restyled to match TARGETS rail (280 px, top:110, slides + fades). City pills click → enterScope on top-jobs company in that city. `bestBuildingForCompany()` ensures TARGETS clicks for EY/Ro/Deloitte/Binance always reach scope (was broken when "busiest office" city didn't match any building entry).
- 2026-04-26 (extended) — Added `data/building_focus_extended.json` with 75 building entries for ranks 31–80 (Meta, Salesforce, Tesla, Goldman Sachs, AMD, etc. + extra SF/NYC/London/Tokyo/Beijing hubs for the SF cycle issue). `src/buildings.js` merges both files; total 127 entries / 80 unique companies / **115 of 4,682 offices = 2.5% scope-view coverage**. Re-geocoding the remaining 4,567 offices is deferred to next pass (Google Places API path queued).
- 2026-04-26 (column ↔ polyline) — Tried real 3D `Cesium.Cylinder` for spikes; reverted because (a) sub-pixel from globe distance — invisible, and (b) cylinders are positioned at altitude 0 (sea level), so they floated above ground in inland cities (Denver +1600m, Mexico City +2200m). Polylines are screen-space pixel-width and project to screen → don't fight terrain elevation. Final: 8 px width, hover 12 px, glowPower 0.30 (less diffuse halo), height max 1,900 km.
- 2026-04-26 (deck) — Added single-file SIGINT pitch deck at `public/pitch.html` → `https://ai-jobs-globe.vercel.app/pitch.html`. 5 slides (cover / problem / solution / demo / contact). QR codes (transparent bg, cyan modules) via `qr-creator` CDN. Keyboard nav. Same monospace + cyan + amber aesthetic as the live globe.
- 2026-04-26 (footer) — `POWERED BY EMERGENCES LABS` in stats bar is now a clickable link to https://emergences.ai/ ; added `[ www ]` and `[ in ]` icon links to the website + LinkedIn.
- 2026-04-27 — `startAutoSpin(viewer, isScopeActive)` rotates camera around Earth's polar axis ~0.8°/sec at home view. Stops when scope is active OR camera altitude < 10,000 km (user has zoomed in). User drag still works — the spin composes with manual rotation and resumes at the new heading after release.
- 2026-04-27 — City pills replaced: Tokyo / Beijing / Tel Aviv had 0 scope-able offices in our DB → swapped for Mountain View / Santa Clara / Austin (each with 4–8 scope-able buildings).
- 2026-04-27 — Brackets in scope view are now CLICKABLE → open the right panel for that office without moving the camera. Buildings without a matching office row in the DB no longer render brackets (no more clicks-to-empty-panel for TikTok Beijing / Goldman Tokyo).
- 2026-04-27 — `scope.js` now owns the panel during scope mode via `syncPanelToBuilding()` — every `enterScope` / `cycle` / `exitScope` call automatically updates the panel content. Fixes the "panel stuck on first company while cycling" bug.
- 2026-04-27 — `panel.js` `openPanel` got a sequence-guard so out-of-order Supabase fetch responses can't repaint the DOM with stale content. Fixes the cold-start race where the first 10–20 s of clicking through TARGETS left the panel showing the wrong company.

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

### Component Breakdown (current implementation)

#### 1. Globe Viewport (`src/globe.js`)
- Full-screen `<div id="cesiumContainer">` hosting Cesium's `Viewer`
- Default destination: lat 25, lon -115, alt 14,000 km, pitch -85°, heading 0
- Camera limits: 200 m floor, 30,000 km ceiling, collision detection on
- `inertiaZoom: 0` (snappy wheel zoom — no overshoot drag)
- Google Photorealistic 3D Tiles primitive added once tileset promise resolves
- `scene.globe.show = false` once tiles are mounted (the photoreal tiles ARE the surface)
- Sky atmosphere: hueShift -0.05, brightnessShift -0.2, slight cyan dusk feel
- All default Cesium widgets disabled (animation, timeline, fullscreen, geocoder, infoBox, base-layer-picker, etc.)
- `startAutoSpin()` rotates camera around `Cartesian3.UNIT_Z` ~0.8°/sec when at home view (off in scope or zoom-in)
- `flyHome()` resets camera to default view (wired to clicking the topbar title)

#### 2. Top Bar (`index.html` + `src/style.css`)
- Fixed at top of viewport (top: 0, full width, z-index 22)
- Three flex sections:
  - **Left**: clickable "AI JOBS GLOBE" title + "// EMERGENCES LABS" subtitle. Click → `flyHome` + `exitScope` + `closePanel`.
  - **Centre**: `<select id="scope-select">` populated with companies that have building data, sorted by total jobs. On change → `enterScope(building)`. Replaces the original search input.
  - **Right**: `[ FILTERS ]` and `[ ? ]` ghost buttons (currently no-op placeholders)

#### 3. Scope Bar (`index.html` #scope-bar)
- Fixed top:50, centre-aligned, z-index 21 — sits BELOW the topbar
- Hidden by default; shown when `enterScope()` runs
- Single-row layout: `[ < PREV ] [ company // building // address ] [ NEXT > ] [ EXIT SCOPE ]`
- All 4 buttons wired to `cycle(±1)` / `exitScope()`

#### 4. TARGETS Rail (`src/companies-rail.js`)
- Fixed left:16, top:60, bottom:110, width:240, z-index 18
- Lists top 30 companies by total open AI jobs (descending)
- Each row: 20-px logo (or initials fallback) + name + cyan job count
- Click → `focusCompany(companyName, fallbackOffice)` → `enterScope` on the company's HQ if any building data exists; else `flyTo` + open panel

#### 5. Detail Panel (`src/panel.js`)
- Fixed right:16, top:110, bottom:110, z-index 19, width 280 px
- Mirrors the TARGETS rail's silhouette on the opposite edge
- Slides + fades on open/close (`transform: translateX` + `opacity`)
- Owned by `scope.js` while scope mode is active — every `enterScope` / `cycle` / `exitScope` syncs panel content to match the active building's office
- Sequence-guarded `openPanel(office)` ignores stale Supabase fetch responses
- Content: company logo, name, location, tier badge, role count + scrollable job list with title link, AI-type chip, salary range, posted date

#### 6. Stats Bar (`index.html` #bottombar)
- Fixed bottom, contains the location pills (above) + stats line (below)
- Stats: `<jobs> AI JOBS // <companies> COMPANIES // <countries> COUNTRIES // POWERED BY EMERGENCES LABS [www] [in]`
- Counters animate from 0 over 1.5 s on first load (`countUp()` in main.js)
- "POWERED BY EMERGENCES LABS" is a link to `https://emergences.ai/`; the `[ www ]` and `[ in ]` icons link to the website and company LinkedIn

#### 7. Location Pills
- 6 pills: SAN FRANCISCO / NEW YORK / LONDON / MOUNTAIN VIEW / SANTA CLARA / AUSTIN (all chosen for ≥ 4 scope-able buildings)
- Click → `enterScope` on the top-jobs company in that city via `topBuildingInCity()`; falls back to `flyTo` if no building data

#### 8. Hover Tooltip (`#tooltip`)
- Plain DOM div absolutely positioned at the cursor on `MOUSE_MOVE` over a polyline
- Content: company name (cyan) + location · job count · tier
- Hidden when no polyline is hovered

#### 9. Scope Mode (`src/scope.js`)
- State: `{ active, building, index, exitedAt, preScopeAlt, preScopePos }`
- `enterScope(building)` — flies camera using building's `camera` block (heading/pitch/range), shows scope-bar, drops cyan ground ring, renders `[ company name ]` brackets for nearby buildings WITH matching offices, opens panel for active building's office
- `cycle(±1)` — walks `allBuildingsByLongitude()` (global, not city-local), wraps around the world
- `exitScope()` — flies back to 500 km globe view, clears highlight + brackets, closes panel
- Brackets at altitude 30 m above ground, screen-space sized, depth-tested up to 50 km so they hide behind globe geometry from far away

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
│   ├── topbar.js                    # ⚠ DEAD CODE — was search input; replaced by scope-select in index.html. Safe to delete.
│   ├── companies-rail.js            # Left-rail TARGETS list (top 30 by jobs, with logos)
│   └── style.css                    # Single CSS file, all design-system tokens + components
└── (no shaders, no utils — Cesium handles geo math + camera animation)
```

---

## Current State (2026-04-27)

| Layer | Status |
|---|---|
| Vite + Cesium + Supabase scaffold | ✅ shipped |
| Google Photorealistic 3D Tiles loaded with Cesium Ion fallback | ✅ shipped |
| Polyline spikes — width 8, glow halo 0.30, height 400 km – 1,900 km by `log2(jobs+1)` | ✅ shipped |
| Cyan `[ Company ]` bracket markers — **scope view only**, skipped if no matching office row, clickable → open panel | ✅ shipped |
| Hover tooltip (company / location / job count / tier) | ✅ shipped |
| Click polyline → focusOffice → enterScope (if building data) or flyTo + panel | ✅ shipped |
| TARGETS rail (top 30 by jobs, with logos) → focusCompany → always reaches scope | ✅ shipped |
| Scope mode — manual entry, global longitude cycle, panel auto-syncs with active building | ✅ shipped |
| Scope dropdown in topbar listing scopable companies sorted by jobs desc | ✅ shipped |
| Detail panel — 280 px wide, top:110 / bottom:110, slides + fades, sequence-guarded fetch | ✅ shipped |
| Bottom location pills (SF / NYC / London / Mountain View / Santa Clara / Austin) | ✅ shipped (Tokyo/Beijing/TelAviv removed — 0 scope-able) |
| Bottom stats bar — `<jobs> // <companies> // <countries> // POWERED BY EMERGENCES LABS [www] [in]` | ✅ shipped, links live |
| `data/building_focus.json` + `data/building_focus_extended.json` merged in buildings.js | ✅ shipped — 127 entries, 80 unique cos, 115/4682 offices = 2.5% coverage |
| Auto-spin at home view (~0.8°/sec, off in scope or zoom-in) | ✅ shipped |
| Camera limits: 200m floor, 30,000km ceiling, inertiaZoom 0, collision on | ✅ shipped |
| EMERGENCES LABS HUD top-left | ❌ removed (overlapped scope bar) |
| HUD top-right (timestamp + lat/lon) | ❌ removed (clutter, not needed for the demo) |
| Search bar in topbar | ❌ replaced with scope-select dropdown |
| `src/topbar.js` (search wiring) | ⚠ dead code — safe to delete |
| Pitch deck at `public/pitch.html` (5 slides, transparent QRs) | ✅ shipped — `https://ai-jobs-globe.vercel.app/pitch.html` |

---

## Open Items

The 6 items from the original 2026-04-26 cleanup list are all SHIPPED. Current open items:

1. **Re-geocode the remaining 4,567 offices.** Coverage is only 2.5% (115 of 4,682). The `data/_research_brief_v2.md` agent only covered top 80 employers. Path forward: Google Places API script (~$15-20, ~30 min code + run), or a third agent pass with a wider brief. Without this, most polylines from "the long tail" use city-center geocoding instead of building-precise coords.
2. **Auto-scope on zoom-in** disabled — was firing erroneously on boot. Worth re-enabling once we can debug it interactively.
3. **`src/topbar.js`** is dead code (search input was replaced). Safe to delete.
4. **Filter button is a no-op.** Should expose AI-type / tier / country filters per the original SOT spec, OR remove the button.
5. **Scope-only dropdown** could carry the company logo next to the name (currently text-only).
6. **Scope mode neighbour radius** — brackets show buildings within 5 km. Some metros (LA, London Greater Area) might want bigger radius; some dense city centres (Manhattan) might want smaller. Tune-by-zoom-level is a future polish.

---

## Reference Visuals

Bilawal Sidhu's WORLDVIEW remains the primary visual target (see `Reference Visuals & Inspiration` section above). The bracket markers `[ ]`, the close-up camera-orbit-per-building, and the cyan/amber colour palette are all tracking that reference.
