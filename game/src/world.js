import { TILE, TILE_SIZE, MAP_W, MAP_H, COLORS } from './constants.js';

function generateIsland() {
  const map = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(TILE.DEEP_WATER));
  const cx = Math.floor(MAP_W / 2);
  const cy = Math.floor(MAP_H / 2);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const dx = (x - cx) / 4.5;
      const dy = (y - cy) / 5.5;
      const d = dx * dx + dy * dy;
      if (d < 0.85) map[y][x] = TILE.GRASS;
      else if (d < 1.1) map[y][x] = TILE.SAND;
      else if (d < 1.5) map[y][x] = TILE.WATER;
    }
  }
  return map;
}

export class World {
  constructor() {
    this.map = generateIsland();
    this._expandable = new Set();
    this._computeExpandable();
    this._waterTime = 0;
  }

  tileAt(x, y) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return TILE.DEEP_WATER;
    return this.map[y][x];
  }

  isWalkable(x, y) {
    const t = this.tileAt(x, y);
    return t === TILE.GRASS || t === TILE.SAND;
  }

  isLand(x, y) {
    return this.isWalkable(x, y);
  }

  setTile(x, y, type) {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return;
    this.map[y][x] = type;
    this._computeExpandable();
  }

  canExpand(x, y) {
    return this._expandable.has(`${x},${y}`);
  }

  expand(x, y) {
    this.setTile(x, y, TILE.GRASS);
  }

  update(dt) {
    this._waterTime += dt;
  }

  _computeExpandable() {
    this._expandable.clear();
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.map[y][x] !== TILE.WATER) continue;
        const nearLand = dirs.some(([dx, dy]) => this.isLand(x + dx, y + dy));
        if (nearLand) this._expandable.add(`${x},${y}`);
      }
    }
  }

  draw(ctx, camera) {
    const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE));
    const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE));
    const endX = Math.min(MAP_W, Math.ceil((camera.x + camera.viewW) / TILE_SIZE));
    const endY = Math.min(MAP_H, Math.ceil((camera.y + camera.viewH) / TILE_SIZE));

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const tile = this.map[y][x];
        const px = Math.floor(x * TILE_SIZE - camera.x);
        const py = Math.floor(y * TILE_SIZE - camera.y);

        // Base tile color
        switch (tile) {
          case TILE.DEEP_WATER: {
            const wave = Math.sin(this._waterTime * 0.001 + x * 0.7 + y * 0.5) * 0.5 + 0.5;
            ctx.fillStyle = wave > 0.6 ? COLORS.WATER_LIGHT : COLORS.DEEP_WATER;
            break;
          }
          case TILE.WATER: {
            const wave = Math.sin(this._waterTime * 0.0012 + x * 0.8 + y * 0.6) * 0.5 + 0.5;
            ctx.fillStyle = wave > 0.55 ? COLORS.WATER_LIGHT : COLORS.WATER;
            break;
          }
          case TILE.SAND:
            ctx.fillStyle = COLORS.SAND;
            break;
          case TILE.GRASS: {
            const shade = (x + y) % 2 === 0 ? COLORS.GRASS : COLORS.GRASS_LIGHT;
            ctx.fillStyle = shade;
            break;
          }
        }
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Expandable highlight
        if (this._expandable.has(`${x},${y}`)) {
          ctx.fillStyle = COLORS.EXPAND_FILL;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = COLORS.EXPAND_BORDER;
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);

          // Plus icon
          const mx = px + TILE_SIZE / 2;
          const my = py + TILE_SIZE / 2;
          ctx.fillStyle = COLORS.EXPAND_BORDER;
          ctx.fillRect(mx - 1.5, my - 7, 3, 14);
          ctx.fillRect(mx - 7, my - 1.5, 14, 3);
        }
      }
    }

    // Soft vignette over deep water edges
    const grad = ctx.createRadialGradient(
      camera.viewW / 2, camera.viewH / 2, camera.viewH * 0.3,
      camera.viewW / 2, camera.viewH / 2, camera.viewH * 0.75
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, camera.viewW, camera.viewH);
  }
}
