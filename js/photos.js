// Photo capture, on-device compression and the reusable photo field widget.
import { putPhoto, getPhoto, getPhotos, deletePhotos, scheduleSave, flushSave } from './db.js';
import { uid, nowISO } from './model.js';
import { h, icon, ICONS, objectUrl, confirmDialog, choose, toast, trackOverlay } from './ui.js';
import { openCamera, cameraSupported } from './camera.js';

export const FULL_MAX = 1600;
export const FULL_QUALITY = 0.82;
const THUMB_MAX = 320;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

/**
 * Resize an image Blob/File to fit within max×max and encode as JPEG.
 * <img> applies EXIF orientation in all current browsers, so the result is upright.
 */
export async function resizeImage(blob, max, quality) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const hgt = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = hgt;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // flatten transparent PNGs
    ctx.fillRect(0, 0, w, hgt);
    ctx.drawImage(img, 0, 0, w, hgt);
    const out = await new Promise((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image'))), 'image/jpeg', quality));
    canvas.width = canvas.height = 0; // release memory early (iOS)
    return { blob: out, w, h: hgt };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Compress a picked file, store it, return the new photo id. */
export async function storePhotoFile(file, jobId) {
  const full = await resizeImage(file, FULL_MAX, FULL_QUALITY);
  const thumb = await resizeImage(full.blob, THUMB_MAX, 0.7);
  const rec = { id: uid(), jobId, blob: full.blob, thumb: thumb.blob, w: full.w, h: full.h, created: nowISO() };
  await putPhoto(rec);
  return rec.id;
}

/** Build a thumbnail for an already-stored full image (used by import). */
export async function makeThumb(blob) {
  return (await resizeImage(blob, THUMB_MAX, 0.7)).blob;
}

/**
 * Photo field: one "Add photos" button that asks "Take photos" or "Upload from
 * phone", plus a thumbnail grid.
 *
 * "Take photos" opens the in-app camera (camera.js): snap repeatedly with no
 * per-photo review; shots are saved in the background. Falls back to the
 * phone's camera app if the in-app camera can't start.
 *
 * @param {object} job   the job (saved after every change)
 * @param {string[]} list  the photos array to manage – mutated in place
 * @param {() => void} [onChange]  called after add/remove (e.g. to update a count)
 */
export function photoField(job, list, onChange = () => {}) {
  const status = h('div', { class: 'photo-status', 'aria-live': 'polite' });
  const grid = h('div', { class: 'thumbs' });

  const handleFiles = async (input) => {
    const files = [...input.files];
    input.value = '';
    if (!files.length) return;
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      status.textContent = `Processing photo ${i + 1} of ${files.length}…`;
      try {
        const id = await storePhotoFile(files[i], job.id);
        list.push(id);
        grid.append(thumbButton(id));
        // Persist immediately so a photo is never orphaned if the app is closed.
        scheduleSave(job, 0);
        await flushSave();
      } catch (e) {
        console.error(e);
        failed++;
      }
    }
    status.textContent = '';
    if (failed) toast(`${failed} photo${failed > 1 ? 's' : ''} couldn’t be read`);
    onChange();
    return files.length - failed;
  };

  // Upload: no capture attribute, multiple allowed (iOS shows Photo Library / Take Photo / Files).
  const pickInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => handleFiles(e.target) });
  // Fallback only (no in-app camera / permission refused): the phone's own camera app.
  const camInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => handleFiles(e.target) });

  // ----- In-app camera: snap many in a row, no review step -----
  // Shots are saved one after another in the background while you keep shooting.
  let queue = Promise.resolve();
  let pending = 0;
  const saveShot = (blob) => {
    pending++;
    status.textContent = `Saving ${pending} photo${pending === 1 ? '' : 's'}…`;
    queue = queue.then(async () => {
      try {
        const id = await storePhotoFile(blob, job.id);
        list.push(id);
        grid.append(thumbButton(id));
        scheduleSave(job, 0);
        await flushSave();
      } catch (e) {
        console.error(e);
        toast('A photo couldn’t be saved');
      } finally {
        pending--;
        status.textContent = pending ? `Saving ${pending} photo${pending === 1 ? '' : 's'}…` : '';
        onChange();
      }
    });
  };

  const takePhotos = async () => {
    if (!cameraSupported()) return camInput.click();
    const { error } = await openCamera({ onCapture: saveShot, onNative: () => camInput.click() });
    if (error) {
      console.warn(error);
      // A fresh tap is needed before the browser will open the phone's camera app.
      await choose({
        title: 'Camera not available',
        message: error.name === 'NotAllowedError'
          ? 'Camera permission was refused. Allow camera access for this site in your browser settings, or use the phone’s camera app instead.'
          : 'The camera couldn’t be started. You can use the phone’s camera app instead.',
        buttons: [
          { label: '📷 Use phone camera app', value: 'native', class: 'btn-primary btn-big', onClick: () => camInput.click() },
          { label: 'Cancel', value: null },
        ],
      });
    }
  };

  const addPhotos = () => choose({
    title: 'Add photos',
    buttons: [
      { label: '📷 Take photos', value: 'camera', class: 'btn-primary btn-big', onClick: () => { takePhotos(); } },
      { label: '🖼 Upload from phone', value: 'upload', class: 'btn-big', onClick: () => pickInput.click() },
      { label: 'Cancel', value: null },
    ],
  });

  const thumbButton = (id) => {
    const img = h('img', { alt: 'Photo', loading: 'lazy' });
    const btn = h('button', { type: 'button', 'aria-label': 'View photo', onclick: () => openLightbox(id) }, img);
    btn.dataset.id = id;
    getPhoto(id).then((rec) => {
      if (rec) img.src = objectUrl(rec.thumb || rec.blob);
      else btn.remove();
    });
    return btn;
  };

  const openLightbox = async (id) => {
    const rec = await getPhoto(id);
    if (!rec) return;
    const url = URL.createObjectURL(rec.blob);
    let untrack = () => {};
    const close = () => {
      if (!box.isConnected) return;
      box.remove();
      URL.revokeObjectURL(url);
      document.removeEventListener('keydown', onKey);
      untrack();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Photo' },
      h('img', { src: url, alt: 'Photo' }),
      h('div', { class: 'btn-row' },
        h('button', {
          type: 'button',
          class: 'btn-danger',
          onclick: async () => {
            if (!(await confirmDialog('Delete this photo?'))) return;
            const i = list.indexOf(id);
            if (i >= 0) list.splice(i, 1);
            await deletePhotos([id]);
            scheduleSave(job, 0);
            await flushSave();
            grid.querySelector(`[data-id="${id}"]`)?.remove();
            close();
            onChange();
          },
        }, 'Delete'),
        h('button', { type: 'button', onclick: close }, 'Close')));
    document.addEventListener('keydown', onKey);
    document.body.append(box);
    untrack = trackOverlay(() => { untrack = () => {}; close(); }); // phone back button
  };

  grid.append(...list.map(thumbButton));

  const field = h('div', { class: 'photo-field' },
    h('div', { class: 'photo-actions' },
      h('button', { type: 'button', class: 'add-photos', onclick: addPhotos }, icon(ICONS.camera), ' Add photos')),
    pickInput,
    camInput,
    status,
    grid);
  field.takePhotos = takePhotos; // used by photoButton
  return field;
}

