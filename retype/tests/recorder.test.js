// tests/recorder.test.js — unit tests for the pure product logic.
// Run with `npm test` (Node's built-in runner; no dependencies).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FREE_WINDOW_MS,
  FREE_ENTRY_LIMIT,
  MIN_TEXT_LENGTH,
  MAX_TEXT_LENGTH,
  CONTINUE_WINDOW_MS,
  DEFAULT_SETTINGS,
  makeId,
  isSensitiveField,
  shouldCaptureField,
  makeFieldKey,
  labelForField,
  pageKeyFromUrl,
  hostFromUrl,
  findCandidate,
  planSnapshot,
  countWords,
  previewOf,
  metaOf,
  upsertMeta,
  pruneIndex,
  visibleMetas,
  searchEntries,
  normalizeSettings,
  serializeArchive,
  parseArchive,
  mergeArchives,
} from '../src/core/recorder.js';

const NOW = 1_700_000_000_000;

const field = (over = {}) => ({ kind: 'textarea', type: '', name: 'story', ...over });

const snapshot = (over = {}) => ({
  url: 'https://forum.example.com/post/42?sid=abc#reply',
  title: 'Example Forum — reply',
  field: field(over.field),
  text: 'This is a long reply that took ages to write.',
  ...over,
});

/** Build an entry via the public API so tests never hand-craft the shape. */
function entryFor(over = {}, now = NOW, rand = 0.5) {
  const plan = planSnapshot(null, snapshot(over), now, rand);
  assert.equal(plan.action, 'create');
  return plan.entry;
}

// --- ids ------------------------------------------------------------------

test('makeId is deterministic and unique across time/rand', () => {
  assert.equal(makeId(NOW, 0.5), makeId(NOW, 0.5));
  assert.notEqual(makeId(NOW, 0.5), makeId(NOW + 1, 0.5));
  assert.notEqual(makeId(NOW, 0.5), makeId(NOW, 0.6));
  assert.match(makeId(NOW, 0.5), /^rt_/);
});

// --- field rules -------------------------------------------------------------

test('isSensitiveField catches passwords, cards and id numbers', () => {
  assert.equal(isSensitiveField(field({ type: 'password', name: '' })), true);
  assert.equal(isSensitiveField(field({ type: 'hidden', name: '' })), true);
  assert.equal(isSensitiveField(field({ name: 'user_password' })), true);
  assert.equal(isSensitiveField(field({ name: '', autocomplete: 'cc-number' })), true);
  assert.equal(isSensitiveField(field({ name: '', labelText: 'Card number' })), true);
  assert.equal(isSensitiveField(field({ name: '', placeholder: 'Social Security Number' })), true);
  assert.equal(isSensitiveField(field({ name: '', ariaLabel: 'One-time code' })), true);
  assert.equal(isSensitiveField(null), true);
});

test('isSensitiveField leaves ordinary fields alone', () => {
  assert.equal(isSensitiveField(field({ name: 'message' })), false);
  assert.equal(isSensitiveField(field({ kind: 'input', type: 'email', name: 'email' })), false);
  // "pin" must match as a word, not inside "shipping".
  assert.equal(isSensitiveField(field({ name: 'shipping_address' })), false);
});

test('shouldCaptureField accepts text-bearing fields and rejects the rest', () => {
  assert.equal(shouldCaptureField(field()), true);
  assert.equal(shouldCaptureField(field({ kind: 'rich', name: 'editor' })), true);
  assert.equal(shouldCaptureField(field({ kind: 'input', type: 'text' })), true);
  assert.equal(shouldCaptureField(field({ kind: 'input', type: 'search' })), true);
  assert.equal(shouldCaptureField(field({ kind: 'input', type: 'checkbox' })), false);
  assert.equal(shouldCaptureField(field({ kind: 'input', type: 'file' })), false);
  assert.equal(shouldCaptureField(field({ type: 'password' })), false);
  assert.equal(shouldCaptureField(null), false);
});

