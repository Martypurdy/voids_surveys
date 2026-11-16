// Minimal .xlsx writer (Excel / Google Sheets / LibreOffice). No library: an .xlsx is zipped XML.
//
//   buildXlsx({ sheets: [{ name, cols: [{ w }], rows: [[cell, …]], freeze, landscape, merges, validations, autoFilter }] })
//
// A cell is a string, a number, a boolean, null, or { v, f, s, link }:
//   v     the value (for a formula, the cached result shown before Excel recalculates)
//   f     a formula without the leading "=" (the workbook is set to recalculate when opened)
//   s     a style: a preset name from STYLE, or { font, fill, border, fmt, wrap, h, v }
//   link  a web address (the cell becomes a clickable link)
import { zipFiles } from './zip.js';

const esc = (s) => String(s ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export const cellRef = (row, col) => `${colName(col)}${row + 1}`;

// ---------- styles ----------
// fonts: 0 normal, 1 bold, 2 bold white, 3 link, 4 title, 5 muted note
const FONTS = [
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>',
  '<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Calibri"/><family val="2"/></font>',
  '<font><b/><sz val="15"/><color rgb="FF1F5F8B"/><name val="Calibri"/><family val="2"/></font>',
  '<font><i/><sz val="10"/><color rgb="FF5A6672"/><name val="Calibri"/><family val="2"/></font>',
];
// fills: 0 none, 1 gray125 (required by Excel), 2 header blue, 3 total grey, 4 input yellow
const FILLS = [
  '<fill><patternFill patternType="none"/></fill>',
  '<fill><patternFill patternType="gray125"/></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1F5F8B"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EDF2"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF6D6"/><bgColor indexed="64"/></patternFill></fill>',
];
const BORDERS = [
  '<border><left/><right/><top/><bottom/><diagonal/></border>',
  '<border><left style="thin"><color rgb="FFBFC6CE"/></left><right style="thin"><color rgb="FFBFC6CE"/></right><top style="thin"><color rgb="FFBFC6CE"/></top><bottom style="thin"><color rgb="FFBFC6CE"/></bottom><diagonal/></border>',
];
const MONEY = 164;
export const STYLE = {
  title: { font: 4 },
  note: { font: 5, wrap: 1 },
  bold: { font: 1 },
  head: { font: 2, fill: 2, border: 1, wrap: 1, v: 'center' },
  cell: { border: 1, wrap: 1, v: 'top' },
  num: { border: 1, v: 'top' },
  money: { border: 1, fmt: MONEY, v: 'top' },
  link: { font: 3, border: 1, wrap: 1, v: 'top' },
  total: { font: 1, fill: 3, border: 1 },
  totalMoney: { font: 1, fill: 3, border: 1, fmt: MONEY },
  inText: { fill: 4, border: 1, wrap: 1, v: 'top' },
  inNum: { fill: 4, border: 1, v: 'top' },
  inMoney: { fill: 4, border: 1, fmt: MONEY, v: 'top' },
};

class Styles {
  constructor() { this.xfs = [{}]; this.map = new Map([['{}', 0]]); }
  index(spec) {
    const key = JSON.stringify(spec || {});
    if (!this.map.has(key)) { this.map.set(key, this.xfs.length); this.xfs.push(spec); }
    return this.map.get(key);
  }
  xml() {
    const xf = (s) => {
      const align = s.wrap || s.h || s.v ? `<alignment${s.h ? ` horizontal="${s.h}"` : ''}${s.v ? ` vertical="${s.v}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>` : '';
      const attrs = ` numFmtId="${s.fmt || 0}" fontId="${s.font || 0}" fillId="${s.fill || 0}" borderId="${s.border || 0}" xfId="0"`
        + `${s.fmt ? ' applyNumberFormat="1"' : ''}${s.font ? ' applyFont="1"' : ''}${s.fill ? ' applyFill="1"' : ''}${s.border ? ' applyBorder="1"' : ''}${align ? ' applyAlignment="1"' : ''}`;
      return align ? `<xf${attrs}>${align}</xf>` : `<xf${attrs}/>`;
    };
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + `<numFmts count="1"><numFmt numFmtId="${MONEY}" formatCode="&quot;£&quot;#,##0.00;[Red]\\-&quot;£&quot;#,##0.00"/></numFmts>`
      + `<fonts count="${FONTS.length}">${FONTS.join('')}</fonts>`
      + `<fills count="${FILLS.length}">${FILLS.join('')}</fills>`
      + `<borders count="${BORDERS.length}">${BORDERS.join('')}</borders>`
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + `<cellXfs count="${this.xfs.length}">${this.xfs.map(xf).join('')}</cellXfs>`
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>';
  }
}

// ---------- cells ----------
function cellXml(ref, cell, styles, links) {
  if (cell == null || cell === '') return '';
  let v = cell, f = null, link = null, spec = null;
  if (typeof cell === 'object') {
    ({ v, f = null, link = null } = cell);
    spec = typeof cell.s === 'string' ? STYLE[cell.s] : cell.s;
  }
  if (link && /^https?:\/\//i.test(link) && link.length < 2000) {
    links.push({ ref, url: link });
    if (!spec) spec = STYLE.link;
  }
  const s = styles.index(spec || {});
  const a = ` r="${ref}"${s ? ` s="${s}"` : ''}`;
  if (f != null) {
    const formula = `<f>${esc(f)}</f>`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c${a}>${formula}<v>${v}</v></c>`;
    return `<c${a} t="str">${formula}<v>${esc(v ?? '')}</v></c>`;
  }
  if (v == null || v === '') return s ? `<c${a}/>` : '';
  if (typeof v === 'number') return Number.isFinite(v) ? `<c${a}><v>${v}</v></c>` : '';
  if (typeof v === 'boolean') return `<c${a} t="b"><v>${v ? 1 : 0}</v></c>`;
  return `<c${a} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function sheetXml(sheet, styles) {
  const links = [];
  const rows = sheet.rows || [];
  const maxCols = Math.max(1, ...rows.map((r) => (Array.isArray(r) ? r : r.cells).length));
  const rowsXml = rows.map((row, ri) => {
    const cells = Array.isArray(row) ? row : row.cells;
    const ht = !Array.isArray(row) && row.h ? ` ht="${row.h}" customHeight="1"` : '';
    const inner = cells.map((c, ci) => cellXml(cellRef(ri, ci), c, styles, links)).join('');
    return inner || ht ? `<row r="${ri + 1}"${ht}>${inner}</row>` : '';
  }).join('');

  const fz = sheet.freeze;
  const pane = fz && (fz.row || fz.col)
    ? `<pane${fz.col ? ` xSplit="${fz.col}"` : ''}${fz.row ? ` ySplit="${fz.row}"` : ''} topLeftCell="${cellRef(fz.row || 0, fz.col || 0)}" activePane="${fz.row && fz.col ? 'bottomRight' : fz.row ? 'bottomLeft' : 'topRight'}" state="frozen"/>`
    : '';
  const cols = sheet.cols?.length
    ? `<cols>${sheet.cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w || 12}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  const vals = sheet.validations?.length
    ? `<dataValidations count="${sheet.validations.length}">${sheet.validations.map((d) => `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${d.ref}"><formula1>"${esc(d.list)}"</formula1></dataValidation>`).join('')}</dataValidations>`
    : '';
  const hl = links.length ? `<hyperlinks>${links.map((l, i) => `<hyperlink ref="${l.ref}" r:id="rId${i + 1}"/>`).join('')}</hyperlinks>` : '';
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
    + `<dimension ref="A1:${cellRef(Math.max(0, rows.length - 1), maxCols - 1)}"/>`
    + `<sheetViews><sheetView workbookViewId="0"${sheet.hideGrid ? ' showGridLines="0"' : ''}>${pane}</sheetView></sheetViews>`
    + '<sheetFormatPr defaultRowHeight="15"/>'
    + cols
    + `<sheetData>${rowsXml}</sheetData>`
    + (sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : '')
    + merges + vals + hl
    + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>'
    + `<pageSetup paperSize="9" orientation="${sheet.landscape === false ? 'portrait' : 'landscape'}" fitToWidth="1" fitToHeight="0"/>`
    + '</worksheet>';
  return { xml, links };
}

const safeName = (name, used) => {
  let n = String(name || 'Sheet').replace(/[\[\]:*?/\\]/g, '-').trim().slice(0, 31) || 'Sheet';
  let i = 2;
  const base = n;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
};

/** Build the workbook. Returns a Blob. */
export async function buildXlsx({ sheets }) {
  const styles = new Styles();
  const used = new Set();
  const names = sheets.map((s) => safeName(s.name, used));
  const parts = sheets.map((s) => sheetXml(s, styles));

  const files = [];
  const W = 'http://schemas.openxmlformats.org/officeDocument/2006';
  files.push({
    name: '[Content_Types].xml',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>',
  });
  files.push({
    name: '_rels/.rels',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + `<Relationship Id="rId1" Type="${W}/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  });
  files.push({
    name: 'xl/workbook.xml',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${W}/relationships">`
      + `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>`
      + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
  });
  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${W}/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="${W}/relationships/styles" Target="styles.xml"/></Relationships>`,
  });
  parts.forEach((p, i) => {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: p.xml });
    if (p.links.length) {
      files.push({
        name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
          + p.links.map((l, k) => `<Relationship Id="rId${k + 1}" Type="${W}/relationships/hyperlink" Target="${esc(l.url)}" TargetMode="External"/>`).join('')
          + '</Relationships>',
      });
    }
  });
  files.push({ name: 'xl/styles.xml', data: styles.xml() }); // last: every style used by the sheets is registered by now
  const blob = await zipFiles(files);
  return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
