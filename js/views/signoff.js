// Ready to let › Sign off: are there any appliances to be maintained? Yes pops up the
// appliance list; then photos and notes.
import { scheduleSave } from '../db.js';
import { APPLIANCES, fmtDateTime, nowISO } from '../model.js';
import { h, multiSelect, worksButton, textField, yesNo, confirmDialog } from '../ui.js';
import { captureSignature } from '../signature.js';
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

  // ----- Signature: tap to sign full screen in landscape -----
  const sig = job.rtl.signature;
  const sigBox = h('div');
  const sign = async () => {
    const image = await captureSignature({ title: sig.name ? `Sign below – ${sig.name}` : 'Sign below' });
    if (!image) return;
    sig.image = image;
    sig.date = nowISO();
    scheduleSave(job, 0);
    renderSig();
  };
  const renderSig = () => sigBox.replaceChildren(sig.image
    ? h('div', null,
      h('img', { class: 'sig-preview', src: sig.image, alt: 'Signature' }),
      h('p', { class: 'hint' }, `✓ Signed ${fmtDateTime(sig.date)}`),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', onclick: sign }, '✍️ Sign again'),
        h('button', {
          type: 'button',
          class: 'btn-danger',
          onclick: async () => {
            if (!(await confirmDialog('Remove this signature?', { ok: 'Remove' }))) return;
            sig.image = '';
            sig.date = '';
            save();
            renderSig();
          },
        }, 'Remove')))
    : h('button', { type: 'button', class: 'btn-primary btn-big btn-block sig-start', onclick: sign }, '✍️ Tap to sign'));
  renderSig();

  root.append(
    ...jobChrome(job, 'signoff'),
    h('div', { class: 'content' },
      h('h2', null, 'Appliances'),
      h('div', { class: 'card card-body' },
        h('span', { class: 'field-label' }, 'Are there any appliances to be maintained?'),
        question),
      listSlot,
      more,
      h('h2', null, 'Signature'),
      h('div', { class: 'card card-body' },
        textField('Name', sig.name, (v) => { sig.name = v; save(); }, { autocapitalize: 'words', placeholder: 'Name of the person signing' }),
        h('span', { class: 'field-label' }, 'Signature'),
        sigBox),
      completeFooter(job, 'signoff')));
}
