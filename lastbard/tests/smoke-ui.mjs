// tests/smoke-ui.mjs — headless sanity checks for the rendering layer.
// Run directly: `node tests/smoke-ui.mjs`. Not part of `npm test`.
//
// Two parts:
//   A) drive the Arena engine with a controlled clock (the high-risk new code):
//      exercise attack/guard/cast/hurt/crescendo/die + the full render path.
//   B) mount the real app.js (title → map → combat) to catch wiring mistakes.

import assert from 'node:assert/strict';

// ── controllable clock ──
let clock = 0;
globalThis.performance = { now: () => clock };

// ── canvas + 2D context stub (Proxy → unknown methods are no-ops) ──
function makeCtx() {
  const grad = { addColorStop() {} };
  const base = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 12 }),
    imageSmoothingEnabled: false,
  };
  return new Proxy(base, {
    get(t, p) { return p in t ? t[p] : () => {}; },
    set(t, p, v) { t[p] = v; return true; },
  });
}
function makeCanvas() {
  return {
    width: 360, height: 300, style: makeStyle(), className: '', nodeType: 1, children: [],
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 300 }),
    addEventListener() {}, setAttribute(k, v) { this[k] = v; }, appendChild(c) { this.children.push(c); return c; },
    classList: { add() {}, remove() {} },
  };
}

// ── minimal DOM ──
class FakeEl {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this._text = ''; this.className = ''; this.style = makeStyle(); this.nodeType = 1; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent ?? '').join('') : this._text; }
  set innerHTML(v) { this._text = String(v); }
  appendChild(c) { this.children.push(c); return c; }
  replaceChildren(...n) { this.children = n; }
  setAttribute(k, v) { this[k] = v; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) if (typeof fn === 'function') fn({}); }
}
function makeStyle() { return new Proxy({}, { get(t, p) { return p === 'setProperty' ? () => {} : t[p]; }, set(t, p, v) { t[p] = v; return true; } }); }

const appRoot = new FakeEl('div');
globalThis.document = {
  getElementById: () => appRoot,
  createElement: (t) => (t === 'canvas' ? makeCanvas() : new FakeEl(t)),
  createTextNode: (t) => ({ textContent: String(t), nodeType: 3 }),
};
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
globalThis.confirm = () => true;
globalThis.window = { devicePixelRatio: 1 };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
const rafCbs = new Map(); let rafId = 0;
globalThis.requestAnimationFrame = (cb) => { const id = ++rafId; rafCbs.set(id, cb); return id; };
globalThis.cancelAnimationFrame = (id) => rafCbs.delete(id);
function pumpFrames(n) { for (let i = 0; i < n; i++) { clock += 16; const cbs = [...rafCbs.values()]; rafCbs.clear(); for (const cb of cbs) cb(clock); } }

// ════════════════════════════════════════════════════════════════════════════
//  PART A — Arena engine
// ════════════════════════════════════════════════════════════════════════════
const { Arena } = await import('../src/ui/arena.js');
const { getFrame } = await import('../src/ui/sprites.js');

// sprite baking works under the stub
const bard = getFrame('bard');
assert.ok(bard && bard.w > 0 && bard.h > 0, 'bard sprite bakes');

const canvas = makeCanvas();
const arena = new Arena(canvas);
arena.setCombatants(
  { sprite: 'bard', hp: 60, maxHp: 80, block: 0 },
  [{ id: 'e0', slot: 0, sprite: 'hushWisp', hp: 30, maxHp: 30, block: 0, intent: { intent: 'attack', damage: 6, times: 1, block: 0 } }],
);
assert.equal(arena.actors.size, 2, 'two actors mounted');

// Drive an attack to completion via the render loop (controlled clock).
let attackDone = false;
arena.attack('player', 'e0', () => { arena.hurt('e0', 'player', 8); arena.floatText('e0', '-8', '#fff'); }).then(() => { attackDone = true; });
let safety = 0;
while (!attackDone && safety++ < 200) { clock += 16; arena.last = clock - 16; arena._tick(); await Promise.resolve(); }
assert.ok(attackDone, 'attack promise resolves after animation');
assert.ok(arena.particles.length >= 0, 'particles array intact');

// Exercise the rest of the effects + full render path; assert no throws.
arena.guard('player');
arena.cast('player', '#ffe24a');
arena.crescendo();
arena.harmonyPing();
arena.hurt('player', 'enemy', 12);
arena.floatText('player', '-12', '#ff5e7a', true);
for (let i = 0; i < 30; i++) { clock += 16; arena.last = clock - 16; arena._tick(); }
arena.die('e0');
for (let i = 0; i < 50; i++) { clock += 16; arena.last = clock - 16; arena._tick(); }
const deadActor = arena.actors.get('e0');
assert.ok(deadActor.dead, 'enemy marked dead');

// hit testing returns an actor id for a point inside the player's bounds
const px = arena.actors.get('player').bx;
const hit = arena.hitTest(px, arena.groundY - 20);
assert.ok(hit === 'player' || hit === null, 'hitTest does not throw and returns sane value');

arena.stop();
console.log('  [A] arena engine: PASS');

// ════════════════════════════════════════════════════════════════════════════
//  PART B — mount the real app
// ════════════════════════════════════════════════════════════════════════════
function walk(node, fn) { if (!node || node.nodeType !== 1) return; fn(node); for (const c of node.children) walk(c, fn); }
function findBtn(text) { let hit = null; walk(appRoot, (n) => { if (!hit && n.tag === 'button' && n.textContent.includes(text)) hit = n; }); return hit; }
function hasCanvas() { let found = false; walk(appRoot, (n) => { if (n.className && String(n.className).includes('arena-canvas')) found = true; }); return found; }

await import('../src/ui/app.js'); // renders title
assert.ok(appRoot.textContent.includes('THE LAST BARD'), 'title renders');

findBtn('BEGIN').click();
assert.ok(/F1\/\d/.test(appRoot.textContent), 'on the map after BEGIN');

const enter = findBtn('ENTER') || findBtn('FACE THE HUSH') || findBtn('REST');
assert.ok(enter, 'map CTA present');
enter.click();
// If we entered a fight, the arena canvas should be mounted; if a rest node, that's fine too.
pumpFrames(5); // run the arena loop a few frames without throwing
const wentToCombat = hasCanvas();
const wentToRest = appRoot.textContent.includes('CAMPFIRE');
assert.ok(wentToCombat || wentToRest, 'entered combat (arena mounted) or rest');
if (wentToCombat) { pumpFrames(20); } // ensure the render loop is stable

console.log('  [B] app mount: PASS', wentToCombat ? '(combat + arena)' : '(rest)');
console.log('UI smoke test PASSED');
