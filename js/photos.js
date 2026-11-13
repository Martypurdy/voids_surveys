// Photo capture, on-device compression and the reusable photo field widget.
import { putPhoto, getPhoto, getPhotos, deletePhotos, scheduleSave, flushSave } from './db.js';
import { uid, nowISO } from './model.js';
import { h, icon, ICONS, objectUrl, confirmDialog, toast } from './ui.js';

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
 * Photo field: "Add photos" (iOS shows Take Photo / Photo Library) + a camera
 * shortcut button (opens the rear camera directly) + thumbnail grid.
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
    if (failed) toast(`${failed} photo${failed > 1 ? 's' : ''} couldn't be read`);
    onChange();
  };

  // No capture attribute: iOS offers Take Photo / Photo Library / Choose File.
  const pickInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => handleFiles(e.target) });
  // Direct to rear camera (and a fallback for Android pickers that hide the camera).
  const camInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => handleFiles(e.target) });

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
    const close = () => {
      box.remove();
      URL.revokeObjectURL(url);
      document.removeEventListener('keydown', onKey);
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
  };

  grid.append(...list.map(thumbButton));

  return h('div', { class: 'photo-field' },
    h('div', { class: 'photo-actions' },
      h('button', { type: 'button', class: 'add-photos', onclick: () => pickInput.click() }, '+ Add photos'),
      h('button', { type: 'button', class: 'camera-btn', 'aria-label': 'Take photo with camera', title: 'Camera', onclick: () => camInput.click() }, icon(ICONS.camera))),
    pickInput,
    camInput,
    status,
    grid);
}

/** Load photo records for ids, skipping missing ones. */
export async function loadPhotos(ids) {
  if (!ids.length) return [];
  return (await getPhotos(ids)).filter(Boolean);
}
