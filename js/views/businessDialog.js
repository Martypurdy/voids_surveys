// The "Companies and projects" dialog: add, edit and remove the businesses you keep records for. Used from Accountancy and
// from quotes and invoices. Each business has a name and colour, a VAT setting and the details printed on its documents.
import { h, toast, choose, confirmDialog } from '../ui.js';
import { listReceipts, getBusinesses, businessOf, currentBusiness, selectBusiness, addBusiness, updateBusiness, removeBusiness, BUSINESS_COLORS, BUSINESS_DETAIL_DEFAULTS } from '../accounts/store.js';

const DETAIL_FIELDS = [
  ['address', 'Address', { multiline: true, placeholder: 'Shown on quotes and invoices' }],
  ['phone', 'Phone', {}], ['email', 'Email', {}],
  ['vatNumber', 'VAT number', { placeholder: 'If registered' }], ['companyNumber', 'Company number', { placeholder: 'If a limited company' }],
  ['bank', 'Bank details for payment', { multiline: true, placeholder: 'Account name, sort code, account number' }],
  ['terms', 'Standard terms', { multiline: true, placeholder: 'Printed at the foot of quotes and invoices' }],
];

/** Opens the dialog; resolves when it is closed. The current business may have changed (use currentBusiness()). */
export async function manageBusinesses() {
  const content = h('div', null);
  let editing = null;
  let color = BUSINESS_COLORS[getBusinesses().length % BUSINESS_COLORS.length];

  const removeIt = async (b, repaint) => {
    const all = await listReceipts();
    const count = all.filter((r) => businessOf(r) === b.id).length;
    const others = getBusinesses().filter((x) => x.id !== b.id);
    let moveTo = others[0].id;
    if (count) {
      const pick = await choose({
        title: `Remove “${b.name}”?`,
        message: `It has ${count} receipt${count === 1 ? '' : 's'} and invoice${count === 1 ? '' : 's'} recorded. What should happen to them?`,
        buttons: [
          ...others.map((o) => ({ label: `Move them to “${o.name}”`, value: `move:${o.id}`, class: 'btn-primary' })),
          { label: 'Delete the receipts and their pictures', value: 'delete', class: 'btn-danger' },
          { label: 'Cancel', value: null },
        ],
      });
      if (!pick) return;
      moveTo = pick.startsWith('move:') ? pick.slice(5) : '';
    } else if (!(await confirmDialog(`Remove “${b.name}”?`, { ok: 'Remove' }))) return;
    try {
      await removeBusiness(b.id, moveTo);
      repaint();
    } catch (err) { toast(err.message); }
  };

  const paint = () => {
    const list = getBusinesses();
    const name = h('input', { type: 'text', placeholder: 'e.g. Smith Plumbing Ltd, or Kitchen job at 12 High St', value: editing ? editing.name : '', autocapitalize: 'words', 'aria-label': 'Business name' });
    const vat = h('input', { type: 'checkbox', checked: editing ? editing.vatRegistered : false });
    const swatches = h('div', { class: 'biz-swatches', role: 'group', 'aria-label': 'Colour' });
    const picker = h('input', { type: 'color', value: color, 'aria-label': 'Pick any colour', oninput: (e) => { color = e.target.value; paintSwatches(); } });
    const paintSwatches = () => swatches.replaceChildren(...BUSINESS_COLORS.map((c) => h('button', { type: 'button', class: 'biz-swatch', style: `background:${c}`, 'aria-label': c, 'aria-pressed': String(color.toLowerCase() === c), onclick: () => { color = c; picker.value = c; paintSwatches(); } })), picker);
    paintSwatches();

    // the details printed on quotes and invoices
    const src = editing || BUSINESS_DETAIL_DEFAULTS;
    const detailInputs = {};
    const detailField = ([k, label, opts]) => {
      const input = h(opts.multiline ? 'textarea' : 'input', { value: src[k] ?? '', rows: opts.multiline ? 2 : null, placeholder: opts.placeholder, 'aria-label': label, autocapitalize: 'sentences' }, opts.multiline ? src[k] ?? '' : null);
      detailInputs[k] = input;
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
    };
    const numInput = (k, label) => {
      const input = h('input', { type: 'text', inputmode: 'numeric', value: String(src[k] ?? ''), 'aria-label': label });
      detailInputs[k] = input;
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
    };
    const textInput = (k, label) => {
      const input = h('input', { type: 'text', value: src[k] ?? '', 'aria-label': label });
      detailInputs[k] = input;
      return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
    };
    const docs = h('details', { class: 'biz-docs' },
      h('summary', null, 'Details printed on quotes and invoices'),
      h('div', { class: 'biz-docs-body' },
        ...DETAIL_FIELDS.map(detailField),
        h('div', { class: 'input-row' }, textInput('quotePrefix', 'Quote number starts'), numInput('nextQuote', 'Next quote number')),
        h('div', { class: 'input-row' }, textInput('invoicePrefix', 'Invoice number starts'), numInput('nextInvoice', 'Next invoice number')),
        h('div', { class: 'input-row' }, numInput('payDays', 'Invoice due after (days)'), numInput('validDays', 'Quote valid for (days)'))));

    const save = h('button', { type: 'button', class: 'btn-primary', onclick: async () => {
      try {
        const details = Object.fromEntries(Object.entries(detailInputs).map(([k, i]) => [k, i.value]));
        if (editing) await updateBusiness(editing.id, { name: name.value, color, vatRegistered: vat.checked, ...details });
        else { const b = await addBusiness({ name: name.value, color, vatRegistered: vat.checked, ...details }); selectBusiness(b.id); }
        editing = null;
        color = BUSINESS_COLORS[getBusinesses().length % BUSINESS_COLORS.length];
        paint();
      } catch (err) { toast(err.message); }
    } }, editing ? 'Save changes' : 'Add business');
    content.replaceChildren(
      h('p', { class: 'hint' }, 'Add each company, contractor or project you keep records for. Pick a colour: the top bar takes it, so you can see at a glance who you are adding to.'),
      ...list.map((b) => h('div', { class: 'biz-row' },
        h('span', { class: 'biz-dot', style: `background:${b.color}` }),
        h('span', { class: 'biz-name' }, b.name),
        h('button', { type: 'button', class: 'btn-small', onclick: () => { editing = b; color = b.color; paint(); content.querySelector('.biz-form')?.scrollIntoView?.({ block: 'nearest' }); } }, 'Edit'),
        list.length > 1 ? h('button', { type: 'button', class: 'btn-small btn-danger', onclick: () => removeIt(b, paint) }, 'Remove') : null)),
      h('div', { class: 'biz-form' },
        h('strong', null, editing ? `Edit “${editing.name}”` : 'Add a company or project'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), name),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Colour'), swatches),
        h('label', { class: 'rv-check' }, vat, h('span', null, 'VAT registered')),
        docs,
        h('div', { class: 'btn-row' }, save, editing ? h('button', { type: 'button', onclick: () => { editing = null; paint(); } }, 'Cancel edit') : null)));
  };
  paint();
  await choose({ title: 'Companies and projects', content, buttons: [{ label: 'Done', value: 'done', class: 'btn-primary' }] });
  void currentBusiness;
}
