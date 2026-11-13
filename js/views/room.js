// Screen: one room – size calculator, then each part (Ceiling, Walls, …) with an
// OK button (green = no work) or a defects sheet (red = work needed).
// With an SOR library loaded, the sheet shows the preloaded SORs for the part
// (size bands picked from the room size) plus a search over the whole SOR.
import { scheduleSave, flushSave, deletePhotos } from '../db.js';
import { roomPart, roomAreas, roomStatus, uid } from '../model.js';
import { PARTS, UNITS, qtyText, defectInfo } from '../data/parts.js';
import { getLibrary, searchLibrary, libraryItem } from '../sor.js';
import { setHidden, setAdded, roomTypeLabel } from '../templates.js';
import { templateOptions } from '../defectOptions.js';
import { h, textField, confirmDialog, toast } from '../ui.js';
import { photoField } from '../photos.js';
import { go } from '../router.js';
import { loadJobOr404, jobChrome } from './chrome.js';

const fmt = (n) => (n ? String(n) : '–');

export default async function roomPage(root, { id, roomId }) {
  const job = await loadJobOr404(id);
  const room = job.rooms.find((r) => r.id === roomId);
  if (!room) return go(`/job/${id}/rooms`);
  const library = await getLibrary();
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

  // ---------- Features ----------
  const partsList = h('div', { class: 'parts-list' });
  const statusLine = h('p', { class: 'hint' });

  const partSummary = (part, p) => {
    if (p.state === 'ok') return 'OK – no work required';
    if (p.state === 'works') {
      return p.defects.map((d) => {
        const { label, unit } = defectInfo(part, d);
        const q = qtyText(d.qty, unit);
        return `${label}${q ? ` ${q}` : ''}`;
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
        ? `✓ All features checked – ${s.defects} defect${s.defects === 1 ? '' : 's'} recorded.`
        : `${s.checked} of ${s.total} features checked.`;
  };

  // ---------- Defects sheet ----------
  function openDefects(part) {
    const p = roomPart(room, part.key);
    const areas = roomAreas(room.size);
    const prefill = part.fill ? areas[part.fill] : 0;

    // The list for this type of room (Bedroom 1/2/3 share one) on this device:
    // built-in list, minus items removed with −, plus items pinned 📌 or written by the user.
    const typeLabel = roomTypeLabel(room.name);
    const listName = `${typeLabel} ${part.label.toLowerCase()}`;
    const tplArgs = { library, roomName: room.name, part, ceilingArea: areas.ceiling };
    let tpl = templateOptions(tplArgs);
    const options = tpl.base;
    let hidden = tpl.hidden;
    const visibleOptions = () => tpl.visible;
    const removedOptions = () => tpl.removed;
    const refreshTemplate = () => {
      tpl = templateOptions(tplArgs);
      hidden = tpl.hidden;
    };

    // Working copy: code -> { qty, d, u }. Only Save changes the room.
    const chosen = new Map(p.defects.map((d) => {
      const info = defectInfo(part, d);
      return [d.id, { qty: d.qty, d: info.label, u: info.unit }];
    }));
    let notes = p.notes || '';
    let query = '';

    const defaultQty = (u) => (UNITS[u]?.count ? '1' : (u === 'm2' || u === 'm') && prefill ? String(prefill) : '');

    // SORs already recorded on this room's other parts (e.g. per-room items like
    // "Prep for decoration" offered on both Walls and Ceiling) – flag to avoid double counting.
    const elsewhere = new Map();
    for (const other of PARTS) {
      if (other.key === part.key) continue;
      for (const d of room.parts?.[other.key]?.defects || []) {
        elsewhere.set(d.id, [...(elsewhere.get(d.id) || []), other.label]);
      }
    }

    const row = (opt, { removable = false, pinnable = false } = {}) => {
      const on = chosen.has(opt.c);
      const alsoOn = elsewhere.get(opt.c);
      const unit = UNITS[opt.u] || UNITS.nr;
      const lib = library ? libraryItem(library, opt.c) : null;
      const info = h('div', { class: 'defect-info', hidden: true }, lib?.l || '');
      return h('div', { class: 'defect-row', dataset: { on: String(on) } },
        h('button', {
          type: 'button',
          class: 'defect-toggle',
          'aria-pressed': String(on),
          onclick: () => {
            if (on) chosen.delete(opt.c);
            else chosen.set(opt.c, { qty: defaultQty(opt.u), d: opt.d, u: opt.u });
            render();
          },
        },
        h('span', { class: 'works-tick', 'aria-hidden': 'true' }, on ? '✓' : ''),
        h('span', { class: 'defect-text' },
          h('span', { class: 'defect-label' }, opt.d),
          opt.custom
            ? h('span', { class: 'defect-code' }, `✎ your own · ${unit.label}`)
            : library ? h('span', { class: 'defect-code' }, `${opt.c} · ${unit.label}${opt.note ? ` · ${opt.note}` : ''}${opt.pinned ? ' · 📌 added by you' : ''}`) : null,
          alsoOn ? h('span', { class: 'defect-also' }, `⚠ already on ${alsoOn.join(' & ')} in this room`) : null)),
        on
          ? h('label', { class: 'defect-qty' },
            h('input', {
              type: 'text',
              inputmode: unit.count ? 'numeric' : 'decimal',
              value: chosen.get(opt.c)?.qty ?? '',
              'aria-label': `${opt.d} ${unit.input}`,
              oninput: (e) => { chosen.get(opt.c).qty = e.target.value; },
            }),
            h('span', null, unit.input))
          : null,
        removable
          ? h('button', {
            type: 'button',
            class: 'defect-remove',
            'aria-label': `Remove “${opt.d}” from the ${typeLabel} ${part.label.toLowerCase()} list`,
            title: `Remove from ${typeLabel} list`,
            onclick: () => {
              // Already-ticked items stay ticked (they move to "Also selected").
              if (opt.pinned) {
                setAdded(room.name, part.key, opt, false); // your own addition: just un-pin it
                toast(`Removed from the ${listName} list`);
              } else {
                setHidden(room.name, part.key, opt.k, true);
                toast(`Removed from ${listName} list – restore it at the bottom`);
              }
              refreshTemplate();
              render();
            },
          }, '−')
          : null,
        pinnable
          ? h('button', {
            type: 'button',
            class: 'defect-pin',
            'aria-label': `Keep “${opt.d}” in the ${listName} list`,
            title: `Keep in every ${listName} list`,
            onclick: () => {
              // A preloaded SOR that was removed earlier is simply restored.
              const base = options.find((o) => o.c === opt.c);
              if (base && hidden.has(base.k)) setHidden(room.name, part.key, base.k, false);
              else setAdded(room.name, part.key, opt, true);
              refreshTemplate();
              render();
              toast(`📌 Added to every ${listName} list on this phone`);
            },
          }, '📌')
          : null,
        lib?.l
          ? h('button', {
            type: 'button',
            class: 'defect-more',
            'aria-label': 'Full SOR description',
            onclick: () => { info.hidden = !info.hidden; },
          }, 'ⓘ')
          : null,
        info);
    };

    const searchBox = h('input', {
      type: 'search',
      class: 'sor-search',
      placeholder: '🔍 Search all SOR codes or words…',
      'aria-label': 'Search SOR',
      autocomplete: 'off',
      enterkeyhint: 'search',
      oninput: (e) => { query = e.target.value; renderResults(); },
    });
    const results = h('div', { class: 'defect-list' });
    const list = h('div', { class: 'defect-list' });

    const inList = (code) => visibleOptions().some((o) => o.c === code);

    const renderResults = () => {
      if (!library) return;
      const found = query.trim().length >= 2 ? searchLibrary(library, query, 30, part.key) : [];
      results.replaceChildren(
        query.trim().length >= 2
          ? h('p', { class: 'hint' }, found.length ? `${found.length === 30 ? '30+' : found.length} match${found.length === 1 ? '' : 'es'} – tap to add` : 'No matches')
          : '',
        ...found.map((it) => row({ c: it.c, d: it.d, u: it.u }, { pinnable: !inList(it.c) })));
    };

    // ----- Add your own defect (saved to this room type's list on this device) -----
    const ownLabel = h('input', { type: 'text', placeholder: 'Describe the defect…', autocapitalize: 'sentences', 'aria-label': 'Your own defect' });
    const ownUnit = h('select', { 'aria-label': 'Measured by' },
      h('option', { value: 'nr' }, 'Qty'), h('option', { value: 'm2' }, 'm²'), h('option', { value: 'm' }, 'm'));
    const addOwnDefect = () => {
      const label = ownLabel.value.trim();
      if (!label) return ownLabel.focus();
      const item = { c: `my-${uid().slice(0, 8)}`, d: label, u: ownUnit.value, custom: true };
      setAdded(room.name, part.key, item, true);
      refreshTemplate();
      chosen.set(item.c, { qty: defaultQty(item.u), d: item.d, u: item.u });
      ownLabel.value = '';
      render();
      toast(`Added to every ${listName} list on this phone`);
    };
    ownLabel.addEventListener('keydown', (e) => { if (e.key === 'Enter') addOwnDefect(); });
    const addOwn = h('div', { class: 'add-own' },
      h('span', { class: 'field-label' }, '+ Add your own defect'),
      h('div', { class: 'add-own-row' }, ownLabel, ownUnit,
        h('button', { type: 'button', class: 'btn-primary', onclick: addOwnDefect }, 'Add')));

    const render = () => {
      const shown = visibleOptions();
      const shownCodes = new Set(shown.map((o) => o.c));
      // Ticked items not in the list (from search, or since removed) appear first.
      const extras = [...chosen].filter(([code]) => !shownCodes.has(code))
        .map(([code, v]) => ({ c: code, d: v.d, u: v.u }));
      const removed = removedOptions();
      list.replaceChildren(
        extras.length ? h('p', { class: 'field-label' }, 'Also selected') : '',
        ...extras.map((o) => row(o, { pinnable: true })),
        h('p', { class: 'field-label' }, `${typeLabel} – ${part.label.toLowerCase()}${library ? ' SORs' : ''}`),
        ...shown.map((o) => row(o, { removable: true })),
        addOwn,
        shown.length ? '' : h('p', { class: 'hint' }, 'All removed – use search, or restore some below.'),
        removed.length
          ? h('details', { class: 'removed-list' },
            h('summary', null, `Removed from this ${typeLabel} list (${removed.length})`),
            h('p', { class: 'hint' }, `Hidden for every ${typeLabel} on this device. Tap + to put one back.`),
            ...removed.map((o) => h('div', { class: 'removed-row' },
              h('span', { class: 'defect-text' },
                h('span', { class: 'defect-label' }, o.d),
                library ? h('span', { class: 'defect-code' }, o.c) : null),
              h('button', {
                type: 'button',
                class: 'defect-restore',
                'aria-label': `Restore “${o.d}”`,
                onclick: () => {
                  setHidden(room.name, part.key, o.k, false);
                  refreshTemplate();
                  render();
                },
              }, '+'))))
          : '');
      renderResults();
    };
    render();

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
        library
          ? h('div', { class: 'sor-search-wrap' }, searchBox)
          : h('p', { class: 'hint' }, 'Draft list. Load your SOR library in Settings (⚙ on the surveys list) to use SOR codes and search.'),
        results,
        h('p', { class: 'hint' }, prefill
          ? `m² / m are pre-filled from the room size (${prefill}) – change them as needed.`
          : 'Tick each defect and enter the quantity.'),
        list,
        textField('Notes', notes, (v) => { notes = v; }, { multiline: true, autocapitalize: 'sentences', placeholder: 'Anything the contractor should know' }),
        h('span', { class: 'field-label' }, 'Photos'),
        photoField(job, p.photos, () => save())),
      h('footer', { class: 'sheet-foot' },
        h('button', {
          type: 'button',
          class: 'btn-primary btn-big',
          onclick: () => {
            p.defects = [...chosen].map(([code, v]) => ({ id: code, qty: String(v.qty ?? '').trim(), d: v.d, u: v.u }));
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

      h('h2', null, 'Features'),
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
