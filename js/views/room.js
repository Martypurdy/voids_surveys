// Screen: one room – size calculator, then each part (Ceiling, Walls, …) with an
// OK button (green = no work) or a defects sheet (red = work needed).
import { scheduleSave, flushSave, deletePhotos } from '../db.js';
import { roomPart, roomAreas, roomStatus } from '../model.js';
import { PARTS, UNITS, defectById } from '../data/parts.js';
import { h, textField, confirmDialog, toast } from '../ui.js';
import { photoField } from '../photos.js';
import { go } from '../router.js';
import { loadJobOr404, jobChrome } from './chrome.js';

const fmt = (n) => (n ? String(n) : '–');

export default async function roomPage(root, { id, roomId }) {
  const job = await loadJobOr404(id);
  const room = job.rooms.find((r) => r.id === roomId);
  if (!room) return go(`/job/${id}/rooms`);
  const save = () => scheduleSave(job);
  const backHref = `#/job/${job.id}/rooms`;

  // ---------- Room size ----------
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

  // ---------- Parts ----------
  const partsList = h('div', { class: 'parts-list' });
  const statusLine = h('p', { class: 'hint' });

  const partSummary = (part, p) => {
    if (p.state === 'ok') return 'OK – no work required';
    if (p.state === 'works') {
      return p.defects.map((d) => {
        const def = defectById(part, d.id);
        const unit = UNITS[def?.unit]?.label || '';
        const qty = d.qty ? (unit === 'nr' ? ` ×${d.qty}` : ` ${d.qty} ${unit}`) : '';
        return `${def?.label || d.id}${qty}`;
      }).join(' · ');
    }
    return 'Tap for defects, or OK if no work needed';
  };

  const renderParts = () => {
    partsList.replaceChildren(...PARTS.map((part) => {
      const p = roomPart(room, part.key);
      const state = p.state === 'ok' ? 'ok' : p.state === 'works' ? 'attention' : 'todo';
      return h('div', { class: 'part-row' },
        h('button', {
          type: 'button',
          class: 'works-item part-item',
          dataset: { state },
          onclick: () => openDefects(part),
        },
        h('span', { class: 'works-tick', 'aria-hidden': 'true' }, state === 'ok' ? '✓' : state === 'attention' ? '!' : ''),
        h('span', { class: 'works-text' },
          h('span', { class: 'works-label' }, part.label),
          h('span', { class: 'works-detail' }, partSummary(part, p))),
        h('span', { class: 'works-chevron', 'aria-hidden': 'true' }, '›')),
        h('button', {
          type: 'button',
          class: 'ok-btn',
          'aria-pressed': String(p.state === 'ok'),
          'aria-label': `${part.label} OK – no work required`,
          onclick: async () => {
            if (p.state === 'works' && !(await confirmDialog(
              `${part.label} has ${p.defects.length} defect${p.defects.length === 1 ? '' : 's'} recorded. Clear them and mark OK?`,
              { title: 'Mark as OK?', ok: 'Clear and mark OK' }))) return;
            if (p.state === 'ok') p.state = '';
            else {
              p.state = 'ok';
              p.defects = [];
            }
            save();
            renderParts();
          },
        }, p.state === 'ok' ? '✓ OK' : 'OK'));
    }));
    const s = roomStatus(room, PARTS);
    statusLine.textContent = s.state === 'ok'
      ? '✓ Every part OK – no work required in this room.'
      : s.checked === s.total
        ? `✓ All parts checked – ${s.defects} defect${s.defects === 1 ? '' : 's'} recorded.`
        : `${s.checked} of ${s.total} parts checked.`;
  };

  // ---------- Defects sheet ----------
  function openDefects(part) {
    const p = roomPart(room, part.key);
    const areas = roomAreas(room.size);
    const prefill = part.fill ? areas[part.fill] : 0;
    // Work on a copy; only Save changes the room.
    const chosen = new Map(p.defects.map((d) => [d.id, d.qty]));
    let notes = p.notes || '';

    const rows = h('div', { class: 'defect-list' });
    const renderRows = () => {
      rows.replaceChildren(...part.defects.map((def) => {
        const on = chosen.has(def.id);
        const unit = UNITS[def.unit];
        return h('div', { class: 'defect-row', dataset: { on: String(on) } },
          h('button', {
            type: 'button',
            class: 'defect-toggle',
            'aria-pressed': String(on),
            onclick: () => {
              if (on) chosen.delete(def.id);
              else chosen.set(def.id, def.unit !== 'nr' && prefill ? String(prefill) : def.unit === 'nr' ? '1' : '');
              renderRows();
            },
          },
          h('span', { class: 'works-tick', 'aria-hidden': 'true' }, on ? '✓' : ''),
          h('span', { class: 'defect-label' }, def.label)),
          on
            ? h('label', { class: 'defect-qty' },
              h('input', {
                type: 'text',
                inputmode: def.unit === 'nr' ? 'numeric' : 'decimal',
                value: chosen.get(def.id) ?? '',
                'aria-label': `${def.label} ${unit.input}`,
                oninput: (e) => chosen.set(def.id, e.target.value),
              }),
              h('span', null, unit.input))
            : null);
      }));
    };
    renderRows();

    const close = () => {
      sheet.remove();
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('dialog[open], .camera, .lightbox')) close(); };

    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${part.label} defects` },
      h('header', { class: 'sheet-head' },
        h('h2', null, `${room.name} – ${part.label}`),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
      h('div', { class: 'sheet-body' },
        h('p', { class: 'hint' }, prefill
          ? `Tick each defect. m² / m are pre-filled from the room size (${prefill}) – change them as needed.`
          : 'Tick each defect and enter the quantity.'),
        rows,
        textField('Notes', notes, (v) => { notes = v; }, { multiline: true, autocapitalize: 'sentences', placeholder: 'Anything the contractor should know' }),
        h('span', { class: 'field-label' }, 'Photos'),
        photoField(job, p.photos, () => save())),
      h('footer', { class: 'sheet-foot' },
        h('button', {
          type: 'button',
          class: 'btn-primary btn-big',
          onclick: () => {
            p.defects = [...chosen].map(([defId, qty]) => ({ id: defId, qty: String(qty ?? '').trim() }));
            p.notes = notes;
            if (p.defects.length) p.state = 'works';
            else if (p.state === 'works') p.state = '';
            save();
            renderParts();
            close();
            if (p.defects.length) toast(`${part.label}: ${p.defects.length} defect${p.defects.length === 1 ? '' : 's'} saved`);
          },
        }, 'Save'),
        h('button', { type: 'button', class: 'btn-big', onclick: close }, 'Cancel')));
    document.addEventListener('keydown', onKey);
    document.body.append(sheet);
    document.body.classList.add('no-scroll');
  }

  // ---------- Room details ----------
  const roomIndex = job.rooms.indexOf(room);
  const nextRoom = job.rooms[roomIndex + 1];

  renderParts();
  root.append(
    ...jobChrome(job, 'rooms', { back: backHref, title: room.name || 'Room' }),
    h('div', { class: 'content' },
      h('h2', null, 'Room size'),
      h('div', { class: 'grid-3' }, sizeField('length', 'Length (m)'), sizeField('width', 'Width (m)'), sizeField('height', 'Height (m)')),
      areasLine,

      h('h2', null, 'Parts'),
      statusLine,
      partsList,

      h('details', { class: 'card room-more' },
        h('summary', null, 'Room name, notes & photos'),
        h('div', { class: 'card-body' },
          textField('Room name', room.name, (v) => {
            room.name = v;
            save();
            root.querySelector('.appbar h1')?.replaceChildren(v || 'Room');
          }, { autocapitalize: 'words' }),
          textField('Room notes', room.notes, (v) => { room.notes = v; save(); }, { multiline: true, autocapitalize: 'sentences' }),
          h('span', { class: 'field-label' }, 'Room photos'),
          photoField(job, room.photos),
          h('div', { class: 'btn-row' },
            h('button', {
              type: 'button',
              class: 'btn-danger btn-small',
              onclick: async () => {
                if (!(await confirmDialog(`Delete “${room.name}” and all its defects and photos?`))) return;
                const ids = [...room.photos, ...Object.values(room.parts).flatMap((x) => x.photos || [])];
                job.rooms.splice(job.rooms.indexOf(room), 1);
                await deletePhotos(ids);
                scheduleSave(job, 0);
                await flushSave();
                go(`/job/${job.id}/rooms`);
              },
            }, 'Delete room')))),

      h('div', { class: 'complete-footer btn-row' },
        h('a', { class: 'btn btn-big', href: backHref }, '‹ All rooms'),
        nextRoom ? h('a', { class: 'btn btn-primary btn-big', href: `#/job/${job.id}/rooms/${nextRoom.id}` }, `${nextRoom.name} ›`) : null)));
}
