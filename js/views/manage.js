// Select and clear out: every entry on the device in one list, to tick in bulk and then export as zip backup(s),
// export and remove, or just delete. Reached from Properties and history. Nothing is removed without a confirmation.
import { listProperties, getJob, deleteJob, getProperty, deleteProperty, flushSave } from '../db.js';
import { fmtDate } from '../model.js';
import { addressTitle, entryForm, natureOf } from '../properties.js';
import { h, pageHeader, confirmDialog, choose, toast, busy } from '../ui.js';
import { offerFile } from '../export/deliver.js';

const PAGE = 100;
const AGES = [['any', 'Any age', 0], ['30', 'Older than a month', 30], ['180', 'Older than 6 months', 180], ['365', 'Older than a year', 365]];

export default async function manage(root) {
  await flushSave();
  let rows = [];
  const load = async () => {
    const props = await listProperties();
    rows = props.flatMap((p) => p.entries.map((e) => ({ ...e, pid: p.id, title: addressTitle(p.address), search: `${addressTitle(p.address)} ${p.address?.postcode || ''} ${p.ref || ''} ${e.nature || ''} ${entryForm(e).title} ${e.ref || ''}`.toLowerCase() })))
      .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  };
  await load();

  const selected = new Set();
  let shown = PAGE;
  const f = { q: '', form: 'all', status: 'all', age: 'any' };

  const isDone = (e) => e.total && e.done === e.total;
  const filtered = () => {
    const q = f.q.trim().toLowerCase();
    const days = AGES.find((a) => a[0] === f.age)[2];
    const cutoff = days ? Date.now() - days * 864e5 : 0;
    return rows.filter((e) => (!q || e.search.includes(q))
      && (f.form === 'all' || `${e.form}:${e.kind}` === f.form)
      && (f.status === 'all' || (f.status === 'done' ? isDone(e) : !isDone(e)))
      && (!cutoff || new Date(e.created || 0).getTime() < cutoff));
  };

  const list = h('div', { class: 'mg-list' });
  const info = h('p', { class: 'hint' });
  const bar = h('div', { class: 'mg-bar' });

  const render = () => {
    const found = filtered();
    const page = found.slice(0, shown);
    const nSel = found.filter((e) => selected.has(e.id)).length;
    info.textContent = `${found.length} of ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} shown.`;
    list.replaceChildren(
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', onclick: () => { for (const e of found) selected.add(e.id); render(); } }, `Select all ${found.length}`),
        h('button', { type: 'button', onclick: () => { for (const e of found) selected.delete(e.id); render(); }, disabled: !nSel }, 'Clear ticks')),
      ...(page.length ? page.map((e) => row(e)) : [h('p', { class: 'empty' }, 'Nothing matches.')]),
      ...(found.length > shown ? [h('button', { type: 'button', class: 'btn-block', onclick: () => { shown += PAGE; render(); } }, `Show more (${found.length - shown} more)`)] : []));
    const n = selected.size;
    bar.hidden = !n;
    bar.replaceChildren(
      h('strong', null, `${n} selected`),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn-primary', onclick: () => exportSelected(false) }, '🗜 Export zip'),
        h('button', { type: 'button', class: 'btn-primary', onclick: () => exportSelected(true) }, '🗜 Export, then remove'),
        h('button', { type: 'button', class: 'btn-danger', onclick: () => removeSelected() }, '🗑 Delete')));
  };

  const row = (e) => {
    const fm = entryForm(e);
    const box = h('input', { type: 'checkbox', checked: selected.has(e.id), 'aria-label': `Select ${e.title} ${e.nature || fm.title}`, onchange: () => { if (box.checked) selected.add(e.id); else selected.delete(e.id); render(); } });
    return h('label', { class: 'mg-row', dataset: { state: isDone(e) ? 'done' : 'progress' } },
      box,
      h('span', { class: 'mg-text' },
        h('strong', null, e.title),
        h('span', null, `${fm.emoji} ${e.nature || fm.title} · ${fmtDate(e.created)} · ${isDone(e) ? '✓ Complete' : 'In progress'}${e.lastExported ? ' · backed up' : ''}`)));
  };

  // ----- actions -----
  const chosen = () => rows.filter((e) => selected.has(e.id));
  const withCodes = () => h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'mg-codes' }), 'Include key safe codes');
  const withReports = () => h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 'mg-pdf' }), 'Also include a PDF report for each (slower, bigger)');

  /** Export the ticked entries as zip(s). Resolves true if every part was saved or shared. */
  const exportZips = async (entries) => {
    const content = h('div', null, withCodes(), withReports());
    const go1 = await choose({
      title: `Export ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`,
      message: 'One zip file (or several if there are a lot of photos). You can import it again later with Import on the front screen.',
      content,
      buttons: [{ label: 'Make the zip', value: true, class: 'btn-primary' }, { label: 'Cancel', value: false }],
    });
    if (!go1) return false;
    const includeCode = content.querySelector('#mg-codes').checked;
    const reports = content.querySelector('#mg-pdf').checked;
    const progress = busy('Getting ready…');
    let packs;
    try {
      const jobs = [];
      for (let i = 0; i < entries.length; i++) {
        progress.update(`Reading ${i + 1} of ${entries.length}…`);
        const j = await getJob(entries[i].id);
        if (j) jobs.push(j);
      }
      const { buildBatchPacks } = await import('../export/pack.js');
      packs = await buildBatchPacks(jobs, { includeCode, reports, onProgress: progress.update });
      progress.close();
    } catch (e) {
      console.error(e);
      progress.close();
      toast(`Export failed: ${e.message}`);
      return false;
    }
    for (const p of packs) {
      if (!(await offerFile(p.blob, p.filename, packs.length > 1 ? `Backup ready – ${p.filename}` : 'Backup ready'))) return false;
    }
    return true;
  };

  const exportSelected = async (thenRemove) => {
    const entries = chosen();
    if (!entries.length) return;
    const ok = await exportZips(entries);
    if (!ok) { if (thenRemove) toast('Nothing was removed'); return; }
    if (!thenRemove) return toast('Backup saved');
    await removeEntries(entries, { afterExport: true });
  };

  const removeSelected = async () => {
    const entries = chosen();
    if (!entries.length) return;
    await removeEntries(entries, { afterExport: false });
  };

  const removeEntries = async (entries, { afterExport }) => {
    const n = entries.length;
    const notBacked = entries.filter((e) => !e.lastExported).length;
    const ok = await confirmDialog(
      `${afterExport ? 'Check the zip file really saved or sent, then delete' : 'Delete'} ${n} entr${n === 1 ? 'y' : 'ies'} and all their photos from this device? Addresses left with nothing in them go too. This can’t be undone.${!afterExport && notBacked ? ` ${notBacked} ha${notBacked === 1 ? 's' : 've'} never been backed up.` : ''}`,
      { title: `Delete ${n}?`, ok: `Delete ${n}` });
    if (!ok) return;
    const progress = busy('Deleting…');
    try {
      const touched = new Set();
      for (let i = 0; i < n; i++) {
        progress.update(`Deleting ${i + 1} of ${n}…`);
        const e = entries[i];
        await deleteJob(e.id);
        if (e.form === 'invoice') await (await import('../accounts/store.js')).removeIncomeFor(e.id);
        touched.add(e.pid);
        selected.delete(e.id);
      }
      let gone = 0;
      for (const pid of touched) {
        const p = await getProperty(pid);
        if (p && !p.entries.length) { await deleteProperty(pid); gone++; }
      }
      progress.close();
      toast(`Deleted ${n} entr${n === 1 ? 'y' : 'ies'}${gone ? ` and ${gone} empty address${gone === 1 ? '' : 'es'}` : ''}`);
    } catch (e) {
      console.error(e);
      progress.close();
      toast(`Delete failed: ${e.message}`);
    }
    await load();
    render();
  };

  // ----- filters -----
  const kinds = [...new Map(rows.map((e) => [`${e.form}:${e.kind}`, entryForm(e)])).entries()];
  const sel = (label, opts, get, set) => h('label', { class: 'field mg-filter' },
    h('span', { class: 'field-label' }, label),
    h('select', { onchange: (ev) => { set(ev.target.value); shown = PAGE; render(); } },
      opts.map(([v, t]) => h('option', { value: v, selected: get() === v }, t))));
  const search = h('input', { type: 'search', placeholder: '🔍 Search address, postcode or type…', 'aria-label': 'Search entries', oninput: (ev) => { f.q = ev.target.value; shown = PAGE; render(); } });

  root.append(
    pageHeader('Select and clear out', { back: '#/properties' }),
    h('div', { class: 'content props' },
      h('p', { class: 'hint' }, 'Tick the entries you want, then export them as one zip, export and remove them, or delete them. Nothing is removed without asking first.'),
      search,
      h('div', { class: 'mg-filters' },
        sel('Type', [['all', 'All types'], ...kinds.map(([k, fm]) => [k, `${fm.emoji} ${fm.title}`])], () => f.form, (v) => { f.form = v; }),
        sel('Status', [['all', 'All'], ['done', 'Complete'], ['open', 'In progress']], () => f.status, (v) => { f.status = v; }),
        sel('Age', AGES.map(([v, t]) => [v, t]), () => f.age, (v) => { f.age = v; })),
      info,
      list,
      bar));
  render();
}
