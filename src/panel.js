/**
 * Right-edge detail panel. Renders the office's company info + a list of
 * its open jobs, fetched lazily on click.
 */
import { fetchOfficeJobs } from './data.js';

const panelEl = document.getElementById('panel');
const bodyEl = document.getElementById('panel-body');
const closeBtn = document.getElementById('panel-close');

closeBtn?.addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePanel();
});

export function closePanel() {
  panelEl.hidden = true;
}

/**
 * Open the panel for a given office row (from globe_data).
 */
export async function openPanel(office) {
  panelEl.hidden = false;
  bodyEl.innerHTML = renderHeader(office) + `
    <div class="panel-section-label">// LOADING JOBS…</div>
  `;

  let jobs = [];
  try {
    jobs = await fetchOfficeJobs(office.office_id);
  } catch (err) {
    console.error(err);
    bodyEl.innerHTML = renderHeader(office) + `
      <div class="panel-section-label">// COULD NOT LOAD JOBS</div>
    `;
    return;
  }

  bodyEl.innerHTML = renderHeader(office) + renderJobList(jobs);
}

function renderHeader(o) {
  const logoSrc = o.has_logo && o.logo_file ? `/logos/${o.logo_file}` : null;
  const logo = logoSrc
    ? `<img class="panel-logo" src="${logoSrc}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'panel-logo-fallback',textContent:initials('${escapeAttr(o.company)}')}));" />`
    : `<div class="panel-logo-fallback">${initials(o.company)}</div>`;
  const tierClass = `tier-${o.tier || 2}`;
  return `
    <div class="panel-company">
      ${logo}
      <div>
        <div class="panel-company-name">${escapeHtml(o.company)}</div>
        <div class="panel-company-meta">
          ${escapeHtml(o.location_name || '—')}
          <span class="tier-badge ${tierClass}">T${o.tier ?? '?'}</span>
        </div>
        <div class="panel-company-meta">
          ${o.job_count} open AI ${o.job_count === 1 ? 'role' : 'roles'} at this site
        </div>
      </div>
    </div>
  `;
}

function renderJobList(jobs) {
  if (!jobs.length) {
    return `<div class="panel-section-label">// NO JOBS RETURNED</div>`;
  }
  const rows = jobs.map((j) => {
    const link = j.job_url
      ? `<a class="job-title" href="${escapeAttr(j.job_url)}" target="_blank" rel="noopener">${escapeHtml(j.title)}</a>`
      : `<span class="job-title">${escapeHtml(j.title)}</span>`;
    const meta = [];
    if (j.ai_type) meta.push(`<span class="job-aitype">${j.ai_type}</span>`);
    if (j.is_remote) meta.push('REMOTE');
    if (j.salary_min || j.salary_max) {
      const cur = j.currency || 'USD';
      const lo = j.salary_min ? Math.round(j.salary_min / 1000) + 'K' : '?';
      const hi = j.salary_max ? Math.round(j.salary_max / 1000) + 'K' : '?';
      meta.push(`${cur} ${lo}–${hi}`);
    }
    if (j.date_posted) meta.push(j.date_posted);
    return `
      <li class="job-row">
        ${link}
        <div class="job-meta">${meta.join(' / ')}</div>
      </li>
    `;
  }).join('');
  return `
    <div class="panel-section-label">// OPEN ROLES (${jobs.length})</div>
    <ul class="job-list">${rows}</ul>
  `;
}

function initials(name) {
  return name
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}
