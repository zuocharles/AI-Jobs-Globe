/**
 * Spike + heat layer.
 *
 * Many of our office rows share the exact same lat/lon (e.g. 50+ companies
 * geocoded to "San Francisco, CA" at 37.7749, -122.4194). If we drop a
 * cylinder at every row, they all stack on the same pixel — visually we lose
 * the signal that SF is a hotspot.
 *
 * Strategy:
 *   1. Group offices by rounded (lat, lon) — that's a city cluster.
 *   2. For each cluster, draw ONE big heat-aura disc at the centre, sized by
 *      total jobs across all companies in that city.
 *   3. Distribute each company's spike in a small ring around the centre so
 *      they remain individually selectable. Heights scale with the company's
 *      job count at that office.
 */
import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
  HeightReference,
} from 'cesium';

const TIER_COLOR = {
  1: Color.fromCssColorString('#00ffff'),  // cyan — top brand
  2: Color.fromCssColorString('#3b82f6'),  // blue — strong
  3: Color.fromCssColorString('#8b5cf6'),  // purple — emerging
};

// Heat aura at the city centre. Cyan because that's our "data" colour.
const HEAT_COLOR = Color.fromCssColorString('#00ffff');

function tierColor(tier) {
  return TIER_COLOR[tier] || TIER_COLOR[2];
}

/**
 * Spike height in meters. Scaled so a 1-job site is still visible from orbit
 * (~30 km) and a 100-job site towers (~140 km).
 */
function spikeHeightMeters(jobCount) {
  return 25_000 + Math.log2(jobCount + 1) * 18_000;
}

/**
 * Spike base radius in meters. A bit fatter for big sites.
 */
function spikeRadiusMeters(jobCount) {
  return 1_200 + Math.sqrt(jobCount) * 300;
}

/**
 * Heat-aura radius in meters around the city centre.
 * Scales with sqrt(total city jobs) so SF (~1500 jobs) reads as a much
 * bigger blob than Boise (~5 jobs).
 */
function heatRadiusMeters(totalJobs) {
  return 6_000 + Math.sqrt(totalJobs) * 2_000;
}

/**
 * Round to ~1km precision so coordinates that are "essentially the same
 * city" hash to the same key. Two offices within 0.01° (~1 km at the
 * equator) get clustered together.
 */
function clusterKey(lat, lon) {
  return `${lat.toFixed(2)}|${lon.toFixed(2)}`;
}

/**
 * Distribute N points around a centre in a ring of given radius (meters).
 * Returns degree-offsets [dLat, dLon] for each index.
 *
 * This is the classic "small ring" trick: 1 deg of latitude is ~111 km,
 * 1 deg of longitude is ~111*cos(lat) km. We invert that for the offset.
 */
function ringOffset(index, count, radiusMeters, centreLatDeg) {
  if (count <= 1) return [0, 0];
  const angle = (2 * Math.PI * index) / count;
  const dLat = (radiusMeters * Math.cos(angle)) / 111_000;
  const dLon = (radiusMeters * Math.sin(angle)) / (111_000 * Math.cos((centreLatDeg * Math.PI) / 180));
  return [dLat, dLon];
}

/**
 * Add spikes + heat auras to the viewer.
 *
 * @param {import('cesium').Viewer} viewer
 * @param {Array} offices  Rows from the globe_data view.
 * @returns {Map<string, object>}  entityId → office row, used for hover/click lookup.
 */
export function renderSpikes(viewer, offices) {
  const officeById = new Map();
  const entities = viewer.entities;

  // 1. Bucket offices by rough city coords.
  const clusters = new Map(); // key -> { lat, lon, totalJobs, members[] }
  for (const o of offices) {
    if (!o.lat || !o.lon || !o.job_count) continue;
    const k = clusterKey(o.lat, o.lon);
    const c = clusters.get(k) || { lat: o.lat, lon: o.lon, totalJobs: 0, members: [] };
    c.totalJobs += o.job_count;
    c.members.push(o);
    clusters.set(k, c);
  }

  // 2. For each cluster: heat aura + per-member spikes distributed in a ring.
  for (const cluster of clusters.values()) {
    // Heat aura at city centre. Cesium's clamp-to-ground for ellipses requires
    // an explicit height; we set 0 and skip the outline (outlines on
    // ground-clamped polygons trip the material batch updater).
    entities.add({
      ellipse: {
        semiMinorAxis: heatRadiusMeters(cluster.totalJobs),
        semiMajorAxis: heatRadiusMeters(cluster.totalJobs),
        material: new ColorMaterialProperty(HEAT_COLOR.withAlpha(0.18)),
        height: 0,
        heightReference: HeightReference.CLAMP_TO_GROUND,
      },
      position: Cartesian3.fromDegrees(cluster.lon, cluster.lat, 0),
    });

    // Ring radius scales gently with cluster size so dense cities don't have
    // overlapping spikes, but small towns don't waste space.
    const ringRadius = Math.min(2_500 + cluster.members.length * 120, 25_000);

    cluster.members.forEach((o, idx) => {
      const [dLat, dLon] = ringOffset(idx, cluster.members.length, ringRadius, cluster.lat);
      const lat = cluster.lat + dLat;
      const lon = cluster.lon + dLon;
      const id = `office-${o.office_id}`;
      const height = spikeHeightMeters(o.job_count);
      const radius = spikeRadiusMeters(o.job_count);
      const color = tierColor(o.tier);

      // Cylinder centre is at half-height so the base sits on the ground.
      const position = Cartesian3.fromDegrees(lon, lat, height / 2);

      entities.add({
        id,
        position,
        cylinder: {
          length: height,
          topRadius: radius * 0.35,
          bottomRadius: radius,
          // Outlines on cylinders trip Cesium's batch updater
          // ("materialProperty.getType is not a function" each frame). Skipping
          // outline keeps the render loop clean; the additive material still
          // gives the spike crisp edges.
          material: new ColorMaterialProperty(color.withAlpha(0.7)),
        },
        properties: {
          office_id: o.office_id,
          company: o.company,
        },
      });

      officeById.set(id, { ...o, lat, lon }); // store the jittered coords for fly-to
    });
  }

  return officeById;
}

// Track previous hover so we only repaint two spikes per move
// instead of all 4,682 — keeps the highlight cheap.
let lastHoverId = null;

/**
 * Highlight one spike (on hover). Pass null to clear.
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
      const c = tierColor(curOffice.tier);
      cur.cylinder.material = new ColorMaterialProperty(c.withAlpha(0.95));
    }
  }
  lastHoverId = hoverId;
}
