/**
 * Spike layer — polyline only.
 *
 * One thin glowing vertical polyline per office, height proportional to
 * log2(jobs). Tall enough to read from low orbit (~1900km max), thin enough
 * to see PAST when zoomed close. No fat cylinders, no point markers, no
 * solid heat-aura blocks — that visual experiment is over.
 *
 * Many offices share lat/lon (e.g. 50+ companies in "San Francisco, CA").
 * We cluster by rounded coords and distribute each cluster's spikes in a
 * small ring around the centre so they remain individually pickable.
 *
 * The polyline IS the click target — Cesium picks polylines if their pixel
 * width is wide enough. We use 4px which is comfortably pickable.
 */
import {
  Cartesian2,
  Cartesian3,
  Color,
  LabelStyle,
  NearFarScalar,
  PolylineGlowMaterialProperty,
  VerticalOrigin,
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
 * Polyline spike height in meters.
 *   1 job   ≈  400 km  (visible from low orbit)
 *   10 jobs ≈  920 km
 *   100 jobs ≈ 1400 km
 *   1000 jobs ≈ 1900 km — about 30% of Earth's radius, dramatic
 */
function spikeHeightMeters(jobCount) {
  return 400_000 + Math.log2(jobCount + 1) * 150_000;
}

function clusterKey(lat, lon) {
  return `${lat.toFixed(2)}|${lon.toFixed(2)}`;
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

  // 1. Bucket offices by rough city coords.
  const clusters = new Map();
  for (const o of offices) {
    if (!o.lat || !o.lon || !o.job_count) continue;
    const k = clusterKey(o.lat, o.lon);
    const c = clusters.get(k) || { lat: o.lat, lon: o.lon, members: [] };
    c.members.push(o);
    clusters.set(k, c);
  }

  // 2. For each cluster, distribute member offices in a small ring + draw
  //    each as a tall thin glowing polyline.
  for (const cluster of clusters.values()) {
    const ringRadius = Math.min(2_500 + cluster.members.length * 120, 25_000);

    cluster.members.forEach((o, idx) => {
      // If we have a precise building entry for this office, anchor the
      // polyline ON the actual building (e.g. 1455 Mission for OpenAI). Else
      // fall back to the city-ring distribution that prevents pile-ups when
      // many companies share city-level lat/lon.
      const building = findBuildingForOffice(o);
      let lat, lon;
      if (building) {
        lat = building.lat;
        lon = building.lon;
      } else {
        const [dLat, dLon] = ringOffset(idx, cluster.members.length, ringRadius, cluster.lat);
        lat = cluster.lat + dLat;
        lon = cluster.lon + dLon;
      }
      const id = `office-${o.office_id}`;
      const height = spikeHeightMeters(o.job_count);
      const color = tierColor(o.tier);

      const basePos = Cartesian3.fromDegrees(lon, lat, 0);
      const tipPos = Cartesian3.fromDegrees(lon, lat, height);

      entities.add({
        id,
        // Position drives the label/billboard projection — set it to the
        // spike tip so the bracket marker floats above the polyline.
        position: tipPos,
        polyline: {
          positions: [basePos, tipPos],
          // 4px wide — visible from any zoom + reliably pickable by mouse.
          width: 4,
          material: new PolylineGlowMaterialProperty({
            color: color.withAlpha(0.9),
            glowPower: 0.3,
            taperPower: 0.5,
          }),
        },
        // Bilawal-style bracket marker — small cyan/blue/purple "[ ]" floating
        // above each spike. Screen-space size, always visible, scales mildly
        // by distance so it doesn't dominate the close-up scope view.
        label: {
          text: '[ ]',
          font: '13px "JetBrains Mono", "Fira Code", monospace',
          fillColor: color.withAlpha(0.95),
          outlineColor: Color.BLACK.withAlpha(0.85),
          outlineWidth: 2,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -4),
          scaleByDistance: new NearFarScalar(5e3, 1.4, 5e7, 0.55),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
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

// Track previous hover so we only repaint two spikes per move.
let lastHoverId = null;

/**
 * Highlight one spike on hover. Bumps width + brightens.
 */
export function setHover(viewer, hoverId, officeById) {
  if (hoverId === lastHoverId) return;
  if (lastHoverId) {
    const prev = viewer.entities.getById(lastHoverId);
    const prevOffice = officeById?.get(lastHoverId);
    if (prev?.polyline && prevOffice) {
      const c = tierColor(prevOffice.tier);
      prev.polyline.width = 4;
      prev.polyline.material = new PolylineGlowMaterialProperty({
        color: c.withAlpha(0.9),
        glowPower: 0.3,
        taperPower: 0.5,
      });
    }
  }
  if (hoverId) {
    const cur = viewer.entities.getById(hoverId);
    const curOffice = officeById?.get(hoverId);
    if (cur?.polyline && curOffice) {
      cur.polyline.width = 7;
      cur.polyline.material = new PolylineGlowMaterialProperty({
        color: Color.WHITE.withAlpha(0.95),
        glowPower: 0.5,
        taperPower: 0.3,
      });
    }
  }
  lastHoverId = hoverId;
}
