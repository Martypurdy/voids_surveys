// Shared feature list for rooms, outside areas and the Security screen:
// each feature has an OK button (green = no work) or a defects sheet (red = work
// needed); "+ Add feature" and "✎ Edit features" add or remove features.
// With an SOR library loaded, room features show their preloaded SORs (size bands
// picked from the room size) plus a search over the whole SOR.
import { scheduleSave, flushSave, deletePhotos } from '../db.js';
import { roomPart, roomAreas, roomStatus, uid } from '../model.js';
import { UNITS, qtyText, defectInfo } from '../data/parts.js';
import { FEATURES, SUGGESTIONS, featuresOf, customFeatureKey } from '../data/features.js';
import { searchLibrary, libraryItem } from '../sor.js';
import { setHidden, setAdded, updateAdded, setWording, roomTypeLabel } from '../templates.js';
import { templateOptions } from '../defectOptions.js';
import { h, textField, confirmDialog, toast, choose, trackOverlay } from '../ui.js';
import { photoField } from '../photos.js';

/**
 * Press and hold (~0.8 s, without moving) then let go → fn(). Opening on release
 * means lifting the finger can't land on – and close – the edit box.
 */
function onLongPress(el, fn, ms = 800) {
  let timer = 0;
  let start = null;
  let held = false;
  const reset = () => { clearTimeout(timer); start = null; held = false; el.classList.remove('holding'); };
  el.addEventListener('pointerdown', (e) => {
    reset();
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      held = true;
      el.dataset.held = '1'; // swallow the click that follows the release
      el.classList.add('holding');
      navigator.vibrate?.(30);
    }, ms);
  });
  el.addEventListener('pointermove', (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) reset(); // scrolling
  });
  el.addEventListener('pointerup', () => {
    const wasHeld = held;
    reset();
    if (wasHeld) {
      setTimeout(fn, 60);
      setTimeout(() => { delete el.dataset.held; }, 500);
    }
  });
  for (const ev of ['pointercancel', 'pointerleave']) el.addEventListener(ev, () => { reset(); delete el.dataset.held; });
}

