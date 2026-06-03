// tests/smoke-ui.mjs — headless sanity check of the UI layer.
//
// Not part of `npm test` (it's not a unit test); run directly with
// `node tests/smoke-ui.mjs`. It stubs a minimal DOM, loads the real app.js,
// and drives a few taps to prove the view renders and routes events without
// throwing. Catches wiring mistakes that the pure-core tests can't.

import assert from 'node:assert/strict';

// --- minimal DOM ------------------------------------------------------------
class FakeEl {
  constructor(tag) {
    this.tag = tag; this.children = []; this.listeners = {};
    this.attrs = {}; this._text = ''; this.className = ''; this.style = '';
    this.nodeType = 1;
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent ?? '').join('');
    return this._text;
  }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...n) { this.children = n; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) if (typeof fn === 'function') fn({}); }
}

const appRoot = new FakeEl('div');
global.document = {
  getElementById: () => appRoot,
  createElement: (t) => new FakeEl(t),
  createTextNode: (t) => ({ textContent: String(t), nodeType: 3 }),
};
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: (k) => store.delete(k),
};
global.confirm = () => true;

// --- tree helpers -----------------------------------------------------------
function walk(node, fn) {
  if (!node || node.nodeType !== 1) return;
  fn(node);
  for (const c of node.children) walk(c, fn);
}
function findByText(node, text) {
  let hit = null;
  walk(node, (n) => { if (!hit && n.tag === 'button' && n.textContent.includes(text)) hit = n; });
  return hit;
}
function findCards(node) {
  const out = [];
  walk(node, (n) => { if ((n.className || '').includes('card') && (n.listeners.click || []).length) out.push(n); });
  return out;
}
function screenText() { return appRoot.textContent; }

// --- drive it ---------------------------------------------------------------
await import('../src/ui/app.js'); // renders the title screen on load

assert.ok(screenText().includes('SPIRELING'), 'title screen should render');

const newRun = findByText(appRoot, 'New Run');
assert.ok(newRun, 'New Run button present');
newRun.click();
assert.ok(/Floor 1\/\d/.test(screenText()), 'should be on the map after New Run');

// Enter the first node (a fight) and play a turn.
const enter = findByText(appRoot, 'Enter') || findByText(appRoot, 'Face the Boss');
assert.ok(enter, 'Enter button present on map');
enter.click();
assert.ok(screenText().includes('End Turn'), 'combat screen should render');

// Tap a few cards (then any revealed enemy target), then end the turn — several
// times — to exercise playing, targeting, enemy turns, drawing and re-render.
for (let round = 0; round < 6; round++) {
  for (let i = 0; i < 5; i++) {
    const cards = findCards(appRoot);
    if (!cards.length) break;
    cards[0].click();
    // If that selected a card, an enemy may now be targetable.
    walk(appRoot, (n) => {
      if ((n.className || '').includes('targetable') && (n.listeners.click || []).length) n.click();
    });
  }
  const endBtn = findByText(appRoot, 'End Turn');
  if (endBtn) endBtn.click();
  // Combat may have ended (win/lose) → reward/rest/map/end screen; that's fine.
  if (!screenText().includes('End Turn')) break;
}

console.log('UI smoke test PASSED — rendered and handled taps across:',
  screenText().includes('Victory') ? 'a victory' :
  screenText().includes('DIED') ? 'a defeat' :
  screenText().includes('End Turn') ? 'ongoing combat' : 'a transition');
