/**
 * Left-rail "TARGETS" panel: top 30 companies by total open AI jobs.
 * Click a row to fly the camera to that company's busiest office.
 */

const listEl = document.getElementById('company-rail-list');

/**
 * @param {Map<string,object>} officeById  entityId → office row from spikes
 * @param {(office: object) => void} onPick  called with the chosen office
 */
export function initCompanyRail(officeById, onPick) {
  // Aggregate jobs per company across all their offices in our data.
  const byCompany = new Map(); // company name -> { totalJobs, bestOffice }
  for (const o of officeById.values()) {
    const cur = byCompany.get(o.company) || { totalJobs: 0, bestOffice: null };
    cur.totalJobs += o.job_count;
    if (!cur.bestOffice || o.job_count > cur.bestOffice.job_count) {
      cur.bestOffice = o;
    }
    byCompany.set(o.company, cur);
  }

  // Top 30 by total jobs.
  const top = [...byCompany.entries()]
    .sort((a, b) => b[1].totalJobs - a[1].totalJobs)
    .slice(0, 30);

  listEl.innerHTML = top.map(([name, info]) => `
    <li data-co="${escape(name)}">
      <span class="rail-co" title="${escape(name)}">${escape(name)}</span>
      <span class="rail-jobs">${info.totalJobs}</span>
    </li>
  `).join('');

  listEl.querySelectorAll('li[data-co]').forEach((li) => {
    li.addEventListener('click', () => {
      const co = li.dataset.co;
      const info = byCompany.get(co);
      if (info?.bestOffice) onPick(info.bestOffice);
    });
  });
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
}
