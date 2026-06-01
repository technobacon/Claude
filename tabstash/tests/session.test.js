// tests/session.test.js — run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isRestorableUrl,
  makeId,
  normalizeName,
  captureToWorkspace,
  countTabs,
  validateWorkspace,
  restorePlan,
  canSave,
  serializeLibrary,
  parseLibrary,
  mergeLibraries,
  FREE_WORKSPACE_LIMIT,
  SCHEMA_VERSION,
} from '../src/core/session.js';

// --- isRestorableUrl --------------------------------------------------------
test('isRestorableUrl accepts web urls and rejects internal/empty', () => {
  assert.equal(isRestorableUrl('https://example.com'), true);
  assert.equal(isRestorableUrl('http://example.com'), true);
  assert.equal(isRestorableUrl('file:///Users/me/notes.txt'), true);
  assert.equal(isRestorableUrl('chrome://settings'), false);
  assert.equal(isRestorableUrl('chrome-extension://abc/popup.html'), false);
  assert.equal(isRestorableUrl('about:blank'), false);
  assert.equal(isRestorableUrl(''), false);
  assert.equal(isRestorableUrl(null), false);
});

// --- makeId -----------------------------------------------------------------
test('makeId is deterministic for given inputs and prefixed', () => {
  const a = makeId(1700000000000, 0.5);
  const b = makeId(1700000000000, 0.5);
  assert.equal(a, b);
  assert.match(a, /^ws_/);
});

test('makeId varies with time and randomness', () => {
  assert.notEqual(makeId(1, 0.1), makeId(2, 0.1));
  assert.notEqual(makeId(1, 0.1), makeId(1, 0.9));
});

// --- normalizeName ----------------------------------------------------------
test('normalizeName trims, collapses whitespace, and defaults', () => {
  assert.equal(normalizeName('  Project   X  '), 'Project X');
  assert.equal(normalizeName(''), 'Untitled workspace');
  assert.equal(normalizeName('   '), 'Untitled workspace');
  assert.equal(normalizeName(null), 'Untitled workspace');
});

test('normalizeName caps length at 120 chars', () => {
  assert.equal(normalizeName('a'.repeat(200)).length, 120);
});

// --- captureToWorkspace -----------------------------------------------------
test('captureToWorkspace filters unrestorable tabs and keeps order', () => {
  const ws = captureToWorkspace(
    'Work',
    [
      {
        tabs: [
          { url: 'https://a.com', title: 'A', pinned: true, groupId: -1 },
          { url: 'chrome://settings', title: 'Settings', groupId: -1 },
          { url: 'https://b.com', title: 'B', pinned: false, groupId: -1 },
        ],
        groups: [],
      },
    ],
    1700000000000,
  );
  assert.equal(ws.schemaVersion, SCHEMA_VERSION);
  assert.equal(ws.name, 'Work');
  assert.equal(ws.windows.length, 1);
  assert.deepEqual(
    ws.windows[0].tabs.map((t) => t.url),
    ['https://a.com', 'https://b.com'],
  );
  assert.equal(ws.windows[0].tabs[0].pinned, true);
});

test('captureToWorkspace maps chrome groupIds to stable keys with metadata', () => {
  const ws = captureToWorkspace(
    'Grouped',
    [
      {
        tabs: [
          { url: 'https://a.com', title: 'A', groupId: 42 },
          { url: 'https://b.com', title: 'B', groupId: 42 },
          { url: 'https://c.com', title: 'C', groupId: -1 },
        ],
        groups: [{ id: 42, title: 'Research', color: 'blue', collapsed: true }],
      },
    ],
    1,
  );
  const [a, b, c] = ws.windows[0].tabs;
  assert.equal(a.groupKey, b.groupKey);
  assert.equal(c.groupKey, null);
  assert.equal(ws.windows[0].groups.length, 1);
  assert.deepEqual(ws.windows[0].groups[0], {
    key: a.groupKey,
    title: 'Research',
    color: 'blue',
    collapsed: true,
  });
});

test('captureToWorkspace drops windows that have no restorable tabs', () => {
  const ws = captureToWorkspace(
    'Empty',
    [{ tabs: [{ url: 'chrome://newtab', groupId: -1 }], groups: [] }],
    1,
  );
  assert.equal(ws.windows.length, 0);
});

test('captureToWorkspace drops groups left empty after filtering', () => {
  const ws = captureToWorkspace(
    'Mixed',
    [
      {
        tabs: [
          { url: 'chrome://x', groupId: 7 }, // filtered out -> group 7 becomes empty
          { url: 'https://keep.com', groupId: -1 },
        ],
        groups: [{ id: 7, title: 'Gone', color: 'red' }],
      },
    ],
    1,
  );
  assert.equal(ws.windows[0].groups.length, 0);
  assert.equal(ws.windows[0].tabs.length, 1);
});

// --- countTabs --------------------------------------------------------------
test('countTabs sums across windows and is safe on junk', () => {
  const ws = {
    windows: [{ tabs: [1, 2, 3] }, { tabs: [1] }],
  };
  assert.equal(countTabs(ws), 4);
  assert.equal(countTabs(null), 0);
  assert.equal(countTabs({}), 0);
});

