// "Export…": pick PDF, Word or Excel. The format that suits the document best is listed first.
import { choose, h } from '../ui.js';

/** Resolves with 'pdf' | 'docx' | 'xlsx', or null if cancelled. */
export async function exportChooser(job) {
  const { formatChoices } = await import('../export/engine.js');
  const choices = formatChoices(job);
  return choose({
    title: 'Export',
    message: 'Pick a format – the first one suits this document best.',
    buttons: [
      ...choices.map((c, i) => ({
        label: h('span', { class: 'export-opt' }, h('strong', null, `${c.emoji} ${c.label} (.${c.ext})${i === 0 ? ' – recommended' : ''}`), h('small', null, c.why)),
        value: c.format,
        class: i === 0 ? 'btn-primary' : '',
      })),
      { label: 'Cancel', value: null },
    ],
  });
}