test('makeFieldKey prefers stable attributes and ignores position when it has one', () => {
  assert.equal(makeFieldKey(field({ index: 3 })), 'textarea:name=story');
  assert.equal(makeFieldKey(field({ index: 9 })), makeFieldKey(field({ index: 1 })));
  assert.equal(makeFieldKey({ kind: 'input', id: 'subject' }), 'input:id=subject');
  assert.equal(makeFieldKey({ kind: 'rich', placeholder: 'Write here' }), 'rich:ph=Write here');
  assert.equal(makeFieldKey({ kind: 'input', index: 2 }), 'input:n=2');
});

test('labelForField picks the most human attribute available', () => {
  assert.equal(labelForField({ labelText: 'Your  answer ', name: 'q1' }), 'Your answer');
  assert.equal(labelForField({ placeholder: 'Tell us more' }), 'Tell us more');
  assert.equal(labelForField({ kind: 'rich' }), 'rich');
});

test('pageKeyFromUrl strips query and fragment but keeps host and path', () => {
  assert.equal(pageKeyFromUrl('https://a.com/form?step=2#top'), 'a.com/form');
  assert.equal(pageKeyFromUrl('https://a.com/'), 'a.com/');
  assert.equal(pageKeyFromUrl('not a url'), 'not a url');
  assert.equal(hostFromUrl('https://sub.a.com:8080/x'), 'sub.a.com:8080');
  assert.equal(hostFromUrl('nope'), '');
});

// --- snapshot planning ------------------------------------------------------------

test('planSnapshot ignores text below the noise floor', () => {
  const plan = planSnapshot(null, snapshot({ text: 'hi     ' }), NOW);
  assert.equal(plan.action, 'ignore');
});

test('planSnapshot creates a well-formed entry', () => {
  const e = entryFor();
  assert.equal(e.pageKey, 'forum.example.com/post/42');
  assert.equal(e.host, 'forum.example.com');
  assert.equal(e.fieldKey, 'textarea:name=story');
  assert.equal(e.createdAt, NOW);
  assert.equal(e.updatedAt, NOW);
  assert.equal(e.text, snapshot().text);
});

test('planSnapshot updates a continuing entry in place', () => {
  const e = entryFor();
  const grown = snapshot({ text: `${e.text} And here is more.` });
  const plan = planSnapshot(e, grown, NOW + 5000);
  assert.equal(plan.action, 'update');
  assert.equal(plan.entry.id, e.id);
  assert.equal(plan.entry.createdAt, NOW);
  assert.equal(plan.entry.updatedAt, NOW + 5000);
  assert.equal(plan.entry.text, grown.text);
});

test('planSnapshot ignores an unchanged snapshot', () => {
  const e = entryFor();
  assert.equal(planSnapshot(e, snapshot(), NOW + 5000).action, 'ignore');
});

test('planSnapshot never lets a cleared field erase saved text', () => {
  const e = entryFor({ text: 'x'.repeat(200) });
  assert.equal(planSnapshot(e, snapshot({ text: '' }), NOW + 1000).action, 'ignore');
  assert.equal(planSnapshot(e, snapshot({ text: 'ok' }), NOW + 1000).action, 'ignore');
});

test('planSnapshot freezes the old entry when text shrinks drastically', () => {
  const e = entryFor({ text: 'x'.repeat(200) });
  const shrunk = snapshot({ text: 'a fresh short draft after the site wiped the form' });
  const plan = planSnapshot(e, shrunk, NOW + 1000, 0.9);
  assert.equal(plan.action, 'create');
  assert.notEqual(plan.entry.id, e.id);
});

test('planSnapshot truncates pathological text at the cap', () => {
  const plan = planSnapshot(null, snapshot({ text: 'y'.repeat(MAX_TEXT_LENGTH + 5000) }), NOW);
  assert.equal(plan.entry.text.length, MAX_TEXT_LENGTH);
});

