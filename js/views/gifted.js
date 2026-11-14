// Screen: gifted items – things left for the incoming tenant (carpets, blinds…).
// Tap an item, pick the rooms / areas it applies to; it turns green. Add your own items.
import { scheduleSave } from '../db.js';
import { GIFT_ITEMS, isRtl } from '../model.js';
import { h, multiSelect, worksButton, confirmDialog, toast, yesNo, textField } from '../ui.js';
import { photoButton } from '../photos.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const WHOLE = 'Whole property';

export default async function gifted(root, { id }) {
  const job = await loadJobOr404(id);
  const g = job.gifted;
  const save = () => scheduleSave(job);
  const list = h('div', { class: 'works-list' });

  // Places to choose from: this survey's rooms and outside areas.
  const places = () => [WHOLE, ...job.rooms.map((r) => r.name), ...job.externals.map((r) => r.name)].filter(Boolean);

  const pickRooms = async (item) => {
    const options = places();
    const current = g.selected[item] || [];
    const r = await multiSelect({
      title: item,
      message: options.length > 1 ? 'Which rooms or areas is it gifted in?' : 'Add rooms on the Rooms tab to pick them here.',
      groups: [{ options: [...new Set([...options, ...current])], selected: current }],
    });
    if (!r) return;
    const [chosen] = r;
    if (chosen.length) g.selected[item] = chosen;
    else delete g.selected[item];
    save();
    render();
  };

  const removeOwn = async (item) => {
    if (!(await confirmDialog(`Remove “${item}” from this survey’s gifted items?`, { ok: 'Remove' }))) return;
    g.extra = g.extra.filter((x) => x !== item);
    delete g.selected[item];
    save();
    render();
  };

  const render = () => {
    const items = [...GIFT_ITEMS, ...g.extra];
    list.replaceChildren(...items.map((item) => {
      const rooms = g.selected[item] || [];
      const btn = worksButton(item, rooms.length ? rooms.join(', ') : 'Tap to choose rooms', rooms.length > 0,
        () => pickRooms(item), { chevron: '›' });
      return g.extra.includes(item)
        ? h('div', { class: 'room-row' }, btn,
          h('button', { type: 'button', class: 'feature-remove', 'aria-label': `Remove ${item}`, onclick: () => removeOwn(item) }, '−'))
        : btn;
    }));
  };

  const own = h('input', { type: 'text', placeholder: 'e.g. Mirror, Fridge freezer…', autocapitalize: 'sentences', 'aria-label': 'Your own gifted item' });
  const addOwn = async () => {
    const item = own.value.trim();
    if (!item) return own.focus();
    if ([...GIFT_ITEMS, ...g.extra].some((x) => x.toLowerCase() === item.toLowerCase())) return toast(`${item} is already in the list`);
    g.extra.push(item);
    own.value = '';
    save();
    render();
    await pickRooms(item);
  };
  own.addEventListener('keydown', (e) => { if (e.key === 'Enter') addOwn(); });

  render();

  // Ready to let: decorating voucher – required? then its value and photos.
  let voucher = null;
  if (isRtl(job)) {
    const v = job.rtl.voucher;
    const details = h('div', { class: 'inline-row inline-bottom' },
      h('div', { class: 'inline-grow' }, textField('Value of voucher (£)', v.value, (x) => { v.value = x; save(); }, { inputmode: 'decimal', placeholder: 'e.g. 150' })),
      photoButton(job, v.photos, () => {}, { label: 'Voucher photos' }));
    details.hidden = v.required !== 'yes';
    voucher = h('div', { class: 'card card-body' },
      h('span', { class: 'field-label' }, 'Is a decorating voucher required?'),
      yesNo('Decorating voucher required?', v.required, (x) => {
        v.required = x;
        details.hidden = x !== 'yes';
        save();
      }),
      details);
  }

  root.append(
    ...jobChrome(job, 'gifted'),
    h('div', { class: 'content' },
      voucher ? [h('h2', null, 'Decorating voucher'), voucher] : null,
      h('h2', null, 'Gifted items'),
      h('p', { class: 'hint' }, 'Items left for the incoming tenant. Tap an item and choose the rooms it applies to – selected items turn green.'),
      list,
      h('div', { class: 'add-own' },
        h('span', { class: 'field-label' }, '+ Add another item'),
        h('div', { class: 'add-own-row', style: 'grid-template-columns:1fr auto' }, own,
          h('button', { type: 'button', class: 'btn-primary', onclick: addOwn }, 'Add'))),
      completeFooter(job, 'gifted')));
}
