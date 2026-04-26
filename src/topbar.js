/**
 * Search box + filter toggles in the top bar.
 * Search hits Supabase with a 250 ms debounce and shows a results dropdown.
 */
import { searchCompanies } from './data.js';

const inputEl = document.getElementById('search-input');
const resultsEl = document.getElementById('search-results');

let debounceTimer = null;
let activeIndex = -1;
let currentResults = [];

/**
 * @param {(office: object) => void} onPick   called with the office row to fly to
 * @param {Map<string,object>} officeById     entityId → office row, for picking the busiest office of a company
 */
export function initSearch(onPick, officeById) {
  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 2) { hide(); return; }
    debounceTimer = setTimeout(() => runSearch(q, officeById, onPick), 250);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (resultsEl.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      pickIndex(activeIndex, officeById, onPick);
    } else if (e.key === 'Escape') {
      hide();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topbar-center')) hide();
  });
}

async function runSearch(q, officeById, onPick) {
  let companies = [];
  try { companies = await searchCompanies(q); }
  catch (err) { console.error(err); return; }
  currentResults = companies;
  activeIndex = -1;
  if (!companies.length) {
    resultsEl.innerHTML = `<li class="search-empty">// NO MATCH</li>`;
    resultsEl.hidden = false;
    return;
  }
  resultsEl.innerHTML = companies.map((c, i) => `
    <li data-i="${i}">
      <span style="color: var(--cyan); font-weight: 600;">${escape(c.name)}</span>
      <span style="float: right; color: var(--text-secondary); font-size: 10px; letter-spacing: 0.1em;">
        ${c.country} · T${c.tier} · ${c.jobs_count} jobs
      </span>
    </li>
  `).join('');
  resultsEl.hidden = false;
  resultsEl.querySelectorAll('li[data-i]').forEach((li) => {
    li.addEventListener('click', () => pickIndex(Number(li.dataset.i), officeById, onPick));
  });
}

function move(delta) {
  const items = resultsEl.querySelectorAll('li[data-i]');
  if (!items.length) return;
  activeIndex = (activeIndex + delta + items.length) % items.length;
  items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
}

function pickIndex(i, officeById, onPick) {
  const company = currentResults[i];
  if (!company) return;
  // Find the busiest office for this company in our loaded data.
  let best = null;
  for (const o of officeById.values()) {
    if (o.company === company.name) {
      if (!best || o.job_count > best.job_count) best = o;
    }
  }
  if (best) onPick(best);
  hide();
  inputEl.blur();
}

function hide() {
  resultsEl.hidden = true;
  activeIndex = -1;
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
}
