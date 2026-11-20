// Screen 1: home – branded header, the quick-start buttons (no address needed), the forms you are in the
// middle of, and a button for properties and history.
import { listProperties, storageInfo } from '../db.js';
import { fmtDate } from '../model.js';
import { addressTitle, entryForm, hasAddress } from '../properties.js';
import { h, icon, ICONS, torchButton } from '../ui.js';
import { refresh } from '../router.js';
import { getLastSurveyor } from '../surveyors.js';
import { formGrid, cardInner } from './startForm.js';
import { inboxCount } from '../files.js';

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

function greeting() {
  const hr = new Date().getHours();
  const part = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const first = getLastSurveyor().trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

const CONTINUE = 3; // unfinished forms shown on the home screen

export default async function jobList(root) {
  const props = await listProperties();
  const waiting = await inboxCount().catch(() => 0); // files shared to the app, not yet saved to a property
  const all = props.flatMap((p) => p.entries.map((e) => ({ e, p })));
  const open = all.filter(({ e }) => e.done < e.total);
  const inProgress = open.length;
  const complete = all.length - inProgress;

  const importInput = h('input', {
    type: 'file',
    accept: '.json,.txt,.zip,application/json,application/zip,text/plain', // backups shared from a phone arrive as .txt
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
  const stat = (n, label, kind) => h('div', { class: `hero-stat hero-stat-${kind}` }, h('strong', null, String(n)), h('span', null, label));
  const hero = h('header', { class: 'hero' },
    h('div', { class: 'hero-top' },
      logo(),
      h('div', { class: 'hero-brand' }, h('h1', null, 'PropertyPad'), h('span', null, 'Surveys & site forms')),
      h('button', { type: 'button', class: 'hero-btn hero-icon', onclick: () => importInput.click(), 'aria-label': 'Import a survey file or pack', title: 'Import a survey file or pack' }, icon(ICONS.import)),
      importInput,
      torchButton('hero-btn hero-icon torch-btn'),
      h('a', { class: 'hero-btn hero-icon', href: '#/settings', 'aria-label': 'Settings' }, icon(ICONS.settings))),
    h('p', { class: 'hero-hello' }, greeting(), h('span', null, new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))),
    h('div', { class: 'hero-stats' },
      stat(inProgress, 'In progress', 'progress'),
      stat(complete, 'Complete', 'done'),
      stat(props.length, `Propert${props.length === 1 ? 'y' : 'ies'}`, 'photos')));

  // ---------- Continue: the forms you were last working on ----------
  const recent = open
    .sort((a, b) => (b.e.updated || '').localeCompare(a.e.updated || ''))
    .slice(0, CONTINUE);
  const continueCard = ({ e, p }) => {
    const f = entryForm(e);
    const pct = e.total ? Math.round((e.done / e.total) * 100) : 0;
    const title = hasAddress(p.address) ? `${addressTitle(p.address)} – ${e.nature || f.title}` : `${e.nature || f.title} – no address yet`;
    return h('div', { class: 'card job-card', dataset: { state: e.done || e.started ? 'progress' : 'new', form: e.form } },
      h('a', { href: e.form === 'plan' ? `#/job/${e.id}/dimensions` : e.form === 'calc' ? `#/job/${e.id}/calculate` : e.form === 'quote' || e.form === 'invoice' ? `#/job/${e.id}/items` : `#/job/${e.id}` },
        h('div', { class: 'job-head' },
          h('div', { class: 'job-title' }, title),
          h('span', { class: 'job-pill' }, e.done || e.started ? 'In progress' : 'New')),
        h('div', { class: 'job-sub' }, `${f.emoji} ${f.title} · ${fmtDate(e.updated)}`),
        h('div', { class: 'job-progress' },
          h('div', { class: 'progress', 'aria-hidden': 'true' }, Array.from({ length: e.total }, (_, i) => h('span', { dataset: { state: i < e.done ? 'complete' : 'todo' } }))),
          h('span', { class: 'job-pct' }, `${pct}%`))));
  };

  root.append(
    hero,
    h('div', { class: 'content home' },
      h('div', { class: 'home-main' },
        h('h2', { class: 'home-h' }, 'Start a new form'),
        formGrid(null)), // no address needed: it goes in "No address yet" until you give it one
      h('div', { class: 'home-side' },
      h('a', { class: 'form-card form-card-ready form-card-group', href: '#/inbox', dataset: { group: 'shared' } },
        cardInner(waiting
          ? { emoji: '📥', title: `Shared files (${waiting})`, text: 'Photos and documents shared to PropertyPad. Save them to a property.' }
          : { emoji: '📎', title: 'Add files', text: 'Choose photos or documents from this device, then save them to a property.' }, true, '›')),
      recent.length ? [h('h2', { class: 'home-h' }, 'Continue'), h('div', { class: 'job-list compact' }, recent.map(continueCard))] : null,
      h('h2', { class: 'home-h' }, 'Properties and history'),
      h('a', { class: 'form-card form-card-ready form-card-group', href: '#/properties', dataset: { group: 'properties' } },
        cardInner({
          emoji: '🗂️',
          title: 'Properties and history',
          text: props.length ? `${props.length} propert${props.length === 1 ? 'y' : 'ies'} · ${all.length} entr${all.length === 1 ? 'y' : 'ies'}. Search by postcode, address or reference.` : 'Every address and everything done there, in one place.',
        }, true, '›')),
      footnote())));
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