/** Load photo records for ids, skipping missing ones. */
export async function loadPhotos(ids) {
  if (!ids.length) return [];
  return (await getPhotos(ids)).filter(Boolean);
}

/**
 * Compact camera button for a row (sits next to a tick or quantity box).
 * Tap: take photos straight away. Turns green with a count once photos are taken.
 * Long press (touch) or right-click: a pop-up to view, delete or upload photos.
 *
 * @param {object} job
 * @param {string[]} list  the photos array – mutated in place
 * @param {() => void} [onChange]
 */
export function photoButton(job, list, onChange = () => {}, { label = 'Photos' } = {}) {
  const count = h('span', { class: 'photo-btn-count' });
  const btn = h('button', { type: 'button', class: 'photo-btn' }, icon(ICONS.camera), count);
  const render = () => {
    btn.dataset.has = String(list.length > 0);
    count.textContent = list.length ? String(list.length) : '';
    const n = list.length;
    btn.setAttribute('aria-label', `${label}: ${n ? `${n} photo${n === 1 ? '' : 's'}` : 'none yet'}. Tap to take photos, hold to view or edit.`);
    btn.title = 'Tap to take photos · hold (or right-click) to view or edit';
  };
  const changed = () => { render(); onChange(); };
  // A hidden photo field does the capturing and saving.
  const field = photoField(job, list, changed);

  // ----- Long press / right-click: photo pop-up -----
  let timer = null;
  let opened = 0;
  const openPopup = () => {
    opened = Date.now();
    navigator.vibrate?.(15);
    // Lifting the finger after a long press sends a tap to whatever is now under it
    // (the pop-up) – ignore taps for a moment so it doesn't close straight away.
    const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
    document.addEventListener('click', swallow, true);
    setTimeout(() => document.removeEventListener('click', swallow, true), 700);
    const inner = photoField(job, list, changed);
    let untrack = () => {};
    const close = () => {
      if (!pop.isConnected) return;
      pop.remove();
      untrack();
      render();
    };
    const pop = h('div', {
      class: 'photo-pop',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': label,
      onclick: (e) => { if (e.target === pop) close(); },
    },
    h('div', { class: 'photo-pop-card' },
      h('div', { class: 'photo-pop-head' }, h('strong', null, label),
        h('button', { type: 'button', class: 'btn-primary', onclick: close }, 'Done')),
      list.length ? h('p', { class: 'hint' }, 'Tap a photo to view or delete it.') : null,
      inner));
    document.body.append(pop);
    untrack = trackOverlay(() => { untrack = () => {}; close(); }); // phone back button
  };
  const cancel = () => { clearTimeout(timer); timer = null; };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    cancel();
    timer = setTimeout(() => { timer = null; openPopup(); }, 550);
  });
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointerleave', cancel);
  btn.addEventListener('pointercancel', cancel);
  btn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    cancel();
    if (Date.now() - opened > 800) openPopup(); // right-click (a long press has already opened it)
  });
  btn.addEventListener('click', () => {
    if (Date.now() - opened < 800) return; // the long press opened the pop-up
    field.takePhotos();
  });

  render();
  return h('span', { class: 'photo-btn-wrap' }, btn, h('span', { hidden: true }, field));
}
