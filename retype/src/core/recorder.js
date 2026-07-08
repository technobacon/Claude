// core/recorder.js
//
// Pure, dependency-free logic for Retype. Nothing in this file touches the
// `chrome.*` APIs, the DOM, or storage. That keeps it trivially unit-testable
// under plain Node (`node --test`) and makes the rules of the product live in
// one place instead of being smeared across content/background/UI code.
//
// Vocabulary:
//   snapshot — one debounced "here is what this field contains now" report
//              from the content script.
//   entry    — a stored piece of typing: one field on one page, rolled up
//              across a typing session. This is what users browse and restore.
//   meta     — the lightweight index record for an entry (everything except
//              the full text), so lists render without loading every text.

export const SCHEMA_VERSION = 1;
export const EXPORT_FORMAT = 'retype-archive';
export const EXPORT_VERSION = 1;

// --- Product boundaries (kept here, not in UI, so tests cover them) ----------

// Free tier: restore anything typed in the last 24h, up to this many entries
// per view. Pro unlocks the full archive plus search and export.
export const FREE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const FREE_ENTRY_LIMIT = 5;

// Below this many trimmed characters a snapshot is noise, not work worth
// keeping. It also means clearing a field never overwrites the saved text.
export const MIN_TEXT_LENGTH = 8;
export const MAX_TEXT_LENGTH = 200_000;
export const PREVIEW_LENGTH = 120;

// A snapshot continues an existing entry (same field, same page) if that
// entry was updated within this window; otherwise it starts a new entry.
export const CONTINUE_WINDOW_MS = 30 * 60 * 1000;

// "Shrink freeze": if a field suddenly loses more than half of a substantial
// text (site cleared the form, user selected-all-and-typed, …), the old
// version is kept and a fresh entry starts. Losing text is the one thing
// this product must never do.
export const SHRINK_FREEZE_MIN = 80;
export const SHRINK_FREEZE_RATIO = 0.5;

export const DEFAULT_SETTINGS = Object.freeze({
  retentionDays: 30,
  maxEntries: 2000,
  pausedHosts: [],
});

// --- Ids ----------------------------------------------------------------------

/**
 * Build a stable id. `now` and `rand` are injected so tests are deterministic.
 * @param {number} now epoch ms
 * @param {number} [rand] value in [0,1)
 */
export function makeId(now, rand = 0) {
  const suffix = Math.floor(rand * 1e6).toString(36).padStart(4, '0');
  return `rt_${now.toString(36)}_${suffix}`;
}

// --- Field rules ---------------------------------------------------------------

const SENSITIVE_ATTR = /pass(word|code)?|pwd|cvv|cvc|card.?num|ccnum|\bpin\b|ssn|social.?security|secret|otp|one.?time|token|iban|routing/i;
const SENSITIVE_AUTOCOMPLETE = /^cc-|password|one-time-code/i;
const CAPTURABLE_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'number']);

/**
 * Should this field's contents never be recorded?
 * The content script additionally hard-skips `type=password` before the value
 * is even read; this is the belt to that suspender, and covers fields that
 * only *look* sensitive from their attributes.
 * @param {object} field descriptor: {tag,type,name,id,autocomplete,ariaLabel,placeholder,labelText}
 */
export function isSensitiveField(field) {
  if (!field || typeof field !== 'object') return true;
  const type = String(field.type || '').toLowerCase();
  if (type === 'password' || type === 'hidden') return true;
  if (SENSITIVE_AUTOCOMPLETE.test(String(field.autocomplete || ''))) return true;
  const haystack = [field.name, field.id, field.ariaLabel, field.placeholder, field.labelText]
    .filter(Boolean)
    .join(' ');
  return SENSITIVE_ATTR.test(haystack);
}

/**
 * Is this a field Retype records at all? (kind: 'input' | 'textarea' | 'rich')
 */
export function shouldCaptureField(field) {
  if (!field || isSensitiveField(field)) return false;
  if (field.kind === 'textarea' || field.kind === 'rich') return true;
  if (field.kind === 'input') {
    return CAPTURABLE_INPUT_TYPES.has(String(field.type || '').toLowerCase());
  }
  return false;
}

/**
 * A stable identity for a field so later snapshots (and restores) find it
 * again. Prefers author-assigned attributes; falls back to the field's
 * position among editables on the page.
 */
export function makeFieldKey(field) {
  const kind = field.kind || 'input';
  if (field.name) return `${kind}:name=${field.name}`;
  if (field.id) return `${kind}:id=${field.id}`;
  if (field.ariaLabel) return `${kind}:aria=${field.ariaLabel}`;
  if (field.placeholder) return `${kind}:ph=${field.placeholder}`;
  return `${kind}:n=${field.index ?? 0}`;
}

