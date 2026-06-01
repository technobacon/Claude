// core/storage.js
//
// Thin async wrapper around chrome.storage.local. Intentionally dumb: all the
// real rules live in session.js (and are unit-tested). This file only persists
// and retrieves the array of workspaces.

const KEY = 'tabstash:workspaces';

/** @returns {Promise<object[]>} stored workspaces (empty array if none). */
export async function getWorkspaces() {
  const out = await chrome.storage.local.get(KEY);
  const list = out[KEY];
  return Array.isArray(list) ? list : [];
}

/** Overwrite the whole library. @param {object[]} workspaces */
export async function setWorkspaces(workspaces) {
  await chrome.storage.local.set({ [KEY]: workspaces });
}

/** Append one workspace and persist. @returns {Promise<object[]>} */
export async function addWorkspace(workspace) {
  const list = await getWorkspaces();
  list.unshift(workspace); // newest first
  await setWorkspaces(list);
  return list;
}

/** Remove by id and persist. @returns {Promise<object[]>} */
export async function deleteWorkspace(id) {
  const list = (await getWorkspaces()).filter((w) => w.id !== id);
  await setWorkspaces(list);
  return list;
}

/** Rename by id and bump updatedAt. @returns {Promise<object[]>} */
export async function renameWorkspace(id, name, now = Date.now()) {
  const list = await getWorkspaces();
  for (const w of list) {
    if (w.id === id) {
      w.name = name;
      w.updatedAt = now;
    }
  }
  await setWorkspaces(list);
  return list;
}
