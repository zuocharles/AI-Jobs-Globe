/**
 * Spike + heat layer (hybrid rendering).
 *
 * Three coordinated layers per office cluster:
 *
 *   1. **Heat aura** (Entity.ellipse, ground-clamped): one big translucent
 *      cyan disc per city. Radius scales with sqrt(total city jobs) so SF Bay
 *      Area reads as a much larger glow than Boise. Visible from orbit.
 *
 *   2. **Always-visible point marker** (Entity.point, screen-space pixels):
 *      one small cyan/blue/purple dot per office. Stays the same size on screen
 *      regardless of camera distance — never invisible from orbit, never huge
 *      when zoomed in. This is the click target for hover + select.
 *
 *   3. **Polyline spike** (Entity.polyline, screen-space pixels for width):
 *      thin vertical line rising from each office, height proportional to
 *      log2(jobs). 3 px wide, so it's always visible from any altitude but
 *      thin enough to see PAST when zoomed close (no more "fat cylinder
 *      blocking the camera" problem).
 *
 * Many of our office rows share the exact same lat/lon (e.g. 50+ companies
 * geocoded to "San Francisco, CA"). We cluster by rounded coords, draw ONE
 * heat aura per city, and distribute the per-office points + polylines in a
 * small ring around the centre so they're individually selectable.
 */
import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
  PolylineGlowMaterialProperty,
  HeightReference,
  NearFarScalar,
} from 'cesium';

const TIER_COLOR = {
  1: Color.fromCssColorString('#00ffff'),  // cyan — top brand
  2: Color.fromCssColorString('#3b82f6'),  // blue — strong
  3: Color.fromCssColorString('#8b5cf6'),  // purple — emerging
};

const HEAT_COLOR = Color.fromCssColorString('#00ffff');

function tierColor(tier) {
  return TIER_COLOR[tier] || TIER_COLOR[2];
}

/**
 * Polyline spike height in meters. Tall enough to read from low orbit, but
 * scaled gently so big sites tower without dwarfing the planet:
 *   1 job   ≈  40 km
 *   10 jobs ≈ 100 km
 *   100 jobs ≈ 160 km
 *   1000 jobs ≈ 220 km
 */
function spikeHeightMeters(jobCount) {
  return 40_000 + Math.log2(jobCount + 1) * 20_000;
}

/**
 * Heat-aura radius in meters around city centre. Scales with sqrt(total city
 * jobs). SF Bay Area (~1500 jobs) gets ~150 km radius — a clear regional glow
 * without clobbering LA. Tweak the constants if you want more/less drama.
 */
function heatRadiusMeters(totalJobs) {
  return 30_000 + Math.sqrt(totalJobs) * 4_000;
}

function clusterKey(lat, lon) {
  return `${lat.toFixed(2)}|${lon.toFixed(2)}`;
}

/**
 * Distribute N points around a centre in a ring of given radius (meters).
 * 1 deg lat ≈ 111 km; 1 deg lon ≈ 111*cos(lat) km.
 */
function ringOffset(index, count, radiusMeters, centreLatDeg) {
  if (count <= 1) return [0, 0];
  const angle = (2 * Math.PI * index) / count;
  const dLat = (radiusMeters * Math.cos(angle)) / 111_000;
  const dLon = (radiusMeters * Math.sin(angle)) / (111_000 * Math.cos((centreLatDeg * Math.PI) / 180));
  return [dLat, dLon];
}

/**
 * Add the hybrid spike + heat layer to the viewer.
 *
 * @param {import('cesium').Viewer} viewer
 * @param {Array} offices  Rows from the globe_data view.
 * @returns {Map<string, object>}  entityId → office row, used for hover/click lookup.
 */
export function renderSpikes(viewer, offices) {
  const officeById = new Map();
  const entities = viewer.entities;

  // 1. Bucket offices by rough city coords.
  const clusters = new Map();
  for (const o of offices) {
    if (!o.lat || !o.lon || !o.job_count) continue;
    const k = clusterKey(o.lat, o.lon);
    const c = clusters.get(k) || { lat: o.lat, lon: o.lon, totalJobs: 0, members: [] };
    c.totalJobs += o.job_count;
    c.members.push(o);
    clusters.set(k, c);
  }

  // 2. For each cluster: heat aura + per-member point + polyline spike.
  for (const cluster of clusters.values()) {
    // Heat aura at city centre.
    entities.add({
      ellipse: {
        semiMinorAxis: heatRadiusMeters(cluster.totalJobs),
        semiMajorAxis: heatRadiusMeters(cluster.totalJobs),
        material: new ColorMaterialProperty(HEAT_COLOR.withAlpha(0.10)),
        height: 0,
        heightReference: HeightReference.CLAMP_TO_GROUND,
      },
      position: Cartesian3.fromDegrees(cluster.lon, cluster.lat, 0),
    });

    // Ring radius scales with cluster size so dense cities don't have
    // overlapping spikes, but small towns don't waste space.
    const ringRadius = Math.min(2_500 + cluster.members.length * 120, 25_000);

    cluster.members.forEach((o, idx) => {
      const [dLat, dLon] = ringOffset(idx, cluster.members.length, ringRadius, cluster.lat);
      const lat = cluster.lat + dLat;
      const lon = cluster.lon + dLon;
      const id = `office-${o.office_id}`;
      const height = spikeHeightMeters(o.job_count);
      const color = tierColor(o.tier);

      const basePos = Cartesian3.fromDegrees(lon, lat, 0);
      const tipPos = Cartesian3.fromDegrees(lon, lat, height);

      entities.add({
        id,
        position: basePos,
        // Always-visible screen-space marker (the click target).
        point: {
          pixelSize: 6,
          color: color.withAlpha(0.95),
          outlineColor: Color.WHITE.withAlpha(0.4),
          outlineWidth: 1,
          // Stay readable at any distance — slightly bigger when very close.
          scaleByDistance: new NearFarScalar(1.5e3, 1.4, 1.5e7, 1.0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        // Tall thin polyline rising from the surface — the magnitude indicator.
        polyline: {
          positions: [basePos, tipPos],
          width: 2.5,
          material: new PolylineGlowMaterialProperty({
            color: color.withAlpha(0.85),
            glowPower: 0.25,
            taperPower: 0.6,
          }),
        },
        properties: {
          office_id: o.office_id,
          company: o.company,
        },
      });

      officeById.set(id, { ...o, lat, lon });
    });
  }

  return officeById;
}

// Track previous hover so we only repaint two markers per move.
let lastHoverId = null;

/**
 * Highlight one spike (on hover). Pass null to clear.
 * Visually pumps the screen-space point larger + brighter.
 */
export function setHover(viewer, hoverId, officeById) {
  if (hoverId === lastHoverId) return;
  if (lastHoverId) {
    const prev = viewer.entities.getById(lastHoverId);
    const prevOffice = officeById?.get(lastHoverId);
    if (prev?.point && prevOffice) {
      const c = tierColor(prevOffice.tier);
      prev.point.color = c.withAlpha(0.95);
      prev.point.outlineColor = Color.WHITE.withAlpha(0.4);
      prev.point.pixelSize = 6;
    }
  }
  if (hoverId) {
    const cur = viewer.entities.getById(hoverId);
    const curOffice = officeById?.get(hoverId);
    if (cur?.point && curOffice) {
      const c = tierColor(curOffice.tier);
      cur.point.color = Color.WHITE;
      cur.point.outlineColor = c;
      cur.point.pixelSize = 12;
    }
  }
  lastHoverId = hoverId;
}
