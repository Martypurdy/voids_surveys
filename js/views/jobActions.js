// Per-job actions dialog: PDF report, .json backup, delete.
import { deleteJob, flushSave, saveJob, moveEntry } from '../db.js';
import { jobTitle, backupStatus, fmtDateTime, isPrice, isInspection, formOf } from '../model.js';
import { entryName, addressTitle } from '../properties.js';
import { h, choose, confirmDialog, toast, busy, textField } from '../ui.js';
import { pickProperty } from './pickProperty.js';
import { offerFile } from '../export/deliver.js';

/**
 * Show the actions dialog for a job. `job` must be the caller's live object
 * (it is updated in place when a backup is recorded).
 * Resolves 'deleted', 'changed' (backup recorded) or null.
 */
export async function jobActions(job) {
  await flushSave();

  const hasCode = Boolean(job.keySafe.code);
  const codeBox = h('input', { type: 'checkbox', checked: true }); // included by default; untick to withhold
  const status = backupStatus(job);
  const content = h('div', null,
    h('p', { class: status.stale ? 'warn' : 'hint' },
      status.stale ? `⚠ ${status.text}` : job.lastExported ? `Last backed up ${fmtDateTime(job.lastExported)}` : 'Not backed up yet'),
    hasCode
      ? h('label', { class: 'check' }, codeBox, 'Include key safe code')
      : null);

  const action = await choose({
    title: entryName(job),
    content,
    buttons: [
      { label: '👁 Preview report', value: 'preview', class: 'btn-primary' },
      isInspection(job) ? { label: '📧 Email report', value: 'email', class: 'btn-primary' } : null,
      { label: 'Export PDF report', value: 'pdf', class: 'btn-primary' },
      { label: 'Backup file (.json)', value: 'json', class: 'btn-primary' },
      { label: '🗜 Pack (zip: entry, photos and PDF)', value: 'pack', class: 'btn-primary' },
      { label: '✎ Rename (nature of the file)', value: 'rename' },
      { label: '📁 Move to another property', value: 'move' },
      { label: isPrice(job) ? 'Delete costing' : isInspection(job) ? 'Delete survey' : 'Delete plan', value: 'delete', class: 'btn-danger' },
      { label: 'Cancel', value: null },
    ].filter(Boolean),
  });
  if (action === 'email') {
    const { emailReport } = await import('../export/email.js');
    await emailReport(job);
    return null;
  }
  const includeCode = hasCode && codeBox.checked;

  if (action === 'preview') {
    const progress = busy('Building preview…');
    try {
      const [{ buildPdf, pdfFilename }, { previewPdf }] = await Promise.all([
        import('../export/pdf.js'),
        import('../export/preview.js'),
      ]);
      const blob = await buildPdf(job, { includeCode, onProgress: progress.update });
      progress.close();
      await previewPdf(blob, pdfFilename(job));
    } catch (e) {
      console.error(e);
      progress.close();
      toast(`Preview failed: ${e.message}`);
    }
    return null;
  }

  if (action === 'pdf' && isInspection(job) && !job.legionella?.done
    && !(await confirmDialog('Legionella flush not recorded – export anyway?', { ok: 'Export anyway' }))) return null;

  if (action === 'pdf') {
    const progress = busy('Building report…');
    try {
      const { buildPdf, pdfFilename } = await import('../export/pdf.js');
      const blob = await buildPdf(job, { includeCode, onProgress: progress.update });
      progress.close();
      await offerFile(blob, pdfFilename(job), 'Report ready');
    } catch (e) {
      console.error(e);
      progress.close();
      toast(`Report failed: ${e.message}`);
    }
    return null;
  }

  if (action === 'rename') {
    let nature = job.nature || '';
    const ok = await choose({
      title: 'Rename',
      message: `The file is called “${addressTitle(job.address)} – …”. Say what it is, for example “Empty home works”. Leave it blank to use “${formOf(job).title}”.`,
      content: textField('Nature of the file', nature, (t) => { nature = t; }, { placeholder: formOf(job).title }),
      buttons: [{ label: 'Save', value: 'save', class: 'btn-primary btn-big' }, { label: 'Cancel', value: null }],
    });
    if (ok !== 'save') return null;
    job.nature = nature.trim();
    await saveJob(job);
    toast('Renamed');
    return 'changed';
  }

  if (action === 'move') {
    const to = await pickProperty({ title: 'Move to which property?', exclude: [job.propertyId] });
    if (!to) return null;
    await moveEntry(job, to.id);
    toast(`Moved to ${addressTitle(to.address)}`);
    return 'moved';
  }

  if (action === 'pack') {
    const progress = busy('Building the pack…');
    try {
      const { buildEntryPack } = await import('../export/pack.js');
      const { blob, filename } = await buildEntryPack(job, { includeCode, onProgress: progress.update });
      progress.close();
      await offerFile(blob, filename, 'Pack ready');
    } catch (e) {
      console.error(e);
      progress.close();
      toast(`Pack failed: ${e.message}`);
    }
    return null;
  }

  if (action === 'json') {
    const progress = busy('Preparing backup…');
    try {
      const { buildJobFile, jsonFilename, markExported } = await import('../export/json.js');
      const blob = await buildJobFile(job, { includeCode });
      progress.close();
      if (await offerFile(blob, jsonFilename(job), 'Backup ready')) {
        await markExported(job);
        toast('Backup saved');
        return 'changed';
      }
    } catch (e) {
      console.error(e);
      progress.close();
      toast(`Backup failed: ${e.message}`);
    }
    return null;
  }

  if (action === 'delete') {
    const ok = await confirmDialog(`Delete “${jobTitle(job)}” and all its photos from this device? This can’t be undone.`);
    if (!ok) return null;
    await deleteJob(job.id);
    toast('Survey deleted');
    return 'deleted';
  }
  return null;
}
