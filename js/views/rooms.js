// Screen: rooms list – add rooms from presets; each room is a button coloured by
// progress (amber = not finished, red = needs work, green = all OK).
import { scheduleSave } from '../db.js';
import { ROOM_PRESETS, newRoom, nextNumberedName, roomStatus } from '../model.js';
import { PARTS } from '../data/parts.js';
import { h } from '../ui.js';
import { go } from '../router.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const NUMBERED = new Set(['Bedroom']);

export function roomSummary(room) {
  const s = roomStatus(room, PARTS);
  if (s.state === 'todo') return 'Not started – tap to survey';
  const parts = `${s.checked} of ${s.total} checked`;
  if (!s.works) return s.state === 'ok' ? 'All OK – no work required' : parts;
  return `${parts} · ${s.defects} defect${s.defects === 1 ? '' : 's'}`;
}

export default async function rooms(root, { id }) {
  const job = await loadJobOr404(id);
  const list = h('div', { class: 'works-list' });

  const roomButton = (room) => {
    const s = roomStatus(room, PARTS);
    return h('button', {
      type: 'button',
      class: 'works-item room-item',
      dataset: { state: s.state },
      onclick: () => go(`/job/${job.id}/rooms/${room.id}`),
    },
    h('span', { class: 'works-tick', 'aria-hidden': 'true' }, s.state === 'ok' ? '✓' : s.state === 'attention' ? '!' : ''),
    h('span', { class: 'works-text' },
      h('span', { class: 'works-label' }, room.name || 'Untitled room'),
      h('span', { class: 'works-detail' }, roomSummary(room))),
    h('span', { class: 'works-chevron', 'aria-hidden': 'true' }, '›'));
  };

  const empty = h('p', { class: 'empty' }, 'No rooms yet. Tap a room type above to add it.');
  const render = () => {
    list.replaceChildren(...job.rooms.map(roomButton));
    empty.hidden = job.rooms.length > 0;
  };

  const add = (name) => {
    const room = newRoom(NUMBERED.has(name) ? nextNumberedName(job.rooms, name) : name);
    job.rooms.push(room);
    scheduleSave(job);
    render();
    list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const customInput = h('input', {
    type: 'text',
    placeholder: 'Custom room…',
    autocapitalize: 'words',
    enterkeyhint: 'done',
    'aria-label': 'Custom room name',
    onkeydown: (e) => { if (e.key === 'Enter') addCustom(); },
  });
  const addCustom = () => {
    const name = customInput.value.trim();
    if (!name) return customInput.focus();
    customInput.value = '';
    add(name);
  };

  render();
  root.append(
    ...jobChrome(job, 'rooms'),
    h('div', { class: 'content' },
      h('h2', null, 'Add a room'),
      h('div', { class: 'chips' },
        ROOM_PRESETS.map((p) => h('button', { type: 'button', onclick: () => add(p) }, `+ ${p}`))),
      h('div', { class: 'input-row', style: 'margin-bottom:8px' },
        h('div', { class: 'field' }, customInput),
        h('button', { type: 'button', onclick: addCustom }, 'Add')),
      h('h2', null, 'Rooms'),
      h('p', { class: 'hint' }, 'Amber = not finished · Red = work needed · Green = all OK'),
      list,
      empty,
      completeFooter(job, 'rooms')));
}
