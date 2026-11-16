// RAMS pack as one document description, used by Word and PDF, and as an Excel workbook. Order: project details,
// construction phase plan, risk assessments, on-the-day checks, method statements, briefing records, sign-off, then the
// large photos from method statement steps.
import { textLines, addressLines, fmtDate, formOf } from '../../model.js';
import { DYNAMIC_CHECKS, DYNAMIC_OUTCOMES, SAFETY_NOTE } from '../../data/hazards.js';
import { notifiable, usedRisks, ramsPhotos } from '../../rams.js';

const ACCENT = '1F4E5C';
const has = (v) => String(v ?? '').trim() !== '';
const date = (v) => (has(v) ? fmtDate(v.slice(0, 10)) : '');
const ANSWER = { yes: 'Yes', no: 'No', na: 'N/A' };

/** Pairs [label, value] to grid rows: two pairs per row; empty values are left out. */
function gridRows(pairs, wide = false) {
  const items = pairs.filter(([, v]) => has(v));
  const rows = [];
  if (wide) return items.map(([k, v]) => [k, v]);
  for (let i = 0; i < items.length; i += 2) rows.push(items[i + 1] ? [...items[i], ...items[i + 1]] : [...items[i]]);
  return rows;
}

/** Everything the documents say, gathered once. */
function collect(job) {
  const r = job.rams;
  const cust = [r.customer, addressLines(r.customerAddress || {}).join(', ')].filter(Boolean).join(' - ');
  return { r, cust, where: textLines(job.address).join(', '), photos: ramsPhotos(r), sg: job.signature || {} };
}