test('findCandidate matches only same field + page within the window', () => {
  const meta = metaOf(entryFor());
  const key = { fieldKey: meta.fieldKey, pageKey: meta.pageKey };
  assert.equal(findCandidate([meta], key, NOW + 1000), meta);
  assert.equal(findCandidate([meta], key, NOW + CONTINUE_WINDOW_MS + 1), null);
  assert.equal(findCandidate([meta], { ...key, pageKey: 'other.com/' }, NOW), null);
  assert.equal(findCandidate([meta], { ...key, fieldKey: 'input:n=0' }, NOW), null);
});

test('findCandidate picks the most recently updated match', () => {
  const older = { ...metaOf(entryFor()), id: 'a', updatedAt: NOW - 1000 };
  const newer = { ...metaOf(entryFor()), id: 'b', updatedAt: NOW };
  assert.equal(findCandidate([older, newer], older, NOW).id, 'b');
});

// --- metas / index -----------------------------------------------------------------

test('metaOf summarizes an entry without its full text', () => {
  const e = entryFor({ text: 'one two   three\nfour ' });
  const m = metaOf(e);
  assert.equal(m.words, 4);
  assert.equal(m.chars, e.text.length);
  assert.equal(m.preview, 'one two three four');
  assert.equal(m.label, 'story');
  assert.equal(Object.hasOwn(m, 'text'), false);
});

test('previewOf collapses whitespace and caps length', () => {
  assert.equal(previewOf('  a\n\n b\tc  '), 'a b c');
  assert.equal(previewOf('z'.repeat(500)).length, 120);
  assert.equal(countWords(''), 0);
});

test('upsertMeta replaces by id without duplicating', () => {
  const m = metaOf(entryFor());
  const updated = { ...m, chars: 999 };
  const out = upsertMeta([m], updated);
  assert.equal(out.length, 1);
  assert.equal(out[0].chars, 999);
});

test('pruneIndex drops entries beyond retention age and count', () => {
  const metas = [
    { id: 'fresh', updatedAt: NOW },
    { id: 'old', updatedAt: NOW - 31 * 24 * 3600 * 1000 },
    { id: 'mid', updatedAt: NOW - 1000 },
  ];
  const { keep, dropIds } = pruneIndex(metas, NOW, DEFAULT_SETTINGS);
  assert.deepEqual(dropIds, ['old']);
  assert.deepEqual(keep.map((m) => m.id), ['fresh', 'mid']);

  const many = Array.from({ length: 150 }, (_, i) => ({ id: `e${i}`, updatedAt: NOW - i }));
  const capped = pruneIndex(many, NOW, { ...DEFAULT_SETTINGS, maxEntries: 100 });
  assert.equal(capped.keep.length, 100);
  assert.equal(capped.dropIds.length, 50);
  assert.equal(capped.keep[0].id, 'e0'); // newest survive
});

// --- gating ----------------------------------------------------------------------------

test('visibleMetas: paid sees everything, newest first', () => {
  const metas = [
    { id: 'a', host: 'x.com', updatedAt: NOW - 5 },
    { id: 'b', host: 'y.com', updatedAt: NOW },
    { id: 'c', host: 'x.com', updatedAt: NOW - 10 * FREE_WINDOW_MS },
  ];
  const { visible, hiddenCount } = visibleMetas(metas, { paid: true, now: NOW });
  assert.deepEqual(visible.map((m) => m.id), ['b', 'a', 'c']);
  assert.equal(hiddenCount, 0);
});

test('visibleMetas: free is capped to the recent window and entry limit', () => {
  const metas = [
    ...Array.from({ length: 8 }, (_, i) => ({ id: `new${i}`, host: 'x.com', updatedAt: NOW - i })),
    { id: 'stale', host: 'x.com', updatedAt: NOW - FREE_WINDOW_MS - 1 },
  ];
  const { visible, hiddenCount } = visibleMetas(metas, { paid: false, now: NOW });
  assert.equal(visible.length, FREE_ENTRY_LIMIT);
  assert.equal(hiddenCount, metas.length - FREE_ENTRY_LIMIT);
  assert.equal(visible.some((m) => m.id === 'stale'), false);
});

