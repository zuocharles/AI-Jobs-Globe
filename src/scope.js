/**
 * Scope mode — close-up auto-focus camera over a specific building.
 *
 * Inspired by Bilawal Sidhu's WORLDVIEW. When the user enters scope mode
 * (either by clicking a TARGETS company that has a known building OR by
 * zooming in below the altitude floor near a known building), the camera
 * smoothly flies to a framed close-up of that building using Google's
 * Photorealistic 3D Tiles for the actual rendering.
 *
 * In scope mode:
 *   - L/R arrow keys cycle to the next/previous nearby building (different
 *     companies, same geographic area, since cities are densely populated)
 *   - ESC or [ EXIT SCOPE ] button returns the camera to the globe view at
 *     the city's altitude
 *   - A small label shows "Company · Building Name · Address"
 */
import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
  HeightReference,
  HeadingPitchRange,
  Math as CesiumMath,
} from 'cesium';
import { buildingsNear } from './buildings.js';

const barEl = () => document.getElementById('scope-bar');
const labelEl = () => document.getElementById('scope-label');

const HIGHLIGHT_ID = '__scope_highlight__';
let highlightViewer = null;

const state = {
  active: false,
  building: null,         // currently scoped building
  neighbours: [],         // buildings near current (incl. itself, sorted)
  index: 0,               // index of current building in `neighbours`
  exitedAt: 0,            // timestamp of last exit (for auto-trigger debounce)
  preScopeAlt: null,      // camera altitude when we entered scope (for exit fly-back)
  preScopePos: null,      // camera position when we entered scope
};

export function isScopeActive() {
  return state.active;
}

export function timeSinceLastExitMs() {
  return Date.now() - state.exitedAt;
}

/**
 * Fly the camera to a framed close-up of `building` and enter scope mode.
 * @param {import('cesium').Viewer} viewer
 * @param {object} building   row from building_focus.json
 */
export function enterScope(viewer, building) {
  if (!building) return;

  // Remember the camera state so EXIT SCOPE can fly us back out.
  if (!state.active) {
    const c = viewer.camera.positionCartographic;
    state.preScopeAlt = c.height;
    state.preScopePos = {
      lat: CesiumMath.toDegrees(c.latitude),
      lon: CesiumMath.toDegrees(c.longitude),
    };
  }

  state.active = true;
  state.building = building;
  state.neighbours = buildingsNear(building.lat, building.lon, 50)
    .sort((a, b) => {
      // Stable order: by company name, then building name, so L/R is predictable.
      const c = (a.company || '').localeCompare(b.company || '');
      if (c !== 0) return c;
      return (a.building_name || '').localeCompare(b.building_name || '');
    });
  state.index = state.neighbours.findIndex(
    (b) => b.lat === building.lat && b.lon === building.lon && b.company === building.company,
  );
  if (state.index < 0) state.index = 0;

  flyToBuilding(viewer, building);
  showScopeUI(building);
  showBuildingHighlight(viewer, building);
}

/**
 * Exit scope mode: fly the camera back to the pre-scope altitude over the
 * same lat/lon (so the user lands roughly where they were before scoping).
 */
export function exitScope(viewer) {
  if (!state.active) return;
  state.active = false;
  state.exitedAt = Date.now();
  hideScopeUI();
  hideBuildingHighlight(viewer);
  // Fly back to a reasonable globe view above the building. Use 500km min
  // so we're well above the 3km auto-scope altitude threshold and the
  // debounce can run out before we drop low again.
  const back = state.preScopePos || { lat: state.building.lat, lon: state.building.lon };
  const alt = Math.max(state.preScopeAlt || 500_000, 500_000);
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(back.lon, back.lat, alt),
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-65), roll: 0 },
    duration: 1.4,
  });
  state.building = null;
  state.neighbours = [];
}

/** Cycle L/R to the next/previous building in the city. */
export function cycle(viewer, direction) {
  if (!state.active || !state.neighbours.length) return;
  state.index = (state.index + direction + state.neighbours.length) % state.neighbours.length;
  const next = state.neighbours[state.index];
  state.building = next;
  flyToBuilding(viewer, next);
  showScopeUI(next);
  showBuildingHighlight(viewer, next);
}

// ── private ───────────────────────────────────────────────────────────

function flyToBuilding(viewer, building) {
  const cam = building.camera || {};
  const altitude = cam.altitude_m ?? 250;
  const heading = (cam.heading_deg ?? 45) * Math.PI / 180;
  const pitch = (cam.pitch_deg ?? -30) * Math.PI / 180;
  const range = cam.range_m ?? 400;

  // Use lookAt with HeadingPitchRange so the camera ends up framed around the
  // building rather than flying THROUGH it.
  const target = Cartesian3.fromDegrees(building.lon, building.lat, altitude * 0.5);
  viewer.camera.flyToBoundingSphere(
    { center: target, radius: range / 3 },
    {
      offset: new HeadingPitchRange(heading, pitch, range),
      duration: 1.6,
    },
  );
}

function showScopeUI(building) {
  const bar = barEl();
  if (bar) bar.hidden = false;
  const label = labelEl();
  if (label) {
    const parts = [
      escapeHtml(building.company || '—'),
      escapeHtml(building.building_name || ''),
      escapeHtml(building.address || ''),
    ].filter(Boolean);
    label.innerHTML = parts.map((p, i) =>
      i === 0
        ? `<span class="scope-co">${p}</span>`
        : `<span class="scope-meta">${p}</span>`
    ).join('<span class="scope-sep">//</span>');
  }
}

function hideScopeUI() {
  const bar = barEl();
  if (bar) bar.hidden = true;
}

/**
 * Drop a small ground-clamped cyan ring at the building's lat/lon so the
 * user can see exactly which footprint is currently scoped. Reused across
 * cycles by repositioning the same entity (id = HIGHLIGHT_ID).
 */
function showBuildingHighlight(viewer, building) {
  highlightViewer = viewer;
  let entity = viewer.entities.getById(HIGHLIGHT_ID);
  const position = Cartesian3.fromDegrees(building.lon, building.lat, 0);
  if (entity) {
    entity.position = position;
    entity.show = true;
  } else {
    viewer.entities.add({
      id: HIGHLIGHT_ID,
      position,
      ellipse: {
        semiMinorAxis: 40,   // ~40 m radius spotlight at ground level
        semiMajorAxis: 40,
        material: new ColorMaterialProperty(Color.fromCssColorString('#00ffff').withAlpha(0.45)),
        height: 0,
        heightReference: HeightReference.CLAMP_TO_GROUND,
      },
    });
  }
}

function hideBuildingHighlight(viewer) {
  const v = viewer || highlightViewer;
  if (!v) return;
  const entity = v.entities.getById(HIGHLIGHT_ID);
  if (entity) entity.show = false;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