export function ramsModel(job) {
  const c = collect(job);
  const { r } = c;
  const cpp = r.cpp;
  const sections = [];

  sections.push({ paras: [SAFETY_NOTE] });
  sections.push({
    band: 'PROJECT DETAILS',
    grid: [
      ...gridRows([['Property address', c.where], ['Job number', r.ref], ['Postcode', job.address.postcode], ['Client or tenant', c.cust], ['Prepared by', job.surveyor], ['Company', r.company]]),
      ...(has(r.description) ? [['Job description', r.description]] : []),
    ],
  });

  // ----- construction phase plan -----
  const present = cpp.dangers.filter((d) => d.present && has(d.hazard));
  const cppGrid = [
    ...gridRows([['In charge of the job', cpp.principal], ['Designer / principal designer', cpp.designer], ['Start date', date(cpp.startDate)], ['Finish date', date(cpp.endDate)]]),
    ...gridRows([['Who else is on site', cpp.others], ['Keeping everyone up to date', cpp.updates], ['Responsible for safety', cpp.responsible], ['Supervision', cpp.supervision], ['Site rules', cpp.rules], ['Welfare facilities', cpp.welfare], ['Fire and emergency', cpp.emergency], ['Asbestos', cpp.asbestos], ['Services and isolation points', cpp.services]], true),
    ...gridRows([['Working days', cpp.days], ['Most people on site at once', cpp.workers], ['Total person-days', cpp.personDays]]),
  ];
  if (cppGrid.length || present.length) {
    const s = { band: 'CONSTRUCTION PHASE PLAN (CDM 2015)', grid: cppGrid };
    if (present.length) s.table = { headFill: ACCENT, headColor: 'FFFFFF', cols: [{ title: 'Main dangers on site', w: 2 }, { title: 'How they will be controlled', w: 4 }], rows: present.map((d) => [d.hazard, d.controls]) };
    if (notifiable(cpp)) s.paras = ['This job is large enough to be notifiable to the HSE (form F10) and needs a fuller plan than this simple one.'];
    sections.push(s);
  }

  // ----- risk assessments -----
  for (const ra of r.risks) {
    const rows = usedRisks(ra.rows);
    sections.push({
      band: `RISK ASSESSMENT - ${ra.title || 'Untitled'}`,
      grid: gridRows([['Reference', ra.ref], ['Date assessed', date(ra.date)], ['Assessed by', job.surveyor], ['Next review', date(ra.reviewDate)]]),
      ...(rows.length ? {
        table: {
          headFill: ACCENT, headColor: 'FFFFFF',
          cols: [{ title: 'What are the hazards?', w: 3 }, { title: 'Who might be harmed and how?', w: 2.6 }, { title: 'Controls already in place', w: 4 }, { title: 'Further action needed', w: 3 }, { title: 'Who', w: 1.6 }, { title: 'By when', w: 1.5 }, { title: 'Done', w: 1 }],
          rows: rows.map((x) => [x.hazard, x.who, x.controls, x.action, x.owner, has(x.when) && /^\d{4}-\d{2}-\d{2}$/.test(x.when) ? fmtDate(x.when) : x.when, x.done ? 'Yes' : '']),
        },
      } : { paras: ['No hazards recorded.'] }),
    });
  }
  for (const d of r.dynamics) {
    const answered = DYNAMIC_CHECKS.filter(([k]) => d.checks[k]);
    const found = usedRisks(d.found);
    sections.push({
      band: `ON-THE-DAY CHECK - ${d.task || 'Untitled'}`,
      grid: gridRows([['Where', d.location], ['Date', date(d.date)]]),
      table: answered.length ? { headFill: ACCENT, headColor: 'FFFFFF', cols: [{ title: 'Stop and check before starting', w: 6 }, { title: 'Answer', w: 1 }], rows: answered.map(([k, q]) => [q, ANSWER[d.checks[k]] || '']) } : undefined,
      ...(found.length || has(d.outcome) || has(d.notes) ? {} : {}),
    });
    if (found.length) sections.push({ table: { headFill: ACCENT, headColor: 'FFFFFF', cols: [{ title: 'Hazard found', w: 3 }, { title: 'What was done about it', w: 5 }], rows: found.map((x) => [x.hazard, x.controls]) } });
    const out = DYNAMIC_OUTCOMES.find(([k]) => k === d.outcome)?.[1] || '';
    const tail = gridRows([['Outcome', out], ['Notes', d.notes]], true);
    if (tail.length) sections.push({ grid: tail });
  }

  // ----- method statements -----
  for (const m of r.methods) {
    const raTitles = r.risks.filter((x) => m.raIds.includes(x.id)).map((x) => x.title || 'Risk assessment');
    const people = m.personnel.filter((p) => has(p.name) || has(p.role) || has(p.competence));
    const steps = m.steps.filter((s) => has(s.text) || s.photos.length);
    const tools = m.tools.filter((t) => has(t.type) || has(t.details));
    const photoN = new Map(c.photos.map((p) => [p.id, p.n]));
    sections.push({
      band: `METHOD STATEMENT - ${m.title || 'Untitled'}`,
      grid: [
        ...gridRows([['Reference', m.ref], ['Starts', date(m.start)], ['How long', m.duration], ['Number of workers', m.workers]]),
        ...gridRows([['Description of the work', m.description], ['Areas to be worked in', m.areas], ['Goes with these risk assessments', raTitles.join(', ')]], true),
        ...gridRows([['Fire and getting out', m.emergency.fire], ['First aid', m.emergency.firstAid], ['Spills and pollution', m.emergency.spill], ['Other emergency arrangements', m.emergency.other]], true),
        ...gridRows([['Protective equipment', [...m.ppe, m.ppeOther].filter(has).join(', ')], ['Dust or fumes', m.dust === 'yes' ? `Yes - ${m.dustControls || 'controls not yet written'}` : m.dust === 'no' ? 'No' : ''], ['Hazardous materials', m.hazmat === 'yes' ? `Yes - ${m.hazControls || 'controls not yet written'}` : m.hazmat === 'no' ? 'No' : ''], ['Safety data sheets (COSHH) to hand', m.coshh === 'yes' ? 'Yes' : m.coshh === 'no' ? 'No' : ''], ['Permits', [...m.permits, m.permitOther].filter(has).join(', ')], ['Permits issued by', m.permitBy]], true),
      ],
      ...(people.length ? { table: { headFill: ACCENT, headColor: 'FFFFFF', cols: [{ title: 'Name', w: 2 }, { title: 'Role', w: 2 }, { title: 'Training or competence', w: 4 }], rows: people.map((p) => [p.name, p.role, p.competence]) } } : {}),
    });
    if (steps.length) {
      sections.push({
        table: {
          headFill: ACCENT, headColor: 'FFFFFF',
          cols: [{ title: 'No.', w: 0.6 }, { title: 'Safe method of work, step by step', w: 8 }, { title: 'Photos', w: 2.4 }],
          rows: steps.map((s, i) => [String(i + 1), s.text, { thumbs: s.photos.filter((id) => photoN.has(id)).map((id) => ({ id, n: photoN.get(id) })) }]),
        },
      });
    }
    if (tools.length) sections.push({ table: { headFill: ACCENT, headColor: 'FFFFFF', cols: [{ title: 'Tools, plant and equipment', w: 3 }, { title: 'Checks, tests or certificates', w: 5 }], rows: tools.map((t) => [t.type, t.details]) } });
  }

  // ----- briefings -----
  for (const b of r.briefings) {
    const people = b.attendees.filter((a) => has(a.name) || has(a.trade) || has(a.company) || a.signature);
    sections.push({
      band: `BRIEFING RECORD - ${b.subject || 'Untitled'}`,
      grid: [...gridRows([['Briefing about', b.kinds.join(', ')], ['Date', date(b.date)], ['Where', b.location], ['Given by', b.by]]), ...gridRows([['Comments from the team', b.feedback]], true)],
      ...(people.length ? { table: { headFill: ACCENT, headColor: 'FFFFFF', cols: [{ title: 'Name', w: 3 }, { title: 'Trade', w: 2 }, { title: 'Company', w: 3 }, { title: 'Signature', w: 2.5 }], rows: people.map((a) => [a.name, a.trade, a.company, a.signature ? { sig: a.signature } : '']) } } : {}),
    });
  }

  // ----- sign-off -----
  sections.push({
    band: 'SIGN-OFF',
    table: { headFill: ACCENT, headColor: 'FFFFFF', cols: [{ title: 'Name', w: 3 }, { title: 'Date', w: 2 }, { title: 'Signature', w: 3 }], rows: [[c.sg.name || job.surveyor || '', c.sg.date ? date(c.sg.date) : '', c.sg.image ? { sig: c.sg.image } : 'Not signed']] },
  });

  if (c.photos.length) sections.push({ heading: 'Photos', pageBreak: true, photoMaxH: 12, photos: c.photos.map((p) => ({ id: p.id, caption: `Photo ${p.n}  -  ${p.caption}` })) });

  return { title: formOf(job).pdfTitle.toUpperCase(), subtitle: c.where || 'Address not recorded', landscape: true, accent: ACCENT, footer: c.where || formOf(job).title, sections };
}

