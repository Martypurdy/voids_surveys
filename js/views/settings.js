// Screen: settings – load / remove the private SOR library on this device.
import { getLibrary, saveLibrary, removeLibrary, validateLibrary } from '../sor.js';
import { PARTS } from '../data/parts.js';
import { h, pageHeader, confirmDialog, toast, busy } from '../ui.js';
import { fmtDateTime } from '../model.js';
import { refresh } from '../router.js';
import { defectListEditor } from './defectLists.js';

export default async function settings(root) {
  const lib = await getLibrary();

  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const progress = busy('Loading SOR library…');
      try {
        const data = validateLibrary(JSON.parse(await file.text()));
        await saveLibrary(data);
        progress.close();
        toast(`SOR library loaded – ${data.items.length.toLocaleString('en-GB')} items`);
        refresh();
      } catch (err) {
        progress.close();
        toast(err instanceof SyntaxError ? 'That file isn’t valid' : err.message);
      }
    },
  });

  const status = lib
    ? h('div', { class: 'card card-body' },
      h('p', { class: 'sor-status' }, '✓ ', h('strong', null, lib.name || 'SOR library'), ' loaded on this device'),
      h('p', { class: 'hint' },
        `${lib.items.length.toLocaleString('en-GB')} items · loaded ${fmtDateTime(lib.loaded)}`, h('br'),
        'Preloaded: ', PARTS.map((p) => `${p.label} ${lib.parts[p.key]?.length || 0}`).join(', ')),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', onclick: () => fileInput.click() }, 'Load a newer file'),
        h('button', {
          type: 'button',
          class: 'btn-danger',
          onclick: async () => {
            if (!(await confirmDialog('Remove the SOR library from this device? Surveys keep the SOR items already recorded.', { ok: 'Remove' }))) return;
            await removeLibrary();
            toast('SOR library removed');
            refresh();
          },
        }, 'Remove')))
    : h('div', { class: 'card card-body' },
      h('p', { class: 'sor-status' }, 'No SOR library loaded – the defects lists use the built-in drafts.'),
      h('button', { type: 'button', class: 'btn-primary btn-block btn-big', onclick: () => fileInput.click() }, 'Load SOR library file'));

  root.append(
    pageHeader('Settings', { back: '#/' }),
    h('div', { class: 'content' },
      h('h2', null, 'SOR library'),
      status,
      fileInput,
      h('p', { class: 'hint' },
        'The SOR library file (sor-library.json) is private and stays on this device – it is never uploaded to the website. ',
        'Tap “Load SOR library file”, then choose OneDrive in the file picker and open the “Void Surveys” folder ',
        '(on iPhone: Browse › OneDrive; on Android: ☰ › OneDrive). ',
        'Do this once per phone, and again whenever the library is updated.'),

      h('h2', null, 'Defect lists'),
      h('p', { class: 'hint' }, 'Set up the defects offered for each room type and feature on this phone. Remove standard ones with −, add your own (choose Qty, m² or m), and edit the wording or unit of your own. Bedroom 1, 2, 3 … share the Bedroom list. Defects already recorded on surveys are not changed.'),
      defectListEditor(lib)));
}
