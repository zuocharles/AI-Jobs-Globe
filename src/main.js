/**
 * Entry point. Order:
 *   1. Init Cesium viewer + Google 3D Tiles
 *   2. Fetch globe_data + stats from Supabase in parallel
 *   3. Render spike polylines
 *   4. Wire hover, click, scope dropdown, scope-bar buttons, pills, keys
 *   5. Animate the loading bar away
 */
import { createGlobe, flyTo, flyHome } from './globe.js';
import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from 'cesium';
import { fetchGlobeData, fetchStats } from './data.js';
import { renderSpikes, setHover } from './spikes.js';
import { openPanel, closePanel } from './panel.js';
import { initCompanyRail } from './companies-rail.js';
import {
  findBuildingForOffice,
  bestBuildingForCompany,
  topBuildingInCity,
  allBuildings,
  indexOffices,
} from './buildings.js';
import { enterScope, exitScope, cycle, isScopeActive } from './scope.js';

// ── DOM refs ─────────────────────────────────────────────────────
const loadingEl = document.getElementById('loading');
const loadingBar = document.getElementById('loading-bar');
const loadingStatus = document.getElementById('loading-status');
const tooltipEl = document.getElementById('tooltip');

const statJobs = document.getElementById('stat-jobs');
const statCompanies = document.getElementById('stat-companies');
const statCountries = document.getElementById('stat-countries');