/** The workbook: one sheet each for the details and plan, risk assessments, method statements and briefings. */
export function ramsWorkbook(job) {
  const c = collect(job);
  const { r } = c;
  const cpp = r.cpp;
  const head = (labels) => labels.map((v) => ({ v, s: 'headTeal' }));
  const label = { font: 1, fill: 3, border: 1, wrap: 1, v: 'top' };
  const kv = (k, v) => [{ v: k, s: label }, { v: v ?? '', s: 'cell' }];
  const sheets = [];

  const d = [[{ v: formOf(job).pdfTitle.toUpperCase(), s: 'title' }], [{ v: SAFETY_NOTE, s: 'note' }], [], head(['PROJECT DETAILS', ''])];
  for (const [k, v] of [['Property address', c.where], ['Postcode', job.address.postcode], ['Job number', r.ref], ['Client or tenant', c.cust], ['Prepared by', job.surveyor], ['Company', r.company], ['Job description', r.description]]) if (has(v)) d.push(kv(k, v));
  d.push([], head(['CONSTRUCTION PHASE PLAN', '']));
  for (const [k, v] of [['In charge of the job', cpp.principal], ['Designer / principal designer', cpp.designer], ['Start date', date(cpp.startDate)], ['Finish date', date(cpp.endDate)], ['Who else is on site', cpp.others], ['Keeping everyone up to date', cpp.updates], ['Responsible for safety', cpp.responsible], ['Supervision', cpp.supervision], ['Site rules', cpp.rules], ['Welfare facilities', cpp.welfare], ['Fire and emergency', cpp.emergency], ['Asbestos', cpp.asbestos], ['Services and isolation points', cpp.services], ['Working days', cpp.days], ['Most people on site at once', cpp.workers], ['Total person-days', cpp.personDays]]) if (has(v)) d.push(kv(k, v));
  if (notifiable(cpp)) d.push(kv('Notifiable', 'Large enough to be notifiable to the HSE (form F10)'));
  const present = cpp.dangers.filter((x) => x.present && has(x.hazard));
  if (present.length) { d.push([], head(['Main dangers on site', 'How they will be controlled'])); for (const x of present) d.push([{ v: x.hazard, s: 'cell' }, { v: x.controls, s: 'cell' }]); }
  sheets.push({ name: 'Plan', cols: [{ w: 34 }, { w: 90 }], rows: d, hideGrid: true, landscape: true });

  if (r.risks.length || r.dynamics.length) {
    const rows = [];
    for (const ra of r.risks) {
      rows.push([{ v: `RISK ASSESSMENT - ${ra.title || 'Untitled'}`, s: 'title' }]);
      rows.push([{ v: `Reference: ${ra.ref || '-'}   Date assessed: ${date(ra.date) || '-'}   Next review: ${date(ra.reviewDate) || '-'}   Assessed by: ${job.surveyor || '-'}`, s: 'note' }]);
      rows.push(head(['What are the hazards?', 'Who might be harmed and how?', 'Controls already in place', 'Further action needed', 'Who', 'By when', 'Done']));
      for (const x of usedRisks(ra.rows)) rows.push([x.hazard, x.who, x.controls, x.action, x.owner, x.when, x.done ? 'Yes' : ''].map((v) => ({ v: v ?? '', s: 'cell' })));
      rows.push([]);
    }
    for (const dy of r.dynamics) {
      rows.push([{ v: `ON-THE-DAY CHECK - ${dy.task || 'Untitled'}`, s: 'title' }]);
      rows.push([{ v: `Where: ${dy.location || '-'}   Date: ${date(dy.date) || '-'}   Outcome: ${DYNAMIC_OUTCOMES.find(([k]) => k === dy.outcome)?.[1] || '-'}`, s: 'note' }]);
      rows.push(head(['Stop and check before starting', 'Answer']));
      for (const [k, q] of DYNAMIC_CHECKS) if (dy.checks[k]) rows.push([{ v: q, s: 'cell' }, { v: ANSWER[dy.checks[k]] || '', s: 'cell' }]);
      for (const x of usedRisks(dy.found)) rows.push([{ v: `Found: ${x.hazard}`, s: 'cell' }, { v: x.controls, s: 'cell' }]);
      if (has(dy.notes)) rows.push([{ v: 'Notes', s: label }, { v: dy.notes, s: 'cell' }]);
      rows.push([]);
    }
    sheets.push({ name: 'Risk assessments', cols: [{ w: 34 }, { w: 30 }, { w: 48 }, { w: 34 }, { w: 16 }, { w: 14 }, { w: 8 }], rows, landscape: true });
  }

  if (r.methods.length) {
    const rows = [];
    for (const m of r.methods) {
      rows.push([{ v: `METHOD STATEMENT - ${m.title || 'Untitled'}`, s: 'title' }]);
      for (const [k, v] of [['Reference', m.ref], ['Description of the work', m.description], ['Starts', date(m.start)], ['How long', m.duration], ['Number of workers', m.workers], ['Areas to be worked in', m.areas], ['Goes with these risk assessments', r.risks.filter((x) => m.raIds.includes(x.id)).map((x) => x.title).join(', ')], ['Fire and getting out', m.emergency.fire], ['First aid', m.emergency.firstAid], ['Spills and pollution', m.emergency.spill], ['Protective equipment', [...m.ppe, m.ppeOther].filter(has).join(', ')], ['Dust or fumes', m.dust === 'yes' ? `Yes - ${m.dustControls}` : m.dust === 'no' ? 'No' : ''], ['Hazardous materials', m.hazmat === 'yes' ? `Yes - ${m.hazControls}` : m.hazmat === 'no' ? 'No' : ''], ['Permits', [...m.permits, m.permitOther].filter(has).join(', ')]]) if (has(v)) rows.push(kv(k, v));
      rows.push(head(['Step', 'Safe method of work']));
      m.steps.filter((s) => has(s.text)).forEach((s, i) => rows.push([{ v: i + 1, s: 'cell' }, { v: s.text, s: 'cell' }]));
      const people = m.personnel.filter((p) => has(p.name) || has(p.role));
      if (people.length) { rows.push(head(['Name', 'Role and competence'])); for (const p of people) rows.push([{ v: p.name, s: 'cell' }, { v: [p.role, p.competence].filter(has).join(' - '), s: 'cell' }]); }
      rows.push([]);
    }
    sheets.push({ name: 'Method statements', cols: [{ w: 34 }, { w: 100 }], rows, landscape: true });
  }

  if (r.briefings.length) {
    const rows = [head(['Briefing', 'Date', 'Name', 'Trade', 'Company', 'Signed'])];
    for (const b of r.briefings) for (const a of b.attendees.filter((x) => has(x.name))) rows.push([b.subject, date(b.date), a.name, a.trade, a.company, a.signature ? 'Yes' : ''].map((v) => ({ v: v ?? '', s: 'cell' })));
    sheets.push({ name: 'Briefings', cols: [{ w: 34 }, { w: 14 }, { w: 24 }, { w: 18 }, { w: 24 }, { w: 10 }], rows, freeze: { row: 1 }, landscape: true });
  }
  return { sheets };
}
