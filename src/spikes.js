/**
 * Spike layer — polyline only.
 *
 * One thin glowing vertical polyline per office, height proportional to
 * log2(jobs). Tall enough to read from low orbit (~1900km max), thin enough
 * to see PAST when zoomed close.
 *
 * Anchoring rules (in order of precedence):
 *   1. If the office has a precise building entry (top-30 + ranks 31-80
 *      from data/building_focus*.json), the polyline base sits ON that
 *      building's lat/lon.
 *   2. If MULTIPLE offices land on the SAME exact (rounded) lat/lon —
 *      either both via building data OR both via city geocode — they get
 *      ring-distributed in a small circle around that point so each
 *      polyline is independently clickable.
 *   3. Otherwise, the polyline base is at the office's city geocode.
 *
 * Bracket markers ("[ ]") are NO LONGER drawn here — Charles wants them
 * to appear ONLY in scope view (rendered by src/scope.js), not on every
 * spike all the time. Globe view stays clean polylines.
 */
import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
} from 'cesium';
import { findBuildingForOffice } from './buildings.js';

const TIER_COLOR = {
  1: Color.fromCssColorString('#00ffff'),  // cyan — top brand
  2: Color.fromCssColorString('#3b82f6'),  // blue — strong
  3: Color.fromCssColorString('#8b5cf6'),  // purple — emerging
};

function tierColor(tier) {
  return TIER_COLOR[tier] || TIER_COLOR[2];
}

/**
 * Cylinder spike height in meters.
 *   1 job   ≈  400 km  (visible from low orbit)
 *   10 jobs ≈  920 km
 *   100 jobs ≈ 1400 km
 *   1000 jobs ≈ 1900 km — about 30% of Earth's radius, dramatic
 */
function spikeHeightMeters(jobCount) {
  return 400_000 + Math.log2(jobCount + 1) * 150_000;
}

/**
 * Cylinder radius in meters — sized to roughly match a typical office
 * building footprint (~15-30 m wide). Scales gently with job count so a
 * busy site reads slightly chunkier than a quiet one.
 */
function spikeRadiusMeters(jobCount) {
  return 15 + Math.sqrt(jobCount) * 1.5;   // 1 job: 17m, 100 jobs: 30m, 1000 jobs: 62m
}

/** Round to ~1km precision for clustering by city. */
function clusterKey(lat, lon) {
  return `${lat.toFixed(2)}|${lon.toFixed(2)}`;
}

/** Round to ~10m precision for "same exact building" detection. */
function buildingKey(lat, lon) {
  return `${lat.toFixed(4)}|${lon.toFixed(4)}`;
}

function ringOffset(index, count, radiusMeters, centreLatDeg) {
  if (count <= 1) return [0, 0];
  const angle = (2 * Math.PI * index) / count;
  const dLat = (radiusMeters * Math.cos(angle)) / 111_000;
  const dLon = (radiusMeters * Math.sin(angle)) / (111_000 * Math.cos((centreLatDeg * Math.PI) / 180));
  return [dLat, dLon];
}

/**
 * Add the spike layer to the viewer.
 *
 * @param {import('cesium').Viewer} viewer
 * @param {Array} offices  Rows from the globe_data view.
 * @returns {Map<string, object>}  entityId → office row, used for hover/click lookup.
 */
