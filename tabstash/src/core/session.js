// core/session.js
//
// Pure, dependency-free logic for TabStash. Nothing in this file touches the
// `chrome.*` APIs, the DOM, or storage. That keeps it trivially unit-testable
// under plain Node (`node --test`) and makes the rules of the product live in
// one place instead of being smeared across UI and background code.

export const SCHEMA_VERSION = 1;
export const EXPORT_FORMAT = 'tabstash-library';
export const EXPORT_VERSION = 1;

// How many workspaces a user may keep before the one-time purchase is required.
// Kept here (not in the UI) so the free/paid boundary is covered by tests.
export const FREE_WORKSPACE_LIMIT = 3;

/**
 * URLs the browser will not let us reopen cleanly (internal pages, the new tab
 * page, extension pages, etc.). We drop these when capturing so a restored
 * workspace never contains dead or permission-blocked tabs.
 * @param {string} url
 * @returns {boolean}
 */
export function isRestorableUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  return /^(https?|file|ftp):/i.test(url);
}

/**
 * Build a stable id. `now` and `rand` are injected so tests are deterministic.
 * @param {number} now  epoch ms
 * @param {number} [rand] value in [0,1)
 * @returns {string}
 */
export function makeId(now, rand = 0) {
  const suffix = Math.floor(rand * 1e6).toString(36).padStart(4, '0');
  return `ws_${now.toString(36)}_${suffix}`;
}

/**
 * Convert raw browser window data into a clean, serializable workspace.
 *
 * @param {string} name
 * @param {Array<{tabs: Array, groups?: Array}>} windowsData
 *   Each window: { tabs: [{url,title,pinned,groupId}], groups: [{id,title,color,collapsed}] }
 *   `groupId` of -1 (Chrome's TAB_GROUP_ID_NONE) means "no group".
 * @param {number} now epoch ms
 * @param {number} [rand]
 * @returns {object} workspace
 */
export function captureToWorkspace(name, windowsData, now, rand = 0) {
  const cleanName = normalizeName(name);
  const windows = [];

  for (const win of windowsData || []) {
    const groupsById = new Map();
    for (const g of win.groups || []) {
      groupsById.set(g.id, g);
    }

    const usedGroupKeys = new Map(); // chrome groupId -> stable key within window
    const groups = [];
    const tabs = [];

    for (const tab of win.tabs || []) {
      if (!isRestorableUrl(tab.url)) continue;

      let groupKey = null;
      if (tab.groupId != null && tab.groupId !== -1) {
        if (!usedGroupKeys.has(tab.groupId)) {
          const key = `g${groups.length}`;
          usedGroupKeys.set(tab.groupId, key);
          const meta = groupsById.get(tab.groupId) || {};
          groups.push({
            key,
            title: typeof meta.title === 'string' ? meta.title : '',
            color: typeof meta.color === 'string' ? meta.color : 'grey',
            collapsed: Boolean(meta.collapsed),
          });
        }
        groupKey = usedGroupKeys.get(tab.groupId);
      }

      tabs.push({
        url: tab.url,
        title: typeof tab.title === 'string' ? tab.title : tab.url,
        pinned: Boolean(tab.pinned),
        groupKey,
      });
    }

    // Drop empty groups (every tab in them was unrestorable) and windows that
    // ended up with no tabs at all.
    const referenced = new Set(tabs.map((t) => t.groupKey).filter(Boolean));
    const liveGroups = groups.filter((g) => referenced.has(g.key));
    if (tabs.length > 0) {
      windows.push({ tabs, groups: liveGroups });
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    id: makeId(now, rand),
    name: cleanName,
    createdAt: now,
    updatedAt: now,
    windows,
  };
}

/** Trim, collapse whitespace, fall back to a dated default, cap length. */
export function normalizeName(name) {
  const trimmed = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
  const base = trimmed.length > 0 ? trimmed : 'Untitled workspace';
  return base.slice(0, 120);
}

/** Total tab count across all windows in a workspace. */
export function countTabs(workspace) {
  if (!workspace || !Array.isArray(workspace.windows)) return 0;
  return workspace.windows.reduce(
    (sum, w) => sum + (Array.isArray(w.tabs) ? w.tabs.length : 0),
    0,
  );
}

/**
 * Structurally validate a workspace. Throws an Error (with a human-readable
 * message) on the first problem; returns the workspace on success.
 */
export function validateWorkspace(ws) {
  if (!ws || typeof ws !== 'object') throw new Error('Workspace is not an object');
  if (typeof ws.id !== 'string' || ws.id.length === 0) throw new Error('Workspace is missing an id');
  if (typeof ws.name !== 'string') throw new Error('Workspace name must be a string');
  if (!Array.isArray(ws.windows)) throw new Error('Workspace windows must be an array');
  if (ws.windows.length === 0) throw new Error('Workspace has no windows');

  for (const win of ws.windows) {
    if (!win || !Array.isArray(win.tabs)) throw new Error('Window is missing its tabs array');
    if (win.tabs.length === 0) throw new Error('Window has no tabs');
    const groupKeys = new Set((win.groups || []).map((g) => g && g.key));
    for (const tab of win.tabs) {
      if (!tab || typeof tab.url !== 'string') throw new Error('Tab is missing a url');
      if (tab.groupKey != null && !groupKeys.has(tab.groupKey)) {
        throw new Error(`Tab references unknown group "${tab.groupKey}"`);
      }
    }
  }
  return ws;
}

/**
 * Turn a stored workspace into an ordered plan the background script can
 * replay with chrome.windows/tabs/tabGroups. Pure data — no side effects.
 * @returns {Array<{tabs: Array<{url,pinned,groupKey}>, groups: Array}>}
 */
export function restorePlan(workspace) {
  validateWorkspace(workspace);
  return workspace.windows.map((win) => ({
    groups: (win.groups || []).map((g) => ({ ...g })),
    tabs: win.tabs.map((t) => ({
      url: t.url,
      pinned: Boolean(t.pinned),
      groupKey: t.groupKey ?? null,
    })),
  }));
}

// --- Free / paid gating -----------------------------------------------------

/**
 * May the user save another workspace right now?
 * @param {number} currentCount existing saved workspace count
 * @param {boolean} isPaid has the one-time purchase been made
 * @param {number} [limit]
 */
export function canSave(currentCount, isPaid, limit = FREE_WORKSPACE_LIMIT) {
  if (isPaid) return true;
  return currentCount < limit;
}

// --- Export / import --------------------------------------------------------

/** Serialize the whole library to a versioned, pretty-printed JSON string. */
export function serializeLibrary(workspaces, now) {
  const list = Array.isArray(workspaces) ? workspaces : [];
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: now,
      workspaces: list,
    },
    null,
    2,
  );
}

