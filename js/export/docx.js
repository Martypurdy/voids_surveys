// Minimal .docx writer (Word / Google Docs / LibreOffice). No library: a .docx is zipped XML.
//
//   buildDocx(model, { loadImage })
//
// model = {
//   title, subtitle, landscape, accent (heading colour, hex without #, default 1F5F8B),
//   meta: [[label, value], …],                      a small details table under the title
//   sections: [{
//     heading, level (1|2), pageBreak,
//     paras: [text], bullets: [text], kv: [[label, value]],
//     band: 'TITLE',                                a coloured bar (accent) heading a block of tables
//     grid: [[label, value, label, value] | [label, value]],   a details table with shaded labels
//     table: { cols: [{ title, w, align }], rows: [[cell…]], foot: [[cell…]], headFill, headColor },
//     photos: [{ id, caption }], photoMaxH,         loaded with loadImage(id) -> { bytes, w, h, type }
//     images: [{ bytes, w, h, type, caption, widthCm }],
//   }],
// }
// A table cell is a string, a number, or { t, link, bold } or { thumbs: [{ id, n }] } (small numbered pictures) or { sig } (a signature, PNG data URL).
import { zipFiles } from './zip.js';

const esc = (s) => String(s ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const EMU_CM = 360000;
const A4 = { w: 11906, h: 16838 };
const MARGIN = 1134; // 2 cm, in twips
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
  + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:color w:val="1F5F8B"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="1F5F8B"/></w:pBdr><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F5F8B"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/><w:szCs w:val="25"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFC6CE"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BFC6CE"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFC6CE"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BFC6CE"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFC6CE"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="BFC6CE"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;

export async function buildDocx(model, { loadImage = async () => null } = {}) {
  const accent = /^[0-9A-Fa-f]{6}$/.test(model.accent || '') ? model.accent.toUpperCase() : '1F5F8B';
  const landscape = Boolean(model.landscape);
  const pageW = landscape ? A4.h : A4.w;
  const pageH = landscape ? A4.w : A4.h;
  const usable = pageW - 2 * MARGIN;

  const rels = []; // { id, type, target, external }
  let nextId = 10; // 1-9 are kept for styles, header and footer
  const files = [];
  let docPrId = 1;
  const addLink = (url) => {
    const found = rels.find((r) => r.external && r.target === url);
    if (found) return found.id;
    const id = `rId${nextId++}`;
    rels.push({ id, type: 'hyperlink', target: url, external: true });
    return id;
  };
  const imageIds = new Map(); // the same picture used twice (small, then large) is stored once
  const addImage = (img) => {
    if (imageIds.has(img.bytes)) return imageIds.get(img.bytes);
    const ext = /png/i.test(img.type || '') ? 'png' : 'jpeg';
    const name = `image${files.length + 1}.${ext}`;
    const id = `rId${nextId++}`;
    rels.push({ id, type: 'image', target: `media/${name}` });
    files.push({ name: `word/media/${name}`, data: img.bytes, ext });
    imageIds.set(img.bytes, id);
    return id;
  };

  // ----- runs and paragraphs -----
  const rpr = (o = {}) => {
    const inner = `${o.link ? '<w:rStyle w:val="Hyperlink"/>' : ''}${o.bold ? '<w:b/>' : ''}${o.italic ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : ''}`;
    return inner ? `<w:rPr>${inner}</w:rPr>` : '';
  };
  const run = (text, o = {}) => {
    const lines = String(text ?? '').split('\n');
    const body = lines.map((l, i) => `${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(l)}</w:t>`).join('');
    return `<w:r>${rpr(o)}${body}</w:r>`;
  };
  const linkRun = (text, url, o = {}) => (/^https?:\/\//i.test(url || '')
    ? `<w:hyperlink r:id="${addLink(url)}" w:history="1">${run(text, { ...o, link: true })}</w:hyperlink>`
    : run(text, o));
  const para = (content, o = {}) => {
    const ppr = `${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.keepNext ? '<w:keepNext/>' : ''}${o.pageBreak ? '<w:pageBreakBefore/>' : ''}`
      + `${o.after != null || o.before != null ? `<w:spacing${o.before != null ? ` w:before="${o.before}"` : ''}${o.after != null ? ` w:after="${o.after}"` : ''}/>` : ''}`
      + `${o.indent ? `<w:ind w:left="${o.indent}" w:hanging="${o.hanging || 0}"/>` : ''}${o.align ? `<w:jc w:val="${o.align}"/>` : ''}`;
    return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${content}</w:p>`;
  };
  const text = (t, o = {}) => para(run(t, o), o);

  const cellContent = (c, o = {}) => {
    if (c && typeof c === 'object') return c.link ? linkRun(c.t, c.link, { ...o, bold: c.bold ?? o.bold }) : run(c.t, { ...o, bold: c.bold ?? o.bold });
    return run(c, o);
  };

  // ----- tables -----
  const tc = (width, inner, { fill } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>${inner}</w:tc>`;
  const table = (widths, rowsXml) => `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>`
    + '<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>'
    + `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rowsXml}</w:tbl>`;

  const dataTable = ({ cols, rows, foot = [], ...opts }) => {
    const totalW = cols.reduce((a, c) => a + (c.w || 1), 0);
    const widths = cols.map((c) => Math.floor((usable * (c.w || 1)) / totalW));
    const align = (c) => (c.align === 'right' ? 'right' : undefined);
    const headFill = opts.headFill || 'E8EDF2';
    const headColor = opts.headColor;
    const cellXml = (c, i, head, isFoot) => {
      if (c && c._imgs) return tc(widths[i], thumbParas(c._imgs, widths[i]));
      return tc(widths[i], para(cellContent(c ?? '', { bold: head || isFoot, size: 19, color: head ? headColor : undefined }), { align: align(cols[i]) }), { fill: head ? headFill : isFoot ? 'F4F6F8' : undefined });
    };
    const rowXml = (cells, { head = false, foot: isFoot = false } = {}) => `<w:tr><w:trPr><w:cantSplit/>${head ? '<w:tblHeader/>' : ''}</w:trPr>`
      + cells.map((c, i) => cellXml(c, i, head, isFoot)).join('')
      + '</w:tr>';
    return table(widths, rowXml(cols.map((c) => c.title), { head: true }) + rows.map((r) => rowXml(r)).join('') + foot.map((r) => rowXml(r, { foot: true })).join(''))
      + para('', { after: 60 });
  };
  const kvTable = (rows) => {
    const widths = [Math.floor(usable * 0.3), usable - Math.floor(usable * 0.3)];
    return table(widths, rows.map(([k, v]) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${tc(widths[0], para(run(k, { bold: true, size: 19, color: '505860' })), { fill: 'F4F6F8' })}${tc(widths[1], para(cellContent(v ?? '', { size: 19 })))}</w:tr>`).join(''))
      + para('', { after: 60 });
  };

  /** A coloured bar with a title (like the headings of a paper form). */
  const band = (title) => table([usable], `<w:tr><w:trPr><w:cantSplit/></w:trPr>${tc(usable, para(run(title, { bold: true, size: 20, color: 'FFFFFF' }), { keepNext: true, after: 0 }), { fill: accent })}</w:tr>`).replace('<w:tblStyle w:val="TableGrid"/>', '<w:tblStyle w:val="TableNormal"/>');
  /** Details table: shaded labels, either label | value or label | value | label | value. */
  const gridTable = (rows) => {
    const four = rows.some((r) => r.length > 2);
    const lw = Math.floor(usable * (four ? 0.17 : 0.2));
    const vw = four ? Math.floor((usable - 2 * lw) / 2) : usable - lw;
    const label = (t) => tc(lw, para(run(t, { bold: true, size: 19, color: accent })), { fill: 'E3EEF1' });
    const value = (v, w) => tc(w, para(cellContent(v ?? '', { size: 19 })));
    return table(four ? [lw, vw, lw, vw] : [lw, vw], rows.map((r) => {
      if (four && r.length === 2) {
        return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${label(r[0])}<w:tc><w:tcPr><w:tcW w:w="${vw * 2 + lw}" w:type="dxa"/><w:gridSpan w:val="3"/></w:tcPr>${para(cellContent(r[1] ?? '', { size: 19 }))}</w:tc></w:tr>`;
      }
      return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => (i % 2 === 0 ? label(c) : value(c, vw))).join('')}</w:tr>`;
    }).join('')) + para('', { after: 40 });
  };
  /** Small numbered pictures in a table cell (preloaded: [{ img, n }]). */
  const thumbParas = (imgs, width) => {
    const cm = (width / 1440) * 2.54 - 0.4;
    const size = 1.7;
    const perLine = imgs[0]?.box ? 1 : Math.max(1, Math.floor(cm / (size + 0.45)));
    let out = '';
    for (let i = 0; i < imgs.length; i += perLine) {
      out += para(imgs.slice(i, i + perLine).map(({ img, n, box }) => { const [cx, cy] = box ? fit(img, Math.min(box[0], cm), box[1]) : fit(img, size, size); return drawing(img, cx, cy) + (n === '' ? '' : run(` ${n}   `, { size: 14, color: '505860' })); }).join(''), { after: 40 });
    }
    return out || para('');
  };
  const preloadThumbs = async (t) => {
    for (const row of [...t.rows, ...(t.foot || [])]) {
      for (const c of row) {
        if (c && typeof c === 'object' && c.sig) { // a signature (PNG data URL)
          const b64 = String(c.sig).split(',')[1];
          if (b64) {
            const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
            const dv = new DataView(bytes.buffer);
            c._imgs = [{ img: { bytes, w: dv.getUint32(16), h: dv.getUint32(20), type: 'image/png' }, n: '', box: [3.6, 1.5] }];
          }
          continue;
        }
        if (c && typeof c === 'object' && c.thumbs) {
          c._imgs = [];
          for (const p of c.thumbs) { const img = await loadImage(p.id); if (img) c._imgs.push({ img, n: p.n }); }
        }
      }
    }
  };

  // ----- pictures -----
  const drawing = (img, cx, cy) => {
    const id = addImage(img);
    const n = docPrId++;
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/>`
      + '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
      + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
      + `<pic:nvPicPr><pic:cNvPr id="${n}" name="Picture ${n}"/><pic:cNvPicPr/></pic:nvPicPr>`
      + `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
      + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
      + '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  };
  const fit = (img, maxWcm, maxHcm) => {
    const s = Math.min(maxWcm / img.w, maxHcm / img.h);
    return [Math.round(img.w * s * EMU_CM), Math.round(img.h * s * EMU_CM)];
  };
  /** Photos two to a row, each with its caption. */
  const photoTable = async (items, maxH = 8.5) => {
    const loaded = [];
    for (const it of items) {
      const img = await loadImage(it.id);
      if (img) loaded.push({ img, caption: it.caption });
    }
    if (!loaded.length) return '';
    const half = Math.floor(usable / 2);
    const cellCm = (half / 1440) * 2.54 - 0.4; // twips -> cm, less the padding
    let out = '';
    for (let i = 0; i < loaded.length; i += 2) {
      const pair = loaded.slice(i, i + 2);
      out += '<w:tr><w:trPr><w:cantSplit/></w:trPr>' + [0, 1].map((k) => {
        const p = pair[k];
        if (!p) return tc(half, para(''));
        const [cx, cy] = fit(p.img, cellCm, maxH);
        return tc(half, para(drawing(p.img, cx, cy), { after: 40 }) + (p.caption ? para(run(p.caption, { size: 17, color: '505860' }), { after: 60 }) : ''));
      }).join('') + '</w:tr>';
    }
    return table([half, half], out).replace('<w:tblStyle w:val="TableGrid"/>', '<w:tblStyle w:val="TableNormal"/>') + para('', { after: 60 });
  };

  // ----- body -----
  let body = '';
  body += para(run(model.title || ''), { style: 'Title' });
  if (model.subtitle) body += para(run(model.subtitle, { size: 24, color: '505860' }), { after: 120 });
  if (model.meta?.length) body += kvTable(model.meta.filter(([, v]) => v !== '' && v != null));

  for (const s of model.sections || []) {
    if (s.heading) body += para(run(s.heading), { style: s.level === 2 ? 'Heading2' : 'Heading1', pageBreak: s.pageBreak });
    else if (s.pageBreak) body += para('', { pageBreak: true });
    for (const t of s.paras || []) body += para(run(t, { size: 20 }));
    for (const t of s.bullets || []) body += para(run(`•  ${t}`, { size: 20 }), { indent: 360, hanging: 240, after: 40 });
    if (s.band) body += band(s.band);
    if (s.grid?.length) body += gridTable(s.grid);
    if (s.kv?.length) body += kvTable(s.kv.filter(([, v]) => v !== '' && v != null));
    if (s.table?.rows?.length) { await preloadThumbs(s.table); body += dataTable(s.table); }
    for (const img of s.images || []) {
      const [cx, cy] = fit(img, img.widthCm || (usable / 1440) * 2.54, ((pageH - 2 * MARGIN) / 1440) * 2.54 - 2);
      body += para(drawing(img, cx, cy), { after: 60 });
      if (img.caption) body += para(run(img.caption, { size: 17, color: '505860' }));
    }
    if (s.photos?.length) body += await photoTable(s.photos, s.photoMaxH);
  }
  body += `<w:sectPr><w:headerReference w:type="default" r:id="rId2"/><w:footerReference w:type="default" r:id="rId3"/>`
    + `<w:pgSz w:w="${pageW}" w:h="${pageH}"${landscape ? ' w:orient="landscape"' : ''}/>`
    + `<w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;

  const small = (t, extra = '') => `<w:r><w:rPr><w:color w:val="78808A"/><w:sz w:val="16"/></w:rPr>${extra}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const fld = (instr, shown) => `<w:fldSimple w:instr=" ${instr} "><w:r><w:rPr><w:color w:val="78808A"/><w:sz w:val="16"/></w:rPr><w:t>${shown}</w:t></w:r></w:fldSimple>`;
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}><w:p><w:pPr><w:jc w:val="right"/></w:pPr>${small('PropertyPad')}</w:p></w:hdr>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${usable}"/></w:tabs></w:pPr>${small(model.footer || model.title || '')}<w:r><w:tab/></w:r>${small('Page ')}${fld('PAGE', '1')}${small(' of ')}${fld('NUMPAGES', '1')}</w:p></w:ftr>`;

  const media = files.map((f) => f.ext);
  const docRels = [
    `<Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/>`,
    `<Relationship Id="rId2" Type="${R}/header" Target="header1.xml"/>`,
    `<Relationship Id="rId3" Type="${R}/footer" Target="footer1.xml"/>`,
    ...rels.map((r) => `<Relationship Id="${r.id}" Type="${R}/${r.type}" Target="${esc(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`),
  ].join('');

  const out = [
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        + (media.includes('jpeg') ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : '') + (media.includes('png') ? '<Default Extension="png" ContentType="image/png"/>' : '')
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        + '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
        + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>',
    },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}</w:body></w:document>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${docRels}</Relationships>` },
    { name: 'word/styles.xml', data: STYLES.replaceAll('1F5F8B', accent) },
    { name: 'word/header1.xml', data: header },
    { name: 'word/footer1.xml', data: footer },
    ...files.map((f) => ({ name: f.name, data: f.data })),
  ];
  const blob = await zipFiles(out);
  return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
