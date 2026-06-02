export function findPath(world, entities, sx, sy, ex, ey, maxSteps = 300) {
  const blocked = new Set(
    entities.filter(e => e.alive && e.blocksTile).map(e => `${e.x},${e.y}`)
  );

  const key = (x, y) => `${x},${y}`;
  const passable = (x, y, isGoal) => {
    if (!world.isWalkable(x, y)) return false;
    if (isGoal) return true; // allow stepping on goal even if "blocked" (adjacent to entity)
    return !blocked.has(key(x, y));
  };

  const startKey = key(sx, sy);
  const endKey = key(ex, ey);

  if (startKey === endKey) return [];

  const open = new Map([[startKey, { x: sx, y: sy }]]);
  const came = new Map();
  const g = new Map([[startKey, 0]]);
  const h = (x, y) => Math.abs(x - ex) + Math.abs(y - ey);
  const f = new Map([[startKey, h(sx, sy)]]);
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  let steps = 0;
  while (open.size > 0 && steps++ < maxSteps) {
    let curKey = null, curF = Infinity;
    for (const k of open.keys()) {
      const fv = f.get(k) ?? Infinity;
      if (fv < curF) { curF = fv; curKey = k; }
    }

    if (curKey === endKey) {
      const path = [];
      let k = endKey;
      while (k !== startKey) {
        const [px, py] = k.split(',').map(Number);
        path.unshift({ x: px, y: py });
        k = came.get(k);
      }
      return path;
    }

    const cur = open.get(curKey);
    open.delete(curKey);

    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const nk = key(nx, ny);
      if (!passable(nx, ny, nk === endKey)) continue;
      const ng = (g.get(curKey) ?? Infinity) + 1;
      if (ng >= (g.get(nk) ?? Infinity)) continue;
      came.set(nk, curKey);
      g.set(nk, ng);
      f.set(nk, ng + h(nx, ny));
      open.set(nk, { x: nx, y: ny });
    }
  }

  return [];
}

export function adjacentTo(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}
