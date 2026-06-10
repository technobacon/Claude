// The art ships as code, so the art gets tests: every body must have a
// sprite, every sprite must be a well-formed 12x12 grid, and every pixel
// character must resolve to a palette color.

import test from 'node:test';
import assert from 'node:assert/strict';
import { SPRITES, THEMES, themeForDepth } from '../src/ui/sprites.js';
import { BODIES, MAX_DEPTH } from '../src/core/bodies.js';

test('every body in the bestiary has a sprite', () => {
  for (const id of Object.keys(BODIES)) {
    assert.ok(SPRITES[id], `missing sprite for ${id}`);
  }
});

test('non-body game objects have sprites', () => {
  for (const name of ['soul', 'corpse', 'essence', 'vial', 'hourglass', 'stairs',
    'shrineMend', 'shrinePreserve', 'shrineEmpower']) {
    assert.ok(SPRITES[name], `missing sprite for ${name}`);
  }
});

test('sprites are square 12x12 grids with fully defined palettes', () => {
  for (const [name, def] of Object.entries(SPRITES)) {
    assert.equal(def.rows.length, 12, `${name}: wrong row count`);
    for (const row of def.rows) {
      assert.equal(row.length, 12, `${name}: row "${row}" is not 12 wide`);
      for (const ch of row) {
        if (ch === '.') continue;
        const color = def.palette[ch];
        assert.ok(/^#[0-9a-f]{6}$/i.test(color || ''),
          `${name}: pixel char "${ch}" has no valid palette color (${color})`);
      }
    }
  }
});

test('every depth has a theme', () => {
  for (let d = 1; d <= MAX_DEPTH; d++) {
    assert.ok(themeForDepth(d), `no theme for depth ${d}`);
  }
  assert.ok(THEMES.length >= 2, 'shipping with at least two visual themes');
});
