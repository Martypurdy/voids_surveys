// Accountancy: receipts by UK tax year. Scan or choose receipts (read on the device), check each one, and see spending by
// HMRC expense heading per month and per year. Everything is stored on this device only.
import { h, toast, choose, busy, pageHeader, confirmDialog } from '../ui.js';
import { openCamera, cameraSupported } from '../camera.js';
import { allCategories, UNSORTED, categoryOf, currentTaxYear, taxYearStart, taxYearLabel, monthLabel } from '../accounts/hmrc.js';
import { listReceipts, newReceipt, deleteReceipt, storeReceiptImage, categoryForSupplier, knownSuppliers, getSettings, setSettings, getRules, forgetRule, loadCustomCategories, addCustomCategory, removeCustomCategory,
  loadBusinesses, getBusinesses, businessOf, currentBusiness, selectBusiness, addBusiness, updateBusiness, removeBusiness, BUSINESS_COLORS, inkFor } from '../accounts/store.js';
import { yearTotals, receiptParts, receiptsInYear, money } from '../accounts/totals.js';
import { parseReceiptText } from '../accounts/parse.js';
import { reviewReceipt } from './receiptReview.js';

export default async function accounts(root) {
  const settings = getSettings();
  await loadCustomCategories();
  await loadBusinesses();
  let biz = currentBusiness();
  let allReceipts = await listReceipts();
  const mine = () => allReceipts.filter((r) => businessOf(r) === biz.id);
  let receipts = mine(); // the receipts of the business being worked in
  let year = settings.year ?? currentTaxYear();
  let tab = 'receipts';
  let filterCat = '';
  let filterText = '';

  const body = h('div', { class: 'acc-body' });
  const summary = h('div', { class: 'acc-summary' });
  const yearSel = h('select', { 'aria-label': 'Tax year', onchange: (e) => { year = Number(e.target.value); setSettings({ year }); render(); } });
  const vatBox = h('input', { type: 'checkbox', checked: biz.vatRegistered, onchange: async (e) => { biz = await updateBusiness(biz.id, { vatRegistered: e.target.checked }); render(); } });

  const reload = async () => { allReceipts = await listReceipts(); receipts = mine(); render(); };
  const vatRegistered = () => biz.vatRegistered;

  // ---------- adding ----------
  /** Read each picture on the device, then show it for checking, one at a time. */
  async function scanBatch(blobs) {
    if (!blobs.length) return;
    const { readReceipt, closeScanner } = await import('../accounts/ocr.js');
    const known = await knownSuppliers(biz.id);
    const entries = blobs.map((blob) => ({ blob, receipt: newReceipt({ source: 'scan', businessId: biz.id }), flags: {}, error: '', ready: null, progress: '' }));
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
          e.receipt.category = (await categoryForSupplier(p.supplier, biz.id)) || '';
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
    const receipt = newReceipt({ date: '', source: 'manual', businessId: biz.id });
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
      h('option', { value: '' }, 'All categories'), allCategories().map((c) => h('option', { value: c.key }, c.short)), h('option', { value: '__none' }, UNSORTED.label));
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
      const blob = await buildXlsx(receiptsWorkbook(receipts, year, vatRegistered(), biz.name));
      progress.close();
      await offerFile(blob, `Receipts ${taxYearLabel(year).replace('/', '-')} - ${biz.name.replace(/[\\/:*?"<>|]+/g, '')}.xlsx`, 'Receipts');
    } catch (e) {
      console.error(e);
      progress.close();
      toast(`Export failed: ${e.message}`);
    }
  }

  async function manageRules() {
    const rules = await getRules(biz.id);
    const entries = Object.entries(rules);
    const content = h('div', null, entries.length
      ? entries.map(([key, v]) => h('div', { class: 'lib-row' }, h('span', null, `${v.name} → ${categoryOf(v.category).short}`), h('button', { type: 'button', class: 'btn-small btn-danger', onclick: async (ev) => { await forgetRule(key); ev.target.closest('.lib-row').remove(); } }, 'Forget')))
      : h('p', { class: 'hint' }, 'None yet. Once you file a receipt under a category, that supplier is filed there automatically next time.'));
    await choose({ title: `Supplier rules – ${biz.name}`, message: 'Receipts from these suppliers are filed under the category shown for this business.', content, buttons: [{ label: 'Done', value: 'done', class: 'btn-primary' }] });
  }

  async function manageCategories() {
    const content = h('div', null);
    const paint = async () => {
      const list = (await loadCustomCategories());
      const input = h('input', { type: 'text', placeholder: 'e.g. Small tools', autocapitalize: 'sentences', 'aria-label': 'New category', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); add.click(); } } });
      const add = h('button', { type: 'button', class: 'btn-small btn-primary', onclick: async () => { try { await addCustomCategory(input.value); await paint(); } catch (err) { toast(err.message); } } }, 'Add');
      content.replaceChildren(
        h('p', { class: 'hint' }, 'The usual tax return headings are always there. Add your own for things you want to see on their own, such as small tools.'),
        h('div', { class: 'rv-own' }, input, add),
        ...(list.length ? list.map((c) => h('div', { class: 'lib-row' }, h('span', null, c.label), h('button', { type: 'button', class: 'btn-small btn-danger', onclick: async () => { if (await confirmDialog(`Remove “${c.label}”? Its receipts go back to “Not sorted yet”.`, { ok: 'Remove' })) { await removeCustomCategory(c.key); await paint(); } } }, 'Remove'))) : [h('p', { class: 'hint' }, 'You have not added any yet.')]));
    };
    await paint();
    await choose({ title: 'Your categories', content, buttons: [{ label: 'Done', value: 'done', class: 'btn-primary' }] });
    receipts = await listReceipts();
    render();
  }

  // ---------- companies / projects ----------
  const bizSel = h('select', { 'aria-label': 'Company or project', onchange: (e) => { selectBusiness(e.target.value); biz = currentBusiness(); receipts = mine(); paintBiz(); render(); } });
  const bizBar = h('div', { class: 'acc-biz' }, bizSel,
    h('button', { type: 'button', class: 'btn-small', onclick: () => manageBusinesses() }, 'Add / edit'));
  const header = pageHeader('Accountancy', { back: '#/' });
  const paintBiz = () => {
    bizSel.replaceChildren(...getBusinesses().map((b) => h('option', { value: b.id }, b.name)));
    bizSel.value = biz.id;
    for (const el of [bizBar, header]) { el.style.setProperty('--biz', biz.color); el.style.setProperty('--biz-ink', inkFor(biz.color)); }
    header.dataset.biz = biz.id;
    header.querySelector('h1').textContent = `Accountancy · ${biz.name}`;
  };

  async function manageBusinesses() {
    const content = h('div', null);
    let editing = null;
    let color = BUSINESS_COLORS[getBusinesses().length % BUSINESS_COLORS.length];
    const paint = () => {
      const list = getBusinesses();
      const name = h('input', { type: 'text', placeholder: 'e.g. Smith Plumbing Ltd, or Kitchen job at 12 High St', value: editing ? editing.name : '', autocapitalize: 'words', 'aria-label': 'Business name' });
      const vat = h('input', { type: 'checkbox', checked: editing ? editing.vatRegistered : false });
      const swatches = h('div', { class: 'biz-swatches', role: 'group', 'aria-label': 'Colour' });
      const picker = h('input', { type: 'color', value: color, 'aria-label': 'Pick any colour', oninput: (e) => { color = e.target.value; paintSwatches(); } });
      const paintSwatches = () => swatches.replaceChildren(...BUSINESS_COLORS.map((c) => h('button', { type: 'button', class: 'biz-swatch', style: `background:${c}`, 'aria-label': c, 'aria-pressed': String(color.toLowerCase() === c), onclick: () => { color = c; picker.value = c; paintSwatches(); } })), picker);
      paintSwatches();
      const save = h('button', { type: 'button', class: 'btn-primary', onclick: async () => {
        try {
          if (editing) await updateBusiness(editing.id, { name: name.value, color, vatRegistered: vat.checked });
          else { const b = await addBusiness({ name: name.value, color, vatRegistered: vat.checked }); selectBusiness(b.id); }
          biz = currentBusiness();
          editing = null;
          color = BUSINESS_COLORS[getBusinesses().length % BUSINESS_COLORS.length];
          receipts = mine();
          paintBiz();
          paint();
          render();
        } catch (err) { toast(err.message); }
      } }, editing ? 'Save changes' : 'Add business');
      content.replaceChildren(
        h('p', { class: 'hint' }, 'Add each company, contractor or project you keep records for. Pick a colour: the top bar takes it, so you can see at a glance who you are adding to.'),
        ...list.map((b) => h('div', { class: 'biz-row' },
          h('span', { class: 'biz-dot', style: `background:${b.color}` }),
          h('span', { class: 'biz-name' }, b.name),
          h('button', { type: 'button', class: 'btn-small', onclick: () => { editing = b; color = b.color; paint(); } }, 'Edit'),
          list.length > 1 ? h('button', { type: 'button', class: 'btn-small btn-danger', onclick: () => removeIt(b, paint) }, 'Remove') : null)),
        h('div', { class: 'biz-form' },
          h('strong', null, editing ? `Edit “${editing.name}”` : 'Add a company or project'),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), name),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Colour'), swatches),
          h('label', { class: 'rv-check' }, vat, h('span', null, 'VAT registered')),
          h('div', { class: 'btn-row' }, save, editing ? h('button', { type: 'button', onclick: () => { editing = null; paint(); } }, 'Cancel edit') : null)));
    };
    async function removeIt(b, repaint) {
      const count = allReceipts.filter((r) => businessOf(r) === b.id).length;
      const others = getBusinesses().filter((x) => x.id !== b.id);
      let moveTo = others[0].id;
      if (count) {
        const pick = await choose({
          title: `Remove “${b.name}”?`,
          message: `It has ${count} receipt${count === 1 ? '' : 's'}. What should happen to them?`,
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
        if (biz.id === b.id) { selectBusiness(null); biz = currentBusiness(); }
        allReceipts = await listReceipts();
        receipts = mine();
        paintBiz();
        repaint();
        render();
      } catch (err) { toast(err.message); }
    }
    paint();
    await choose({ title: 'Companies and projects', content, buttons: [{ label: 'Done', value: 'done', class: 'btn-primary' }] });
    allReceipts = await listReceipts();
    receipts = mine();
    paintBiz();
    render();
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
    header,
    h('div', { class: 'content wide acc-page' },
      bizBar,
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
        h('button', { type: 'button', onclick: manageCategories }, 'My categories'),
        h('button', { type: 'button', onclick: manageRules }, 'Supplier rules')),
      h('p', { class: 'hint' }, '🔒 Receipts and their pictures stay on this device. They are read on the device too: nothing is uploaded.')));
  paintBiz();
  render();
}
