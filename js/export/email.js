// 📧 Email report: builds the PDF and opens the email app (Outlook, Gmail…) through the
// phone's / computer's share panel, with the PDF attached and the subject and message
// written. No email addresses are kept in the app – choose who it goes to in the email app.
import { addressLines, formOf, fmtDate, isRtl, todayLocal } from '../model.js';
import { h, choose, busy, confirmDialog, toast } from '../ui.js';
import { saveFile } from './deliver.js';

const BIG_MB = 15; // many work mailboxes refuse attachments much bigger than this

/** Subject and message for this job. */
export function emailText(job) {
  const lines = addressLines(job.address);
  const first = lines[0] || 'the property';
  const form = formOf(job).pdfTitle;
  const body = [
    'Hi,',
    '',
    `Please see attached the ${form} report for ${lines.join(', ') || first}, completed on ${fmtDate(todayLocal())}.`,
  ];
  const v = isRtl(job) ? job.rtl.voucher : null;
  if (v?.required === 'yes') {
    body.push('', `Decorating card: Yes${v.value ? ` – £${v.value}` : ''}. Photos of the card are at the start of the Photos section at the end of the report.`);
  } else if (v?.required === 'no') {
    body.push('', 'Decorating card: No.');
  }
  body.push('', 'Kind regards,', job.surveyor || '');
  // Postcode: the postcode box, else a postcode found in the address lines.
  const postcode = (job.address.postcode || '').trim()
    || lines.map((l) => l.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0]).filter(Boolean).pop() || '';
  const firstHasPostcode = postcode && first.replace(/\s/g, '').toUpperCase().includes(postcode.replace(/\s/g, '').toUpperCase());
  return { subject: `${form} – ${first}${postcode && !firstHasPostcode ? `, ${postcode.toUpperCase()}` : ''}`, body: body.join('\n').trim() };
}

export async function emailReport(job) {
  if (!job.legionella?.done && !(await confirmDialog('Legionella flush not recorded – email the report anyway?', { title: 'Legionella flush', ok: 'Email anyway', danger: false }))) return;
  let includeCode = false;
  if (job.keySafe?.code) {
    includeCode = (await choose({
      title: 'Key safe code',
      message: 'Include the key safe code in the emailed report?',
      buttons: [
        { label: 'No – leave it out', value: false, class: 'btn-primary' },
        { label: 'Yes – include it', value: true },
      ],
    })) === true;
  }
  const progress = busy('Building report…');
  let blob, filename;
  try {
    const { buildPdf, pdfFilename } = await import('./pdf.js');
    blob = await buildPdf(job, { includeCode, onProgress: progress.update });
    filename = pdfFilename(job);
  } catch (e) {
    console.error(e);
    toast(`Report failed: ${e.message}`);
    return;
  } finally {
    progress.close();
  }

  const t = emailText(job);
  const subject = h('input', { type: 'text', value: t.subject, 'aria-label': 'Subject' });
  const message = h('textarea', { rows: 8, 'aria-label': 'Message' });
  message.value = t.body;
  const mb = blob.size / 1048576;
  const file = new File([blob], filename, { type: 'application/pdf' });
  const canShare = Boolean(navigator.canShare?.({ files: [file] }));

  await choose({
    title: '📧 Email report',
    content: h('div', { class: 'email-pop' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Subject'), subject),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Message'), message),
      h('p', { class: 'hint' }, `📎 ${filename} (${mb.toFixed(1)} MB) will be attached. Choose who it goes to in your email app.`),
      mb > BIG_MB ? h('p', { class: 'warn' }, `⚠ This report is ${mb.toFixed(0)} MB – some work mailboxes won’t accept attachments this big. Fewer photos make it smaller.`) : null,
      canShare ? null : h('p', { class: 'hint' }, 'This device can’t attach files to an email directly: the PDF will be saved, then your email opens – attach the saved PDF.')),
    buttons: [
      {
        label: '📧 Open email app',
        value: 'go',
        class: 'btn-primary btn-big',
        onClick: () => {
          if (canShare) {
            // Many email apps take the share title as the subject and the text as the message.
            navigator.share({ files: [file], title: subject.value, text: message.value }).catch((e) => {
              if (e.name !== 'AbortError') toast('Couldn’t open the email app – use Export › Share instead');
            });
          } else {
            saveFile(blob, filename);
            location.href = `mailto:?subject=${encodeURIComponent(subject.value)}&body=${encodeURIComponent(message.value)}`;
          }
        },
      },
      { label: 'Cancel', value: null },
    ],
  });
}
