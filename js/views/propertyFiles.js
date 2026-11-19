// Files kept with a property: the list on the property page, and the viewer (PDF, photo, or Share / Save for anything else).
import { h, choose, confirmDialog, toast, textField, selectField, trackOverlay } from '../ui.js';
import { deliverFile } from '../export/deliver.js';
import {
  FILE_KINDS, KIND_EMOJI, kindLabel, fmtSize, isImage, isPdf,
  addPropertyFile, listPropertyFiles, savePropertyFile, deletePropertyFile,
} from '../files.js';
import { fmtDate } from '../model.js';
import { addressTitle } from '../properties.js';
import { pickProperty } from './pickProperty.js';

/** Open a file: PDFs in the in-app viewer, photos full screen, anything else through Share / Save. */
export async function viewFile({ blob, name, type }) {
  const f = { name, type: type || blob.type };
  if (isPdf(f)) {
    const { previewPdf } = await import('../export/preview.js');
    return previewPdf(blob, name, { title: name });
  }
  if (isImage(f)) return viewImage(blob, name);
  return deliverFile(blob, name);
}

function viewImage(blob, name) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    let untrack = () => {};
    const close = () => {
      if (!overlay.isConnected) return;
      untrack();
      overlay.remove();
      URL.revokeObjectURL(url);
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', onKey);
      resolve();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const overlay = h('div', { class: 'preview', role: 'dialog', 'aria-modal': 'true', 'aria-label': name },
      h('header', { class: 'sheet-head' },
        h('h2', null, name),
        h('button', { type: 'button', class: 'btn-small preview-share', onclick: () => deliverFile(blob, name) }, 'Share / Save'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
      h('div', { class: 'pf-photo' }, h('img', { src: url, alt: name })));
    document.body.append(overlay);
    document.body.classList.add('no-scroll');
    document.addEventListener('keydown', onKey);
    untrack = trackOverlay(() => { untrack = () => {}; close(); });
  });
}

/** Save these files (File objects) to a property, guessing what each is. Returns how many were saved. */
export async function saveFilesTo(propertyId, files) {
  let n = 0;
  for (const f of files) {
    await addPropertyFile(propertyId, { blob: f, name: f.name });
    n++;
  }
  return n;
}

/** The "Files" block for a property page. */
export function filesSection(p) {
  const list = h('div', { class: 'pf-list' });
  const count = h('span', null, '');
  const picker = h('input', {
    type: 'file', multiple: true, hidden: true, 'aria-label': 'Choose files to add',
    accept: 'application/pdf,image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt',
    onchange: async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (files.length) { await add(files); }
    },
  });
  const box = h('div', { class: 'pf' },
    h('div', { class: 'pf-head' },
      h('h2', { class: 'home-h' }, 'Files ', count),
      h('button', { type: 'button', class: 'btn-small', onclick: () => picker.click() }, '＋ Add file')),
    picker,
    list);

  const add = async (files) => {
    const n = await saveFilesTo(p.id, files);
    if (n) toast(`${n} file${n === 1 ? '' : 's'} saved to this property`);
    await render();
  };

  const rowMenu = async (rec) => {
    const v = await choose({
      title: rec.name,
      buttons: [
        { label: 'Open', value: 'open', class: 'btn-primary' },
        { label: 'Share / Save a copy', value: 'share' },
        { label: '✎ Rename or change type', value: 'rename' },
        { label: '⇆ Move to another property', value: 'move' },
        { label: 'Delete', value: 'delete', class: 'btn-danger' },
        { label: 'Cancel', value: null },
      ],
    });
    if (v === 'open') await viewFile(rec);
    if (v === 'share') await deliverFile(rec.blob, rec.name);
    if (v === 'rename') {
      let name = rec.name;
      let kind = rec.kind;
      const ok = await choose({
        title: 'Rename',
        content: h('div', null, textField('Name', name, (t) => { name = t; }), selectField('Type', kind, FILE_KINDS, (t) => { kind = t; }, { placeholder: null })),
        buttons: [{ label: 'Save', value: true, class: 'btn-primary' }, { label: 'Cancel', value: null }],
      });
      if (ok && name.trim()) { rec.name = name.trim(); rec.kind = kind || rec.kind; await savePropertyFile(rec); }
    }
    if (v === 'move') {
      const to = await pickProperty({ title: 'Move to which property?', exclude: [p.id] });
      if (to) {
        rec.propertyId = to.id;
        await savePropertyFile(rec);
        toast(`Moved to ${addressTitle(to.address)}`);
      }
    }
    if (v === 'delete' && await confirmDialog(`Delete “${rec.name}” from this property?`)) await deletePropertyFile(rec.id);
    await render();
  };

  const row = (rec) => h('div', { class: 'card pf-row' },
    h('button', { type: 'button', class: 'pf-open', onclick: () => viewFile(rec) },
      h('span', { class: 'pf-emoji', 'aria-hidden': 'true' }, KIND_EMOJI[rec.kind] || '📎'),
      h('span', { class: 'pf-text' },
        h('strong', null, rec.name),
        h('span', null, `${kindLabel(rec.kind)} · ${fmtSize(rec.size)} · ${fmtDate(rec.added)}`))),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Actions for ${rec.name}`, onclick: () => rowMenu(rec) }, '⋯'));

  async function render() {
    const files = await listPropertyFiles(p.id);
    count.textContent = files.length ? `(${files.length})` : '';
    list.replaceChildren(...(files.length
      ? files.map(row)
      : [h('p', { class: 'hint' }, 'Quotes, PDFs and photos for this address. Share them here from your email or gallery (choose PropertyPad), or tap Add file.')]));
  }

  // Drag files onto the block (computers).
  box.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); box.classList.add('pf-drop'); } });
  box.addEventListener('dragleave', () => box.classList.remove('pf-drop'));
  box.addEventListener('drop', async (e) => {
    box.classList.remove('pf-drop');
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    await add(files);
  });

  render();
  return box;
}
