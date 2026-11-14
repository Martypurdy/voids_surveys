// Screen 1: home – branded header, quick stats, start a new form, and the
// surveys on this device (search / filter once there are a few).
import { listJobs, saveJob, requestPersist, storageInfo } from '../db.js';
import { newJob, jobTitle, backupStatus, fmtDate, allPhotoIds, SECTIONS, completedCount, sectionState } from '../model.js';
import { h, icon, ICONS } from '../ui.js';
import { go, refresh } from '../router.js';
import { jobActions } from './jobActions.js';
import { getLastSurveyor } from '../surveyors.js';

// App logo (house on a notepad), drawn on the white square in the header.
const LOGO_SVG = '<svg viewBox="8 8 84 84" aria-hidden="true"><rect x="23" y="21" width="54" height="63" rx="7" fill="#eef4f9"/>'
  + [33, 43, 53, 63].map((x) => `<rect x="${x}" y="14" width="5" height="14" rx="2.5" fill="#f2b233" stroke="#174a6d" stroke-width="1.5"/>`).join('')
  + '<path d="M50 33 66 46h-4v13H38V46h-4z" fill="#1f5f8b"/><rect x="46.5" y="50" width="7" height="9" rx="1" fill="#eef4f9"/>'
  + '<rect x="33" y="65" width="34" height="3.5" rx="1.75" fill="#9cc3dd"/><rect x="33" y="72" width="22" height="3.5" rx="1.75" fill="#9cc3dd"/></svg>';
function logo() {
  const el = h('span', { class: 'hero-logo' });
  el.innerHTML = LOGO_SVG;
  return el;
}
const FILTER_KEY = 'voids.homeFilter';

/** Forms the app offers. Only the void survey exists so far; the rest show what's planned. */
const FORMS = [
  { key: 'void', emoji: '🏠', title: 'Empty home inspection', text: 'Rooms, defects, security, services, materials and a PDF report.', ready: true },
  { key: 'handover', emoji: '🔑', title: 'Ready to let', text: 'Works check, final readings, keys and sign-off.' },
  { key: 'repair', emoji: '🛠️', title: 'Repair job sheet', text: 'Job details, materials used, photos and completion.' },
  { key: 'inspect', emoji: '📋', title: 'Property inspection', text: 'Tenancy, estate and compliance inspections.' },
];

const isDone = (job) => completedCount(job) === SECTIONS.length;

function greeting() {
  const hr = new Date().getHours();
  const part = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const first = getLastSurveyor().trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

export default async function jobList(root) {
  const jobs = await listJobs();

  const importInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const { importJobFile } = await import('../export/json.js');
      const job = await importJobFile(file);
      if (job) refresh();
    },
  });

  // ---------- Hero ----------
  const inProgress = jobs.filter((j) => !isDone(j)).length;
  const complete = jobs.length - inProgress;
  const photos = jobs.reduce((n, j) => n + allPhotoIds(j).length, 0);
  const stat = (n, label, kind) => h('div', { class: `hero-stat hero-stat-${kind}` },
    h('strong', null, String(n)), h('span', null, label));
  const hero = h('header', { class: 'hero' },
    h('div', { class: 'hero-top' },
      logo(),
      h('div', { class: 'hero-brand' },
        h('h1', null, 'PropertyPad'),
        h('span', null, 'Surveys & site forms')),
      h('button', { type: 'button', class: 'hero-btn', onclick: () => importInput.click(), 'aria-label': 'Import a survey file' }, 'Import'),
      importInput,
      h('a', { class: 'hero-btn hero-icon', href: '#/settings', 'aria-label': 'Settings' }, icon(ICONS.settings))),
    h('p', { class: 'hero-hello' }, greeting(), h('span', null,
      new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))),
    h('div', { class: 'hero-stats' },
      stat(inProgress, 'In progress', 'progress'),
      stat(complete, 'Complete', 'done'),
      stat(photos, `Photo${photos === 1 ? '' : 's'}`, 'photos')));

  // ---------- New form ----------
  const formCard = (f) => h(f.ready ? 'button' : 'div', {
    type: f.ready ? 'button' : null,
    class: `form-card${f.ready ? ' form-card-ready' : ''}`,
    onclick: f.ready ? createJob : null,
    'aria-disabled': f.ready ? null : 'true',
  },
  h('span', { class: 'form-emoji', 'aria-hidden': 'true' }, f.emoji),
  h('span', { class: 'form-text' },
    h('span', { class: 'form-title' }, f.title, f.ready ? null : h('span', { class: 'soon-pill' }, 'Coming soon')),
    h('span', { class: 'form-desc' }, f.text)),
  f.ready ? h('span', { class: 'form-go', 'aria-hidden': 'true' }, '+') : null);

  // ---------- Surveys ----------
  let filter = 'all';
  try { filter = localStorage.getItem(FILTER_KEY) || 'all'; } catch { /* storage blocked */ }
  let query = '';
  const listEl = h('div', { class: 'job-list' });
  const chipsEl = h('div', { class: 'chips home-chips', role: 'group', 'aria-label': 'Show surveys' });
  const renderList = () => {
    const q = query.trim().toLowerCase();
    const shown = jobs.filter((j) => (filter === 'all' || (filter === 'done') === isDone(j))
      && (!q || `${jobTitle(j)} ${j.address.text} ${j.surveyor}`.toLowerCase().includes(q)));
    chipsEl.replaceChildren(...[['all', `All ${jobs.length}`], ['progress', `In progress ${inProgress}`], ['done', `Complete ${complete}`]]
      .map(([k, label]) => h('button', {
        type: 'button',
        'aria-pressed': String(filter === k),
        onclick: () => {
          filter = k;
          try { localStorage.setItem(FILTER_KEY, k); } catch { /* storage blocked */ }
          renderList();
        },
      }, label)));
    listEl.replaceChildren(...(shown.length ? shown.map(jobCard)
      : [h('p', { class: 'empty' }, q ? 'No surveys match your search.' : 'Nothing here yet.')]));
  };
  const search = h('input', {
    type: 'search',
    placeholder: '🔍 Search by address or surveyor…',
    'aria-label': 'Search surveys',
    oninput: (e) => { query = e.target.value; renderList(); },
  });
  if (jobs.length) renderList();

  root.append(
    hero,
    h('div', { class: 'content home' },
      h('h2', { class: 'home-h' }, 'Start a new form'),
      h('div', { class: 'form-grid' }, FORMS.map(formCard)),

      h('h2', { class: 'home-h' }, 'Your surveys'),
      jobs.length
        ? [jobs.length > 3 ? search : null, jobs.length > 1 ? chipsEl : null, listEl]
        : h('div', { class: 'home-empty' },
          h('span', { 'aria-hidden': 'true' }, '📝'),
          h('strong', null, 'No surveys yet'),
          h('span', null, 'Tap “Empty home inspection” above to start your first one.')),
      footnote()));
}

