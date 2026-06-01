// popup.js — view layer. All state changes go through the background worker.
import { countTabs, FREE_WORKSPACE_LIMIT } from '../core/session.js';

const $ = (id) => document.getElementById(id);
const els = {
  name: $('name'),
  saveWindow: $('saveWindow'),
  saveAll: $('saveAll'),
  list: $('list'),
  message: $('message'),
  plan: $('plan'),
  upsell: $('upsell'),
  buy: $('buy'),
  export: $('export'),
  import: $('import'),
  importFile: $('importFile'),
};

let paid = false;

const send = (message) => chrome.runtime.sendMessage(message);

function showMessage(text, isError = false) {
  els.message.textContent = text;
  els.message.classList.toggle('error', isError);
  els.message.hidden = !text;
  if (text) setTimeout(() => { els.message.hidden = true; }, 3500);
}

function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function render(workspaces) {
  els.list.innerHTML = '';

  if (workspaces.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No saved workspaces yet. Name one above and hit Save.';
    els.list.appendChild(li);
  }

  for (const ws of workspaces) {
    const li = document.createElement('li');
    li.className = 'item';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = ws.name;
    const sub = document.createElement('div');
    sub.className = 'sub';
    const wins = ws.windows.length;
    sub.textContent = `${countTabs(ws)} tabs · ${wins} window${wins > 1 ? 's' : ''} · ${timeAgo(ws.updatedAt)}`;
    meta.append(name, sub);

    const restore = document.createElement('button');
    restore.className = 'restore';
    restore.textContent = 'Restore';
    restore.addEventListener('click', () => onRestore(ws.id));

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Delete';
    del.addEventListener('click', () => onDelete(ws.id, ws.name));

    li.append(meta, restore, del);
    els.list.appendChild(li);
  }

  // Free-plan gating UI.
  const atLimit = !paid && workspaces.length >= FREE_WORKSPACE_LIMIT;
  els.upsell.hidden = !atLimit;
  els.saveWindow.disabled = atLimit;
  els.saveAll.disabled = atLimit;

  els.plan.hidden = !paid;
  els.plan.textContent = 'Pro';
  els.export.hidden = !paid;
  els.import.hidden = !paid;
}

async function refresh() {
  const res = await send({ type: 'LIST' });
  paid = res.paid;
  render(res.workspaces);
}

async function onSave(scope) {
  const res = await send({ type: 'SAVE', scope, name: els.name.value });
  if (!res.ok) {
    if (res.reason === 'LIMIT_REACHED') showMessage('Free plan limit reached — unlock for unlimited.', true);
    else if (res.reason === 'NO_TABS') showMessage('Nothing to save (only internal pages were open).', true);
    else showMessage('Could not save.', true);
    return;
  }
  els.name.value = '';
  render(res.workspaces);
  showMessage('Workspace saved.');
}

async function onRestore(id) {
  const res = await send({ type: 'RESTORE', id });
  if (!res.ok) showMessage('Could not restore that workspace.', true);
  else window.close();
}

async function onDelete(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  const res = await send({ type: 'DELETE', id });
  render(res.workspaces);
  showMessage('Workspace deleted.');
}

async function onExport() {
  const res = await send({ type: 'EXPORT' });
  if (!res.ok) return showMessage('Export is a Pro feature.', true);
  const blob = new Blob([res.json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tabstash-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
  render(res.workspaces);
  showMessage(`Imported ${res.added} workspace${res.added === 1 ? '' : 's'} (${res.skipped} skipped).`);
}

// Wire up events.
els.saveWindow.addEventListener('click', () => onSave('current'));
els.saveAll.addEventListener('click', () => onSave('all'));
els.name.addEventListener('keydown', (e) => { if (e.key === 'Enter') onSave('current'); });
els.buy.addEventListener('click', () => send({ type: 'PURCHASE' }));
els.export.addEventListener('click', onExport);
els.import.addEventListener('click', () => els.importFile.click());
els.importFile.addEventListener('change', onImportFile);

refresh();
