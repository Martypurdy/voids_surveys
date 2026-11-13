// Screen: security – key safe (with its details always shown), gain entry, renew
// locks, then the external doors and window security as features (OK / defects).
import { scheduleSave } from '../db.js';
import { CYLINDER_OPTIONS, CYLINDER_DEFAULT } from '../model.js';
import { getLibrary } from '../sor.js';
import { h, multiSelect, worksButton } from '../ui.js';
import { keySafeSection } from './keySafe.js';
import { featureList } from './featureList.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

export default async function security(root, { id }) {
  const job = await loadJobOr404(id);
  const w = job.works;
  const library = await getLibrary();
  const save = () => scheduleSave(job);

  // "Fit key safe" with the key safe details always right under it. The panel is
  // never re-rendered, so typing in it is never interrupted.
  const fitKeySafeSlot = h('div', { class: 'works-list' });
  const keySafePanel = h('div', { class: 'card card-body works-panel keysafe-panel' }, keySafeSection(job));
  const list = h('div', { class: 'works-list' });

  const renderList = () => {
    fitKeySafeSlot.replaceChildren(
      worksButton('Fit key safe', '', w.keySafe, () => { w.keySafe = !w.keySafe; save(); renderList(); }));
    list.replaceChildren(
      worksButton('Gain entry', '', w.gainEntry, () => { w.gainEntry = !w.gainEntry; save(); renderList(); }),
      worksButton('Renew locks', w.cylinders?.length ? w.cylinders.join(', ') : 'Tap to choose locks',
        Boolean(w.cylinders?.length), async () => {
          const r = await multiSelect({
            title: 'Renew locks',
            message: 'Select every lock that needs renewing.',
            groups: [{ options: CYLINDER_OPTIONS, selected: w.cylinders ?? CYLINDER_DEFAULT }],
          });
          if (!r) return;
          [w.cylinders] = r;
          save();
          renderList();
        }, { chevron: '›' }));
  };
  renderList();

  const doors = featureList({ job, room: job.security, kind: 'security', library });

  root.append(
    ...jobChrome(job, 'security'),
    h('div', { class: 'content' },
      h('h2', null, 'Key safe & access'),
      h('p', { class: 'hint' }, 'Tap to select – selected items turn green.'),
      fitKeySafeSlot,
      keySafePanel,
      list,

      h('h2', null, 'Doors & windows'),
      doors.el,
      completeFooter(job, 'security')));
}
