// core/storage.js
//
// Thin async wrapper around chrome.storage.local. Intentionally dumb: all the
// real rules live in recorder.js (and are unit-tested).
//
// Layout: entries are sharded one-per-key so a keystroke only rewrites the
// entry being typed into (plus the small index), never the whole archive.
//   retype:index        -> [meta, ...]         (see recorder.metaOf)
//   retype:entry:<id>   -> full entry
//   retype:settings     -> settings object

const INDEX_KEY = 'retype:index';
const SETTINGS_KEY = 'retype:settings';
const entryKey = (id) => `retype:entry:${id}`;

/** @returns {Promise<object[]>} stored index metas (empty array if none). */
export async function getIndex() {
  const out = await chrome.storage.local.get(INDEX_KEY);
  const list = out[INDEX_KEY];
  return Array.isArray(list) ? list : [];
}

export async function setIndex(metas) {
  await chrome.storage.local.set({ [INDEX_KEY]: metas });
}

/** @returns {Promise<object|null>} */
export async function getEntry(id) {
  const key = entryKey(id);
  const out = await chrome.storage.local.get(key);
  return out[key] || null;
}

/** Batch-load entries by id; missing ids are silently dropped. */
export async function getEntries(ids) {
  if (!ids || ids.length === 0) return [];
  const keys = ids.map(entryKey);
  const out = await chrome.storage.local.get(keys);
  return keys.map((k) => out[k]).filter(Boolean);
}

export async function setEntry(entry) {
  await chrome.storage.local.set({ [entryKey(entry.id)]: entry });
}

export async function removeEntries(ids) {
  if (!ids || ids.length === 0) return;
  await chrome.storage.local.remove(ids.map(entryKey));
}

/** @returns {Promise<object>} raw settings (recorder.normalizeSettings cleans it). */
export async function getSettings() {
  const out = await chrome.storage.local.get(SETTINGS_KEY);
  return out[SETTINGS_KEY] || {};
}

export async function setSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}
