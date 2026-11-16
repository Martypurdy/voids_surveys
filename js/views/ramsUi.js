// Shared pieces for the RAMS pack screens: an editable sheet of rows (cards on a phone, a table on a wide
// screen, always one empty row at the bottom), a picker for starting hazards and library sets, and small helpers.
import { h, toast, multiSelect, confirmDialog } from '../ui.js';
import { photoButton } from '../photos.js';
import { captureSignature } from '../signature.js';
import { HAZARDS } from '../data/hazards.js';
import { savedSets, rowsFromHazards, rowsFromSets, removeSet } from '../raLibrary.js';

const blankText = (v) => String(v ?? '').trim() === '';

/**
 * A sheet of rows.
 *   items   the live array to edit      make()  a new empty item
 *   cols    [{ k, label, ph, w, kind: 'text' | 'check' | 'sign' }]
 *   photos  true = a 📷 button per row (item.photos)      numbered  show 1, 2, 3 …
 *   onChange  called after every edit (save)
 */
export function sheetEditor({ job, items, make, cols, onChange = () => {}, photos = false, numbered = false, removeLabel = 'Remove this row', confirmRemove = true }) {
  const sheet = h('div', { class: 'rep-sheet lst' });
  const template = `${numbered ? '38px ' : ''}${cols.map((c) => c.w || (c.kind === 'text' || !c.kind ? '1fr' : '84px')).join(' ')}${photos ? ' 84px' : ''} 48px`;
  sheet.style.setProperty('--cols', template);
  const textCols = cols.filter((c) => !c.kind || c.kind === 'text');
  const isBlank = (it) => textCols.every((c) => blankText(it[c.k])) && !(photos && it.photos?.length) && cols.every((c) => c.kind !== 'sign' || !it[c.k]);
  let nums = new Map();

  const ensureSpare = () => {
    const last = items[items.length - 1];
    if (!last || !isBlank(last)) { items.push(make()); return true; }
    return false;
  };
  const renumber = () => {
    let n = 0;
    for (const it of items) if (!isBlank(it)) nums.set(it.id, ++n); else nums.delete(it.id);
    for (const el of sheet.querySelectorAll('.rep-num')) { const v = nums.get(el.dataset.id); el.textContent = v ? String(v) : '+'; }
  };

  const rowEl = (it) => {
    const change = () => {
      onChange();
      if (it === items[items.length - 1] && !isBlank(it)) { ensureSpare(); sheet.append(rowEl(items[items.length - 1])); }
      renumber();
    };
    const cells = cols.map((c) => {
      if (c.kind === 'check') {
        const box = h('input', { type: 'checkbox', checked: Boolean(it[c.k]), 'aria-label': c.label, onchange: (e) => { it[c.k] = e.target.checked; onChange(); } });
        return h('label', { class: 'rep-cell rep-check' }, h('span', { class: 'rep-lbl' }, c.label), box);
      }
      if (c.kind === 'sign') {
        const btn = h('button', { type: 'button', class: 'btn-small' });
        const paint = () => { btn.textContent = it[c.k] ? '✓ Signed' : '✍ Sign'; btn.dataset.has = String(Boolean(it[c.k])); };
        paint();
        btn.addEventListener('click', async () => {
          const img = await captureSignature({ title: it.name ? `Sign below – ${it.name}` : 'Sign below' });
          if (!img) return;
          it[c.k] = img;
          paint();
          change();
        });
        return h('div', { class: 'rep-cell' }, h('span', { class: 'rep-lbl' }, c.label), btn);
      }
      const ta = h('textarea', {
        rows: 2, placeholder: c.ph, autocapitalize: 'sentences', 'aria-label': c.label,
        oninput: (e) => { it[c.k] = e.target.value; ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`; change(); },
      }, it[c.k] ?? '');
      return h('label', { class: 'rep-cell' }, h('span', { class: 'rep-lbl' }, c.label), ta);
    });
    const remove = h('button', {
      type: 'button', class: 'defect-remove', 'aria-label': removeLabel,
      onclick: async () => {
        if (!isBlank(it) && confirmRemove && !(await confirmDialog('Remove this row?', { ok: 'Remove' }))) return;
        items.splice(items.indexOf(it), 1);
        ensureSpare();
        onChange();
        render();
      },
    }, '−');
    const el = h('div', { class: 'rep-row', dataset: { id: it.id } },
      numbered ? h('span', { class: 'rep-num', dataset: { id: it.id }, 'aria-hidden': 'true' }) : null,
      cells,
      photos ? h('div', { class: 'rep-cell rep-photos' }, h('span', { class: 'rep-lbl' }, 'Photos'), photoButton(job, it.photos, change)) : null,
      h('div', { class: 'rep-actions' }, remove));
    requestAnimationFrame(() => el.querySelectorAll('textarea').forEach((t) => { t.style.height = 'auto'; if (t.value) t.style.height = `${Math.min(t.scrollHeight, 220)}px`; }));
    return el;
  };

  const render = () => {
    ensureSpare();
    sheet.replaceChildren(
      h('div', { class: 'rep-head', 'aria-hidden': 'true' }, numbered ? h('span', null, 'No.') : null, cols.map((c) => h('span', null, c.label)), photos ? h('span', null, 'Photos') : null, h('span', null, '')),
      ...items.map(rowEl));
    renumber();
  };
  sheet.refresh = render;
  render();
  return sheet;
}

/** Hazards from the starter list and from saved sets: resolves with rows to add, or null. */
export async function pickHazards() {
  const sets = savedSets();
  const groups = [{ label: 'Hazards to start from', options: HAZARDS.map((x) => x.hazard), selected: [] }];
  if (sets.length) groups.push({ label: 'Your saved assessments', options: sets.map((s) => s.title), selected: [] });
  const r = await multiSelect({ title: 'Add hazards', message: 'Tick any that apply. You can change every row afterwards.', groups });
  if (!r) return null;
  const rows = [...rowsFromHazards(r[0]), ...(sets.length ? rowsFromSets(r[1]) : [])];
  if (!rows.length) toast('Nothing ticked');
  return rows;
}

/** A card listing the saved sets with a delete button each (device only). */
export function libraryCard(onChange = () => {}) {
  const wrap = h('div', { class: 'card card-body' });
  const render = () => {
    const sets = savedSets();
    wrap.replaceChildren(
      h('strong', null, 'Your library'),
      h('p', { class: 'hint' }, sets.length ? 'Saved on this device only. Use “Add hazards” on any risk assessment to bring a set in.' : 'Nothing saved yet. Open a risk assessment and tap “Save to library” to keep it for next time.'),
      ...sets.map((s) => h('div', { class: 'lib-row' },
        h('span', null, `${s.title} (${s.rows.length} hazard${s.rows.length === 1 ? '' : 's'})`),
        h('button', { type: 'button', class: 'btn-small btn-danger', onclick: async () => { if (await confirmDialog(`Remove “${s.title}” from the library?`, { ok: 'Remove' })) { removeSet(s.id); render(); onChange(); } } }, 'Remove'))));
  };
  render();
  wrap.refresh = render;
  return wrap;
}

/** Yes / No (tap again to clear) as a labelled field. */
export function yesNoField(label, value, onChange) {
  const wrap = h('div', { class: 'segmented yes-no yes-no-plain', role: 'group', 'aria-label': label });
  const render = () => wrap.replaceChildren(...[['yes', 'Yes'], ['no', 'No']].map(([k, t]) => h('button', {
    type: 'button', 'aria-pressed': String(value === k),
    onclick: () => { value = value === k ? '' : k; render(); onChange(value); },
  }, t)));
  render();
  return h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), wrap);
}

/** A button showing what is chosen from a list; tapping opens a tick list. */
export function pickField(label, options, selected, onChange, { empty = 'Tap to choose' } = {}) {
  const btn = h('button', { type: 'button', class: 'works-item pick-field' });
  const paint = () => { btn.replaceChildren(h('span', { class: 'works-text' }, h('span', { class: 'works-label' }, label), h('span', { class: 'works-detail' }, selected.length ? selected.join(', ') : empty))); btn.dataset.has = String(selected.length > 0); };
  paint();
  btn.addEventListener('click', async () => {
    const r = await multiSelect({ title: label, groups: [{ options: [...new Set([...options, ...selected])], selected }] });
    if (!r) return;
    selected.splice(0, selected.length, ...r[0]);
    paint();
    onChange();
  });
  return btn;
}
