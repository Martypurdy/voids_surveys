// Screen: rooms list (params.kind 'rooms') or outside areas list ('externals').
// Add from presets or a custom name; each is a button coloured by progress
// (amber = not finished, red = needs work, green = all OK) with a delete button.
import { scheduleSave, flushSave, deletePhotos } from '../db.js';
import { newRoom, nextNumberedName, roomStatus, isRtl } from '../model.js';
import { AREA_PRESETS, featuresOf } from '../data/features.js';
import { h, icon, ICONS, confirmDialog, toast } from '../ui.js';
import { go } from '../router.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

const NUMBERED = new Set(['Bedroom']);

export function roomSummary(room, kind = 'rooms') {
  const s = roomStatus(room, featuresOf(room, kind));
  if (!s.total) return room.condition ? `Condition: ${room.condition} (older survey)` : 'No features yet – tap to add';
  if (s.state === 'todo') return room.condition ? `Older survey: rated ${room.condition} – tap to survey` : 'Not started – tap to survey';
  const done = `${s.checked} of ${s.total} checked`;
  if (!s.works) return s.state === 'ok' ? 'All OK – no work required' : done;
  return `${done} · ${s.defects} defect${s.defects === 1 ? '' : 's'}`;
}

export default async function rooms(root, { id, kind = 'rooms' }) {
  const job = await loadJobOr404(id);
  const areas = job[kind];
  const isRoom = kind === 'rooms';
  const noun = isRoom ? 'room' : 'area';
  const list = h('div', { class: 'works-list' });

  const rtl = isRtl(job);
  // Ready to let: green once "Works complete" is ticked, amber until then.
  const rtlState = (room) => (room.done ? 'ok' : 'todo');
  const rtlSummary = (room) => [room.done ? 'Works complete' : 'Tap to check', room.photos.length ? `📷 ${room.photos.length}` : ''].filter(Boolean).join(' · ');

  const roomButton = (room) => {
    const s = rtl ? { state: rtlState(room) } : roomStatus(room, featuresOf(room, kind));
    return h('button', {
      type: 'button',
      class: 'works-item room-item',
      dataset: { state: s.state },
      onclick: () => go(`/job/${job.id}/${kind}/${room.id}`),
    },
    h('span', { class: 'works-tick', 'aria-hidden': 'true' }, s.state === 'ok' ? '✓' : s.state === 'attention' ? '!' : ''),
    h('span', { class: 'works-text' },
      h('span', { class: 'works-label' }, room.name || `Untitled ${noun}`),
      h('span', { class: 'works-detail' }, rtl ? rtlSummary(room) : roomSummary(room, kind))),
    h('span', { class: 'works-chevron', 'aria-hidden': 'true' }, '›'));
  };

  const empty = h('p', { class: 'empty' }, `No ${noun}s yet. Tap a ${noun} type above to add it.`);
  const render = () => {
    list.replaceChildren(...areas.map((room) => h('div', { class: 'room-row' },
      roomButton(room),
      h('button', {
        type: 'button',
        class: 'room-delete',
        'aria-label': `Delete ${room.name || noun}`,
        title: `Delete ${noun}`,
        onclick: () => deleteRoom(room),
      }, icon(ICONS.trash)))));
    empty.hidden = areas.length > 0;
  };

  const deleteRoom = async (room) => {
    const s = roomStatus(room, featuresOf(room, kind));
    const photoIds = [...room.photos, ...Object.values(room.parts || {}).flatMap((p) => p.photos || [])];
    const what = [
      s.defects && `${s.defects} defect${s.defects === 1 ? '' : 's'}`,
      photoIds.length && `${photoIds.length} photo${photoIds.length === 1 ? '' : 's'}`,
    ].filter(Boolean);
    const ok = await confirmDialog(
      what.length ? `This will also delete its ${what.join(' and ')}. This can’t be undone.` : 'It has nothing recorded yet.',
      { title: `Delete “${room.name || noun}”?`, ok: `Delete ${noun}` });
    if (!ok) return;
    areas.splice(areas.indexOf(room), 1);
    await deletePhotos(photoIds);
    scheduleSave(job, 0);
    await flushSave();
    render();
    toast(`${room.name || noun} deleted`);
  };

  const add = (name) => {
    const room = newRoom(isRoom && NUMBERED.has(name) ? nextNumberedName(areas, name) : name, kind);
    areas.push(room);
    scheduleSave(job);
    render();
    list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const customInput = h('input', {
    type: 'text',
    placeholder: isRoom ? 'Custom room…' : 'Custom area, e.g. Side passage…',
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

  render();
  root.append(
    ...jobChrome(job, kind),
    h('div', { class: 'content' },
      h('h2', null, `Add ${isRoom ? 'a room' : 'an area'}`),
      h('div', { class: 'chips' },
        AREA_PRESETS[kind].map((p) => h('button', { type: 'button', onclick: () => add(p) }, `+ ${p}`))),
      h('div', { class: 'input-row', style: 'margin-bottom:8px' },
        h('div', { class: 'field' }, customInput),
        h('button', { type: 'button', onclick: addCustom }, 'Add')),
      h('h2', null, isRoom ? 'Rooms' : 'Areas'),
      h('p', { class: 'hint' }, rtl ? 'Amber = not checked yet · Green = works complete' : 'Amber = not finished · Red = work needed · Green = all OK'),
      list,
      empty,
      completeFooter(job, kind)));
}
