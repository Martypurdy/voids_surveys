// Materials & labour costing: help pop-ups – the "About prices" info, a one-time
// introduction, and the warning for suppliers whose prices can't be read (Screwfix).
import { h, choose } from '../ui.js';

const INTRO_KEY = 'voids.costIntroSeen';
const NO_PRICE_WARN_KEY = 'voids.hideNoPriceWarning';

/** Suppliers whose websites fill in prices from a link (tested). */
export const PRICE_SUPPLIERS = ['Wickes', 'B&Q', 'Selco', 'Toolstation'];
/** Suppliers that block apps from reading their prices – the price is typed. */
export const NO_PRICE_SUPPLIERS = ['Screwfix', 'Travis Perkins'];

const flag = (key) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
const setFlag = (key) => { try { localStorage.setItem(key, '1'); } catch { /* storage blocked */ } };

const list = (items) => h('ul', { class: 'help-list' }, items.map((i) => h('li', null, i)));

/** ℹ️ About prices & product links. */
export function showPriceInfo() {
  return choose({
    title: 'ℹ️ Prices & product links',
    content: h('div', { class: 'help' },
      h('h4', null, '🔗 Adding products from a link'),
      list([
        'Copy the product’s link on the supplier’s website or app (Share › Copy link) and tap “Add from a product link”, or use Share › PropertyPad.',
        'The supplier, item name, product code and unit are always filled in from the link.',
      ]),
      h('h4', null, '✓ Prices filled in automatically'),
      h('p', null, `${PRICE_SUPPLIERS.join(', ')} – and many other shops that publish their product details.`),
      h('h4', null, '✎ Prices you type yourself'),
      h('p', null, `${NO_PRICE_SUPPLIERS.join(' and ')} block apps from reading their prices. The item, code and supplier still fill in; the cursor goes to the Price box – type the price shown in their app or website (tap the line’s 🔗 › Open the supplier’s page to see it).`),
      h('h4', null, '£ VAT'),
      p_('Shop websites show prices including VAT. On a “+ VAT” sheet the app takes the VAT off for you.'),
      h('h4', null, '↻ Prices change'),
      p_('Prices are the website’s public price on the day – not your trade or account price. Use “Update prices” to re-check linked lines.'),
      h('h4', null, '🚚 Delivery & lead times'),
      p_('Material prices don’t include delivery or lead times – add them with “+ Add delivery” so they’re in the totals.')),
    buttons: [{ label: 'OK', value: true, class: 'btn-primary btn-big' }],
  });
}
const p_ = (t) => h('p', null, t);

/** First time the costing sheet is opened on this device: a short introduction. */
export async function maybeShowIntro() {
  if (flag(INTRO_KEY)) return;
  setFlag(INTRO_KEY);
  await choose({
    title: '🧮 Materials & labour costing',
    content: h('div', { class: 'help' },
      p_('Cost a job line by line – it works like a spreadsheet:'),
      list([
        'Type one item per line: item, supplier, code, quantity, unit, price and markup. Totals work themselves out as you type.',
        'A new empty line appears when you use the last one. ✕ removes a line (with Undo).',
        'Swipe the table sideways to see every column. Markup: tap % / £ to switch.',
        '🔗 Add from a product link fills a line in for you (prices from Wickes, B&Q, Selco, Toolstation and more – Screwfix prices are typed).',
        '🚚 + Add delivery adds delivery charges and lead times to the totals.',
        'Choose whether your prices are + VAT, Inc VAT or No VAT at the top.',
      ]),
      h('p', { class: 'hint' }, 'You can read this again any time with ℹ️ at the bottom of the page.')),
    buttons: [{ label: 'Got it', value: true, class: 'btn-primary btn-big' }],
  });
}

/** Warning for the first link from a supplier whose prices can't be read (unless switched off). */
export async function maybeWarnNoPrice(supplier) {
  if (flag(NO_PRICE_WARN_KEY)) return;
  const box = h('input', { type: 'checkbox' });
  await choose({
    title: `⚠️ ${supplier} prices need typing`,
    content: h('div', { class: 'help' },
      p_(`${supplier} doesn’t let apps read its prices, so the price can’t be filled in automatically.`),
      list([
        'The item, product code and supplier have been filled in.',
        `Type the price shown in the ${supplier} app or website into the Price box – the cursor is waiting there.`,
        'Tip: tap the line’s 🔗 › Open the supplier’s page to see the price.',
      ]),
      h('label', { class: 'check' }, box, 'Don’t show this warning again')),
    buttons: [{ label: 'OK', value: true, class: 'btn-primary btn-big' }],
  });
  if (box.checked) setFlag(NO_PRICE_WARN_KEY);
}
