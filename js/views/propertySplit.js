// Wide screens (1000 px and up): the list of properties on the left, the selected property beside it, so you can
// click through addresses and see their history without leaving the screen.
import { getProperty, flushSave } from '../db.js';
import { h, pageHeader } from '../ui.js';
import { refresh } from '../router.js';
import { buildPropertyList } from './propertyList.js';
import { buildDetail } from './propertyPage.js';

export async function renderSplit(root, selectedId) {
  await flushSave();
  const detailEl = h('div', { class: 'split-detail' });
  const show = async (id) => {
    const p = id ? await getProperty(id) : null;
    if (!p) {
      detailEl.replaceChildren(h('div', { class: 'split-empty' }, h('span', { 'aria-hidden': 'true' }, '🏠'), h('strong', null, 'Choose a property'), h('span', null, 'Its history appears here.')));
      return;
    }
    const d = buildDetail(p);
    detailEl.replaceChildren(h('div', { class: 'split-head' }, h('strong', null, d.title), d.menuBtn), ...d.children);
  };
  const list = await buildPropertyList({
    selectedId,
    onPick: (id) => {
      history.replaceState(null, '', `#/property/${id}`); // no page reload: the list keeps its search and position
      list.select(id);
      show(id);
    },
  });
  root.append(
    pageHeader('Properties', { back: '#/' }),
    h('div', { class: 'split' }, h('div', { class: 'split-list' }, list.el), detailEl));
  await show(selectedId);
  matchMedia('(min-width: 1000px)').addEventListener('change', () => { if (detailEl.isConnected) refresh(); }, { once: true });
}
