// Files kept with a property (supplier quotes, PDFs, photos, letters) and the "inbox" of files that have been
// shared to the app but not yet filed.
//
//   property files – IndexedDB store 'voids-files': { id, propertyId, name, kind, type, size, added, blob }
//   inbox          – the Cache API ('shared-inbox-v1'), because the service worker receives shared files while the
//                    app is closed and can write to it; the app moves them into a property from the Shared files screen.
import { createStore, get, set, del, values, delMany } from '../vendor/idb-keyval.js';

const fileStore = createStore('voids-files', 'files');
const INBOX = 'shared-inbox-v1'; // must not start with "voids-" (sw.js deletes old caches with that prefix)

export const FILE_KINDS = [['quote', 'Quote or invoice'], ['document', 'Document'], ['photo', 'Photo'], ['other', 'Other']];
export const KIND_EMOJI = { quote: '🧾', document: '📄', photo: '🖼', other: '📎' };
export const kindLabel = (k) => (FILE_KINDS.find(([v]) => v === k) || FILE_KINDS[3])[1];

export const isImage = (f) => /^image\//.test(f.type || '') || /\.(jpe?g|png|gif|webp|heic)$/i.test(f.name || '');
export const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');

/** A first guess at what a file is, from its name and type. The user can change it. */
export function guessKind(f) {
  if (isImage(f)) return 'photo';
  if (/quote|quotation|estimate|invoice|proforma/i.test(f.name || '')) return 'quote';
  if (isPdf(f) || /\.(docx?|xlsx?|txt|csv)$/i.test(f.name || '')) return 'document';
  return 'other';
}

export const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const newId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ---------- Files kept with a property ----------

export async function addPropertyFile(propertyId, { blob, name, kind }) {
  const rec = {
    id: newId(),
    propertyId,
    name: (name || 'File').trim() || 'File',
    kind: kind || guessKind({ name, type: blob.type }),
    type: blob.type || '',
    size: blob.size,
    added: new Date().toISOString(),
    blob,
  };
  await set(rec.id, rec, fileStore);
  return rec;
}

export async function listPropertyFiles(propertyId) {
  return (await values(fileStore)).filter((f) => f.propertyId === propertyId).sort((a, b) => (b.added || '').localeCompare(a.added || ''));
}

export const getPropertyFile = (id) => get(id, fileStore);
export const savePropertyFile = (rec) => set(rec.id, rec, fileStore);
export const deletePropertyFile = (id) => del(id, fileStore);

export async function deleteFilesFor(propertyId) {
  const ids = (await listPropertyFiles(propertyId)).map((f) => f.id);
  if (ids.length) await delMany(ids, fileStore);
}

export async function moveFilesTo(fromId, toId) {
  for (const f of await listPropertyFiles(fromId)) await set(f.id, { ...f, propertyId: toId }, fileStore);
}

// ---------- Inbox (shared files waiting to be filed) ----------

const inboxUrl = (id) => new URL(`./shared-inbox/${id}`, new URL('./', document.baseURI)).href;

/** Put files in the inbox (used when you add files from the Shared files screen, or open a PDF with the app on a computer). */
export async function stashToInbox(files) {
  const cache = await caches.open(INBOX);
  let n = 0;
  for (const f of files) {
    await cache.put(inboxUrl(newId()), new Response(f, {
      headers: {
        'Content-Type': f.type || 'application/octet-stream',
        'X-Name': encodeURIComponent(f.name || 'File'),
        'X-Added': new Date().toISOString(),
      },
    }));
    n++;
  }
  return n;
}

/** Everything waiting in the inbox, oldest first: { key, name, type, size, added, blob }. */
export async function listInbox() {
  if (!('caches' in window)) return [];
  const cache = await caches.open(INBOX);
  const out = [];
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    if (!res) continue;
    const blob = await res.blob();
    out.push({
      key: req.url,
      name: decodeURIComponent(res.headers.get('X-Name') || 'File'),
      type: blob.type || res.headers.get('Content-Type') || '',
      size: blob.size,
      added: res.headers.get('X-Added') || '',
      blob,
    });
  }
  return out.sort((a, b) => (a.added || '').localeCompare(b.added || ''));
}

export async function removeFromInbox(key) {
  const cache = await caches.open(INBOX);
  await cache.delete(key);
}

export async function inboxCount() {
  if (!('caches' in window)) return 0;
  return (await (await caches.open(INBOX)).keys()).length;
}