/** Pick a feature to add: suggestions not already present, or your own name. */
function pickFeature(kind, present) {
  return new Promise((resolve) => {
    const custom = h('input', { type: 'text', placeholder: 'e.g. Conservatory, Pond…', autocapitalize: 'sentences', 'aria-label': 'Your own feature' });
    const done = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    const addCustom = () => {
      const label = custom.value.trim();
      if (label) done({ key: customFeatureKey(label), label });
      else custom.focus();
    };
    custom.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCustom(); });
    const options = SUGGESTIONS[kind].filter((k) => !present.has(k));
    const dlg = h('dialog', null,
      h('div', { class: 'dialog-body' },
        h('h3', null, 'Add a feature'),
        options.length
          ? h('div', { class: 'choice-grid choice-grid-2' },
            options.map((k) => h('button', { type: 'button', onclick: () => done({ key: k, label: FEATURES[k].label }) }, FEATURES[k].label)))
          : null,
        h('span', { class: 'field-label', style: 'margin-top:12px' }, 'Or name your own'),
        h('div', { class: 'add-own-row', style: 'grid-template-columns:1fr auto' }, custom,
          h('button', { type: 'button', class: 'btn-primary', onclick: addCustom }, 'Add'))),
      h('div', { class: 'dialog-buttons' }, h('button', { type: 'button', onclick: () => done(null) }, 'Cancel')));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

/**
 * @param {object} o
 * @param {object} o.job
 * @param {object} o.room   room / area / security object (has parts, features, photos)
 * @param {'rooms'|'externals'|'security'} o.kind
 * @param {object|null} o.library  SOR library or null
 * @param {() => void} [o.onChange]
 * @returns {{ el: HTMLElement, refresh: () => void }}
 */
export function featureList({ job, room, kind, library, onChange = () => {} }) {
  const save = () => { scheduleSave(job); onChange(); };
  const areaWord = kind === 'rooms' ? 'room' : kind === 'security' ? 'property' : 'area';
  const list = h('div', { class: 'parts-list' });
  const statusLine = h('p', { class: 'hint' });
  let editing = false;

  const features = () => featuresOf(room, kind);
  const ensureOwnList = () => {
    if (!room.features) room.features = features().map((f) => f.key);
    room.featureLabels ??= {};
  };

  const summary = (part, p) => {
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

  const removeFeature = async (part) => {
    const p = room.parts?.[part.key];
    const n = p?.defects?.length || 0;
    const photos = p?.photos || [];
    const what = [n && `${n} defect${n === 1 ? '' : 's'}`, photos.length && `${photos.length} photo${photos.length === 1 ? '' : 's'}`].filter(Boolean);
    if (!(await confirmDialog(what.length ? `This also deletes its ${what.join(' and ')}.` : 'Nothing is recorded on it yet.',
      { title: `Remove “${part.label}”?`, ok: 'Remove' }))) return;
    ensureOwnList();
    room.features = room.features.filter((k) => k !== part.key);
    delete room.parts[part.key];
    await deletePhotos(photos);
    scheduleSave(job, 0);
    await flushSave();
    onChange();
    render();
  };

  const render = () => {
    const fs = features();
    list.replaceChildren(...fs.map((part) => {
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
          h('span', { class: 'works-detail' }, summary(part, p))),
        h('span', { class: 'works-chevron', 'aria-hidden': 'true' }, '›')),
        editing
          ? h('button', { type: 'button', class: 'feature-remove', 'aria-label': `Remove ${part.label}`, onclick: () => removeFeature(part) }, '−')
          : h('button', {
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
              render();
            },
          }, p.state === 'ok' ? '✓ OK' : 'OK'));
    }));
    const s = roomStatus(room, fs);
    statusLine.textContent = !fs.length
      ? `No features yet – tap “+ Add feature”.`
      : s.state === 'ok'
        ? `✓ Every feature OK – no work required in this ${areaWord}.`
        : s.checked === s.total
          ? `✓ All features checked – ${s.defects} defect${s.defects === 1 ? '' : 's'} recorded.`
          : `${s.checked} of ${s.total} features checked.`;
    editBtn.textContent = editing ? '✓ Done editing' : '✎ Edit features';
    editBtn.setAttribute('aria-pressed', String(editing));
  };

  const addBtn = h('button', {
    type: 'button',
    class: 'btn-small',
    onclick: async () => {
      const present = new Set(features().map((f) => f.key));
      const picked = await pickFeature(kind, present);
      if (!picked) return;
      if (present.has(picked.key)) return toast(`${picked.label} is already here`);
      ensureOwnList();
      room.features.push(picked.key);
      if (!FEATURES[picked.key]) room.featureLabels[picked.key] = picked.label;
      save();
      render();
      toast(`${picked.label} added`);
    },
  }, '+ Add feature');
  const editBtn = h('button', { type: 'button', class: 'btn-small', onclick: () => { editing = !editing; render(); } });

  // ---------- Defects sheet ----------
  function openDefects(part) {
    const p = roomPart(room, part.key);
    const areas = roomAreas(room.size);
    const prefill = kind === 'rooms' && part.fill ? areas[part.fill] : 0;

    // The list for this type of room/area (Bedroom 1/2/3 share one) on this device:
    // built-in list, minus items removed with −, plus items pinned 📌 or written by the user.
    const typeLabel = roomTypeLabel(room.name);
    const listName = `${typeLabel} ${part.label.toLowerCase()}`;
    const tplArgs = { library, roomName: room.name, part, ceilingArea: areas.ceiling };
    let tpl = templateOptions(tplArgs);
    const options = tpl.base;
    let hidden = tpl.hidden;
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

    // Items already recorded on other features here (e.g. per-room "Prep for
    // decoration" offered on Walls and Ceiling) – flag to avoid double counting.
    const elsewhere = new Map();
    for (const other of features()) {
      if (other.key === part.key) continue;
      for (const d of room.parts?.[other.key]?.defects || []) {
        elsewhere.set(d.id, [...(elsewhere.get(d.id) || []), other.label]);
      }
    }

    // Press and hold a defect (about a second) to change its wording. The new wording
    // is kept in this room type's list on this device, so it's used on every survey after.
    const editWording = async (opt) => {
      const listed = tpl.visible.find((o) => o.c === opt.c) || options.find((o) => o.c === opt.c);
      const current = chosen.get(opt.c)?.d || listed?.d || opt.d;
      const std = listed?.std; // standard wording, if it has been changed
      const box = h('textarea', { value: current, rows: 3, autocapitalize: 'sentences', 'aria-label': 'Defect wording' });
      setTimeout(() => { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }, 50);
      const ok = await choose({
        title: 'Edit wording',
        content: box,
        buttons: [
          { label: 'Save', value: true, class: 'btn-primary' },
          ...(std ? [{ label: 'Back to standard wording', value: 'reset' }] : []),
          { label: 'Cancel', value: false },
        ],
      });
      if (!ok) return;
      const text = ok === 'reset' ? std : box.value.trim() || current;
      if (listed && !listed.pinned && !listed.custom) {
        const standard = std || listed.d;
        setWording(room.name, part.key, opt.c, text === standard ? null : text);
      } else if (listed) {
        updateAdded(room.name, part.key, opt.c, { d: text });
      } else {
        setAdded(room.name, part.key, { c: opt.c, d: text, u: opt.u }, true); // a search result joins the list
      }
      refreshTemplate();
      const entry = chosen.get(opt.c) || { qty: defaultQty(opt.u), u: opt.u };
      chosen.set(opt.c, { ...entry, d: text }); // editing also ticks it
      renderSheet();
    };

    const row = (opt, { removable = false, pinnable = false } = {}) => {
      const on = chosen.has(opt.c);
      const alsoOn = elsewhere.get(opt.c);
      const unit = UNITS[opt.u] || UNITS.nr;
      const lib = library ? libraryItem(library, opt.c) : null;
      const info = h('div', { class: 'defect-info', hidden: true }, lib?.l || '');
      const label = chosen.get(opt.c)?.d || opt.d; // wording may be edited for this survey
      const toggle = h('button', {
        type: 'button',
        class: 'defect-toggle',
        'aria-pressed': String(on),
        title: 'Tap to select · press and hold to edit the wording',
        onclick: () => {
          if (toggle.dataset.held) { delete toggle.dataset.held; return; } // long press handled it
          if (on) chosen.delete(opt.c);
          else chosen.set(opt.c, { qty: defaultQty(opt.u), d: opt.d, u: opt.u });
          renderSheet();
        },
        oncontextmenu: (e) => e.preventDefault(),
      },
      h('span', { class: 'works-tick', 'aria-hidden': 'true' }, on ? '✓' : ''),
      h('span', { class: 'defect-text' },
        h('span', { class: 'defect-label' }, label),
          opt.custom
            ? h('span', { class: 'defect-code' }, `✎ your own · ${unit.label}`)
            : library && lib ? h('span', { class: 'defect-code' }, `${opt.c} · ${unit.label}${opt.note ? ` · ${opt.note}` : ''}${opt.pinned ? ' · 📌 added by you' : ''}`)
              : h('span', { class: 'defect-code' }, unit.label),
          alsoOn ? h('span', { class: 'defect-also' }, `⚠ already on ${alsoOn.join(' & ')} here`) : null));
      onLongPress(toggle, () => editWording(opt));
      return h('div', { class: 'defect-row', dataset: { on: String(on) } },
        toggle,
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
            'aria-label': `Remove “${opt.d}” from the ${listName} list`,
            title: `Remove from ${typeLabel} list`,
            onclick: () => {
              // Already-ticked items stay ticked (they move to "Also selected").
              if (opt.pinned) {
                setAdded(room.name, part.key, opt, false);
                toast(`Removed from the ${listName} list`);
              } else {
                setHidden(room.name, part.key, opt.k, true);
                toast(`Removed from ${listName} list – restore it at the bottom`);
              }
              refreshTemplate();
              renderSheet();
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
              const base = options.find((o) => o.c === opt.c);
              if (base && hidden.has(base.k)) setHidden(room.name, part.key, base.k, false);
              else setAdded(room.name, part.key, opt, true);
              refreshTemplate();
              renderSheet();
              toast(`📌 Added to every ${listName} list on this phone`);
            },
          }, '📌')
          : null,
        lib?.l
          ? h('button', { type: 'button', class: 'defect-more', 'aria-label': 'Full SOR description', onclick: () => { info.hidden = !info.hidden; } }, 'ⓘ')
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
    const listEl = h('div', { class: 'defect-list' });
    const inList = (code) => tpl.visible.some((o) => o.c === code);

    const renderResults = () => {
      if (!library) return;
      const found = query.trim().length >= 2 ? searchLibrary(library, query, 30, part.key) : [];
      results.replaceChildren(
        query.trim().length >= 2
          ? h('p', { class: 'hint' }, found.length ? `${found.length === 30 ? '30+' : found.length} match${found.length === 1 ? '' : 'es'} – tap to add` : 'No matches')
          : '',
        ...found.map((it) => row({ c: it.c, d: it.d, u: it.u }, { pinnable: !inList(it.c) })));
    };

    // ----- Add your own defect (saved to this type's list on this device) -----
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
      renderSheet();
      toast(`Added to every ${listName} list on this phone`);
    };
    ownLabel.addEventListener('keydown', (e) => { if (e.key === 'Enter') addOwnDefect(); });
    const addOwn = h('div', { class: 'add-own' },
      h('span', { class: 'field-label' }, '+ Add your own defect'),
      h('div', { class: 'add-own-row' }, ownLabel, ownUnit,
        h('button', { type: 'button', class: 'btn-primary', onclick: addOwnDefect }, 'Add')));

    const renderSheet = () => {
      const shown = tpl.visible;
      const shownCodes = new Set(shown.map((o) => o.c));
      const extras = [...chosen].filter(([code]) => !shownCodes.has(code))
        .map(([code, v]) => ({ c: code, d: v.d, u: v.u }));
      const removed = tpl.removed;
      listEl.replaceChildren(
        extras.length ? h('p', { class: 'field-label' }, 'Also selected') : '',
        ...extras.map((o) => row(o, { pinnable: true })),
        h('p', { class: 'field-label' }, `${typeLabel} – ${part.label.toLowerCase()}`),
        ...shown.map((o) => row(o, { removable: true })),
        shown.length ? '' : h('p', { class: 'hint' }, 'No standard defects – add your own below.'),
        addOwn,
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
                onclick: () => { setHidden(room.name, part.key, o.k, false); refreshTemplate(); renderSheet(); },
              }, '+'))))
          : '');
      renderResults();
    };
    renderSheet();

    let untrack = () => {};
    const close = () => {
      sheet.remove();
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', onKey);
      untrack();
    };
    // Save the working copy into the room (used by Save, ✕ and the phone's back button).
    const saveAndClose = () => {
      p.defects = [...chosen].map(([code, v]) => ({ id: code, qty: String(v.qty ?? '').trim(), d: v.d, u: v.u }));
      p.notes = notes;
      if (p.defects.length) p.state = 'works';
      else if (p.state === 'works') p.state = '';
      save();
      render();
      close();
      if (p.defects.length) toast(`${part.label}: ${p.defects.length} defect${p.defects.length === 1 ? '' : 's'} saved`);
    };
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('dialog[open], .camera, .lightbox')) saveAndClose(); };

    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${part.label} defects` },
      h('header', { class: 'sheet-head' },
        h('h2', null,
          h('span', { class: 'sheet-room' }, kind === 'security' ? 'Security' : room.name || 'Room'),
          h('span', { class: 'sheet-part' }, `${part.label} defects`)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Save and close', onclick: saveAndClose }, '✕')),
      h('div', { class: 'sheet-body' },
        library ? h('div', { class: 'sor-search-wrap' }, searchBox) : null,
        results,
        h('p', { class: 'hint' }, prefill
          ? `m² / m are pre-filled from the room size (${prefill}) – change them as needed. `
          : 'Tick each defect and enter the quantity. ',
        'Press and hold a defect to change its wording – it’s remembered for next time.'),
        listEl,
        textField('Notes', notes, (v) => { notes = v; }, { multiline: true, autocapitalize: 'sentences', placeholder: 'Anything the contractor should know' }),
        h('span', { class: 'field-label' }, 'Photos'),
        photoField(job, p.photos, () => save())),
      h('footer', { class: 'sheet-foot' },
        h('button', {
          type: 'button',
          class: 'btn-primary btn-big',
          onclick: saveAndClose,
        }, 'Save'),
        h('button', { type: 'button', class: 'btn-big', onclick: close }, 'Cancel')));
    document.addEventListener('keydown', onKey);
    document.body.append(sheet);
    // Phone back button = save and close (never lose what was entered).
    untrack = trackOverlay(() => { untrack = () => {}; saveAndClose(); });
    document.body.classList.add('no-scroll');
  }

  render();
  const el = h('div', { class: 'feature-list' },
    statusLine,
    list,
    h('div', { class: 'btn-row feature-actions' }, addBtn, editBtn));
  return { el, refresh: render };
}