export function renderSpikes(viewer, offices) {
  const officeById = new Map();
  const entities = viewer.entities;

  // Pass 1 — figure out the "intended" anchor for each office: building
  // lat/lon if we have one, otherwise city lat/lon. We need this BEFORE
  // ring-distribution so we can detect exact-coord collisions.
  const anchored = offices
    .filter((o) => o.lat && o.lon && o.job_count)
    .map((o) => {
      const building = findBuildingForOffice(o);
      const lat = building ? building.lat : o.lat;
      const lon = building ? building.lon : o.lon;
      return { office: o, lat, lon, building };
    });

  // Pass 2 — bucket by ROUNDED-TO-10m coords so two companies sharing the
  // same building (or two city-geocoded entries that happen to collide)
  // end up in the same micro-cluster and get ring-distributed.
  const microClusters = new Map();
  for (const a of anchored) {
    const k = buildingKey(a.lat, a.lon);
    const c = microClusters.get(k) || { lat: a.lat, lon: a.lon, members: [] };
    c.members.push(a);
    microClusters.set(k, c);
  }

  // Pass 3 — also bucket by city-rough coords for offices WITHOUT building
  // data, since 50+ companies geocoded to "San Francisco, CA" all share the
  // same city centre and need a wider distribution ring.
  const cityClusters = new Map();
  for (const a of anchored) {
    if (a.building) continue;  // building-anchored offices use micro-cluster only
    const k = clusterKey(a.lat, a.lon);
    const c = cityClusters.get(k) || { lat: a.lat, lon: a.lon, members: [] };
    c.members.push(a);
    cityClusters.set(k, c);
  }

  // Pass 4 — render. For each office, compute its FINAL position by stacking:
  //   (a) city-ring offset if no building (spreads city-geocode pile-ups)
  //   (b) micro-cluster offset if same exact lat/lon as another (spreads
  //       same-building-multi-company)
  // Then draw the polyline.
  for (const cityCluster of cityClusters.values()) {
    cityCluster.members.forEach((a, idx) => {
      const [dLat, dLon] = ringOffset(idx, cityCluster.members.length,
        Math.min(2_500 + cityCluster.members.length * 120, 25_000),
        cityCluster.lat);
      a.lat = cityCluster.lat + dLat;
      a.lon = cityCluster.lon + dLon;
    });
  }
  // Re-bucket micro-clusters AFTER city-ring shifts (so the building-anchored
  // entries can still pull in any others that match their final coords).
  const finalMicro = new Map();
  for (const a of anchored) {
    const k = buildingKey(a.lat, a.lon);
    const c = finalMicro.get(k) || { lat: a.lat, lon: a.lon, members: [] };
    c.members.push(a);
    finalMicro.set(k, c);
  }
  for (const m of finalMicro.values()) {
    if (m.members.length === 1) continue;
    // Ring-spread same-building offices ~30 m apart so each polyline is
    // individually clickable but they still feel "co-located."
    m.members.forEach((a, idx) => {
      const [dLat, dLon] = ringOffset(idx, m.members.length, 30, m.lat);
      a.lat = m.lat + dLat;
      a.lon = m.lon + dLon;
    });
  }

  // Pass 5 — actually create the entities. Each office is a real 3D
  // cylinder roughly the footprint of a typical office building; never an
  // outline (Cesium's batch updater previously crashed with
  // "materialProperty.getType is not a function" on cylinder outlines).
  for (const a of anchored) {
    const o = a.office;
    const id = `office-${o.office_id}`;
    const height = spikeHeightMeters(o.job_count);
    const radius = spikeRadiusMeters(o.job_count);
    const color = tierColor(o.tier);

    // Cesium positions cylinders by their CENTRE, so the entity sits at
    // half-height to put the base flush with ground level.
    const position = Cartesian3.fromDegrees(a.lon, a.lat, height / 2);

    entities.add({
      id,
      position,
      cylinder: {
        length: height,
        topRadius: radius,
        bottomRadius: radius,
        material: new ColorMaterialProperty(color.withAlpha(0.7)),
        // NO outline. NO outlineColor. They crash the batch updater.
      },
      properties: {
        office_id: o.office_id,
        company: o.company,
      },
    });

    officeById.set(id, { ...o, lat: a.lat, lon: a.lon });
  }

  return officeById;
}

// Track previous hover so we only repaint two cylinders per move.
let lastHoverId = null;

/**
 * Highlight one spike on hover. Brightens the cylinder material.
 * (Radius doesn't change on hover — that would require recomputing the
 * cylinder's centre position, since the entity sits at half-height.)
 */
export function setHover(viewer, hoverId, officeById) {
  if (hoverId === lastHoverId) return;
  if (lastHoverId) {
    const prev = viewer.entities.getById(lastHoverId);
    const prevOffice = officeById?.get(lastHoverId);
    if (prev?.cylinder && prevOffice) {
      const c = tierColor(prevOffice.tier);
      prev.cylinder.material = new ColorMaterialProperty(c.withAlpha(0.7));
    }
  }
  if (hoverId) {
    const cur = viewer.entities.getById(hoverId);
    const curOffice = officeById?.get(hoverId);
    if (cur?.cylinder && curOffice) {
      cur.cylinder.material = new ColorMaterialProperty(Color.WHITE.withAlpha(0.95));
    }
  }
  lastHoverId = hoverId;
}