/** Human label for a field, best attribute first. */
export function labelForField(field) {
  const raw =
    field.labelText || field.ariaLabel || field.placeholder || field.name || field.id || field.kind || 'field';
  return String(raw).replace(/\s+/g, ' ').trim().slice(0, 80);
}

/**
 * Page identity used to pair snapshots with entries. Host + path only —
 * query strings and fragments often carry session tokens and change on
 * every visit, which would orphan entries.
 */
export function pageKeyFromUrl(url) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return String(url || '').slice(0, 200);
  }
}

export function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

// --- Snapshot → entry planning ---------------------------------------------------

export function cleanText(text) {
  return String(text == null ? '' : text).slice(0, MAX_TEXT_LENGTH);
}

/**
 * Among index metas, find the entry a new snapshot should continue: same
 * field on the same page, updated recently enough. Returns the meta or null.
 */
export function findCandidate(metas, { fieldKey, pageKey }, now) {
  let best = null;
  for (const m of metas || []) {
    if (m.fieldKey !== fieldKey || m.pageKey !== pageKey) continue;
    if (now - m.updatedAt > CONTINUE_WINDOW_MS) continue;
    if (!best || m.updatedAt > best.updatedAt) best = m;
  }
  return best;
}

function isShrink(oldText, newText) {
  return (
    oldText.length >= SHRINK_FREEZE_MIN &&
    newText.length < oldText.length * SHRINK_FREEZE_RATIO
  );
}

/**
 * Decide what to do with a snapshot, given the entry it would continue (or
 * null). Returns {action: 'ignore'} or {action: 'update'|'create', entry}.
 *
 * @param {object|null} existing full entry the snapshot continues, if any
 * @param {object} snapshot {url, title, field, text}
 * @param {number} now
 * @param {number} [rand]
 */
export function planSnapshot(existing, snapshot, now, rand = 0) {
  const text = cleanText(snapshot.text);
  if (text.trim().length < MIN_TEXT_LENGTH) return { action: 'ignore' };

  if (existing) {
    if (existing.text === text) return { action: 'ignore' };
    if (!isShrink(existing.text, text)) {
      return {
        action: 'update',
        entry: { ...existing, text, updatedAt: now },
      };
    }
    // fall through: freeze the old entry, start a new one
  }

  return { action: 'create', entry: makeEntry(snapshot, text, now, rand) };
}

function makeEntry(snapshot, text, now, rand) {
  const field = snapshot.field || {};
  return {
    schemaVersion: SCHEMA_VERSION,
    id: makeId(now, rand),
    createdAt: now,
    updatedAt: now,
    url: String(snapshot.url || ''),
    pageKey: pageKeyFromUrl(snapshot.url),
    host: hostFromUrl(snapshot.url),
    title: String(snapshot.title || '').slice(0, 200),
    fieldKey: makeFieldKey(field),
    field: {
      kind: field.kind || 'input',
      type: field.type || '',
      name: field.name || '',
      id: field.id || '',
      placeholder: field.placeholder || '',
      ariaLabel: field.ariaLabel || '',
      labelText: field.labelText || '',
      index: field.index ?? 0,
    },
    text,
  };
}

// --- Metas (the index) -----------------------------------------------------------

export function countWords(text) {
  const t = String(text || '').trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

export function previewOf(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, PREVIEW_LENGTH);
}

