// Accountancy: receipts by UK tax year. Scan or choose receipts (read on the device), check each one, and see spending by
// HMRC expense heading per month and per year. Everything is stored on this device only.
import { h, toast, choose, busy, pageHeader } from '../ui.js';
import { openCamera, cameraSupported } from '../camera.js';
import { CATEGORIES, UNSORTED, categoryOf, currentTaxYear, taxYearStart, taxYearLabel, monthLabel } from '../accounts/hmrc.js';
import { listReceipts, newReceipt, deleteReceipt, storeReceiptImage, categoryForSupplier, knownSuppliers, getSettings, setSettings, getRules, forgetRule } from '../accounts/store.js';
import { yearTotals, receiptParts, receiptsInYear, money } from '../accounts/totals.js';
import { parseReceiptText } from '../accounts/parse.js';
import { reviewReceipt } from './receiptReview.js';

export default async function accounts(root) {
  const settings = getSettings();
  let receipts = await listReceipts();
  let year = settings.year ?? currentTaxYear();
  let tab = 'receipts';
  let filterCat = '';
  let filterText = '';

  const body = h('div', { class: 'acc-body' });
  const summary = h('div', { class: 'acc-summary' });
  const yearSel = h('select', { 'aria-label': 'Tax year', onchange: (e) => { year = Number(e.target.value); setSettings({ year }); render(); } });
  const vatBox = h('input', { type: 'checkbox', checked: settings.vatRegistered, onchange: (e) => { setSettings({ vatRegistered: e.target.checked }); render(); } });

  const reload = async () => { receipts = await listReceipts(); render(); };
  const vatRegistered = () => getSettings().vatRegistered;

  // ---------- adding ----------
  /** Read each picture on the device, then show it for checking, one at a time. */
  async function scanBatch(blobs) {
    if (!blobs.length) return;
    const { readReceipt, closeScanner } = await import('../accounts/ocr.js');
    const known = await knownSuppliers();
    const entries = blobs.map((blob) => ({ blob, receipt: newReceipt({ source: 'scan' }), flags: {}, error: '', ready: null, progress: '' }));
    let chain = Promise.resolve();
    for (const e of entries) {
      e.ready = chain = chain.then(async () => {
        try {
          e.receipt.photoId = await storeReceiptImage(e.blob);
          e.progress = 'Reading the receipt…';
          e.onProgress?.(e.progress);
          const sure = (t) => Object.values(parseReceiptText(t, { knownSuppliers: known }).flags).filter((f) => f === 'sure').length;
          const text = await readReceipt(e.blob, (m) => {
            e.progress = m.status === 'recognizing text' ? `Reading the receipt… ${Math.round((m.progress || 0) * 100)}%` : 'Getting the scanner ready (the first time only)…';
            e.onProgress?.(e.progress);
          }, sure, 4);
          const p = parseReceiptText(text, { knownSuppliers: known });
          Object.assign(e.receipt, { date: p.date, supplier: p.supplier, total: p.total, vat: p.vat });
          e.receipt.vatOn = vatRegistered() && p.vat != null && p.vat > 0; // a VAT-registered business ticks it when VAT was found
          e.flags = p.flags;
          e.receipt.category = (await categoryForSupplier(p.supplier)) || '';
        } catch (err) {
          e.error = err.message;
        }
      });
    }
    for (let i = 0; i < entries.length; i++) {
      const res = await reviewReceipt(entries[i], { index: i, count: entries.length, mode: 'scan' });
      await new Promise((r) => setTimeout(r, 200)); // let the phone's back-button history settle before the next screen opens
      if (res === 'stop') {
        // discard the pictures of the ones not looked at
        await Promise.allSettled(entries.slice(i + 1).map(async (x) => { await x.ready; if (x.receipt) await deleteReceipt(x.receipt); }));
        break;
      }
    }
    await closeScanner();
    await reload();
  }

  const galleryInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => { const files = [...e.target.files]; e.target.value = ''; scanBatch(files); } });
  const cameraInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => { const files = [...e.target.files]; e.target.value = ''; scanBatch(files); } });

  async function scanWithCamera() {
    if (!cameraSupported()) return cameraInput.click();
    const shots = [];
    const { error } = await openCamera({ onCapture: (blob) => shots.push(blob), onNative: () => cameraInput.click(), onGallery: () => galleryInput.click() });
    if (error) {
      await choose({
        title: 'Camera not available',
        message: 'The camera couldn’t be started. You can choose receipt pictures instead, or add one by hand.',
        buttons: [{ label: '🖼 Choose from gallery', value: 'g', class: 'btn-primary btn-big', onClick: () => galleryInput.click() }, { label: 'Cancel', value: null }],
      });
      return;
    }
    if (shots.length) scanBatch(shots);
  }

  async function addByHand() {
    const receipt = newReceipt({ date: '', source: 'manual' });
    const res = await reviewReceipt({ receipt, flags: {} }, { mode: 'new' });
    if (res === 'saved') await reload();
  }

  async function edit(r) {
    const res = await reviewReceipt({ receipt: structuredClone(r), flags: {} }, { mode: 'edit' });
    if (res !== 'stop') await reload();
  }

  // ---------- receipts tab ----------
  function receiptsTab(list) {
    const catSel = h('select', { 'aria-label': 'Category', onchange: (e) => { filterCat = e.target.value; render(); } },
      h('option', { value: '' }, 'All categories'), CATEGORIES.map((c) => h('option', { value: c.key }, c.short)), h('option', { value: '__none' }, UNSORTED.label));
    catSel.value = filterCat;
    const search = h('input', { type: 'search', placeholder: 'Search supplier or notes', value: filterText, 'aria-label': 'Search', oninput: (e) => { filterText = e.target.value; renderList(); } });
    const listEl = h('div', { class: 'acc-list' });
    const renderList = () => {
      const shown = list.filter((r) => (!filterCat || (filterCat === '__none' ? r.category === '' : r.category === filterCat)) && (!filterText || `${r.supplier} ${r.notes}`.toLowerCase().includes(filterText.toLowerCase())));
      let month = '';
      const els = [];
      for (const r of shown) {
        const m = r.date.slice(0, 7);
        if (m !== month) { month = m; els.push(h('h3', { class: 'acc-month' }, monthLabel(m))); }
        const p = receiptParts(r, vatRegistered());
        els.push(h('button', { type: 'button', class: 'acc-row', onclick: () => edit(r) },
          h('span', { class: 'acc-date' }, r.date.slice(8, 10) + '/' + r.date.slice(5, 7)),
          h('span', { class: 'acc-what' }, h('strong', null, r.supplier || 'No supplier'), h('small', null, categoryOf(r.category).short, r.photoId ? ' · 📷' : '', r.notes ? ` · ${r.notes}` : '')),
          h('span', { class: 'acc-amt' }, money(p.total), p.vat ? h('small', null, `VAT ${money(p.vat)}`) : null)));
      }
      if (!els.length) els.push(h('p', { class: 'hint' }, list.length ? 'No receipts match.' : 'No receipts yet for this tax year. Scan some, or add one by hand.'));
      listEl.replaceChildren(...els);
    };
    renderList();
    return [h('div', { class: 'acc-filters' }, catSel, search), listEl];
  }

  // ---------- totals tab ----------
  function totalsTab() {
    const t = yearTotals(receipts, year, { vatRegistered: vatRegistered() });
    if (!t.count) return [h('p', { class: 'hint' }, 'No receipts in this tax year yet.')];
    const months = t.months.filter((m) => t.monthTotals[m]); // only months with spending, in tax year order
    const head = h('tr', null, h('th', null, 'Category'), months.map((m) => h('th', null, monthLabel(m).replace(/ \d{4}$/, (y) => `'${y.slice(-2)}`))), h('th', null, 'Year'));
    const rows = t.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r.short), months.map((m) => h('td', null, r.byMonth[m] ? money(r.byMonth[m]) : '')), h('td', { class: 'acc-total' }, money(r.total))));
    const foot = h('tr', { class: 'acc-foot' }, h('th', null, 'Total'), months.map((m) => h('td', null, t.monthTotals[m] ? money(t.monthTotals[m]) : '')), h('td', { class: 'acc-total' }, money(t.total)));
    const cards = t.rows.map((r) => h('div', { class: 'acc-cat' }, h('span', null, r.label), h('strong', null, money(r.total))));
    return [
      h('div', { class: 'calc-wrap acc-scroll' }, h('table', { class: 'acc-table' }, h('thead', null, head), h('tbody', null, rows), h('tfoot', null, foot))),
      h('h3', { class: 'acc-month' }, 'Year by tax return heading'),
      h('div', { class: 'card card-body acc-cats' }, cards),
      h('p', { class: 'hint' }, vatRegistered() ? 'Costs are shown without the VAT you can reclaim. The VAT is totalled separately above.' : 'Costs are the full amounts paid, because you are not VAT registered. Switch “I’m VAT registered” on to separate out the VAT.'),
    ];
  }

  // ---------- export ----------
  async function exportYear() {
    const list = receiptsInYear(receipts, year);
    if (!list.length) return toast('No receipts in this tax year yet');
    const progress = busy('Building the spreadsheet…');
    try {
      const { receiptsWorkbook } = await import('../accounts/export.js');
      const { buildXlsx } = await import('../export/xlsx.js');
      const { offerFile } = await import('../export/deliver.js');
      const blob = await buildXlsx(receiptsWorkbook(receipts, year, vatRegistered()));
      progress.close();
      await offerFile(blob, `Receipts ${taxYearLabel(year).replace('/', '-')}.xlsx`, 'Receipts');
    } catch (e) {
      console.error(e);
      progress.close();
      toast(`Export failed: ${e.message}`);
    }
  }

  async function manageRules() {
    const rules = await getRules();
    const entries = Object.entries(rules);
    const content = h('div', null, entries.length
      ? entries.map(([key, v]) => h('div', { class: 'lib-row' }, h('span', null, `${v.name} → ${categoryOf(v.category).short}`), h('button', { type: 'button', class: 'btn-small btn-danger', onclick: async (ev) => { await forgetRule(key); ev.target.closest('.lib-row').remove(); } }, 'Forget')))
      : h('p', { class: 'hint' }, 'None yet. Once you file a receipt under a category, that supplier is filed there automatically next time.'));
    await choose({ title: 'Supplier rules', message: 'Receipts from these suppliers are filed under the category shown.', content, buttons: [{ label: 'Done', value: 'done', class: 'btn-primary' }] });
  }

  // ---------- the page ----------
  function render() {
    const years = new Set([currentTaxYear(), year, ...receipts.map((r) => taxYearStart(r.date)).filter((y) => y != null)]);
    yearSel.replaceChildren(...[...years].sort((a, b) => b - a).map((y) => h('option', { value: String(y) }, `Tax year ${taxYearLabel(y)}`)));
    yearSel.value = String(year);
    vatBox.checked = vatRegistered();
    const list = receiptsInYear(receipts, year);
    const t = yearTotals(receipts, year, { vatRegistered: vatRegistered() });
    summary.replaceChildren(
      h('div', { class: 'acc-stat' }, h('strong', null, String(t.count)), h('span', null, t.count === 1 ? 'receipt' : 'receipts')),
      h('div', { class: 'acc-stat' }, h('strong', null, money(t.total)), h('span', null, vatRegistered() ? 'spent (excl. VAT)' : 'spent')),
      vatRegistered() ? h('div', { class: 'acc-stat' }, h('strong', null, money(t.vat)), h('span', null, 'VAT to reclaim')) : null);
    const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'View' }, [['receipts', 'Receipts'], ['totals', 'Totals']].map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(tab === k), onclick: () => { tab = k; render(); } }, label)));
    body.replaceChildren(seg, ...(tab === 'receipts' ? receiptsTab(list) : totalsTab()));
  }

  root.append(
    pageHeader('Accountancy', { back: '#/' }),
    h('div', { class: 'content wide acc-page' },
      h('div', { class: 'acc-top' }, yearSel, h('label', { class: 'acc-vat' }, vatBox, h('span', null, 'I’m VAT registered'))),
      summary,
      h('div', { class: 'acc-add' },
        h('button', { type: 'button', class: 'btn-primary btn-big', onclick: scanWithCamera }, '📷 Scan receipts'),
        h('button', { type: 'button', class: 'btn-big', onclick: () => galleryInput.click() }, '🖼️ Choose from gallery'),
        h('button', { type: 'button', class: 'btn-big', onclick: addByHand }, '✍ Add by hand')),
      galleryInput, cameraInput,
      body,
      h('div', { class: 'btn-row acc-foot-row' },
        h('button', { type: 'button', onclick: exportYear }, '⬇ Export this year (Excel)'),
        h('button', { type: 'button', onclick: manageRules }, 'Supplier rules')),
      h('p', { class: 'hint' }, '🔒 Receipts and their pictures stay on this device. They are read on the device too: nothing is uploaded.')));
  render();
}
