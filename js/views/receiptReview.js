// Accountancy: the check-and-correct screen for a receipt (full screen over the page). Used after a scan (the picture and
// what was read from it, with anything uncertain highlighted), for adding a receipt by hand, and for editing a saved one.
import { h, toast, confirmDialog, trackOverlay } from '../ui.js';
import { getPhoto } from '../db.js';
import { allCategories, UNSORTED, taxYearStart, taxYearLabel } from '../accounts/hmrc.js';
import { saveReceipt, deleteReceipt, ruleFor, categoryForSupplier, knownSuppliers, addCustomCategory, getBusinesses, businessOf, inkFor } from '../accounts/store.js';

/** A typed amount as a number: "£1,234.50" or "12,5" -> 1234.5 / 12.5; NaN when it is not one. */
export function parseMoney(v) {
  const s = String(v ?? '').trim().replace(/[£\s]/g, '');
  if (!s) return NaN;
  const t = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  const x = Number(t);
  return Number.isFinite(x) ? x : NaN;
}

const toMoneyText = (n) => (n == null || !Number.isFinite(Number(n)) ? '' : (Math.round(Number(n) * 100) / 100).toFixed(2));

/**
 * Show a receipt for checking.
 *   entry = { receipt, ready: Promise|null (resolves when the scan has filled the receipt in), flags: { date, supplier, total, vat }, error }
 *   opts  = { index, count, mode: 'scan' | 'new' | 'edit' }
 * Resolves 'saved' | 'skipped' | 'deleted' | 'stop'.
 */
