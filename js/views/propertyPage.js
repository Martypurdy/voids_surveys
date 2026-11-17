// A property: everything done at this address, newest first, and the buttons to start something new.
import { getProperty, getJob, deleteProperty, mergeProperties, flushSave } from '../db.js';
import { backupStatus, fmtDate, addressLines } from '../model.js';
import { addressTitle, entryForm, natureOf, firstLine } from '../properties.js';
import { directionsUrl } from '../geo.js';
import { h, icon, ICONS, pageHeader, choose, confirmDialog, toast, busy } from '../ui.js';
import { go, refresh } from '../router.js';
import { jobActions } from './jobActions.js';
import { pickGroup } from './startForm.js';
import { editPropertyDialog } from './addressEditor.js';
import { pickProperty } from './pickProperty.js';
import { offerFile } from '../export/deliver.js';

export default async function propertyPage(root, { id }) {
  await flushSave();
  const p = await getProperty(id);
  if (!p) throw new Error('Property not found on this device');
  if (matchMedia('(min-width: 1000px)').matches) return (await import('./propertySplit.js')).renderSplit(root, id); // list beside it
  const d = buildDetail(p);
  root.append(
    pageHeader(d.title, { back: '#/properties', actions: d.menuBtn }),
    h('div', { class: 'content prop-detail' }, ...d.children));
}

/** The property's card, start button and history: on its own page, or beside the list on wide screens. */
export function buildDetail(p) {
  const title = addressTitle(p.address);

  // ----- property menu -----
  const menu = async () => {
    const v = await choose({
      title,
      buttons: [
        { label: '✎ Edit address and reference', value: 'edit', class: 'btn-primary' },
        p.entries.length ? { label: '🗜 Export the whole file (zip)', value: 'pack', class: 'btn-primary' } : null,
        { label: '⇆ Merge into another property', value: 'merge' },
        { label: 'Delete this property', value: 'delete', class: 'btn-danger' },
        { label: 'Cancel', value: null },
      ].filter(Boolean),
    });
    if (v === 'edit' && await editPropertyDialog(p)) refresh();
    if (v === 'pack') {
      const progress = busy('Building the file…');
      try {
        const { buildPropertyPack } = await import('../export/pack.js');
        const { blob, filename } = await buildPropertyPack(p, { onProgress: progress.update });
        progress.close();
        await offerFile(blob, filename, 'Property file ready');
      } catch (e) {
        console.error(e);
        progress.close();
        toast(`Export failed: ${e.message}`);
      }
    }
    if (v === 'merge') {
      const to = await pickProperty({ title: 'Merge into which property?', exclude: [p.id] });
      if (to && await confirmDialog(`Move all ${p.entries.length} entr${p.entries.length === 1 ? 'y' : 'ies'} from “${title}” into “${addressTitle(to.address)}”? This property is then removed.`, { title: 'Merge properties?', ok: 'Merge', danger: false })) {
        await mergeProperties(p.id, to.id);
        toast('Merged');
        go(`/property/${to.id}`);
      }
    }
    if (v === 'delete') {
      const n = p.entries.length;
      if (await confirmDialog(`Delete “${title}”${n ? ` and its ${n} entr${n === 1 ? 'y' : 'ies'}, with all their photos,` : ''} from this device? This can’t be undone.`)) {
        await deleteProperty(p.id);
        toast('Property deleted');
        go('/properties');
      }
    }
  };

  // ----- address card -----
  const nav = directionsUrl(p.address);
  const lines = addressLines(p.address);
  const card = h('div', { class: 'card card-body prop-card' },
    h('strong', { class: 'prop-title' }, firstLine(p.address) || title),
    lines.slice(1).length ? h('div', { class: 'prop-lines' }, lines.slice(1).join(', ')) : null,
    p.ref ? h('div', { class: 'prop-ref' }, `Reference: ${p.ref}`) : null,
    h('div', { class: 'prop-actions' },
      h('button', { type: 'button', class: 'btn-small', onclick: async () => { if (await editPropertyDialog(p)) refresh(); } }, '✎ Edit'),
      nav ? h('a', { class: 'btn btn-small', href: nav, target: '_blank', rel: 'noopener noreferrer' }, 'Navigate') : null));

  // ----- timeline (newest first, by year) -----
  const entries = [...p.entries].sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  let filter = 'all';
  const forms = [...new Map(entries.map((e) => [`${e.form}:${e.kind}`, entryForm(e)])).entries()];
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Show' });
  const list = h('div', { class: 'timeline' });
  const entryName = (e) => `${title} – ${e.nature || entryForm(e).title}`;
  const render = () => {
    chips.replaceChildren(...(forms.length > 1 && entries.length > 3
      ? [['all', `All ${entries.length}`], ...forms.map(([k, f]) => [k, `${f.emoji} ${f.title}`])].map(([k, label]) => h('button', {
        type: 'button', 'aria-pressed': String(filter === k), onclick: () => { filter = k; render(); },
      }, label))
      : []));
    const shown = entries.filter((e) => filter === 'all' || `${e.form}:${e.kind}` === filter);
    const out = [];
    let year = '';
    for (const e of shown) {
      const y = (e.created || '').slice(0, 4);
      if (y !== year) { year = y; out.push(h('h3', { class: 'timeline-year' }, y || 'Undated')); }
      out.push(entryCard(e));
    }
    list.replaceChildren(...(out.length ? out : [h('p', { class: 'empty' }, 'Nothing done at this property yet. Start something above.')]));
  };
  const entryCard = (e) => {
    const f = entryForm(e);
    const done = e.total && e.done === e.total;
    const state = done ? 'done' : e.done || e.started ? 'progress' : 'new';
    const status = backupStatus({ lastExported: e.lastExported, created: e.created });
    return h('div', { class: 'card job-card', dataset: { state, form: e.form } },
      h('a', { href: `#/job/${e.id}` },
        h('div', { class: 'job-head' },
          h('div', { class: 'job-title' }, entryName(e)),
          h('span', { class: 'job-pill' }, done ? '✓ Complete' : state === 'progress' ? 'In progress' : 'New')),
        h('div', { class: 'job-sub' }, `${f.emoji} ${f.title} · ${fmtDate(e.created)}`),
        h('div', { class: 'job-progress' },
          h('div', { class: 'progress', 'aria-hidden': 'true' }, Array.from({ length: e.total }, (_, i) => h('span', { dataset: { state: i < e.done ? 'complete' : 'todo' } }))),
          h('span', { class: 'job-pct' }, `${e.total ? Math.round((e.done / e.total) * 100) : 0}%`)),
        h('div', { class: 'job-meta' }, e.meta),
        status.stale ? h('span', { class: 'warn' }, '⚠ ', status.text) : null),
      h('button', {
        type: 'button',
        class: 'icon-btn',
        'aria-label': `Actions for ${entryName(e)}`,
        onclick: async () => {
          const job = await getJob(e.id);
          const r = job && await jobActions(job);
          if (typeof r === 'string' && r.startsWith('goto:')) go(r.slice(5));
          else if (r) refresh();
        },
      }, icon(ICONS.more)));
  };
  render();

  return {
    title: firstLine(p.address) || title,
    menuBtn: h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Property actions', onclick: menu }, icon(ICONS.more)),
    children: [
      card,
      h('button', { type: 'button', class: 'btn-primary btn-big btn-block', onclick: () => pickGroup(p.id) }, '＋ Start something new here'),
      h('h2', { class: 'home-h' }, `History (${entries.length})`),
      chips,
      list,
    ],
  };
}
