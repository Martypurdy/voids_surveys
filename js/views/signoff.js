// Sign off (both forms): Ready to let asks about appliances to be maintained (Yes pops
// up the appliance list, then photos and notes). Both forms end with a signature.
import { scheduleSave } from '../db.js';
import { APPLIANCES, fmtDateTime, nowISO, isRtl, isRepair } from '../model.js';
import { h, multiSelect, worksButton, textField, yesNo, confirmDialog } from '../ui.js';
import { captureSignature } from '../signature.js';
import { photoField } from '../photos.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

export default async function signoff(root, { id }) {
  const job = await loadJobOr404(id);
  const rtl = isRtl(job);
  const a = rtl ? job.rtl.appliances : { any: '', list: [], notes: '', photos: [] };
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
    // One line per appliance, each with a delete button (for ones the tenant does not want or that were damaged).
    listSlot.replaceChildren(...(a.any === 'yes'
      ? [
        ...a.list.map((name) => h('div', { class: 'room-row' },
          worksButton(name, '', true, pick),
          h('button', { type: 'button', class: 'feature-remove', 'aria-label': `Remove ${name}`, onclick: () => { a.list = a.list.filter((x) => x !== name); save(); render(); } }, '✕'))),
        worksButton(a.list.length ? 'Add or change appliances' : 'Appliances', a.list.length ? '' : 'Tap to choose appliances', false, pick, { chevron: '›' }),
      ]
      : []));
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
  const sig = job.signature;
  // Empty home inspection: the surveyor signs, so start with their name.
  if (!rtl && !sig.name && job.surveyor) sig.name = job.surveyor;
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
      rtl ? [
        h('h2', null, 'Appliances'),
        h('div', { class: 'card card-body' },
          h('span', { class: 'field-label' }, 'Are there any appliances to be maintained?'),
          question),
        listSlot,
        more,
      ] : isRepair(job) ? [
        h('h2', null, 'Additional notes'),
        h('div', { class: 'card card-body' },
          textField('Additional notes', job.repair.notes, (v) => { job.repair.notes = v; save(); }, { multiline: true, autocapitalize: 'sentences', placeholder: 'Anything else to record' })),
        h('p', { class: 'hint' }, 'Sign to confirm the survey is complete and accurate. The signature appears at the end of the report.'),
      ] : h('p', { class: 'hint' }, 'Sign to confirm the survey is complete and accurate. The signature appears at the end of the PDF report.'),
      h('h2', null, 'Signature'),
      h('div', { class: 'card card-body' },
        textField('Name', sig.name, (v) => { sig.name = v; save(); }, { autocapitalize: 'words', placeholder: 'Name of the person signing' }),
        h('span', { class: 'field-label' }, 'Signature'),
        sigBox),
      completeFooter(job, 'signoff')));
}
