// Quotes and invoices: the pieces shared by their screens – the coloured company bar (like the Accountancy one) and the header colour.
import { h } from '../ui.js';
import { loadBusinesses, getBusinesses, inkFor } from '../accounts/store.js';
import { manageBusinesses } from '../views/businessDialog.js';
import { changeBusiness } from './create.js';
import { saveJob } from '../db.js';

/** The business a document is from (falls back to the first). */
export const businessFor = (doc) => getBusinesses().find((b) => b.id === doc.businessId) || getBusinesses()[0];

/** Colour a bar (or the page header) with a business's colour. */
export function paintWithBusiness(el, b) {
  el.style.setProperty('--biz', b.color);
  el.style.setProperty('--biz-ink', inkFor(b.color));
  el.dataset.biz = b.id;
}

/**
 * The Company / project bar for a quote or invoice: a drop-down of your businesses and Add / edit, in the business's colour; the page
 * header takes the colour too. Changing the company moves the document's number, due date and terms across (unless typed over).
 * onChange runs after the document has changed company (so the screen can refresh the fields that follow it).
 */
export async function businessBar(job, header, { onChange = () => {} } = {}) {
  await loadBusinesses();
  const doc = job.doc;
  if (!getBusinesses().some((b) => b.id === doc.businessId)) doc.businessId = getBusinesses()[0].id;
  const sel = h('select', { 'aria-label': 'Company or project' });
  const bar = h('div', { class: 'acc-biz doc-biz' }, sel, h('button', { type: 'button', class: 'btn-small', onclick: async () => { await manageBusinesses(); await loadBusinesses(); paint(); onChange(); } }, 'Add / edit'));
  const paint = () => {
    const b = businessFor(doc);
    sel.replaceChildren(...getBusinesses().map((x) => h('option', { value: x.id }, x.name)));
    sel.value = b.id;
    paintWithBusiness(bar, b);
    if (header) paintWithBusiness(header, b);
  };
  sel.addEventListener('change', async () => {
    await changeBusiness(job, sel.value);
    await saveJob(job);
    paint();
    onChange();
  });
  paint();
  return bar;
}