async function createJob() {
  const job = newJob({ surveyor: getLastSurveyor() });
  await saveJob(job);
  // Ask the browser to keep our data (helps against eviction, esp. on iOS).
  requestPersist();
  go(`/job/${job.id}`);
}

function jobCard(job) {
  const status = backupStatus(job);
  const nPhotos = allPhotoIds(job).length;
  const done = completedCount(job);
  const state = done === SECTIONS.length ? 'done' : done || Object.keys(job.progress || {}).length ? 'progress' : 'new';
  const pct = Math.round((done / SECTIONS.length) * 100);
  return h('div', { class: 'card job-card', dataset: { state } },
    h('a', { href: `#/job/${job.id}` },
      h('div', { class: 'job-head' },
        h('div', { class: 'job-title' }, jobTitle(job)),
        h('span', { class: 'job-pill' }, state === 'done' ? '✓ Complete' : state === 'progress' ? 'In progress' : 'New')),
      h('div', { class: 'job-sub' }, ['Void survey', job.surveyor].filter(Boolean).join(' · ')),
      h('div', { class: 'job-progress' },
        h('div', { class: 'progress', 'aria-hidden': 'true' }, SECTIONS.map(([k]) => h('span', { dataset: { state: sectionState(job, k) || 'todo' } }))),
        h('span', { class: 'job-pct' }, `${pct}%`)),
      h('div', { class: 'job-meta' },
        `📅 ${fmtDate(job.created)} · 🚪 ${job.rooms.length} room${job.rooms.length === 1 ? '' : 's'} · 📷 ${nPhotos}`),
      status.stale ? h('span', { class: 'warn' }, '⚠ ', status.text) : null),
    h('button', {
      type: 'button',
      class: 'icon-btn',
      'aria-label': `Actions for ${jobTitle(job)}`,
      onclick: async () => {
        if (await jobActions(job)) refresh();
      },
    }, icon(ICONS.more)));
}

function footnote() {
  const text = h('span', null, 'All survey data is stored on this device only.');
  const el = h('div', { class: 'home-foot' }, h('span', { 'aria-hidden': 'true' }, '🔒'), text);
  storageInfo().then(({ persisted, usage }) => {
    const parts = ['All survey data is stored on this device only.'];
    if (usage != null) parts.push(`Using ${(usage / 1048576).toFixed(1)} MB.`);
    parts.push(persisted ? 'Protected storage is on.' : 'Back up regularly – installing the app (Add to Home screen) helps keep data safe.');
    text.textContent = parts.join(' ');
  });
  return el;
}
