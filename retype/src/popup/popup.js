// popup.js — view layer. All state changes go through the background worker.
import { timeAgo, sizeLabel } from '../ui/format.js';

const $ = (id) => document.getElementById(id);
const els = {
  plan: $('plan'),
  siteRow: $('siteRow'),
  siteHost: $('siteHost'),
  siteStatus: $('siteStatus'),
  pause: $('pause'),
  search: $('search'),
  searchLock: $('searchLock'),
  message: $('message'),
  list: $('list'),
  upsell: $('upsell'),
  upsellText: $('upsellText'),
  buy: $('buy'),
  openHistory: $('openHistory'),
  stats: $('stats'),
};

let paid = false;
let currentTab = null; // { id, host } for the page behind the popup
let paused = false;

const send = (message) => chrome.runtime.sendMessage(message);

function showMessage(text, isError = false) {
  els.message.textContent = text;
  els.message.classList.toggle('error', isError);
  els.message.hidden = !text;
  if (text) setTimeout(() => { els.message.hidden = true; }, 3500);
}

function renderSiteRow() {
  els.siteRow.hidden = !currentTab;
  if (!currentTab) return;
  els.siteHost.textContent = currentTab.host;
  els.siteStatus.textContent = paused ? 'paused' : 'recording';
  els.siteStatus.classList.toggle('off', paused);
  els.pause.textContent = paused ? 'Resume' : 'Pause site';
}

function render(metas, hiddenCount, { searching = false } = {}) {
  els.list.innerHTML = '';

  if (metas.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.innerHTML = searching
      ? '<span class="empty-icon">🔍</span>No matches.'
      : '<span class="empty-icon">⌨️</span>Nothing recorded here yet.<br>Type anywhere — Retype saves as you go,<br>ready for the next timeout or crash.';
    els.list.appendChild(li);
  }

  for (const meta of metas) {
    const li = document.createElement('li');
    li.className = 'item';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = meta.label;
    label.title = `${meta.title || meta.pageKey}`;

    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.textContent = meta.preview;

    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = `${sizeLabel(meta)} · ${timeAgo(meta.updatedAt)}${searching ? ` · ${meta.host}` : ''}`;

    const insert = document.createElement('button');
    insert.className = 'insert';
    insert.textContent = 'Insert';
    insert.title = 'Put this text back into the field on the page';
    insert.disabled = !currentTab;
    insert.addEventListener('click', () => onInsert(meta.id));

    const copy = document.createElement('button');
    copy.className = 'ghost';
    copy.textContent = 'Copy';
    copy.addEventListener('click', () => onCopy(meta.id));

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(insert, copy);

    const row = document.createElement('div');
    row.className = 'row';
    row.append(sub, actions);

    li.append(label, preview, row);
    els.list.appendChild(li);
  }

  // Free-plan gating UI.
  els.upsell.hidden = paid || hiddenCount === 0;
  if (hiddenCount > 0) {
    els.upsellText.innerHTML = `<strong>${hiddenCount} older ${hiddenCount === 1 ? 'entry is' : 'entries are'} locked.</strong> Free covers your last 24 hours.`;
  }
  els.plan.hidden = !paid;
  els.searchLock.hidden = paid;
}

async function refresh() {
  const res = await send({ type: 'LIST', host: currentTab ? currentTab.host : null });
  if (!res || !res.ok) return showMessage('Could not load entries.', true);
  paid = res.paid;
  paused = res.paused;
  renderSiteRow();
  render(res.metas, res.hiddenCount);
  els.stats.textContent = res.totalCount > 0 ? `${res.totalCount} entries archived` : '';
}

async function onSearch() {
  const query = els.search.value.trim();
  if (query.length === 0) return refresh();
  if (!paid) {
    showMessage('Search is a Pro feature.', true);
    return;
  }
  const res = await send({ type: 'SEARCH', query });
  if (!res.ok) return showMessage('Search failed.', true);
  render(res.metas, 0, { searching: true });
}

async function onInsert(id) {
  const res = await send({ type: 'RESTORE', id, tabId: currentTab.id });
  if (!res.ok) {
    showMessage(res.reason === 'LOCKED' ? 'That entry is locked — unlock Pro to restore it.' : 'Could not restore.', true);
    return;
  }
  if (res.restored) {
    showMessage('Restored into the page.');
    setTimeout(() => window.close(), 600);
  } else {
    // The exact field wasn't found — fall back to the clipboard.
    await navigator.clipboard.writeText(res.text);
    showMessage('Field not found — copied instead. Click the field and paste.');
  }
}

async function onCopy(id) {
  const res = await send({ type: 'GET_ENTRY', id });
  if (!res.ok) {
    showMessage(res.reason === 'LOCKED' ? 'That entry is locked — unlock Pro to open it.' : 'Could not load entry.', true);
    return;
  }
  await navigator.clipboard.writeText(res.entry.text);
  showMessage('Copied to clipboard.');
}

async function onTogglePause() {
  const res = await send({ type: 'TOGGLE_PAUSE', host: currentTab.host, tabId: currentTab.id });
  if (!res.ok) return;
  paused = res.paused;
  renderSiteRow();
  showMessage(paused ? `Paused on ${currentTab.host}.` : `Recording again on ${currentTab.host}.`);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && /^https?:/i.test(tab.url)) {
    currentTab = { id: tab.id, host: new URL(tab.url).host };
  }
  await refresh();
}

// Wire up events.
let searchTimer;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(onSearch, 250);
});
els.searchLock.addEventListener('click', () => send({ type: 'PURCHASE' }));
els.pause.addEventListener('click', onTogglePause);
els.buy.addEventListener('click', () => send({ type: 'PURCHASE' }));
els.openHistory.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/history/history.html') });
});

init();
