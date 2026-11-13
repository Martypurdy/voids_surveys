// Screen 3: rooms and externals (same component, params.kind = 'rooms' | 'externals').
import { scheduleSave, flushSave, deletePhotos } from '../db.js';
import { ROOM_PRESETS, EXTERNAL_PRESETS, newItem, nextNumberedName } from '../model.js';
import { h, textField, conditionPicker, badge, confirmDialog } from '../ui.js';
import { photoField } from '../photos.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const NUMBERED = new Set(['Bedroom']);

export default async function items(root, { id, kind }) {
  const job = await loadJobOr404(id);
  const list = job[kind];
  const presets = kind === 'rooms' ? ROOM_PRESETS : EXTERNAL_PRESETS;
  const noun = kind === 'rooms' ? 'room' : 'external area';
  const save = () => scheduleSave(job);

  const container = h('div');
  const empty = h('p', { class: 'empty' }, `No ${kind} yet. Add one above.`);
  const syncEmpty = () => { empty.hidden = list.length > 0; };

  const add = (name) => {
    const item = newItem(NUMBERED.has(name) ? nextNumberedName(list, name) : name);
    list.push(item);
    save();
    const card = itemCard(item, true);
    container.append(card);
    syncEmpty();
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const itemCard = (item, open = false) => {
    const title = h('span', { class: 'summary-title' }, item.name || 'Untitled');
    const badgeSlot = h('span', null, badge(item.condition));
    const meta = h('span', { class: 'summary-meta' });
    const syncMeta = () => {
      meta.textContent = item.photos.length ? `📷 ${item.photos.length}` : '';
    };
    syncMeta();

    const card = h('details', { class: 'card', open },
      h('summary', null, title, badgeSlot, meta),
      h('div', { class: 'card-body' },
        textField('Name', item.name, (v) => {
          item.name = v;
          title.textContent = v || 'Untitled';
          save();
        }, { autocapitalize: 'words' }),
        h('span', { class: 'field-label' }, 'Condition'),
        conditionPicker(item.condition, (v) => {
          item.condition = v;
          badgeSlot.replaceChildren(badge(v) || '');
          save();
        }),
        textField('Notes', item.notes, (v) => {
          item.notes = v;
          save();
        }, { multiline: true, placeholder: 'Defects, repairs needed, clearance, etc.', autocapitalize: 'sentences' }),
        h('span', { class: 'field-label' }, 'Photos'),
        photoField(job, item.photos, syncMeta),
        h('div', { class: 'btn-row' },
          h('button', {
            type: 'button',
            class: 'btn-danger btn-small',
            onclick: async () => {
              if (!(await confirmDialog(`Delete “${item.name || 'this item'}” and its ${item.photos.length} photo(s)?`))) return;
              list.splice(list.indexOf(item), 1);
              await deletePhotos(item.photos);
              scheduleSave(job, 0);
              await flushSave();
              card.remove();
              syncEmpty();
            },
          }, `Delete ${noun}`))));
    return card;
  };

  const customInput = h('input', {
    type: 'text',
    placeholder: `Custom ${noun}…`,
    autocapitalize: 'words',
    enterkeyhint: 'done',
    'aria-label': `Custom ${noun} name`,
    onkeydown: (e) => { if (e.key === 'Enter') addCustom(); },
  });
  const addCustom = () => {
    const name = customInput.value.trim();
    if (!name) return customInput.focus();
    customInput.value = '';
    add(name);
  };

  container.append(...list.map((it) => itemCard(it)));
  syncEmpty();

  root.append(
    ...jobChrome(job, kind),
    h('div', { class: 'content' },
      h('div', { class: 'chips' },
        presets.map((p) => h('button', { type: 'button', onclick: () => add(p) }, `+ ${p}`))),
      h('div', { class: 'input-row', style: 'margin-bottom:16px' },
        h('div', { class: 'field' }, customInput),
        h('button', { type: 'button', onclick: addCustom }, 'Add')),
      container,
      empty,
      completeFooter(job, kind)));
}
