// history.js — the full-page archive. View layer only: every state change
// goes through the background worker.
import { timeAgo, sizeLabel } from '../ui/format.js';

const $ = (id) => document.getElementById(id);
const els = {
  plan: $('plan'),
  buy: $('buy'),
  search: $('search'),
  hostFilter: $('hostFilter'),
  export: $('export'),
  import: $('import'),
  importFile: $('importFile'),
  message: $('message'),
  upsell: $('upsell'),
  upsellText: $('upsellText'),
  list: $('list'),
  retentionDays: $('retentionDays'),
  maxEntries: $('maxEntries'),
  pausedList: $('pausedList'),
  clearAll: $('clearAll'),
};

let paid = false;
let metas = [];

const send = (message) => chrome.runtime.sendMessage(message);

function showMessage(text, isError = false) {
  els.message.textContent = text;
  els.message.classList.toggle('error', isError);
  els.message.hidden = !text;
  if (text) setTimeout(() => { els.message.hidden = true; }, 4000);
}

function renderHostFilter() {
  const hosts = [...new Set(metas.map((m) => m.host).filter(Boolean))].sort();
  const current = els.hostFilter.value;
  els.hostFilter.innerHTML = '<option value="">All sites</option>';
  for (const host of hosts) {
    const opt = document.createElement('option');
    opt.value = host;
    opt.textContent = host;
    els.hostFilter.appendChild(opt);
  }
  els.hostFilter.value = hosts.includes(current) ? current : '';
}

function render(visible, hiddenCount) {
  els.list.innerHTML = '';

  if (visible.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nothing here yet. Type anywhere on the web — Retype records as you go.';
    els.list.appendChild(li);
  }

  for (const meta of visible) {
    const li = document.createElement('li');
    li.className = 'item';

    const top = document.createElement('div');
    top.className = 'top';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = meta.label;
    const site = document.createElement('span');
    site.className = 'site';
    site.textContent = meta.pageKey;
    site.title = meta.title;
    top.append(label, site);

    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.textContent = meta.preview;

    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = `${sizeLabel(meta)} · ${timeAgo(meta.updatedAt)}`;

    const view = document.createElement('button');
    view.className = 'ghost';
    view.textContent = 'View';
    view.addEventListener('click', () => onView(meta.id, li, preview, view));

    const copy = document.createElement('button');
    copy.className = 'ghost';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => onCopy(meta.id));

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Delete this entry';
    del.addEventListener('click', () => onDelete(meta.id));

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(view, copy, del);

    const row = document.createElement('div');
    row.className = 'row';
    row.append(sub, actions);

    li.append(top, preview, row);
    els.list.appendChild(li);
  }

  els.plan.hidden = !paid;
  els.buy.hidden = paid;
  els.upsell.hidden = paid || hiddenCount === 0;
  if (hiddenCount > 0) {
    els.upsellText.innerHTML = `<strong>${hiddenCount} older ${hiddenCount === 1 ? 'entry is' : 'entries are'} locked.</strong> Free shows the last 24 hours.`;
  }
}

async function refresh() {
  const res = await send({ type: 'LIST', host: els.hostFilter.value || null });
  if (!res || !res.ok) return showMessage('Could not load your history.', true);
  paid = res.paid;
  metas = res.metas;
  if (!els.hostFilter.value) renderHostFilter();
  render(res.metas, res.hiddenCount);
}

async function onSearch() {
  const query = els.search.value.trim();
  if (query.length === 0) return refresh();
  if (!paid) return showMessage('Search is a Pro feature.', true);
  const res = await send({ type: 'SEARCH', query });
  if (!res.ok) return showMessage('Search failed.', true);
  render(res.metas, 0);
}