// --- validateWorkspace ------------------------------------------------------
test('validateWorkspace accepts a captured workspace', () => {
  const ws = captureToWorkspace(
    'OK',
    [{ tabs: [{ url: 'https://a.com', groupId: -1 }], groups: [] }],
    1,
  );
  assert.equal(validateWorkspace(ws), ws);
});

test('validateWorkspace rejects structural problems with clear messages', () => {
  assert.throws(() => validateWorkspace(null), /not an object/);
  assert.throws(() => validateWorkspace({ id: '', name: 'x', windows: [] }), /missing an id/);
  assert.throws(
    () => validateWorkspace({ id: 'x', name: 'x', windows: [] }),
    /no windows/,
  );
  assert.throws(
    () => validateWorkspace({ id: 'x', name: 'x', windows: [{ tabs: [] }] }),
    /no tabs/,
  );
  assert.throws(
    () =>
      validateWorkspace({
        id: 'x',
        name: 'x',
        windows: [{ tabs: [{ url: 'https://a.com', groupKey: 'ghost' }], groups: [] }],
      }),
    /unknown group/,
  );
});

// --- restorePlan ------------------------------------------------------------
test('restorePlan returns ordered, side-effect-free instructions', () => {
  const ws = captureToWorkspace(
    'Plan',
    [
      {
        tabs: [
          { url: 'https://a.com', pinned: true, groupId: -1 },
          { url: 'https://b.com', groupId: 9 },
        ],
        groups: [{ id: 9, title: 'G', color: 'green' }],
      },
    ],
    1,
  );
  const plan = restorePlan(ws);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].tabs[0].url, 'https://a.com');
  assert.equal(plan[0].tabs[0].pinned, true);
  assert.equal(plan[0].groups[0].title, 'G');
  // plan must be a copy, not the stored object
  plan[0].groups[0].title = 'mutated';
  assert.equal(ws.windows[0].groups[0].title, 'G');
});

// --- canSave (gating) -------------------------------------------------------
test('canSave enforces the free limit until purchased', () => {
  assert.equal(canSave(0, false), true);
  assert.equal(canSave(FREE_WORKSPACE_LIMIT - 1, false), true);
  assert.equal(canSave(FREE_WORKSPACE_LIMIT, false), false);
  assert.equal(canSave(999, true), true); // paid bypasses the limit
});

// --- serialize / parse round trip ------------------------------------------
test('serializeLibrary -> parseLibrary round-trips workspaces', () => {
  const ws = captureToWorkspace(
    'Round',
    [{ tabs: [{ url: 'https://a.com', groupId: -1 }], groups: [] }],
    1,
  );
  const json = serializeLibrary([ws], 123);
  const back = parseLibrary(json);
  assert.deepEqual(back, [ws]);
});

test('parseLibrary rejects junk, wrong format, and future versions', () => {
  assert.throws(() => parseLibrary('not json'), /valid JSON/);
  assert.throws(() => parseLibrary('{"format":"other"}'), /not a TabStash export/);
  assert.throws(
    () => parseLibrary('{"format":"tabstash-library","version":999,"workspaces":[]}'),
    /newer version/,
  );
});

// --- mergeLibraries ---------------------------------------------------------
function wsFixture(id, name, updatedAt = 100) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    createdAt: 1,
    updatedAt,
    windows: [{ tabs: [{ url: 'https://a.com', pinned: false, groupKey: null }], groups: [] }],
  };
}

test('mergeLibraries skips exact duplicates', () => {
  const existing = [wsFixture('a', 'Alpha', 100)];
  const { merged, added, skipped } = mergeLibraries(existing, [wsFixture('a', 'Alpha', 100)]);
  assert.equal(added, 0);
  assert.equal(skipped, 1);
  assert.equal(merged.length, 1);
});

test('mergeLibraries reassigns id on collision with a changed workspace', () => {
  const existing = [wsFixture('a', 'Alpha', 100)];
  const { merged, added } = mergeLibraries(existing, [wsFixture('a', 'Beta', 200)], 5, 0.5);
  assert.equal(added, 1);
  assert.equal(merged.length, 2);
  assert.notEqual(merged[1].id, 'a'); // got a fresh id
});

test('mergeLibraries disambiguates colliding names', () => {
  const existing = [wsFixture('a', 'Alpha', 100)];
  const { merged } = mergeLibraries(existing, [wsFixture('b', 'Alpha', 200)]);
  assert.equal(merged[1].name, 'Alpha (imported)');
});

test('mergeLibraries appends genuinely new workspaces untouched', () => {
  const existing = [wsFixture('a', 'Alpha')];
  const { merged, added } = mergeLibraries(existing, [wsFixture('b', 'Bravo')]);
  assert.equal(added, 1);
  assert.equal(merged[1].id, 'b');
  assert.equal(merged[1].name, 'Bravo');
});