const scopeSelect = document.getElementById('scope-select');

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
  if (import.meta.env.DEV) window.viewer = viewer;

  setLoading(20, 'QUERYING DATA STORE');
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
  // Build the building → office inverse lookup so scope.js can:
  //   - skip rendering brackets for buildings with no office row
  //   - tag each bracket with office_id (clickable → open panel)
  indexOffices(officeById);

  // Build a (company name → total jobs) lookup once. Used by city-pill scope
  // ("top company in SF"), and the scope-select dropdown sort.
  const jobsByCompany = new Map();
  for (const o of officeById.values()) {
    const k = String(o.company || '').trim().toLowerCase();
    jobsByCompany.set(k, (jobsByCompany.get(k) ?? 0) + (o.job_count || 0));
  }

  setLoading(90, 'CALIBRATING');

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
    if (!id) { closePanel(); return; }
    // 1. polyline pick → office_id directly maps via officeById
    const office = officeById.get(id);
    if (office) {
      focusOffice(office);
      return;
    }
    // 2. scope-mode bracket pick → id starts with __scope_bracket__:office-N
    //    Look up that office and just open its panel (camera stays put — user
    //    is already in scope, no need to fly anywhere).
    if (typeof id === 'string' && id.startsWith('__scope_bracket__:')) {
      const officeId = id.slice('__scope_bracket__:'.length);
      const o = officeById.get(officeId);
      if (o) openPanel(o);
      return;
    }
    closePanel();
  }, ScreenSpaceEventType.LEFT_CLICK);

  // ── Location pills → enter scope on top company in that city ────
  document.querySelectorAll('#location-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#location-pills .pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const lat = parseFloat(btn.dataset.lat);
      const lon = parseFloat(btn.dataset.lon);
      // Pull the city name from the button text — strip the "[ … ]" wrapper
      // and trim, then ask buildings.js for the highest-jobs entry there.
      const cityName = (btn.textContent || '').replace(/\[|\]/g, '').trim();
      const top = topBuildingInCity(cityName, jobsByCompany);
      if (top) {
        enterScope(viewer, top);
      } else {
        // Fall back to plain fly-to if no scopable building for that city.
        flyTo(viewer, lat, lon, 80_000, 2.0);
      }
    });
  });

  // POLYLINE-CLICK path. Strict (company, city) match — if office is not in
  // a city we have building data for, fall back to plain fly-to. Never lie
  // about location (don't fly Amazon-Paris-click to Seattle HQ).
  function focusOffice(office) {
    const building = findBuildingForOffice(office);
    if (building) {
      enterScope(viewer, building);
      openPanel(office);
    } else if (isScopeActive()) {
      openPanel(office);
    } else {
      flyTo(viewer, office.lat, office.lon, 30_000, 1.6);
      openPanel(office);
    }
  }

  // TARGETS-RAIL / SCOPE-DROPDOWN path. Always enters scope on the company's
  // HQ (or first known) building if any building data exists. Falls back to
  // the busiest-office flyTo only if the company has no building data at all.
  // This is the fix for "EY/Ro/Deloitte/Binance click does nothing":
  // their busiest office is in a city without a building entry, so the strict
  // findBuildingForOffice returned null. bestBuildingForCompany pulls the HQ.
  function focusCompany(companyName, fallbackOffice) {
    const building = bestBuildingForCompany(companyName);
    if (building) {
      enterScope(viewer, building);
      if (fallbackOffice) openPanel(fallbackOffice);
    } else if (fallbackOffice) {
      flyTo(viewer, fallbackOffice.lat, fallbackOffice.lon, 30_000, 1.6);
      openPanel(fallbackOffice);
    }
  }

  // ── Top companies quick-jump rail ────────────────────────────
  initCompanyRail(officeById, focusCompany);

  // ── Scope-select dropdown (replaces old search input) ────────
  // Populate with companies that have building data, sorted by total jobs
  // desc so the most prominent employers are at the top.
  const scopableCompanies = new Map();   // companyKey → { name, building, jobs }
  for (const b of allBuildings()) {
    const k = String(b.company || '').trim().toLowerCase();
    if (!k) continue;
    const jobs = jobsByCompany.get(k) ?? 0;
    const cur = scopableCompanies.get(k);
    if (!cur || (b.is_hq && !cur.building.is_hq)) {
      // Prefer the HQ entry as the dropdown's default jump target.
      scopableCompanies.set(k, { name: b.company, building: b, jobs });
    } else if (cur && !cur.building.is_hq && jobs > cur.jobs) {
      cur.jobs = jobs;
    }
  }
  const sorted = [...scopableCompanies.values()].sort((a, b) => b.jobs - a.jobs);
  const optsHtml = sorted.map((s, idx) =>
    `<option value="${idx}">${escapeHtml(s.name)} · ${s.jobs} jobs</option>`
  ).join('');
  scopeSelect.insertAdjacentHTML('beforeend', optsHtml);
  scopeSelect.addEventListener('change', () => {
    const idx = parseInt(scopeSelect.value, 10);
    const pick = sorted[idx];
    if (pick) enterScope(viewer, pick.building);
    scopeSelect.value = '';   // reset to placeholder so re-selecting the same company works
  });

  // ── Scope-mode key handlers + scope-bar buttons ──────────────
  document.addEventListener('keydown', (e) => {
    if (!isScopeActive()) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); cycle(viewer, -1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); cycle(viewer, +1); }
    else if (e.key === 'Escape') { e.preventDefault(); exitScope(viewer); closePanel(); }
  });
  document.getElementById('scope-exit')?.addEventListener('click', () => {
    exitScope(viewer);
    closePanel();
  });
  document.getElementById('scope-prev')?.addEventListener('click', () => cycle(viewer, -1));
  document.getElementById('scope-next')?.addEventListener('click', () => cycle(viewer, +1));

  // ── Topbar title → reset to globe home view ──────────────────
  document.querySelector('.topbar-title')?.addEventListener('click', () => {
    if (isScopeActive()) exitScope(viewer);
    closePanel();
    flyHome(viewer);
  });

  // ── Done ─────────────────────────────────────────────────────
  setLoading(100, 'OPERATIONAL');
  setTimeout(hideLoading, 600);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

main().catch((err) => {
  console.error(err);
  loadingStatus.textContent = '// FATAL: SEE CONSOLE';
});
