// Accountancy: the expense headings (from the HMRC Self Assessment form for self-employed people) and UK tax years.
// Pure functions. A UK tax year runs from 6 April to 5 April and is named for the two years it spans, e.g. 2026/27.

/** key, label (the heading on the tax return), short (for narrow tables). */
export const CATEGORIES = [
  { key: 'costofsales', label: 'Cost of sales (materials, hardware and small tools)', short: 'Cost of sales' },
  { key: 'goods', label: 'Cost of goods bought for resale or goods used', short: 'Goods and materials' },
  { key: 'subcontractors', label: 'Construction industry – payments to subcontractors', short: 'Subcontractors' },
  { key: 'staff', label: 'Wages, salaries and other staff costs', short: 'Staff costs' },
  { key: 'travel', label: 'Car, van and travel expenses', short: 'Car, van and travel' },
  { key: 'premises', label: 'Rent, rates, power and insurance costs', short: 'Rent, rates, power, insurance' },
  { key: 'repairs', label: 'Repairs and maintenance of property and equipment', short: 'Repairs and maintenance' },
  { key: 'office', label: 'Phone, fax, stationery and other office costs', short: 'Phone and office' },
  { key: 'advertising', label: 'Advertising and business entertainment costs', short: 'Advertising' },
  { key: 'interest', label: 'Interest on bank and other loans', short: 'Loan interest' },
  { key: 'bank', label: 'Bank, credit card and other financial charges', short: 'Bank charges' },
  { key: 'baddebts', label: 'Irrecoverable debts written off', short: 'Bad debts' },
  { key: 'professional', label: 'Accountancy, legal and other professional fees', short: 'Professional fees' },
  { key: 'depreciation', label: 'Depreciation and loss or profit on sale of assets', short: 'Depreciation' },
  { key: 'other', label: 'Other business expenses', short: 'Other expenses' },
];
export const UNSORTED = { key: '', label: 'Not sorted yet', short: 'Not sorted yet' };
// Categories you add yourself (kept in the receipts store; loaded into this list when the Accountancy screen opens).
let CUSTOM = [];
export const setCustomCategories = (list) => { CUSTOM = Array.isArray(list) ? list.filter((c) => c && c.key && c.label) : []; };
export const customCategories = () => CUSTOM;
/** The built-in headings, then your own. */
export const allCategories = () => [...CATEGORIES, ...CUSTOM.map((c) => ({ key: c.key, label: c.label, short: c.label, custom: true }))];
export const categoryOf = (key) => allCategories().find((c) => c.key === key) || UNSORTED;

// ---------- tax years ----------

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** The year a tax year starts in (2026 for 2026/27) for a yyyy-mm-dd date; null if the date is not valid. */
export function taxYearStart(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return mo > 4 || (mo === 4 && d >= 6) ? y : y - 1;
}
export const taxYearLabel = (start) => `${start}/${String(start + 1).slice(2)}`;
export const taxYearRange = (start) => ({ from: isoDate(start, 4, 6), to: isoDate(start + 1, 4, 5) });
/** The tax year a date falls in, as its start year (today when no date is given). */
export const currentTaxYear = (today = new Date()) => taxYearStart(isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate()));

/** The calendar months of a tax year in order, as yyyy-mm keys: April of the start year to April of the end year. */
export function taxYearMonths(start) {
  const out = [];
  for (let i = 0; i < 13; i++) {
    const m = ((3 + i) % 12) + 1;
    out.push(`${start + (i < 9 ? 0 : 1)}-${pad(m)}`); // April to December in the start year, January to April in the next
  }
  return out;
}
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (key) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
