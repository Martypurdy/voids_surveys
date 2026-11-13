// Per-job actions dialog: delete (export options are added by the export modules).
import { deleteJob } from '../db.js';
import { jobTitle } from '../model.js';
import { choose, confirmDialog, toast } from '../ui.js';

/** Show the actions dialog for a job. Resolves true if the job list should refresh. */
export async function jobActions(job) {
  const action = await choose({
    title: jobTitle(job),
    buttons: [
      { label: 'Delete job', value: 'delete', class: 'btn-danger' },
      { label: 'Cancel', value: null },
    ],
  });

  if (action === 'delete') {
    const ok = await confirmDialog(`Delete “${jobTitle(job)}” and all its photos from this device? This can't be undone.`);
    if (!ok) return false;
    await deleteJob(job.id);
    toast('Job deleted');
    return true;
  }
  return false;
}
