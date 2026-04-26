/**
 * Entry point. Order:
 *   1. Init Cesium viewer + Google 3D Tiles
 *   2. Fetch globe_data + stats from Supabase in parallel
 *   3. Render spike entities
 *   4. Wire hover, click, search, pills, HUD
 *   5. Animate the loading bar away
 */
import { createGlobe, flyTo } from './globe.js';
import {
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium';
import { fetchGlobeData, fetchStats } from './data.js';
import { renderSpikes, setHover } from './spikes.js';
import { openPanel, closePanel } from './panel.js';
import { initSearch } from './topbar.js';
import { initCompanyRail } from './companies-rail.js';

// ── DOM refs ─────────────────────────────────────────────────────
const loadingEl = document.getElementById('loading');
const loadingBar = document.getElementById('loading-bar');
const loadingStatus = document.getElementById('loading-status');
const tooltipEl = document.getElementById('tooltip');

const hudCompanies = document.getElementById('hud-companies');
const hudOffices = document.getElementById('hud-offices');
const hudJobs = document.getElementById('hud-jobs');
const hudFrame = document.getElementById('hud-frame');
const hudTime = document.getElementById('hud-time');
const hudLat = document.getElementById('hud-lat');
const hudLon = document.getElementById('hud-lon');
const hudAlt = document.getElementById('hud-alt');

const statJobs = document.getElementById('stat-jobs');
const statCompanies = document.getElementById('stat-companies');
const statCountries = document.getElementById('stat-countries');

// ── helpers ──────────────────────────────────────────────────────
function setLoading(pct, status) {
  loadingBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  if (status) loadingStatus.textContent = `// ${status}`;
}
function hideLoading() {
  loadingEl.classList.add('hidden');
  setTimeout(() => loadingEl.remove(), 500);
}
function fmtNum(n) { return n.toLocaleString('en-US'); }

// Animate a number from 0 → target over duration ms.
function countUp(el, target, duration = 1500) {
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const v = Math.round(t * target);
    el.textContent = fmtNum(v);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ── boot ─────────────────────────────────────────────────────────
async function main() {
  setLoading(5, 'INITIALIZING VIEWER');
  const { viewer, tilesetReady } = createGlobe('cesiumContainer');
  // Expose for in-browser debugging only (DevTools `viewer.camera` etc.)
  if (import.meta.env.DEV) window.viewer = viewer;

  setLoading(20, 'QUERYING DATA STORE');
  // Don't block the loading bar on photoreal tiles — they stream in async
  // and can take many seconds on first paint. Spike entities + Bing fallback
  // imagery render immediately so the user never stares at "INITIALIZING".
  tilesetReady.catch((err) => console.error('tileset failed', err));
  const [offices, stats] = await Promise.all([
    fetchGlobeData(),
    fetchStats().catch((err) => {
      console.error('stats fetch failed', err);
      return { jobs: 0, companies: 0, countries: 0 };
    }),
  ]);

  setLoading(70, 'PLOTTING SITES');
  const officeById = renderSpikes(viewer, offices);

  setLoading(90, 'CALIBRATING');

  // ── HUD numbers ──────────────────────────────────────────────
  hudCompanies.textContent = String(stats.companies).padStart(4, '0');
  hudOffices.textContent = String(offices.length).padStart(4, '0');
  hudJobs.textContent = String(stats.jobs).padStart(5, '0');

  countUp(statJobs, stats.jobs);
  countUp(statCompanies, stats.companies);
  countUp(statCountries, stats.countries);

  // ── Hover / click via Cesium's screen-space events ───────────
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);

  let hoveredId = null;

  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.endPosition);
    const id = picked?.id?.id;
    const office = id && officeById.get(id);
    if (office) {
      if (hoveredId !== id) {
        hoveredId = id;
        setHover(viewer, id, officeById);
      }
      tooltipEl.hidden = false;
      tooltipEl.style.left = `${movement.endPosition.x}px`;
      tooltipEl.style.top = `${movement.endPosition.y}px`;
      tooltipEl.innerHTML = `
        <div class="tooltip-name">${office.company}</div>
        <div class="tooltip-meta">
          ${office.location_name || '—'} · ${office.job_count} ${office.job_count === 1 ? 'role' : 'roles'} · T${office.tier}
        </div>
      `;
      viewer.canvas.style.cursor = 'pointer';
    } else {
      if (hoveredId !== null) {
        hoveredId = null;
        setHover(viewer, null, officeById);
      }
      tooltipEl.hidden = true;
      viewer.canvas.style.cursor = 'default';
    }
  }, ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction((movement) => {
    const picked = viewer.scene.pick(movement.position);
    const id = picked?.id?.id;
    const office = id && officeById.get(id);
    if (office) {
      flyTo(viewer, office.lat, office.lon, 30_000, 1.4);
      openPanel(office);
    } else {
      closePanel();
    }
  }, ScreenSpaceEventType.LEFT_CLICK);

  // ── Location pills ───────────────────────────────────────────
  document.querySelectorAll('#location-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#location-pills .pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const lat = parseFloat(btn.dataset.lat);
      const lon = parseFloat(btn.dataset.lon);
      flyTo(viewer, lat, lon, 80_000, 2.0);
    });
  });

  // ── Search ───────────────────────────────────────────────────
  initSearch((office) => {
    flyTo(viewer, office.lat, office.lon, 30_000, 1.4);
    openPanel(office);
  }, officeById);

  // ── Top companies quick-jump rail ────────────────────────────
  initCompanyRail(officeById, (office) => {
    flyTo(viewer, office.lat, office.lon, 30_000, 1.6);
    openPanel(office);
  });

  // ── HUD live updates (timestamp + camera coords + frame ms) ──
  let lastFrameStart = performance.now();
  viewer.scene.preRender.addEventListener(() => {
    const now = performance.now();
    hudFrame.textContent = `${Math.round(now - lastFrameStart)}ms`.padStart(4, ' ');
    lastFrameStart = now;
  });

  setInterval(() => {
    hudTime.textContent = new Date().toISOString().replace('.000', '').replace('Z', 'Z');
  }, 1000);

  viewer.camera.changed.addEventListener(updateCameraReadout);
  viewer.camera.changed.raiseEvent?.();
  function updateCameraReadout() {
    const carto = viewer.camera.positionCartographic;
    if (!carto) return;
    hudLat.textContent = CesiumMath.toDegrees(carto.latitude).toFixed(2);
    hudLon.textContent = CesiumMath.toDegrees(carto.longitude).toFixed(2);
    hudAlt.textContent = (carto.height / 1000).toFixed(1) + 'km';
  }
  // Run once at boot
  updateCameraReadout();

  // ── Done ─────────────────────────────────────────────────────
  setLoading(100, 'OPERATIONAL');
  setTimeout(hideLoading, 600);
}

main().catch((err) => {
  console.error(err);
  loadingStatus.textContent = '// FATAL: SEE CONSOLE';
});
