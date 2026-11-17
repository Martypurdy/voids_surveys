// Screens for Inspection -> Ready to let: the button on a finished inspection, and "Start from an inspection" on a
// Ready to let form's Address tab. The copying itself is in ../startRtl.js.
import { getJob, getProperty } from '../db.js';
import { fmtDate } from '../model.js';
import { fillFromInspection, rtlFromInspection, existingRtl, linkBack, summaryText } from '../startRtl.js';
import { h, toast, choose, busy } from '../ui.js';
import { go } from '../router.js';

/** Start a Ready to let from the inspection with this id (warns if one was started already). Goes to the new form. */
export async function startRtlFromEntry(id) {
  const src = await getJob(id);
  if (!src) return toast('That inspection could not be opened');
  const old = await existingRtl(src);
  if (old) {
    const pick = await choose({
      title: 'Already started',
      message: `A Ready to let was already started from this inspection (${fmtDate(old.created)}). Open that one, or start another?`,
      buttons: [
        { label: 'Open the Ready to let', value: 'open', class: 'btn-primary' },
        { label: 'Start another', value: 'new' },
        { label: 'Cancel', value: null },
      ],
    });
    if (!pick) return;
    if (pick === 'open') return go(`/job/${old.id}`);
  }
  const progress = busy('Starting Ready to let…');
  try {
    const job = await rtlFromInspection(src);
    progress.close();
    toast('Ready to let started from the inspection');
    go(`/job/${job.id}`);
  } catch (e) {
    console.error(e);
    progress.close();
    toast(`Could not start it: ${e.message}`);
  }
}

/** Ready to let, Address tab: choose an inspection at this property and copy its locations and rooms in. */
export function inspectionStart(job, save, onChange = () => {}) {
  const status = h('p', { class: 'hint' });
  const paint = async () => {
    const src = job.fromId ? await getJob(job.fromId) : null;
    status.replaceChildren(src
      ? h('span', null, 'Started from the inspection of ', h('a', { href: `#/job/${src.id}` }, fmtDate(src.created)), '.')
      : 'At an address with an Empty home inspection? Copy where the key safe, meters, stop tap, fuse board and rooms are, instead of hunting for them again.');
  };
  paint();

  const start = h('button', {
    type: 'button',
    class: 'btn-primary',
    onclick: async () => {
      const prop = job.propertyId ? await getProperty(job.propertyId) : null;
      const found = (prop?.entries || []).filter((e) => e.form === 'void');
      if (!found.length) return toast('No Empty home inspection at this property yet.');
      found.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      let pick = found[0];
      if (found.length > 1) {
        const id = await choose({
          title: 'Which inspection?',
          buttons: [...found.map((e) => ({ label: `${e.nature || 'Empty home inspection'} · ${fmtDate(e.created)}${e.total && e.done === e.total ? ' ✓' : ''}`, value: e.id })), { label: 'Cancel', value: null }],
        });
        if (!id) return;
        pick = found.find((e) => e.id === id);
      }
      const src = await getJob(pick.id);
      if (!src) return toast('That inspection could not be opened');
      if (src.nextId && src.nextId !== job.id && (await existingRtl(src))) {
        const ok = await choose({
          title: 'Already used',
          message: 'A different Ready to let was already started from this inspection. Copy from it into this one as well?',
          buttons: [{ label: 'Copy into this one', value: 'yes', class: 'btn-primary' }, { label: 'Cancel', value: null }],
        });
        if (!ok) return;
      }
      const progress = busy('Copying…');
      try {
        const done = await fillFromInspection(job, src);
        await linkBack(job, src);
        save();
        progress.close();
        paint();
        onChange();
        toast(`Copied: ${summaryText(done)}`, { timeout: 6000 });
      } catch (e) {
        console.error(e);
        progress.close();
        toast(`Could not copy: ${e.message}`);
      }
    },
  }, 'Start from an inspection');

  return h('div', { class: 'card card-body ref-box' }, h('div', { class: 'btn-row' }, start), status);
}

/** The small 👍 Ready to let button on a finished inspection's bar. */
export function rtlButton(entry) {
  return h('button', {
    type: 'button',
    class: 'rtl-go',
    'aria-label': entry.nextId ? 'Ready to let (already started)' : 'Start Ready to let from this inspection',
    onclick: () => startRtlFromEntry(entry.id),
  }, h('span', { class: 'rtl-go-i', 'aria-hidden': 'true' }, '👍'), 'Ready to let');
}
