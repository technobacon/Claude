// Headless smoke test for the browser shell. A minimal DOM shim boots
// src/ui/main.js for real: element ids are validated against index.html (so
// HTML/JS wiring typos fail here), a run is started, and a few hundred turns
// of input are mashed through the full render path.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

// ---------------------------------------------------------------------------
// DOM shim

function makeCtx() {
  const noop = () => {};
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'canvas') return target.canvas;
      return target[prop] ?? noop;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function makeElement(tag = 'div', id = null) {
  const classes = new Set();
  const el = {
    tagName: tag.toUpperCase(),
    id,
    children: [],
    style: {},
    textContent: '',
    innerHTML: '',
    scrollTop: 0,
    scrollHeight: 0,
    onclick: null,
    width: 0,
    height: 0,
    classList: {
      toggle(cls, force) {
        const want = force === undefined ? !classes.has(cls) : force;
        if (want) classes.add(cls); else classes.delete(cls);
      },
      contains: (cls) => classes.has(cls),
      add: (cls) => classes.add(cls),
      remove: (cls) => classes.delete(cls),
    },
    appendChild(child) { el.children.push(child); return child; },
    removeChild(child) { el.children = el.children.filter((c) => c !== child); },
    get firstChild() { return el.children[0] ?? null; },
    getContext: () => makeCtx(),
    set className(v) { classes.clear(); for (const c of String(v).split(/\s+/)) if (c) classes.add(c); },
    get className() { return [...classes].join(' '); },
  };
  return el;
}

const elements = new Map();
const listeners = { keydown: [] };

globalThis.document = {
  getElementById(id) {
    if (!htmlIds.has(id)) throw new Error(`main.js asked for #${id} but index.html has no such id`);
    if (!elements.has(id)) elements.set(id, makeElement('div', id));
    return elements.get(id);
  },
  createElement: (tag) => makeElement(tag),
  addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
};

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

globalThis.window = {}; // audio falls back to silence when AudioContext is absent

let rafCallback = null;
globalThis.requestAnimationFrame = (cb) => { rafCallback = cb; return 1; };

function pressKey(key, code = key) {
  for (const fn of listeners.keydown) {
    fn({ key, code, shiftKey: false, preventDefault: () => {} });
  }
}

// ---------------------------------------------------------------------------

test('the UI boots, starts a run, survives a key-mash session and renders', async () => {
  await import('../src/ui/main.js'); // throws if any element id is miswired

  // Title screen is showing; start a run.
  assert.ok(elements.get('screen-title'), 'title screen exists');
  assert.equal(elements.get('screen-title').classList.contains('hidden'), false);
  pressKey('Enter');
  assert.equal(elements.get('screen-game').classList.contains('hidden'), false, 'game screen visible');
  assert.ok(elements.get('hud-depth').textContent.includes('DEPTH 1'), 'HUD shows depth');

  // Render some frames and mash a few hundred turns of varied input.
  const keys = [
    ['ArrowUp', 'ArrowUp'], ['ArrowDown', 'ArrowDown'], ['ArrowLeft', 'ArrowLeft'],
    ['ArrowRight', 'ArrowRight'], ['q', 'KeyQ'], ['e', 'KeyE'], ['z', 'KeyZ'], ['c', 'KeyC'],
    ['g', 'KeyG'], [' ', 'Space'], ['.', 'Period'], ['f', 'KeyF'],
  ];
  for (let i = 0; i < 400; i++) {
    const [key, code] = keys[(i * 13 + 7) % keys.length];
    pressKey(key, code);
    if (i % 10 === 0 && rafCallback) rafCallback(i * 16);
  }

  // The session either continues or ended cleanly — both screens are valid.
  const gameVisible = !elements.get('screen-game').classList.contains('hidden');
  const endVisible = !elements.get('screen-end').classList.contains('hidden');
  assert.ok(gameVisible || endVisible, 'still on a coherent screen');
  assert.ok(elements.get('log').children.length > 0, 'the message log accumulated entries');

  // Help overlay round-trips from inside a run.
  if (gameVisible) {
    pressKey('?', 'Slash');
    assert.equal(elements.get('screen-help').classList.contains('hidden'), false, 'help opened');
    pressKey('Escape', 'Escape');
    assert.equal(elements.get('screen-game').classList.contains('hidden'), false, 'back to the run');
  }
});