export function reviewReceipt(entry, { index = 0, count = 1, mode = 'scan' } = {}) {
  return new Promise((resolve) => {
    const r = entry.receipt;
    const flags = { ...(entry.flags || {}) };
    let touchedCategory = Boolean(r.category) && mode !== 'scan';
    let url = null;
    let untrack = () => {};

    // A field the scanner was unsure about is highlighted, with a tick to say "I have checked this": ticking it (or
    // correcting it) turns the box green. orig remembers what the scanner thought, so unticking brings the warning back.
    const orig = { ...flags };
    const accepted = {};
    const unsure = (k) => Boolean(orig[k]) && orig[k] !== 'sure';
    const fieldBox = (label, input, key, hint) => {
      const accept = h('input', { type: 'checkbox', 'aria-label': `I have checked the ${label.toLowerCase()}` });
      const acceptRow = h('label', { class: 'rv-accept' }, accept, h('span', null, 'I have checked this'));
      const box = h('div', { class: 'field rv-field' }, h('label', { class: 'rv-fieldlabel' }, h('span', { class: 'field-label' }, label), input), hint ? h('small', { class: 'rv-hint' }, hint) : null, acceptRow);
      const paint = () => {
        box.dataset.flag = accepted[key] ? 'accepted' : flags[key] && flags[key] !== 'sure' ? flags[key] : '';
        acceptRow.hidden = !unsure(key);
        accept.checked = Boolean(accepted[key]);
      };
      paint();
      const markDone = () => { if (unsure(key)) accepted[key] = true; flags[key] = 'sure'; paint(); };
      input.addEventListener('input', markDone); // correcting it counts as checking it
      accept.addEventListener('change', () => { accepted[key] = accept.checked; flags[key] = accept.checked ? 'sure' : orig[key]; paint(); });
      box.paint = paint;
      box.markDone = markDone;
      return box;
    };

    const date = h('input', { type: 'date', value: r.date || '' });
    const supplier = h('input', { type: 'text', value: r.supplier || '', list: 'rv-suppliers', autocapitalize: 'words', placeholder: 'e.g. Screwfix' });
    const datalist = h('datalist', { id: 'rv-suppliers' });
    const loadNames = () => knownSuppliers(r.businessId).then((names) => datalist.replaceChildren(...names.map((n) => h('option', { value: n }))));
    loadNames();
    const total = h('input', { type: 'text', inputmode: 'decimal', value: toMoneyText(r.total), placeholder: '0.00' });
    const vatOn = h('input', { type: 'checkbox', checked: Boolean(r.vatOn) });
    const vat = h('input', { type: 'text', inputmode: 'decimal', value: toMoneyText(r.vat), placeholder: '0.00' });
    const twenty = h('button', { type: 'button', class: 'btn-small', onclick: () => { const t = parseMoney(total.value); if (!(t > 0)) return toast('Type the total first'); vat.value = toMoneyText((t * 20) / 120); boxVat.markDone(); } }, '20% of total');
    const category = h('select', null);
    const paintOptions = () => category.replaceChildren(h('option', { value: '' }, UNSORTED.label), ...allCategories().map((c) => h('option', { value: c.key }, c.label)));
    paintOptions();
    category.value = r.category || '';
    // your own category: type a name and add it; it joins the list for every receipt from now on
    const newCat = h('input', { type: 'text', placeholder: 'Or type your own category…', autocapitalize: 'sentences', 'aria-label': 'Your own category', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); addOwn(); } } });
    const addOwn = async () => {
      try {
        const c = await addCustomCategory(newCat.value);
        paintOptions();
        category.value = c.key;
        touchedCategory = true;
        newCat.value = '';
        ruleNote.textContent = `“${c.label}” added`;
      } catch (err) { toast(err.message); }
    };
    const ownRow = h('div', { class: 'rv-own' }, newCat, h('button', { type: 'button', class: 'btn-small', onclick: addOwn }, 'Add'));
    category.addEventListener('change', () => { touchedCategory = true; ruleNote.textContent = ''; });
    const ruleNote = h('small', { class: 'rv-hint' });
    const notes = h('textarea', { rows: 2, placeholder: 'What it was for (optional)', autocapitalize: 'sentences' }, r.notes || '');

    const yearNote = h('small', { class: 'rv-hint' });
    const paintYear = () => { const y = taxYearStart(date.value); yearNote.textContent = y ? `Tax year ${taxYearLabel(y)}` : ''; };
    date.addEventListener('input', paintYear);
    paintYear();

    // a supplier you have filed before is filed the same way again
    const applyRule = async () => {
      if (touchedCategory || !supplier.value.trim()) return;
      const c = await categoryForSupplier(supplier.value, r.businessId);
      if (c && !touchedCategory) { category.value = c; ruleNote.textContent = 'Filed here automatically because of this supplier'; }
    };
    supplier.addEventListener('change', applyRule);
    supplier.addEventListener('blur', applyRule);

    const boxVat = fieldBox('VAT amount (£)', vat, 'vat');
    const vatBlock = h('div', { class: 'rv-vat' }, boxVat, twenty);
    const showVat = () => { vatBlock.hidden = !vatOn.checked; };
    vatOn.addEventListener('change', showVat);
    showVat();

    const status = h('p', { class: 'rv-status', 'aria-live': 'polite' });
    const img = h('img', { class: 'rv-img', alt: 'Receipt' });
    const imgWrap = h('div', { class: 'rv-imgwrap' }, img);
    const loadImage = async () => {
      if (!r.photoId) { imgWrap.hidden = true; return; }
      const rec = await getPhoto(r.photoId);
      if (!rec) { imgWrap.hidden = true; return; }
      url = URL.createObjectURL(rec.blob);
      img.src = url;
      imgWrap.hidden = false;
    };
    img.addEventListener('click', () => imgWrap.classList.toggle('rv-big'));

    const fill = () => {
      date.value = r.date || '';
      supplier.value = r.supplier || '';
      total.value = toMoneyText(r.total);
      vat.value = toMoneyText(r.vat);
      vatOn.checked = Boolean(r.vatOn);
      if (r.category) category.value = r.category;
      Object.assign(flags, entry.flags || {});
      Object.assign(orig, entry.flags || {});
      for (const k of Object.keys(accepted)) delete accepted[k];
      for (const b of [boxDate, boxSupplier, boxTotal, boxVat]) b.paint();
      paintYear();
      showVat();
    };

    const boxDate = fieldBox('Date', date, 'date');
    const boxSupplier = fieldBox('Supplier', supplier, 'supplier');
    const boxTotal = fieldBox('Total paid (£)', total, 'total');

    const close = (result) => {
      if (!overlay.isConnected) return;
      overlay.remove();
      if (url) URL.revokeObjectURL(url);
      document.body.classList.remove('no-scroll');
      untrack();
      resolve(result);
    };

    const save = async () => {
      const t = parseMoney(total.value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value) || taxYearStart(date.value) == null) return toast('Choose the date on the receipt');
      if (!(t > 0)) return toast('Type the total that was paid');
      let v = parseMoney(vat.value);
      if (vatOn.checked && Number.isFinite(v) && v > t) return toast('The VAT cannot be more than the total');
      r.date = date.value;
      r.supplier = supplier.value.trim();
      r.total = Math.round(t * 100) / 100;
      r.vatOn = vatOn.checked;
      r.vat = vatOn.checked && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
      r.category = category.value;
      r.notes = notes.value.trim();
      await saveReceipt(r);
      if (r.supplier && r.category) await ruleFor(r.supplier, r.category, r.businessId);
      close('saved');
    };

    const buttons = [
      h('button', { type: 'button', class: 'btn-primary btn-big', onclick: save }, mode === 'scan' && index < count - 1 ? 'Save and next ›' : 'Save'),
    ];
    if (mode === 'scan') {
      buttons.push(h('button', { type: 'button', class: 'btn-big', onclick: async () => { await deleteReceipt(r); close('skipped'); } }, 'Skip this one'));
    }
    if (mode === 'edit') {
      buttons.push(h('button', { type: 'button', class: 'btn-danger btn-big', onclick: async () => { if (!(await confirmDialog('Delete this receipt and its picture?', { ok: 'Delete' }))) return; await deleteReceipt(r); close('deleted'); } }, 'Delete'));
      buttons.push(h('button', { type: 'button', class: 'btn-big', onclick: () => close('stop') }, 'Cancel'));
    }
    if (mode === 'new') buttons.push(h('button', { type: 'button', class: 'btn-big', onclick: () => close('stop') }, 'Cancel'));

    const title = mode === 'scan' ? `Receipt ${index + 1} of ${count}` : mode === 'edit' ? 'Edit receipt' : 'Add a receipt';
    const stop = async () => {
      if (mode === 'scan' && count > 1 && !(await confirmDialog(`Stop here? ${count - index} receipt${count - index === 1 ? '' : 's'} not yet saved will be discarded.`, { ok: 'Stop', danger: true }))) return;
      if (mode === 'scan') await deleteReceipt(r);
      close('stop');
    };

    // the business this receipt is for: a bar like the tax year one, in the business's colour
    r.businessId = businessOf(r);
    const bizSel = h('select', { 'aria-label': 'Company or project' }, getBusinesses().map((b) => h('option', { value: b.id }, b.name)));
    bizSel.value = r.businessId;
    const bizBar = h('div', { class: 'rv-biz' }, bizSel);
    const paintBiz = () => {
      const b = getBusinesses().find((x) => x.id === r.businessId);
      bizBar.style.setProperty('--biz', b?.color || '#1f5f8b');
      bizBar.style.setProperty('--biz-ink', inkFor(b?.color));
    };
    paintBiz();
    bizSel.addEventListener('change', () => { r.businessId = bizSel.value; paintBiz(); touchedCategory = false; loadNames(); applyRule(); });

    const overlay = h('div', { class: 'rv-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'rv-card' },
        bizBar,
        h('div', { class: 'rv-head' }, h('strong', null, title), h('button', { type: 'button', class: 'btn-small', onclick: stop, 'aria-label': 'Close' }, '✕')),
        status,
        imgWrap,
        h('div', { class: 'rv-form' },
          boxDate, yearNote,
          boxSupplier, datalist,
          boxTotal,
          h('label', { class: 'rv-check' }, vatOn, h('span', null, 'This receipt has VAT on it')),
          vatBlock,
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Category (tax return heading)'), category), ownRow, ruleNote,
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Notes'), notes)),
        h('div', { class: 'rv-buttons' }, buttons)));
    document.body.append(overlay);
    document.body.classList.add('no-scroll');
    untrack = trackOverlay(() => { untrack = () => {}; stop(); });
    loadImage();

    // a scan may still be running: show that, then fill the form in when it finishes
    if (entry.ready) {
      overlay.classList.add('rv-busy');
      status.textContent = entry.progress || 'Reading the receipt…';
      entry.onProgress = (t) => { status.textContent = t; };
      entry.ready.then(() => {
        overlay.classList.remove('rv-busy');
        status.textContent = entry.error ? `${entry.error} Please fill the details in.` : 'Please check what was read. Highlighted boxes are guesses.';
        fill();
        loadImage();
        applyRule();
      });
    } else if (mode === 'edit') {
      status.textContent = '';
    }
  });
}
