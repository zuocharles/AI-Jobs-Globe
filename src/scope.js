/**
 * Scope mode — close-up auto-focus camera over a specific building.
 *
 * - Cycle order is GLOBAL by longitude (SF → LA → Denver → NYC → London → Beijing → Tokyo → wraps).
 *   Charles asked: cycling NEXT 500+ should walk the world, not bounce between two SF buildings.
 * - Bracket markers `[ ]` are rendered ONLY in scope view, on each company
 *   visible inside the current frame (not on every spike on the globe).
 * - Highlight ring is enlarged + raised + depth-tested-through-walls so it
 *   stays visible behind tall photoreal building geometry.
 */
import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  HeightReference,
  HeadingPitchRange,
  LabelStyle,
  NearFarScalar,
  VerticalOrigin,
  Math as CesiumMath,
} from 'cesium';
import {
  allBuildingsByLongitude,
  buildingIndex,
  buildingsNear,
  findOfficeForBuilding,
} from './buildings.js';

const barEl = () => document.getElementById('scope-bar');
const labelEl = () => document.getElementById('scope-label');

const HIGHLIGHT_ID = '__scope_highlight__';
const BRACKET_ID_PREFIX = '__scope_bracket__:';
let highlightViewer = null;

const state = {
  active: false,
  building: null,         // currently scoped building
  index: 0,               // index in the global longitude-sorted list
  exitedAt: 0,
  preScopeAlt: null,
  preScopePos: null,
};

export function isScopeActive() {
  return state.active;
}

export function timeSinceLastExitMs() {
  return Date.now() - state.exitedAt;
}

/**
 * Enter scope mode on a specific building.
 */
export function enterScope(viewer, building) {
  if (!building) return;

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
  // Find the building's slot in the GLOBAL longitude-sorted order so
  // L/R cycling walks the world from this anchor.
  const idx = buildingIndex(building);
  state.index = idx >= 0 ? idx : 0;

  flyToBuilding(viewer, building);
  showScopeUI(building);
  showBuildingHighlight(viewer, building);
  refreshScopeBrackets(viewer, building);
}

/**
 * Exit scope: fly camera back to a 500km globe view + tear down scope UI.
 */
export function exitScope(viewer) {
  if (!state.active) return;
  state.active = false;
  state.exitedAt = Date.now();
  hideScopeUI();
  hideBuildingHighlight(viewer);
  clearScopeBrackets(viewer);
  const back = state.preScopePos || { lat: state.building.lat, lon: state.building.lon };
  const alt = Math.max(state.preScopeAlt || 500_000, 500_000);
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(back.lon, back.lat, alt),
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-65), roll: 0 },
    duration: 1.4,
  });
  state.building = null;
}

/**
 * Cycle to the previous (-1) or next (+1) building in the GLOBAL longitude
 * order. Wraps so 500+ NEXT eventually walks the whole world.
 */
export function cycle(viewer, direction) {
  if (!state.active) return;
  const all = allBuildingsByLongitude();
  if (!all.length) return;
  state.index = (state.index + direction + all.length) % all.length;
  const next = all[state.index];
  state.building = next;
  flyToBuilding(viewer, next);
  showScopeUI(next);
  showBuildingHighlight(viewer, next);
  refreshScopeBrackets(viewer, next);
}

// ── private ───────────────────────────────────────────────────────────

function flyToBuilding(viewer, building) {
  const cam = building.camera || {};
  const altitude = cam.altitude_m ?? 250;
  const heading = (cam.heading_deg ?? 45) * Math.PI / 180;
  const pitch = (cam.pitch_deg ?? -30) * Math.PI / 180;
  const range = cam.range_m ?? 400;

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
 * Cyan halo at the active building. Larger (80m), raised slightly above the
 * ground (5m) so it doesn't clip into terrain, and depth-test-disabled within
 * 50km so it punches through wall geometry from the camera's pitched view.
 */
function showBuildingHighlight(viewer, building) {
  highlightViewer = viewer;
  let entity = viewer.entities.getById(HIGHLIGHT_ID);
  const position = Cartesian3.fromDegrees(building.lon, building.lat, 5);
  if (entity) {
    entity.position = position;
    entity.show = true;
  } else {
    viewer.entities.add({
      id: HIGHLIGHT_ID,
      position,
      ellipse: {
        semiMinorAxis: 80,
        semiMajorAxis: 80,
        material: new ColorMaterialProperty(Color.fromCssColorString('#00ffff').withAlpha(0.55)),
        height: 5,
        heightReference: HeightReference.NONE,
        outline: true,
        outlineColor: Color.fromCssColorString('#00ffff').withAlpha(0.95),
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

/**
 * Render bracket markers `[ ]` for every building near the active one, so
 * the user sees the WORLDVIEW look of "scopable targets" inside the current
 * frame. Skips buildings with no matching office row (so brackets never
 * lead to empty panels) and tags each bracket entity with its office_id
 * so clicking a bracket can open the detail panel.
 */
function refreshScopeBrackets(viewer, current) {
  clearScopeBrackets(viewer);
  // 5km radius around the active building — companies that share the frame.
  const visible = buildingsNear(current.lat, current.lon, 5);
  for (const b of visible) {
    const office = findOfficeForBuilding(b);
    if (!office) continue;   // skip brackets that lead nowhere
    const isCurrent = b.lat === current.lat && b.lon === current.lon && b.company === current.company;
    const color = isCurrent
      ? Color.fromCssColorString('#fcd34d')   // amber for the active one
      : Color.fromCssColorString('#00ffff');  // cyan for neighbours
    viewer.entities.add({
      id: BRACKET_ID_PREFIX + 'office-' + office.office_id,
      position: Cartesian3.fromDegrees(b.lon, b.lat, 30),
      label: {
        text: '[ ' + (b.company || '') + ' ]',
        font: '12px "JetBrains Mono", monospace',
        fillColor: color.withAlpha(0.95),
        outlineColor: Color.BLACK.withAlpha(0.9),
        outlineWidth: 2,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -4),
        scaleByDistance: new NearFarScalar(200, 1.2, 5_000, 0.7),
        disableDepthTestDistance: 50_000,
      },
      properties: {
        office_id: office.office_id,
      },
    });
  }
}

function clearScopeBrackets(viewer) {
  const v = viewer || highlightViewer;
  if (!v) return;
  const toRemove = v.entities.values
    .filter((e) => typeof e.id === 'string' && e.id.startsWith(BRACKET_ID_PREFIX));
  for (const e of toRemove) v.entities.remove(e);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