async function onView(id, li, previewEl, button) {
  const existing = li.querySelector('.full');
  if (existing) {
    existing.remove();
    previewEl.hidden = false;
    button.textContent = 'View';
    return;
  }
  const res = await send({ type: 'GET_ENTRY', id });
  if (!res.ok) {
    return showMessage(res.reason === 'LOCKED' ? 'That entry is locked — unlock Pro to open it.' : 'Could not load entry.', true);
  }
  const full = document.createElement('div');
  full.className = 'full';
  full.textContent = res.entry.text;
  previewEl.hidden = true;
  li.insertBefore(full, li.querySelector('.row'));
  button.textContent = 'Hide';
}

async function onCopy(id) {
  const res = await send({ type: 'GET_ENTRY', id });
  if (!res.ok) {
    return showMessage(res.reason === 'LOCKED' ? 'That entry is locked — unlock Pro to open it.' : 'Could not load entry.', true);
  }
  await navigator.clipboard.writeText(res.entry.text);
  showMessage('Copied to clipboard.');
}

async function onDelete(id) {
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  await send({ type: 'DELETE', id });
  refresh();
}

async function onExport() {
  const res = await send({ type: 'EXPORT' });
  if (!res.ok) return showMessage('Export is a Pro feature.', true);
  const blob = new Blob([res.json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `retype-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showMessage('Backup downloaded.');
}

async function onImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const json = await file.text();
  event.target.value = '';
  const res = await send({ type: 'IMPORT', json });
  if (!res.ok) {
    showMessage(res.reason === 'BAD_FILE' ? `Import failed: ${res.message}` : 'Import is a Pro feature.', true);
    return;
  }
  showMessage(`Imported ${res.added} entr${res.added === 1 ? 'y' : 'ies'} (${res.skipped} skipped).`);
  refresh();
}

// --- Settings -----------------------------------------------------------------

async function loadSettings() {
  const res = await send({ type: 'SETTINGS_GET' });
  if (!res.ok) return;
  els.retentionDays.value = res.settings.retentionDays;
  els.maxEntries.value = res.settings.maxEntries;
  els.retentionDays.disabled = !res.paid;
  els.maxEntries.disabled = !res.paid;
  for (const tag of document.querySelectorAll('[data-pro]')) tag.hidden = res.paid;
  renderPaused(res.settings.pausedHosts);
}

function renderPaused(hosts) {
  els.pausedList.innerHTML = '';
  if (hosts.length === 0) {
    const li = document.createElement('li');
    li.className = 'paused-empty';
    li.textContent = 'None — use the popup on any site to pause recording there.';
    li.style.border = 'none';
    li.style.background = 'none';
    els.pausedList.appendChild(li);
    return;
  }
  for (const host of hosts) {
    const li = document.createElement('li');
    li.textContent = host;
    const un = document.createElement('button');
    un.textContent = '✕';
    un.title = `Resume recording on ${host}`;
    un.addEventListener('click', async () => {
      await send({ type: 'TOGGLE_PAUSE', host });
      loadSettings();
    });
    li.appendChild(un);
    els.pausedList.appendChild(li);
  }
}

async function onSettingChanged() {
  const res = await send({
    type: 'SETTINGS_SET',
    settings: { retentionDays: els.retentionDays.value, maxEntries: els.maxEntries.value },
  });
  if (!res.ok) return showMessage('Retention settings are a Pro feature.', true);
  els.retentionDays.value = res.settings.retentionDays;
  els.maxEntries.value = res.settings.maxEntries;
  showMessage('Settings saved.');
}

async function onClearAll() {
  if (!confirm('Delete ALL recorded text on this computer? This cannot be undone.')) return;
  await send({ type: 'CLEAR_ALL' });
  showMessage('All entries deleted.');
  refresh();
}

// Wire up events.
let searchTimer;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(onSearch, 250);
});
els.hostFilter.addEventListener('change', refresh);
els.export.addEventListener('click', onExport);
els.import.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', onImportFile);
els.retentionDays.addEventListener('change', onSettingChanged);
els.maxEntries.addEventListener('change', onSettingChanged);
els.clearAll.addEventListener('click', onClearAll);
els.buy.addEventListener('click', () => send({ type: 'PURCHASE' }));

refresh();
loadSettings();
