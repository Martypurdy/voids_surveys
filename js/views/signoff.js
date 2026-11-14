// Ready to let › Sign off: are there any appliances to be maintained? Yes pops up the
// appliance list; then photos and notes.
import { scheduleSave } from '../db.js';
import { APPLIANCES } from '../model.js';
import { h, multiSelect, worksButton, textField, yesNo } from '../ui.js';
import { photoField } from '../photos.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

export default async function signoff(root, { id }) {
  const job = await loadJobOr404(id);
  const a = job.rtl.appliances;
  const save = () => scheduleSave(job);

  const pick = async () => {
    const r = await multiSelect({
      title: 'Appliances to be maintained',
      message: 'Select every appliance that will be maintained.',
      groups: [{ options: [...new Set([...APPLIANCES, ...a.list])], selected: a.list }],
    });
    if (r) [a.list] = r;
    save();
    render();
  };

  // The chosen appliances (tap to change), shown only when the answer is Yes.
  const listSlot = h('div', { class: 'works-list' });
  // Photos and notes appear once the question is answered.
  const more = h('div', null,
    h('h2', null, 'Photos'),
    photoField(job, a.photos),
    textField('Notes', a.notes, (v) => { a.notes = v; save(); }, { multiline: true, autocapitalize: 'sentences' }));

  const render = () => {
    listSlot.replaceChildren(a.any === 'yes'
      ? worksButton('Appliances', a.list.length ? a.list.join(', ') : 'Tap to choose appliances', a.list.length > 0, pick, { chevron: '›' })
      : '');
    listSlot.hidden = a.any !== 'yes';
    more.hidden = !a.any;
  };

  const question = yesNo('Are there any appliances to be maintained?', a.any, (v) => {
    a.any = v;
    save();
    render();
    if (v === 'yes') pick();
  });
  render();

  root.append(
    ...jobChrome(job, 'signoff'),
    h('div', { class: 'content' },
      h('h2', null, 'Appliances'),
      h('div', { class: 'card card-body' },
        h('span', { class: 'field-label' }, 'Are there any appliances to be maintained?'),
        question),
      listSlot,
      more,
      completeFooter(job, 'signoff')));
}
