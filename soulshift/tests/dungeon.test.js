import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/core/rng.js';
import { generateFloor } from '../src/core/dungeon.js';
import { TILE, tileAt, floodFill, key, isWalkable } from '../src/core/grid.js';
import { MAX_DEPTH, BODIES } from '../src/core/bodies.js';

const SEEDS = Array.from({ length: 25 }, (_, i) => i * 7919 + 1);

test('every generated floor is fully connected', () => {
  for (const seed of SEEDS) {
    const rng = makeRng(seed);
    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
      const floor = generateFloor(rng, depth);
      const reachable = floodFill(floor.map, floor.spawn.x, floor.spawn.y);
      let open = 0;
      for (let i = 0; i < floor.map.tiles.length; i++) {
        if (floor.map.tiles[i] !== TILE.WALL) open++;
      }
      assert.equal(reachable.size, open, `seed ${seed} depth ${depth}: unreachable tiles`);
    }
  }
});

test('non-boss floors have reachable stairs; boss floor has the Warden instead', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const rng = makeRng(seed);
    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
      const floor = generateFloor(rng, depth);
      if (depth < MAX_DEPTH) {
        assert.ok(floor.stairs, `seed ${seed} depth ${depth}: missing stairs`);
        assert.equal(tileAt(floor.map, floor.stairs.x, floor.stairs.y), TILE.STAIRS);
        const reachable = floodFill(floor.map, floor.spawn.x, floor.spawn.y);
        assert.ok(reachable.has(key(floor.stairs.x, floor.stairs.y)), 'stairs reachable');
        assert.ok(!floor.enemies.some((e) => e.type === 'warden'), 'no warden early');
      } else {
        assert.equal(floor.stairs, null);
        assert.equal(floor.enemies.filter((e) => e.type === 'warden').length, 1);
      }
    }
  }
});

test('entities and pickups spawn on walkable, sensible tiles', () => {
  for (const seed of SEEDS.slice(0, 10)) {
    const rng = makeRng(seed);
    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
      const floor = generateFloor(rng, depth);
      assert.ok(isWalkable(floor.map, floor.spawn.x, floor.spawn.y));
      for (const e of floor.enemies) {
        assert.ok(isWalkable(floor.map, e.x, e.y), 'enemy on floor');
        assert.ok(BODIES[e.type], `known enemy type ${e.type}`);
      }
      for (const p of floor.pickups) {
        assert.equal(tileAt(floor.map, p.x, p.y), TILE.FLOOR, 'pickup on plain floor');
      }
      // No two enemies share a tile.
      const tiles = floor.enemies.map((e) => key(e.x, e.y));
      assert.equal(new Set(tiles).size, tiles.length, 'no stacked enemies');
    }
  }
});

test('floors contain shrines', () => {
  let shrines = 0;
  for (const seed of SEEDS.slice(0, 10)) {
    const rng = makeRng(seed);
    const floor = generateFloor(rng, 3);
    for (let i = 0; i < floor.map.tiles.length; i++) {
      const t = floor.map.tiles[i];
      if (t === TILE.SHRINE_MEND || t === TILE.SHRINE_PRESERVE || t === TILE.SHRINE_EMPOWER) shrines++;
    }
  }
  assert.ok(shrines >= 15, `expected ~2 shrines per floor, saw ${shrines} across 10 floors`);
});

test('deeper floors hold more enemies', () => {
  const rng = makeRng(42);
  const shallow = generateFloor(rng, 1);
  const deep = generateFloor(rng, 7);
  assert.ok(deep.enemies.length > shallow.enemies.length);
});
