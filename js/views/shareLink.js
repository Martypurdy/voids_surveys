// A product link shared to PropertyPad from another app (Android: Share › PropertyPad).
// Pick which Materials & labour costing to add it to, or start a new one.
import { listJobs, saveJob } from '../db.js';
import { newJob, jobTitle, isPrice, fmtDate } from '../model.js';
import { h, pageHeader } from '../ui.js';
import { go } from '../router.js';
import { getLastSurveyor } from '../surveyors.js';
import { setPendingLink, takePendingLink, supplierOf } from '../linkfill.js';

export default async function shareLink(root) {
  const url = takePendingLink();
  if (!url) return go('/');
  // Keep it waiting for the costing's Materials tab to pick up.
  setPendingLink(url);
  const costings = (await listJobs()).filter(isPrice);

  const open = (id) => go(`/job/${id}/costs`);
  const startNew = async () => {
    const job = newJob({ surveyor: getLastSurveyor(), form: 'price' });
    await saveJob(job);
    open(job.id);
  };

  root.append(
    pageHeader('Add product', { back: '#/' }),
    h('div', { class: 'content' },
      h('p', { class: 'hint' }, `Product from ${supplierOf(url)}. Which costing should it go on?`),
      h('button', { type: 'button', class: 'btn-primary btn-big btn-block', onclick: startNew }, '＋ New Materials & labour costing'),
      costings.length ? h('h2', null, 'Your costings') : null,
      h('div', { class: 'share-list' }, costings.map((j) => h('button', {
        type: 'button',
        class: 'card share-pick',
        onclick: () => open(j.id),
      },
      h('strong', null, jobTitle(j)),
      h('span', null, [j.pricing.customer, j.pricing.ref, fmtDate(j.created)].filter((t) => t && t !== jobTitle(j)).join(' · ')))))));
}
