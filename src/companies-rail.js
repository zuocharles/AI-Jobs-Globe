/**
 * Left-rail "TARGETS" panel: top 30 companies by total open AI jobs.
 * Click a row to fly the camera to that company's busiest office.
 */

const listEl = document.getElementById('company-rail-list');

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
}

function railInitials(name) {
  return String(name ?? '')
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

// Make available for the inline img.onerror handler we render below.
window.railInitials = railInitials;

/**
 * @param {Map<string,object>} officeById  entityId → office row from spikes
 * @param {(office: object) => void} onPick  called with the chosen office
 */
export function initCompanyRail(officeById, onPick) {
  // Aggregate jobs per company across all their offices in our data.
  // Carry has_logo + logo_file from any office (it's company-level metadata).
  const byCompany = new Map(); // company name -> { totalJobs, bestOffice, hasLogo, logoFile }
  for (const o of officeById.values()) {
    const cur = byCompany.get(o.company) || {
      totalJobs: 0,
      bestOffice: null,
      hasLogo: !!o.has_logo,
      logoFile: o.logo_file || null,
    };
    cur.totalJobs += o.job_count;
    if (!cur.bestOffice || o.job_count > cur.bestOffice.job_count) {
      cur.bestOffice = o;
    }
    if (o.has_logo && !cur.hasLogo) {
      cur.hasLogo = true;
      cur.logoFile = o.logo_file;
    }
    byCompany.set(o.company, cur);
  }

  // Top 30 by total jobs.
  const top = [...byCompany.entries()]
    .sort((a, b) => b[1].totalJobs - a[1].totalJobs)
    .slice(0, 30);

  listEl.innerHTML = top.map(([name, info]) => {
    const logo = info.hasLogo && info.logoFile
      ? `<img class="rail-logo" src="/logos/${escape(info.logoFile)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'rail-logo-fallback',textContent:railInitials('${escape(name)}')}));">`
      : `<div class="rail-logo-fallback">${railInitials(name)}</div>`;
    return `
      <li data-co="${escape(name)}">
        ${logo}
        <span class="rail-co" title="${escape(name)}">${escape(name)}</span>
        <span class="rail-jobs">${info.totalJobs}</span>
      </li>
    `;
  }).join('');

  listEl.querySelectorAll('li[data-co]').forEach((li) => {
    li.addEventListener('click', () => {
      const co = li.dataset.co;
      const info = byCompany.get(co);
      if (info?.bestOffice) onPick(info.bestOffice);
    });
  });
}
