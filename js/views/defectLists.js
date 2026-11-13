// Settings › Defect lists: edit this device's defect list for each room type and
// feature – remove/restore standard defects, add your own (Qty / m² / m), and
// change the wording or unit of your own. Same data as the − / 📌 buttons in a room.
import { UNITS } from '../data/parts.js';
import { AREA_PRESETS, FEATURES, SUGGESTIONS, defaultFeatures } from '../data/features.js';
import { setHidden, setAdded, updateAdded, templateRoomTypes } from '../templates.js';
import { templateOptions } from '../defectOptions.js';
import { uid } from '../model.js';
import { h, toast, confirmDialog } from '../ui.js';

const OWN_UNITS = [['nr', 'Qty'], ['m2', 'm²'], ['m', 'm']];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function unitSelect(value, onChange) {
  return h('select', { 'aria-label': 'Measured by', value, onchange: (e) => onChange(e.target.value) },
    OWN_UNITS.map(([v, l]) => h('option', { value: v }, l)));
}

export function defectListEditor(library) {
  // Every room type, outside area type and Security, plus any custom types already used.
  const types = [
    ...AREA_PRESETS.rooms.map((name) => ({ name, kind: 'rooms' })),
    ...AREA_PRESETS.externals.map((name) => ({ name, kind: 'externals' })),
    { name: 'Security', kind: 'security' },
  ];
  for (const t of templateRoomTypes()) {
    if (!types.some((x) => x.name.toLowerCase() === t)) types.push({ name: cap(t), kind: 'rooms' });
  }
  const featureKeys = (type) => [...new Set([...defaultFeatures(type.name, type.kind), ...SUGGESTIONS[type.kind]])];

  let type = types[0];
  let roomName = type.name;
  let part = FEATURES[featureKeys(type)[0]];

  const partSel = h('select', { 'aria-label': 'Feature', onchange: (e) => { part = FEATURES[e.target.value]; render(); } });
  const fillParts = () => {
    const keys = featureKeys(type);
    partSel.replaceChildren(...keys.map((k) => h('option', { value: k }, FEATURES[k].label)));
    if (!keys.includes(part.key)) part = FEATURES[keys[0]];
    partSel.value = part.key;
  };
  const roomSel = h('select', {
    'aria-label': 'Room or area type',
    onchange: (e) => { type = types[Number(e.target.value)]; roomName = type.name; fillParts(); render(); },
  },
  h('optgroup', { label: 'Rooms' }, types.map((t, i) => (t.kind === 'rooms' ? h('option', { value: String(i) }, t.name) : null))),
  h('optgroup', { label: 'Outside' }, types.map((t, i) => (t.kind === 'externals' ? h('option', { value: String(i) }, t.name) : null))),
  h('optgroup', { label: 'Security' }, types.map((t, i) => (t.kind === 'security' ? h('option', { value: String(i) }, t.name) : null))));
  fillParts();
  const list = h('div', { class: 'tpl-list' });

  // Add your own
  const ownLabel = h('input', { type: 'text', placeholder: 'Describe the defect…', autocapitalize: 'sentences', 'aria-label': 'New defect' });
  let ownUnit = 'nr';
  const add = () => {
    const d = ownLabel.value.trim();
    if (!d) return ownLabel.focus();
    setAdded(roomName, part.key, { c: `my-${uid().slice(0, 8)}`, d, u: ownUnit, custom: true }, true);
    ownLabel.value = '';
    render();
    toast(`Added to ${roomName} › ${part.label}`);
  };
  ownLabel.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

  function render() {
    const tpl = templateOptions({ library, roomName, part });
    const rows = tpl.visible.map((o) => {
      const unit = UNITS[o.u] || UNITS.nr;
      if (o.custom) {
        return h('div', { class: 'tpl-row' },
          h('input', {
            type: 'text',
            value: o.d,
            class: 'tpl-edit',
            'aria-label': 'Defect wording',
            onchange: (e) => {
              const v = e.target.value.trim();
              if (v) updateAdded(roomName, part.key, o.c, { d: v });
              else e.target.value = o.d;
            },
          }),
          unitSelect(o.u, (v) => updateAdded(roomName, part.key, o.c, { u: v })),
          h('button', {
            type: 'button',
            class: 'defect-remove',
            'aria-label': `Delete “${o.d}”`,
            onclick: async () => {
              if (!(await confirmDialog(`Delete your defect “${o.d}” from the ${roomName} ${part.label.toLowerCase()} list?`, { ok: 'Delete' }))) return;
              setAdded(roomName, part.key, o, false);
              render();
            },
          }, '−'));
      }
      return h('div', { class: 'tpl-row' },
        h('span', { class: 'defect-text' },
          h('span', { class: 'defect-label' }, o.d),
          h('span', { class: 'defect-code' }, [library && !o.custom ? o.c : '', unit.label, o.pinned ? '📌 added by you' : 'standard'].filter(Boolean).join(' · '))),
        h('button', {
          type: 'button',
          class: 'defect-remove',
          'aria-label': `Remove “${o.d}”`,
          onclick: () => {
            if (o.pinned) setAdded(roomName, part.key, o, false);
            else setHidden(roomName, part.key, o.k, true);
            render();
          },
        }, '−'));
    });

    list.replaceChildren(
      ...rows,
      rows.length ? '' : h('p', { class: 'hint' }, 'This list is empty – add your own below or restore standard ones.'),
      h('div', { class: 'add-own' },
        h('span', { class: 'field-label' }, '+ Add your own defect'),
        h('div', { class: 'add-own-row' }, ownLabel, unitSelect(ownUnit, (v) => { ownUnit = v; }),
          h('button', { type: 'button', class: 'btn-primary', onclick: add }, 'Add'))),
      tpl.removed.length
        ? h('details', { class: 'removed-list' },
          h('summary', null, `Removed standard defects (${tpl.removed.length})`),
          ...tpl.removed.map((o) => h('div', { class: 'removed-row' },
            h('span', { class: 'defect-text' }, h('span', { class: 'defect-label' }, o.d)),
            h('button', {
              type: 'button',
              class: 'defect-restore',
              'aria-label': `Restore “${o.d}”`,
              onclick: () => { setHidden(roomName, part.key, o.k, false); render(); },
            }, '+'))))
        : '');
  }
  render();

  return h('div', { class: 'card card-body' },
    h('div', { class: 'grid-2' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Room / area'), roomSel),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Feature'), partSel)),
    list);
}
