// Grid math: tiles, line-of-sight, field of view, pathfinding.
// Pure functions over a map object { width, height, tiles } where tiles is a
// flat Uint8Array indexed [y * width + x].

export const TILE = {
  WALL: 0,
  FLOOR: 1,
  STAIRS: 2,
  SHRINE_MEND: 3,
  SHRINE_PRESERVE: 4,
  SHRINE_EMPOWER: 5,
};

export function inBounds(map, x, y) {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function tileAt(map, x, y) {
  if (!inBounds(map, x, y)) return TILE.WALL;
  return map.tiles[y * map.width + x];
}

export function setTile(map, x, y, t) {
  map.tiles[y * map.width + x] = t;
}

export function isWalkable(map, x, y) {
  return tileAt(map, x, y) !== TILE.WALL;
}

export function key(x, y) {
  return x + ',' + y;
}

export function dist(ax, ay, bx, by) {
  // Chebyshev distance — the game uses 8-directional movement.
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export const DIRS8 = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export const DIRS4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];

// Bresenham line from (x0,y0) to (x1,y1) inclusive.
export function line(x0, y0, x1, y1) {
  const points = [];
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  for (;;) {
    points.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return points;
}

// True if no wall strictly between the two points (endpoints may be walls).
export function hasLOS(map, x0, y0, x1, y1) {
  const pts = line(x0, y0, x1, y1);
  for (let i = 1; i < pts.length - 1; i++) {
    if (tileAt(map, pts[i][0], pts[i][1]) === TILE.WALL) return false;
  }
  return true;
}

// Field of view by ray casting to the perimeter of the radius square.
// Returns a Set of "x,y" keys. Walls on the boundary are included (visible).
export function computeFOV(map, ox, oy, radius) {
  const visible = new Set([key(ox, oy)]);
  const cast = (tx, ty) => {
    const pts = line(ox, oy, tx, ty);
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i];
      if (dist(ox, oy, x, y) > radius) break;
      visible.add(key(x, y));
      if (tileAt(map, x, y) === TILE.WALL) break;
    }
  };
  for (let x = ox - radius; x <= ox + radius; x++) {
    cast(x, oy - radius);
    cast(x, oy + radius);
  }
  for (let y = oy - radius; y <= oy + radius; y++) {
    cast(ox - radius, y);
    cast(ox + radius, y);
  }
  return visible;
}

// BFS shortest path next-step from (sx,sy) toward (tx,ty).
// `blocked` is a Set of "x,y" keys that cannot be entered (other entities) —
// the target tile is always allowed so attackers can path into melee range.
// Returns [dx, dy] for the first step, or null if unreachable.
export function nextStep(map, sx, sy, tx, ty, blocked = new Set(), maxNodes = 2000) {
  if (sx === tx && sy === ty) return null;
  const start = key(sx, sy);
  const goal = key(tx, ty);
  const cameFrom = new Map([[start, null]]);
  const queue = [[sx, sy]];
  let found = false;
  let nodes = 0;
  while (queue.length && nodes < maxNodes) {
    const [cx, cy] = queue.shift();
    nodes++;
    if (cx === tx && cy === ty) { found = true; break; }
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx, ny = cy + dy;
      const k = key(nx, ny);
      if (cameFrom.has(k)) continue;
      if (!isWalkable(map, nx, ny)) continue;
      if (blocked.has(k) && k !== goal) continue;
      cameFrom.set(k, key(cx, cy));
      queue.push([nx, ny]);
    }
  }
  if (!found) return null;
  // Walk back from goal to the node whose parent is start.
  let cur = goal;
  while (cameFrom.get(cur) !== start) {
    cur = cameFrom.get(cur);
    if (cur === null) return null;
  }
  const [nx, ny] = cur.split(',').map(Number);
  return [nx - sx, ny - sy];
}

// Flood fill of walkable tiles from a point. Returns Set of "x,y" keys.
export function floodFill(map, sx, sy) {
  const seen = new Set([key(sx, sy)]);
  const queue = [[sx, sy]];
  while (queue.length) {
    const [cx, cy] = queue.pop();
    for (const [dx, dy] of DIRS4) {
      const nx = cx + dx, ny = cy + dy;
      const k = key(nx, ny);
      if (seen.has(k) || !isWalkable(map, nx, ny)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}
