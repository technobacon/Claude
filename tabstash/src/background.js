// background.js — MV3 service worker.
//
// Responsibilities: talk to the chrome.* APIs, and delegate every decision to
// the pure logic in core/session.js. The popup never touches chrome.tabs
// directly; it sends messages here.

import {
  captureToWorkspace,
  restorePlan,
  canSave,
  countTabs,
  serializeLibrary,
  parseLibrary,
  mergeLibraries,
} from './core/session.js';
import {
  getWorkspaces,
  setWorkspaces,
  addWorkspace,
  deleteWorkspace,
  renameWorkspace,
} from './core/storage.js';
import { isPaid, openPurchaseFlow } from './lib/payments.js';

// --- Capturing browser state into a workspace -------------------------------

/** Read one window's tabs + groups into the shape captureToWorkspace expects. */
async function readWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  let groups = [];
  try {
    groups = await chrome.tabGroups.query({ windowId });
  } catch {
    // tabGroups can be unavailable in some contexts; degrade gracefully.
    groups = [];
  }
  return {
    tabs: tabs
      .sort((a, b) => a.index - b.index)
      .map((t) => ({ url: t.url, title: t.title, pinned: t.pinned, groupId: t.groupId })),
    groups: groups.map((g) => ({
      id: g.id,
      title: g.title,
      color: g.color,
      collapsed: g.collapsed,
    })),
  };
}

async function captureCurrentWindow(name) {
  const win = await chrome.windows.getCurrent();
  const data = await readWindow(win.id);
  return captureToWorkspace(name, [data], Date.now(), Math.random());
}

async function captureAllWindows(name) {
  const wins = await chrome.windows.getAll();
  const data = [];
  for (const w of wins) {
    if (w.type === 'normal') data.push(await readWindow(w.id));
  }
  return captureToWorkspace(name, data, Date.now(), Math.random());
}

// --- Restoring a workspace into real windows/tabs/groups --------------------

async function restoreWorkspace(workspace) {
  const plan = restorePlan(workspace);

  for (const win of plan) {
    if (win.tabs.length === 0) continue;

    // Open the window on the first tab, then add the rest.
    const created = await chrome.windows.create({ url: win.tabs[0].url });
    const newTabIds = [created.tabs[0].id];
    if (win.tabs[0].pinned) {
      await chrome.tabs.update(created.tabs[0].id, { pinned: true });
    }

    for (let i = 1; i < win.tabs.length; i += 1) {
      const t = win.tabs[i];
      const tab = await chrome.tabs.create({
        windowId: created.id,
        url: t.url,
        pinned: t.pinned,
        active: false,
      });
      newTabIds.push(tab.id);
    }

    // Recreate tab groups within this window.
    const groupMeta = new Map(win.groups.map((g) => [g.key, g]));
    const byGroupKey = new Map(); // key -> [tabId,...]
    win.tabs.forEach((t, i) => {
      if (!t.groupKey) return;
      if (!byGroupKey.has(t.groupKey)) byGroupKey.set(t.groupKey, []);
      byGroupKey.get(t.groupKey).push(newTabIds[i]);
    });

    for (const [key, tabIds] of byGroupKey.entries()) {
      try {
        const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId: created.id } });
        const meta = groupMeta.get(key);
        if (meta) {
          await chrome.tabGroups.update(groupId, {
            title: meta.title || '',
            color: meta.color || 'grey',
            collapsed: Boolean(meta.collapsed),
          });
        }
      } catch (err) {
        console.warn('[TabStash] could not recreate group', key, err);
      }
    }
  }
}

// --- Message router ---------------------------------------------------------

async function handle(message) {
  switch (message.type) {
    case 'LIST': {
      const [workspaces, paid] = await Promise.all([getWorkspaces(), isPaid()]);
      return { ok: true, workspaces, paid };
    }

    case 'SAVE': {
      const existing = await getWorkspaces();
      const paid = await isPaid();
      if (!canSave(existing.length, paid)) {
        return { ok: false, reason: 'LIMIT_REACHED' };
      }
      const ws =
        message.scope === 'all'
          ? await captureAllWindows(message.name)
          : await captureCurrentWindow(message.name);
      if (countTabs(ws) === 0) return { ok: false, reason: 'NO_TABS' };
      const workspaces = await addWorkspace(ws);
      return { ok: true, workspaces };
    }

    case 'RESTORE': {
      const list = await getWorkspaces();
      const ws = list.find((w) => w.id === message.id);
      if (!ws) return { ok: false, reason: 'NOT_FOUND' };
      await restoreWorkspace(ws);
      return { ok: true };
    }

    case 'DELETE': {
      const workspaces = await deleteWorkspace(message.id);
      return { ok: true, workspaces };
    }

    case 'RENAME': {
      const workspaces = await renameWorkspace(message.id, message.name);
      return { ok: true, workspaces };
    }

    case 'EXPORT': {
      if (!(await isPaid())) return { ok: false, reason: 'LOCKED' };
      const list = await getWorkspaces();
      return { ok: true, json: serializeLibrary(list, Date.now()) };
    }

    case 'IMPORT': {
      if (!(await isPaid())) return { ok: false, reason: 'LOCKED' };
      let incoming;
      try {
        incoming = parseLibrary(message.json);
      } catch (err) {
        return { ok: false, reason: 'BAD_FILE', message: err.message };
      }
      const existing = await getWorkspaces();
      const { merged, added, skipped } = mergeLibraries(
        existing,
        incoming,
        Date.now(),
        Math.random(),
      );
      await setWorkspaces(merged);
      return { ok: true, workspaces: merged, added, skipped };
    }

    case 'PURCHASE': {
      await openPurchaseFlow();
      return { ok: true };
    }

    default:
      return { ok: false, reason: 'UNKNOWN_MESSAGE' };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((err) => {
      console.error('[TabStash]', err);
      sendResponse({ ok: false, reason: 'ERROR', message: String(err && err.message) });
    });
  return true; // keep the channel open for the async response
});

// Keyboard shortcut: quick-save the current window.
chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'save-window') return;
  const existing = await getWorkspaces();
  if (!canSave(existing.length, await isPaid())) return;
  const ws = await captureCurrentWindow('Quick save');
  if (countTabs(ws) > 0) await addWorkspace(ws);
});
