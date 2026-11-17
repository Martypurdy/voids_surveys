// Quote / invoice › Terms: the number, dates, status, notes, terms and payment details. Marking an invoice Paid (with the date) puts it
// in Accountancy as income for its company; making it not-paid again takes it out.
import { scheduleSave, flushSave, getJob } from '../db.js';
import { QUOTE_STATUSES, INVOICE_STATUSES, todayLocal } from '../model.js';
import { docTotals, docStatus, STATUS_LABEL } from '../docs/money.js';
import { businessBar, businessFor } from '../docs/ui.js';
import { invoiceFromQuote } from '../docs/create.js';
import { syncIncome } from '../accounts/store.js';
import { manageBusinesses } from './businessDialog.js';
import { h, textField, selectField, toast } from '../ui.js';
import { go } from '../router.js';
import { loadJobOr404, jobChrome, completeFooter } from './chrome.js';

export default async function docTerms(root, { id }) {
  const job = await loadJobOr404(id);
  const d = job.doc;
  const isInvoice = d.kind === 'invoice';
  const chrome = jobChrome(job, 'terms');
  const body = h('div', null);

  const save = () => scheduleSave(job);
  /** Save now, then keep the Accountancy income record in step with the invoice. */
  const saveAndSync = async () => {
    scheduleSave(job, 0);
    await flushSave();
    if (isInvoice) await syncIncome(job, docTotals(d));
  };

  const render = () => {
    const biz = businessFor(d);
    const shown = docStatus(d);
    const statuses = isInvoice ? INVOICE_STATUSES : QUOTE_STATUSES;
    const paidField = isInvoice && d.status === 'paid'
      ? textField('Date paid', d.paidDate, async (v) => { d.paidDate = v; await saveAndSync(); }, { type: 'date' })
      : null;

    const related = [];
    if (!isInvoice) {
      related.push(d.invoiceId
        ? h('button', { type: 'button', class: 'btn-primary', onclick: () => go(`/job/${d.invoiceId}/items`) }, '🧾 Open the invoice made from this quote')
        : h('button', { type: 'button', class: 'btn-primary', onclick: async () => { await flushSave(); const inv = await invoiceFromQuote(job); toast(`Invoice ${inv.doc.number} made`); go(`/job/${inv.id}/items`); } }, '🧾 Make an invoice from this quote'));
    } else {
      if (d.quoteId) related.push(h('button', { type: 'button', onclick: async () => { if (await getJob(d.quoteId)) go(`/job/${d.quoteId}/items`); else toast('That quote is no longer on this device'); } }, '📝 Open the quote this came from'));
      if (d.status !== 'paid') related.push(h('button', { type: 'button', class: 'btn-primary', onclick: async () => { d.status = 'paid'; d.paidDate ||= todayLocal(); await saveAndSync(); toast('Marked as paid – added to Accountancy income'); render(); } }, '✓ Mark as paid today'));
    }

    body.replaceChildren(
      h('div', { class: 'card card-body' },
        h('div', { class: 'input-row' },
          textField(isInvoice ? 'Invoice number' : 'Quote number', d.number, (v) => { d.number = v; d.numberAuto = false; save(); }, { autocapitalize: 'characters' }),
          selectField('Status', d.status, statuses, async (v) => { d.status = v; if (v === 'paid' && !d.paidDate) d.paidDate = todayLocal(); await saveAndSync(); render(); }, { placeholder: null })),
        shown === 'overdue' ? h('p', { class: 'warn-note' }, 'Overdue: this invoice was due on a date that has passed and has not been marked paid.') : null,
        h('div', { class: 'input-row' },
          textField('Issued', d.issued, (v) => { d.issued = v; save(); }, { type: 'date' }),
          textField(isInvoice ? 'Due by' : 'Valid until', d.due, (v) => { d.due = v; save(); }, { type: 'date' })),
        paidField),
      h('h2', null, 'Wording'),
      h('div', { class: 'card card-body' },
        textField('Notes for the customer', d.notes, (v) => { d.notes = v; save(); }, { multiline: true, autocapitalize: 'sentences', placeholder: 'e.g. Work to start the week after acceptance' }),
        textField('Terms', d.terms, (v) => { d.terms = v; save(); }, { multiline: true, autocapitalize: 'sentences', placeholder: 'Payment terms, guarantees, anything else to agree' }),
        isInvoice ? textField('Payment details', d.payment, (v) => { d.payment = v; save(); }, { multiline: true, placeholder: biz.bank ? `Leave blank to print: ${biz.bank.split('\n')[0]}…` : 'Bank details to pay into (or set them under Add / edit)' }) : null),
      related.length ? h('div', { class: 'btn-row' }, related) : null,
      h('h2', null, 'From'),
      h('div', { class: 'card card-body' },
        h('strong', null, biz.name),
        h('p', { class: 'hint' }, [biz.address, [biz.phone, biz.email].filter(Boolean).join(' · '), biz.vatNumber ? `VAT no. ${biz.vatNumber}` : '', biz.companyNumber ? `Company no. ${biz.companyNumber}` : ''].filter(Boolean).join('\n') || 'No details yet. Add the address, VAT number and bank details so they print on the document.'),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn-small', onclick: async () => { await manageBusinesses(); render(); } }, 'Edit business details'))),
      h('p', { class: 'hint' }, 'Check the document suits your situation before you send it. For a VAT invoice you normally need a unique number, the date, your name, address and VAT number, the customer’s name and address, a description of what was supplied, and the VAT rate and amount.'));
  };

  const bar = await businessBar(job, chrome[0], { onChange: render });
  root.append(
    ...chrome,
    h('div', { class: 'content wide doc-page' }, bar, body, completeFooter(job, 'terms')));
  void STATUS_LABEL;
  render();
}