test('visibleMetas filters by host before gating', () => {
  const metas = [
    { id: 'a', host: 'x.com', updatedAt: NOW },
    { id: 'b', host: 'y.com', updatedAt: NOW },
  ];
  const { visible } = visibleMetas(metas, { paid: false, host: 'y.com', now: NOW });
  assert.deepEqual(visible.map((m) => m.id), ['b']);
});

// --- search ------------------------------------------------------------------------------

test('searchEntries requires every token, case-insensitively, across fields', () => {
  const entries = [
    { id: 'a', text: 'Dear hiring manager, I am excited', title: 'Job form', host: 'jobs.com', label: 'Cover letter', updatedAt: NOW - 10 },
    { id: 'b', text: 'my chili recipe', title: 'Blog', host: 'blog.com', label: 'Post body', updatedAt: NOW },
  ];
  assert.deepEqual(searchEntries(entries, 'HIRING excited').map((e) => e.id), ['a']);
  assert.deepEqual(searchEntries(entries, 'jobs.com cover').map((e) => e.id), ['a']);
  assert.deepEqual(searchEntries(entries, 'recipe hiring'), []);
  assert.deepEqual(searchEntries(entries, '  '), []);
});

test('searchEntries returns newest first', () => {
  const entries = [
    { id: 'old', text: 'match here', updatedAt: NOW - 100 },
    { id: 'new', text: 'match here too', updatedAt: NOW },
  ];
  assert.deepEqual(searchEntries(entries, 'match').map((e) => e.id), ['new', 'old']);
});

// --- settings -----------------------------------------------------------------------------

test('normalizeSettings clamps, defaults and dedupes', () => {
  assert.deepEqual(normalizeSettings(undefined), { ...DEFAULT_SETTINGS, pausedHosts: [] });
  const s = normalizeSettings({
    retentionDays: 9999,
    maxEntries: 1,
    pausedHosts: ['A.com', 'a.com', '', 'b.com '],
  });
  assert.equal(s.retentionDays, 365);
  assert.equal(s.maxEntries, 100);
  assert.deepEqual(s.pausedHosts, ['a.com', 'b.com']);
});

// --- export / import -----------------------------------------------------------------------

test('archive round-trips through serialize/parse', () => {
  const entries = [entryFor(), entryFor({ field: { name: 'other' } }, NOW + 1, 0.7)];
  const parsed = parseArchive(serializeArchive(entries, NOW));
  assert.deepEqual(parsed, entries);
});

test('parseArchive rejects foreign or newer files', () => {
  assert.throws(() => parseArchive('not json'), /not valid JSON/);
  assert.throws(() => parseArchive('{"format":"other"}'), /not a Retype export/);
  assert.throws(
    () => parseArchive(JSON.stringify({ format: 'retype-archive', version: 99, entries: [] })),
    /newer version/,
  );
  assert.throws(
    () => parseArchive(JSON.stringify({ format: 'retype-archive', version: 1, entries: [{}] })),
    /missing an id/,
  );
});

test('mergeArchives dedupes identical entries and re-ids collisions', () => {
  const a = entryFor();
  const b = entryFor({ field: { name: 'other' } }, NOW + 1, 0.7);
  const modifiedA = { ...a, text: 'edited elsewhere', updatedAt: NOW + 9999 };

  const { merged, added, skipped } = mergeArchives([a, b], [a, modifiedA], NOW, 0.3);
  assert.equal(skipped, 1); // exact duplicate of a
  assert.equal(added, 1); // modifiedA imported under a fresh id
  assert.equal(merged.length, 3);
  const ids = merged.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});
