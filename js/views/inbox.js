// "Shared files": photos, PDFs and documents sent to PropertyPad from another app (the phone's Share menu, or
// "Open with" on a computer) wait here until they are saved to a property.
import { h, pageHeader, choose, textField, selectField, toast, objectUrl } from '../ui.js';
import { go, refresh } from '../router.js';
import { pickProperty } from './pickProperty.js';
import { addPropertyDialog } from './addressEditor.js';
import { viewFile } from './propertyFiles.js';
import { FILE_KINDS, KIND_EMOJI, fmtSize, isImage, guessKind, listInbox, removeFromInbox, stashToInbox, addPropertyFile } from '../files.js';
import { addressTitle } from '../properties.js';

export default async function inbox(root) {
  const items = await listInbox();
  const state = new Map(items.map((it) => [it.key, { name: it.name, kind: guessKind(it) }]));

  const picker = h('input', {
    type: 'file', multiple: true, hidden: true, 'aria-label': 'Choose files',
    accept: 'application/pdf,image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt',
    onchange: async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      if (files.length) { await stashToInbox(files); refresh(); }
    },
  });

  const card = (it) => {
    const s = state.get(it.key);
    const thumb = isImage(it)
      ? h('img', { class: 'inbox-thumb', src: objectUrl(it.blob), alt: '' })
      : h('div', { class: 'inbox-thumb inbox-doc', 'aria-hidden': 'true' }, KIND_EMOJI[s.kind] || '📄');
    return h('div', { class: 'card card-body inbox-card' },
      h('div', { class: 'inbox-top' },
        thumb,
        h('div', { class: 'inbox-info' },
          textField('Name', s.name, (t) => { s.name = t; }),
          selectField('Type', s.kind, FILE_KINDS, (t) => { s.kind = t; }, { placeholder: null }),
          h('div', { class: 'hint' }, fmtSize(it.size)))),
      h('div', { class: 'inbox-actions' },
        h('button', { type: 'button', class: 'btn-small', onclick: () => viewFile({ blob: it.blob, name: s.name || it.name, type: it.type }) }, 'View'),
        h('button', {
          type: 'button',
          class: 'btn-small',
          onclick: async () => { await removeFromInbox(it.key); toast('Removed'); refresh(); },
        }, 'Remove')));
  };

  const saveAll = async () => {
    const choice = await choose({
      title: items.length === 1 ? 'Save this file to…' : `Save these ${items.length} files to…`,
      buttons: [
        { label: 'A property already on this device', value: 'existing', class: 'btn-primary' },
        { label: '＋ A new property', value: 'new' },
        { label: 'Cancel', value: null },
      ],
    });
    if (!choice) return;
    const p = choice === 'new' ? await addPropertyDialog() : await pickProperty({ title: 'Save to which property?' });
    if (!p) return;
    for (const it of items) {
      const s = state.get(it.key);
      await addPropertyFile(p.id, { blob: it.blob, name: s.name || it.name, kind: s.kind });
      await removeFromInbox(it.key);
    }
    toast(`Saved to ${addressTitle(p.address)}`);
    go(`/property/${p.id}`);
  };

  root.append(
    pageHeader('Shared files', { back: '#/' }),
    h('div', { class: 'content inbox' },
      items.length
        ? [
          h('p', { class: 'hint' }, 'Check the name and type, then save them to a property. Quotes and PDFs can be opened from the property afterwards.'),
          ...items.map(card),
          h('button', { type: 'button', class: 'btn-primary btn-big btn-block', onclick: saveAll }, items.length === 1 ? 'Save to a property' : `Save all ${items.length} to a property`),
        ]
        : h('p', { class: 'empty' }, 'Nothing waiting. On a phone, open a photo, PDF or email attachment, tap Share and choose PropertyPad. On a computer, add files below or drag them onto a property.'),
      picker,
      h('button', { type: 'button', class: 'btn btn-block', onclick: () => picker.click() }, '＋ Add files from this device')));
}
