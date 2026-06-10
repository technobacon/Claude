import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE, line, hasLOS, computeFOV, nextStep, floodFill, key, dist, setTile,
} from '../src/core/grid.js';

// Build a map from an ASCII picture: '#' wall, '.' floor.
function mapFrom(rows) {
  const height = rows.length;
  const width = rows[0].length;
  const tiles = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      tiles[y * width + x] = rows[y][x] === '#' ? TILE.WALL : TILE.FLOOR;
    }
  }
  return { width, height, tiles };
}

test('line includes both endpoints', () => {
  const pts = line(0, 0, 3, 3);
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts[pts.length - 1], [3, 3]);
});

test('hasLOS blocked by walls, open otherwise', () => {
  const map = mapFrom([
    '.....',
    '..#..',
    '.....',
  ]);
  assert.equal(hasLOS(map, 0, 1, 4, 1), false, 'wall in the middle blocks');
  assert.equal(hasLOS(map, 0, 0, 4, 0), true, 'open row is clear');
});

test('FOV sees through open space, stops at walls', () => {
  const map = mapFrom([
    '.......',
    '...#...',
    '.......',
  ]);
  const fov = computeFOV(map, 1, 1, 5);
  assert.ok(fov.has(key(2, 1)), 'adjacent visible');
  assert.ok(fov.has(key(3, 1)), 'the wall itself is visible');
  assert.ok(!fov.has(key(5, 1)), 'tile behind the wall is hidden');
});

test('FOV respects radius', () => {
  const map = mapFrom(['..........']);
  const fov = computeFOV(map, 0, 0, 3);
  assert.ok(fov.has(key(3, 0)));
  assert.ok(!fov.has(key(4, 0)));
});

test('nextStep routes around walls', () => {
  const map = mapFrom([
    '.#.',
    '.#.',
    '...',
  ]);
  // From (0,0) to (2,0): must go down, across, and up.
  let x = 0, y = 0;
  for (let i = 0; i < 10; i++) {
    const step = nextStep(map, x, y, 2, 0);
    if (!step) break;
    x += step[0]; y += step[1];
    if (x === 2 && y === 0) break;
  }
  assert.deepEqual([x, y], [2, 0]);
});

test('nextStep returns null when walled off', () => {
  const map = mapFrom([
    '.#.',
    '.#.',
    '.#.',
  ]);
  assert.equal(nextStep(map, 0, 1, 2, 1), null);
});

test('nextStep avoids blocked tiles but allows the goal', () => {
  const map = mapFrom(['.....']);
  const blocked = new Set([key(2, 0)]);
  // Only route to (4,0) passes through (2,0), which is blocked.
  assert.equal(nextStep(map, 0, 0, 4, 0, blocked), null);
  // But a blocked *goal* is still reachable (attacker stepping into melee).
  const step = nextStep(map, 1, 0, 2, 0, blocked);
  assert.deepEqual(step, [1, 0]);
});

test('floodFill finds the whole connected component', () => {
  const map = mapFrom([
    '..#..',
    '..#..',
    '..#..',
  ]);
  const left = floodFill(map, 0, 0);
  assert.equal(left.size, 6);
  assert.ok(!left.has(key(3, 0)));
});

test('dist is chebyshev', () => {
  assert.equal(dist(0, 0, 3, 1), 3);
  assert.equal(dist(0, 0, 2, 2), 2);
});

test('setTile writes through', () => {
  const map = mapFrom(['...']);
  setTile(map, 1, 0, TILE.STAIRS);
  assert.equal(map.tiles[1], TILE.STAIRS);
});