/** The lightweight index record stored alongside the full entry. */
export function metaOf(entry) {
  return {
    id: entry.id,
    host: entry.host,
    pageKey: entry.pageKey,
    title: entry.title,
    fieldKey: entry.fieldKey,
    label: labelForField(entry.field || {}),
    kind: (entry.field && entry.field.kind) || 'input',
    preview: previewOf(entry.text),
    chars: entry.text.length,
    words: countWords(entry.text),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/** Replace or insert a meta in an index array (returns a new array). */
export function upsertMeta(metas, meta) {
  const out = (metas || []).filter((m) => m.id !== meta.id);
  out.push(meta);
  return out;
}

/**
 * Apply retention rules. Returns {keep, dropIds} where `keep` preserves the
 * surviving metas (newest first) and `dropIds` lists entries to delete.
 */
export function pruneIndex(metas, now, settings = DEFAULT_SETTINGS) {
  const s = normalizeSettings(settings);
  const maxAge = s.retentionDays * 24 * 60 * 60 * 1000;
  const sorted = [...(metas || [])].sort((a, b) => b.updatedAt - a.updatedAt);
  const keep = [];
  const dropIds = [];
  for (const m of sorted) {
    if (now - m.updatedAt > maxAge || keep.length >= s.maxEntries) dropIds.push(m.id);
    else keep.push(m);
  }
  return { keep, dropIds };
}

// --- Browsing, gating, search ------------------------------------------------------

/**
 * Which entries may this user see right now?
 * Paid: everything (optionally filtered by host), newest first.
 * Free: only entries updated within FREE_WINDOW_MS, capped at FREE_ENTRY_LIMIT;
 * `hiddenCount` powers the "N more entries locked" upsell.
 *
 * @returns {{visible: object[], hiddenCount: number}}
 */
export function visibleMetas(metas, { paid, host = null, now }) {
  let list = [...(metas || [])].sort((a, b) => b.updatedAt - a.updatedAt);
  if (host) list = list.filter((m) => m.host === host);
  if (paid) return { visible: list, hiddenCount: 0 };
  const visible = list
    .filter((m) => now - m.updatedAt <= FREE_WINDOW_MS)
    .slice(0, FREE_ENTRY_LIMIT);
  return { visible, hiddenCount: list.length - visible.length };
}

/**
 * Full-text search over entries (Pro). Every whitespace-separated token must
 * appear in the text, title, host or label. Results newest first.
 * @param {Array<{text,title,host,label,updatedAt}>} entries
 */
export function searchEntries(entries, query) {
  const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return (entries || [])
    .filter((e) => {
      const hay = `${e.text || ''} ${e.title || ''} ${e.host || ''} ${e.label || ''}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// --- Settings ------------------------------------------------------------------------

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const hosts = Array.isArray(r.pausedHosts) ? r.pausedHosts : [];
  return {
    retentionDays: clampInt(r.retentionDays, 1, 365, DEFAULT_SETTINGS.retentionDays),
    maxEntries: clampInt(r.maxEntries, 100, 20000, DEFAULT_SETTINGS.maxEntries),
    pausedHosts: [...new Set(hosts.map((h) => String(h).toLowerCase().trim()).filter(Boolean))],
  };
}

// --- Export / import ------------------------------------------------------------------

/** Structurally validate an entry. Throws on the first problem. */
export function validateEntry(e) {
  if (!e || typeof e !== 'object') throw new Error('Entry is not an object');
  if (typeof e.id !== 'string' || e.id.length === 0) throw new Error('Entry is missing an id');
  if (typeof e.text !== 'string') throw new Error('Entry text must be a string');
  if (typeof e.fieldKey !== 'string') throw new Error('Entry is missing its fieldKey');
  if (typeof e.updatedAt !== 'number') throw new Error('Entry is missing updatedAt');
  return e;
}

/** Serialize the whole archive to a versioned, pretty-printed JSON string. */
export function serializeArchive(entries, now) {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: now,
      entries: Array.isArray(entries) ? entries : [],
    },
    null,
    2,
  );
}

/**
 * Parse and validate an exported archive file. Throws on anything malformed
 * or produced by a newer, incompatible format version.
 */
export function parseArchive(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('File is not valid JSON');
  }
  if (!data || data.format !== EXPORT_FORMAT) {
    throw new Error('This is not a Retype export file');
  }
  if (typeof data.version !== 'number' || data.version > EXPORT_VERSION) {
    throw new Error('This file was made by a newer version of Retype');
  }
  if (!Array.isArray(data.entries)) {
    throw new Error('Export file has no entries');
  }
  data.entries.forEach(validateEntry);
  return data.entries;
}

/**
 * Merge imported entries into the existing archive.
 * - Identical entries (same id + same updatedAt) are skipped as duplicates.
 * - An id collision on a *different* entry gets a fresh id so nothing is
 *   silently overwritten.
 * @returns {{merged: object[], added: number, skipped: number}}
 */
export function mergeArchives(existing, incoming, now = Date.now(), rand = 0) {
  const merged = Array.isArray(existing) ? existing.slice() : [];
  const byId = new Map(merged.map((e) => [e.id, e]));
  let added = 0;
  let skipped = 0;
  let bump = 0;

  for (const entry of incoming || []) {
    const clash = byId.get(entry.id);
    if (clash && clash.updatedAt === entry.updatedAt) {
      skipped += 1;
      continue;
    }
    const copy = { ...entry };
    if (clash) {
      copy.id = makeId(now + bump, rand);
      bump += 1;
    }
    byId.set(copy.id, copy);
    merged.push(copy);
    added += 1;
  }

  return { merged, added, skipped };
}
