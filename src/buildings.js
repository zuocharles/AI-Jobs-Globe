/**
 * Building locations — feeds Cesium scope-mode auto-focus.
 *
 * Data source: data/building_focus.json (53 entries across the top 30
 * employers). Compiled by a background research agent on 2026-04-26 from
 * canonical training-knowledge sources (Wikipedia infoboxes, official
 * locations pages). 38 high-confidence + 15 medium/low — see
 * SOT/data.md for the audit notes.
 *
 * Imported directly via Vite's JSON loader so it ships in the bundle and
 * doesn't need a runtime fetch.
 */
import buildingFocusData from '../data/building_focus.json';
import buildingFocusExtended from '../data/building_focus_extended.json';

const buildings = [
  ...(buildingFocusData.buildings || []),
  ...(buildingFocusExtended.buildings || []),
];

/**
 * Lookup helpers. We index by:
 *   - lowercase company name (for TARGETS-click → scope)
 *   - approximate (lat, lon) bucket (for auto-scope on zoom-in)
 */
const byCompany = new Map();        // co → buildings[]
const byLocationKey = new Map();    // co|cityShort → building (best match)

function normalize(s) {
  return String(s || '').trim().toLowerCase();
}

function cityShort(locationName) {
  // Pull the city out of "San Francisco, CA, US" → "san francisco"
  return normalize(String(locationName || '').split(',')[0]);
}

for (const b of buildings) {
  const co = normalize(b.company);
  if (!co) continue;
  if (!byCompany.has(co)) byCompany.set(co, []);
  byCompany.get(co).push(b);
  byLocationKey.set(`${co}|${cityShort(b.city)}`, b);
}

/**
 * Find the building entry that best matches an office row from globe_data.
 * @param {object} office  { company, location_name, ... }
 * @returns {object|null}
 */
export function findBuildingForOffice(office) {
  if (!office) return null;
  const co = normalize(office.company);
  // Try exact (company, city) match first.
  const exact = byLocationKey.get(`${co}|${cityShort(office.location_name)}`);
  if (exact) return exact;
  // Fallback: first known building for that company (likely the HQ).
  const list = byCompany.get(co);
  return list && list[0] ? list[0] : null;
}

/**
 * All buildings within `radiusKm` km of a (lat, lon). Used for the L/R
 * cycle in scope mode — when user is scoped into one office, L/R rotates
 * through neighbouring buildings in the same city.
 */
export function buildingsNear(lat, lon, radiusKm = 50) {
  const r2 = radiusKm * radiusKm;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  return buildings.filter((b) => {
    const dLat = (b.lat - lat) * 111;       // ~km per deg latitude
    const dLon = (b.lon - lon) * 111 * cosLat;
    return dLat * dLat + dLon * dLon <= r2;
  });
}

/**
 * Nearest known building to a (lat, lon). Returns null if nothing within
 * `maxKm`. Used for auto-scope when camera drops below the altitude floor.
 */
export function nearestBuilding(lat, lon, maxKm = 30) {
  let best = null;
  let bestD2 = (maxKm * maxKm);
  const cosLat = Math.cos((lat * Math.PI) / 180);
  for (const b of buildings) {
    const dLat = (b.lat - lat) * 111;
    const dLon = (b.lon - lon) * 111 * cosLat;
    const d2 = dLat * dLat + dLon * dLon;
    if (d2 < bestD2) {
      best = b;
      bestD2 = d2;
    }
  }
  return best;
}

/** All loaded buildings (for debugging / future filtering). */
export function allBuildings() {
  return buildings;
}

/**
 * All buildings sorted by longitude west→east, then latitude. This is the
 * order Cesium scope-mode uses to cycle around the globe — clicking NEXT
 * 500+ times eventually walks SF → LA → Vegas → Denver → Chicago → NYC →
 * Dublin → London → Berlin → Beijing → Tokyo → wraps back. Geographic
 * order so neighbours are always actual neighbours.
 */
const buildingsByLon = [...buildings].sort((a, b) => {
  if (a.lon !== b.lon) return a.lon - b.lon;
  return a.lat - b.lat;
});

export function allBuildingsByLongitude() {
  return buildingsByLon;
}

/**
 * Index of a building in the global longitude-sorted list. Returns -1 if
 * the building isn't found (e.g. it was passed in by an external caller).
 */
export function buildingIndex(building) {
  if (!building) return -1;
  return buildingsByLon.findIndex((b) =>
    b.lat === building.lat && b.lon === building.lon && b.company === building.company,
  );
}

/**
 * Top company in a city (by jobsByCompany lookup). For city-pill clicks
 * → enter scope on the highest-jobs employer in that pill's city.
 *
 * @param {string} cityName  e.g. "San Francisco"
 * @param {Map<string, number>} jobsByCompany  company name → total open jobs
 * @returns {object|null}
 */
export function topBuildingInCity(cityName, jobsByCompany) {
  const city = normalize(cityName);
  let best = null;
  let bestJobs = -1;
  for (const b of buildings) {
    if (cityShort(b.city) !== city) continue;
    const j = jobsByCompany.get(normalize(b.company)) ?? 0;
    if (j > bestJobs) {
      best = b;
      bestJobs = j;
    }
  }
  return best;
}
