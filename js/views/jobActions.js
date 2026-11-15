// Per-job actions dialog: PDF report, .json backup, delete.
import { deleteJob, flushSave } from '../db.js';
import { jobTitle, backupStatus, fmtDateTime, isPrice } from '../model.js';
import { h, choose, confirmDialog, toast, busy } from '../ui.js';
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
    title: jobTitle(job),
    content,
    buttons: [
      { label: '👁 Preview report', value: 'preview', class: 'btn-primary' },
      { label: 'Export PDF report', value: 'pdf', class: 'btn-primary' },
      { label: 'Backup file (.json)', value: 'json', class: 'btn-primary' },
      { label: isPrice(job) ? 'Delete costing' : 'Delete survey', value: 'delete', class: 'btn-danger' },
      { label: 'Cancel', value: null },
    ],
  });
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

  if (action === 'pdf' && !isPrice(job) && !job.legionella?.done
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