/**
 * Parse and validate an exported library file. Throws on anything malformed or
 * produced by a newer, incompatible format version.
 * @returns {object[]} validated workspaces
 */
export function parseLibrary(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('File is not valid JSON');
  }
  if (!data || data.format !== EXPORT_FORMAT) {
    throw new Error('This is not a TabStash export file');
  }
  if (typeof data.version !== 'number' || data.version > EXPORT_VERSION) {
    throw new Error('This file was made by a newer version of TabStash');
  }
  if (!Array.isArray(data.workspaces)) {
    throw new Error('Export file has no workspaces');
  }
  data.workspaces.forEach(validateWorkspace);
  return data.workspaces;
}

/**
 * Merge imported workspaces into the existing library.
 * - Identical workspaces (same id + same updatedAt) are skipped as duplicates.
 * - An id collision on a *different* workspace gets a fresh id so nothing is
 *   silently overwritten.
 * - A name collision appends " (imported)" so both remain distinguishable.
 *
 * @returns {{merged: object[], added: number, skipped: number}}
 */
export function mergeLibraries(existing, incoming, now = Date.now(), rand = 0) {
  const merged = Array.isArray(existing) ? existing.slice() : [];
  const byId = new Map(merged.map((w) => [w.id, w]));
  const names = new Set(merged.map((w) => w.name));
  let added = 0;
  let skipped = 0;
  let bump = 0;

  for (const incomingWs of incoming || []) {
    const clash = byId.get(incomingWs.id);
    if (clash && clash.updatedAt === incomingWs.updatedAt) {
      skipped += 1;
      continue;
    }

    const copy = { ...incomingWs };
    if (clash) {
      copy.id = makeId(now + bump, rand);
      bump += 1;
    }
    if (names.has(copy.name)) {
      copy.name = `${copy.name} (imported)`;
    }
    names.add(copy.name);
    byId.set(copy.id, copy);
    merged.push(copy);
    added += 1;
  }

  return { merged, added, skipped };
}
