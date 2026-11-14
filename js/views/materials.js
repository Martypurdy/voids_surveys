// Screen: materials list, grouped by room. Standard items and items worked out from
// the defects are ticked automatically; untick anything not needed, change the
// quantity, or add your own.
import { scheduleSave } from '../db.js';
import { materialGroups, setMaterial, addOwnMaterial } from '../materials.js';
import { h, toast } from '../ui.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const unitLabel = (u) => (u === 'm2' ? 'm²' : u === 'm' ? 'm' : 'Qty');

export default async function materials(root, { id }) {
  const job = await loadJobOr404(id);
  const save = () => scheduleSave(job);
  const wrap = h('div');

  const itemRow = (g, it) => {
    const qty = h('input', {
      type: 'text',
      inputmode: 'decimal',
      value: it.q,
      'aria-label': `${it.name} ${unitLabel(it.unit)}`,
      oninput: (e) => {
        if (it.own) g.room.materials.own.find((o) => o.n === it.name).q = e.target.value;
        else setMaterial(g.room, it.name, { q: e.target.value });
        save();
      },
    });
    const detail = it.own ? 'Added by you' : [it.std && !it.from.length ? 'Standard – changed every void' : it.std ? 'Standard' : '', it.from.length ? `from ${it.from.join(', ')}` : ''].filter(Boolean).join(' · ').replace(/^from/, 'From');
    return h('div', { class: 'mat-row', dataset: { on: String(it.on) } },
      h('button', {
        type: 'button',
        class: 'works-item',
        'aria-pressed': String(it.on),
        onclick: () => {
          if (it.own) return;
          setMaterial(g.room, it.name, { on: !it.on });
          save();
          render();
        },
      },
      h('span', { class: 'works-tick', 'aria-hidden': 'true' }, it.on ? '✓' : ''),
      h('span', { class: 'works-text' },
        h('span', { class: 'works-label' }, it.name),
        h('span', { class: 'works-detail' }, detail))),
      h('label', { class: 'defect-qty' }, qty, h('span', null, unitLabel(it.unit))),
      it.own
        ? h('button', {
          type: 'button',
          class: 'defect-remove',
          'aria-label': `Remove ${it.name}`,
          onclick: () => {
            g.room.materials.own = g.room.materials.own.filter((o) => o.n !== it.name);
            save();
            render();
          },
        }, '−')
        : null);
  };

  const addBox = (g) => {
    const input = h('input', { type: 'text', placeholder: 'Add a material…', autocapitalize: 'sentences', 'aria-label': `Add a material to ${g.name}` });
    const add = () => {
      const n = input.value.trim();
      if (!n) return input.focus();
      if (g.items.some((it) => it.name.toLowerCase() === n.toLowerCase())) return toast(`${n} is already listed for ${g.name}`);
      addOwnMaterial(g.room, n, '1');
      save();
      render();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    return h('div', { class: 'add-own-row mat-add', style: 'grid-template-columns:1fr auto' }, input,
      h('button', { type: 'button', class: 'btn-primary', onclick: add }, 'Add'));
  };

  const render = () => {
    const groups = materialGroups(job);
    wrap.replaceChildren(...groups.map((g) => h('section', { class: 'card card-body mat-group' },
      h('h3', { class: 'mat-title' }, g.name),
      g.items.length
        ? h('div', { class: 'works-list' }, g.items.map((it) => itemRow(g, it)))
        : h('p', { class: 'hint' }, g.kind === 'security' ? 'Choose locks in Security › Renew locks.' : 'Nothing yet – items appear as you record defects.'),
      addBox(g))));
    if (!job.rooms.length && !job.externals.length) {
      wrap.append(h('p', { class: 'hint' }, 'Add rooms on the Rooms tab – their standard items appear here.'));
    }
  };
  render();

  root.append(
    ...jobChrome(job, 'materials'),
    h('div', { class: 'content' },
      h('h2', null, 'Materials list'),
      h('p', { class: 'hint' }, 'Standard items and items from your defects are ticked automatically. Tap to untick anything not needed, change quantities, or add your own. Printed under the schedule of works.'),
      wrap,
      completeFooter(job, 'materials')));
}
