// Screen: one room (params.kind 'rooms') or outside area ('externals'):
// room size calculator (rooms only), then its features via the shared feature list.
import { scheduleSave, flushSave, deletePhotos } from '../db.js';
import { roomAreas, isRtl } from '../model.js';
import { getLibrary } from '../sor.js';
import { h, textField, confirmDialog, worksButton } from '../ui.js';
import { photoField } from '../photos.js';
import { go } from '../router.js';
import { loadJobOr404, jobChrome } from './chrome.js';
import { featureList } from './featureList.js';

const fmt = (n) => (n ? String(n) : '–');

export default async function roomPage(root, { id, roomId, kind = 'rooms' }) {
  const job = await loadJobOr404(id);
  const areas = job[kind];
  const room = areas.find((r) => r.id === roomId);
  if (!room) return go(`/job/${id}/${kind}`);
  const library = await getLibrary();
  const save = () => scheduleSave(job);
  const isRoom = kind === 'rooms';
  const noun = isRoom ? 'Room' : 'Area';
  const backHref = `#/job/${job.id}/${kind}`;

  // ---------- Room size (rooms only) ----------
  const areasLine = h('p', { class: 'coords room-areas' });
  const renderAreas = () => {
    const a = roomAreas(room.size);
    areasLine.replaceChildren(a.walls || a.ceiling
      ? h('span', null,
        h('strong', null, 'Emulsion: '), `ceiling ${fmt(a.ceiling)} m², walls ${fmt(a.walls)} m²`, h('br'),
        h('strong', null, 'Flooring: '), `${fmt(a.floor)} m²`, ' · ',
        h('strong', null, 'Skirting: '), `${fmt(a.perimeter)} m`)
      : 'Enter length, width and height to work out m² automatically.');
  };
  const sizeField = (key, label) => textField(label, room.size[key], (v) => {
    room.size[key] = v;
    save();
    renderAreas();
  }, { inputmode: 'decimal', placeholder: 'm' });
  renderAreas();

  const nextRoom = areas[areas.indexOf(room) + 1];
  const navFooter = () => h('div', { class: 'complete-footer btn-row' },
    h('a', { class: 'btn btn-big', href: backHref }, isRoom ? '‹ All rooms' : '‹ All areas'),
    nextRoom ? h('a', { class: 'btn btn-primary btn-big', href: `#/job/${job.id}/${kind}/${nextRoom.id}` }, `${nextRoom.name} ›`) : null);
  const deleteBtn = () => h('div', { class: 'btn-row' },
    h('button', {
      type: 'button',
      class: 'btn-danger btn-small',
      onclick: async () => {
        if (!(await confirmDialog(`Delete “${room.name}” and all its photos?`))) return;
        const ids = [...room.photos, ...Object.values(room.parts).flatMap((x) => x.photos || [])];
        areas.splice(areas.indexOf(room), 1);
        await deletePhotos(ids);
        scheduleSave(job, 0);
        await flushSave();
        go(`/job/${job.id}/${kind}`);
      },
    }, `Delete ${noun.toLowerCase()}`));

  // ---------- Ready to let: works complete tick + photos ----------
  if (isRtl(job)) {
    const tickSlot = h('div', { class: 'works-list' });
    const renderTick = () => tickSlot.replaceChildren(worksButton('Works complete', room.done ? 'Yes – all works finished' : 'Tap to tick when all works are finished', Boolean(room.done), () => {
      room.done = !room.done;
      save();
      renderTick();
    }));
    renderTick();
    root.append(
      ...jobChrome(job, kind, { back: backHref, title: room.name || noun }),
      h('div', { class: 'content' },
        tickSlot,
        h('h2', null, `${noun} photos`),
        photoField(job, room.photos),
        h('details', { class: 'card room-more' },
          h('summary', null, `${noun} name`),
          h('div', { class: 'card-body' },
            textField(`${noun} name`, room.name, (v) => {
              room.name = v;
              save();
              root.querySelector('.appbar h1')?.replaceChildren(v || noun);
            }, { autocapitalize: 'words' }),
            deleteBtn())),
        navFooter()));
    return;
  }

  const features = featureList({ job, room, kind, library });

  root.append(
    ...jobChrome(job, kind, { back: backHref, title: room.name || noun }),
    h('div', { class: 'content' },
      isRoom ? h('h2', null, 'Room size') : null,
      isRoom ? h('div', { class: 'grid-3' }, sizeField('length', 'Length (m)'), sizeField('width', 'Width (m)'), sizeField('height', 'Height (m)')) : null,
      isRoom ? areasLine : null,

      h('h2', null, 'Features'),
      features.el,

      h('details', { class: 'card room-more' },
        h('summary', null, `${noun} name, notes & photos`),
        h('div', { class: 'card-body' },
          textField(`${noun} name`, room.name, (v) => {
            room.name = v;
            save();
            root.querySelector('.appbar h1')?.replaceChildren(v || noun);
          }, { autocapitalize: 'words' }),
          textField(`${noun} notes`, room.notes, (v) => { room.notes = v; save(); }, { multiline: true, autocapitalize: 'sentences' }),
          h('span', { class: 'field-label' }, `${noun} photos`),
          photoField(job, room.photos),
          h('div', { class: 'btn-row' },
            h('button', {
              type: 'button',
              class: 'btn-danger btn-small',
              onclick: async () => {
                if (!(await confirmDialog(`Delete “${room.name}” and all its defects and photos?`))) return;
                const ids = [...room.photos, ...Object.values(room.parts).flatMap((x) => x.photos || [])];
                areas.splice(areas.indexOf(room), 1);
                await deletePhotos(ids);
                scheduleSave(job, 0);
                await flushSave();
                go(`/job/${job.id}/${kind}`);
              },
            }, `Delete ${noun.toLowerCase()}`)))),

      h('div', { class: 'complete-footer btn-row' },
        h('a', { class: 'btn btn-big', href: backHref }, isRoom ? '‹ All rooms' : '‹ All areas'),
        nextRoom ? h('a', { class: 'btn btn-primary btn-big', href: `#/job/${job.id}/${kind}/${nextRoom.id}` }, `${nextRoom.name} ›`) : null)));
}
