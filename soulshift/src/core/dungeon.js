// Procedural floor generation: rooms + corridors, guaranteed connected.
// Pure: takes an rng, returns plain data. No chrome, no DOM, no globals.

import { TILE, setTile, tileAt, floodFill, key, dist } from './grid.js';
import { SPAWN_TABLES, enemyCountForDepth, MAX_DEPTH } from './bodies.js';

const WIDTH = 44;
const HEIGHT = 28;

function emptyMap() {
  return { width: WIDTH, height: HEIGHT, tiles: new Uint8Array(WIDTH * HEIGHT) };
}

function carveRoom(map, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      setTile(map, x, y, TILE.FLOOR);
    }
  }
}

function carveCorridor(map, x0, y0, x1, y1, rng) {
  // L-shaped corridor; orientation randomized so layouts vary.
  let x = x0, y = y0;
  const horizFirst = rng.chance(0.5);
  const carve = () => setTile(map, x, y, TILE.FLOOR);
  carve();
  const moveX = () => { while (x !== x1) { x += Math.sign(x1 - x); carve(); } };
  const moveY = () => { while (y !== y1) { y += Math.sign(y1 - y); carve(); } };
  if (horizFirst) { moveX(); moveY(); } else { moveY(); moveX(); }
}

function roomsOverlap(a, b) {
  // 1-tile gutter so rooms never share walls.
  return a.x - 1 < b.x + b.w && a.x + a.w + 1 > b.x &&
         a.y - 1 < b.y + b.h && a.y + a.h + 1 > b.y;
}

function center(room) {
  return { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
}

function placeRooms(map, rng, count) {
  const rooms = [];
  for (let attempts = 0; attempts < 200 && rooms.length < count; attempts++) {
    const w = rng.int(5, 9);
    const h = rng.int(4, 7);
    const room = { x: rng.int(1, WIDTH - w - 2), y: rng.int(1, HEIGHT - h - 2), w, h };
    if (rooms.some((r) => roomsOverlap(r, room))) continue;
    rooms.push(room);
    carveRoom(map, room);
  }
  // Connect rooms in a chain, then add a couple of loops for tactical routing.
  for (let i = 1; i < rooms.length; i++) {
    const a = center(rooms[i - 1]);
    const b = center(rooms[i]);
    carveCorridor(map, a.x, a.y, b.x, b.y, rng);
  }
  const loops = Math.min(2, Math.max(0, rooms.length - 3));
  for (let i = 0; i < loops; i++) {
    const a = center(rng.pick(rooms));
    const b = center(rng.pick(rooms));
    carveCorridor(map, a.x, a.y, b.x, b.y, rng);
  }
  return rooms;
}

// Random floor tile inside a room, avoiding tiles already in `taken`.
function spotIn(room, rng, taken) {
  for (let i = 0; i < 40; i++) {
    const x = rng.int(room.x, room.x + room.w - 1);
    const y = rng.int(room.y, room.y + room.h - 1);
    if (!taken.has(key(x, y))) {
      taken.add(key(x, y));
      return { x, y };
    }
  }
  return null;
}

export function generateFloor(rng, depth) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const floor = tryGenerate(rng, depth);
    if (floor) return floor;
  }
  throw new Error('dungeon generation failed for depth ' + depth);
}

function tryGenerate(rng, depth) {
  const map = emptyMap();
  const isBossFloor = depth >= MAX_DEPTH;
  const rooms = placeRooms(map, rng, isBossFloor ? 6 : rng.int(7, 9));
  if (rooms.length < 4) return null;

  // Verify every carved tile is reachable from the first room.
  const c0 = center(rooms[0]);
  const reachable = floodFill(map, c0.x, c0.y);
  let floorTiles = 0;
  for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] !== TILE.WALL) floorTiles++;
  if (reachable.size !== floorTiles) return null;

  const taken = new Set();
  const spawn = spotIn(rooms[0], rng, taken);
  if (!spawn) return null;

  // Stairs (or the Warden's arena) go in the room farthest from spawn.
  const byDist = rooms
    .slice(1)
    .sort((a, b) => dist(spawn.x, spawn.y, ...Object.values(center(b))) -
                    dist(spawn.x, spawn.y, ...Object.values(center(a))));
  const farRoom = byDist[0];

  let stairs = null;
  const enemies = [];
  if (isBossFloor) {
    const c = center(farRoom);
    taken.add(key(c.x, c.y));
    enemies.push({ type: 'warden', x: c.x, y: c.y });
  } else {
    stairs = spotIn(farRoom, rng, taken);
    if (!stairs) return null;
    setTile(map, stairs.x, stairs.y, TILE.STAIRS);
  }

  // Shrines: two per floor, distinct types, never in the spawn room.
  const shrineTiles = rng.shuffle([TILE.SHRINE_MEND, TILE.SHRINE_PRESERVE, TILE.SHRINE_EMPOWER]).slice(0, 2);
  const shrineRooms = rng.shuffle(rooms.slice(1));
  for (let i = 0; i < shrineTiles.length && i < shrineRooms.length; i++) {
    const spot = spotIn(shrineRooms[i], rng, taken);
    if (spot) setTile(map, spot.x, spot.y, shrineTiles[i]);
  }

  // Enemies: spawned away from the player's starting room.
  const table = SPAWN_TABLES[Math.min(depth, MAX_DEPTH)].map(([type, weight]) => ({ item: type, weight }));
  const count = enemyCountForDepth(depth);
  for (let i = 0; i < count; i++) {
    const room = rng.pick(rooms.slice(1));
    const spot = spotIn(room, rng, taken);
    if (!spot) continue;
    if (dist(spot.x, spot.y, spawn.x, spawn.y) < 6) continue;
    enemies.push({ type: rng.weighted(table), x: spot.x, y: spot.y });
  }

  // Pickups: essence piles plus the two consumables.
  const pickups = [];
  const dropIn = (kind, amount) => {
    const room = rng.pick(rooms);
    const spot = spotIn(room, rng, taken);
    if (spot && tileAt(map, spot.x, spot.y) === TILE.FLOOR) {
      pickups.push({ kind, x: spot.x, y: spot.y, amount });
    }
  };
  const essencePiles = rng.int(2, 3);
  for (let i = 0; i < essencePiles; i++) dropIn('essence', rng.int(2, 4) + depth);
  for (let i = 0; i < 2; i++) dropIn('vial', 0);
  dropIn('hourglass', 0);

  return { map, rooms, spawn, stairs, enemies, pickups, depth, isBossFloor };
}
