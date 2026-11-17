// Screen: security – key safe (with its details always shown), gain entry, renew
// locks, then the external doors and window security as features (OK / defects).
import { scheduleSave } from '../db.js';
import { CYLINDER_OPTIONS, CYLINDER_DEFAULT, isRtl } from '../model.js';
import { rtlKeysSection } from './keysRtl.js';
import { getLibrary } from '../sor.js';
import { h, multiSelect, worksButton, toast } from '../ui.js';
import { syncDoorsToLocks } from '../lockDoors.js';
import { keySafeSection } from './keySafe.js';
import { featureList } from './featureList.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

export default async function security(root, { id }) {
  const job = await loadJobOr404(id);
  if (isRtl(job)) {
    root.append(...jobChrome(job, 'security'), h('div', { class: 'content' },
      h('h2', null, 'Key safe'),
      h('div', { class: 'card card-body works-panel keysafe-panel' }, keySafeSection(job)),
      rtlKeysSection(job),
      completeFooter(job, 'security')));
    return;
  }
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
          // The doors chosen here are the doors in the Doors & windows list below.
          const { added, removed } = syncDoorsToLocks(job.security, w.cylinders);
          save();
          renderList();
          doors.refresh();
          if (added.length || removed.length) toast(`Doors & windows: ${[added.length ? `added ${added.join(', ')}` : '', removed.length ? `removed ${removed.join(', ')}` : ''].filter(Boolean).join('; ')}`, { timeout: 5000 });
        }, { chevron: '›' }),
      // Must-action: communal keys (red) and fobs (amber) are constant hold-ups at handover.
      w.cylinders?.includes('Communal key')
        ? h('div', { class: 'alert-box', role: 'alert' },
          h('strong', null, '⚠ ACTION REQUIRED'),
          h('span', null, 'Communal keys required – Operative must arrange keys to be cut or communal lock change with manager before works are complete.'))
        : '',
      w.cylinders?.includes('Post box')
        ? h('div', { class: 'alert-box', role: 'alert' },
          h('strong', null, '⚠ ACTION REQUIRED'),
          h('span', null, 'Letter box lock required – Operative must arrange a new lock or keys for the letter box before works are complete.'))
        : '',
      w.cylinders?.includes('Communal fob')
        ? h('div', { class: 'alert-box alert-amber', role: 'alert' },
          h('strong', null, '⚠ ACTION REQUIRED'),
          h('span', null, 'Communal fob required – arrange with the fob team before handover. Flagged in amber on the PDF report.'))
        : '');
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
