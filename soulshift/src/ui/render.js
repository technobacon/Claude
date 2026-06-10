// Canvas renderer: camera, fog of war, sprites, transient effects.
// Reads game state, never mutates it.

import { TILE, tileAt, key } from '../core/grid.js';
import { BODIES } from '../core/bodies.js';
import { spriteCanvas, themeForDepth } from './sprites.js';

export const TILE_PX = 36;
export const VIEW_W = 23; // tiles
export const VIEW_H = 15;

const SHRINE_SPRITE = {
  [TILE.SHRINE_MEND]: 'shrineMend',
  [TILE.SHRINE_PRESERVE]: 'shrinePreserve',
  [TILE.SHRINE_EMPOWER]: 'shrineEmpower',
};

export function makeRenderer(canvas) {
  canvas.width = VIEW_W * TILE_PX;
  canvas.height = VIEW_H * TILE_PX;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  function camera(state) {
    const map = state.floor.map;
    let cx = state.player.x - Math.floor(VIEW_W / 2);
    let cy = state.player.y - Math.floor(VIEW_H / 2);
    cx = Math.max(0, Math.min(map.width - VIEW_W, cx));
    cy = Math.max(0, Math.min(map.height - VIEW_H, cy));
    return { cx, cy };
  }

  function drawSprite(name, px, py) {
    const sp = spriteCanvas(name, 3);
    if (sp) ctx.drawImage(sp, px, py);
  }

  function render(state, effects, now) {
    const { cx, cy } = camera(state);
    const map = state.floor.map;
    const theme = themeForDepth(state.depth);

    // Screen shake.
    let shakeX = 0, shakeY = 0;
    for (const fx of effects) {
      if (fx.type === 'shake') {
        const t = (now - fx.start) / fx.dur;
        if (t < 1) {
          const amp = 5 * (1 - t);
          shakeX = (Math.random() * 2 - 1) * amp;
          shakeY = (Math.random() * 2 - 1) * amp;
        }
      }
    }

    ctx.save();
    ctx.fillStyle = '#0c0d14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(shakeX, shakeY);

    const toPx = (x, y) => [(x - cx) * TILE_PX, (y - cy) * TILE_PX];

    // --- Tiles ---
    for (let ty = cy; ty < cy + VIEW_H; ty++) {
      for (let tx = cx; tx < cx + VIEW_W; tx++) {
        const k = key(tx, ty);
        const explored = state.explored.has(k);
        if (!explored) continue;
        const visible = state.visible.has(k);
        const t = tileAt(map, tx, ty);
        const [px, py] = toPx(tx, ty);
        if (t === TILE.WALL) {
          ctx.fillStyle = theme.wall;
          ctx.fillRect(px, py, TILE_PX, TILE_PX);
          ctx.fillStyle = theme.wallTop;
          ctx.fillRect(px, py, TILE_PX, 6);
        } else {
          // Checkerboard-ish floor variation keyed on position (stable).
          ctx.fillStyle = ((tx * 7 + ty * 13) % 5 === 0) ? theme.floorAlt : theme.floor;
          ctx.fillRect(px, py, TILE_PX, TILE_PX);
          if (t === TILE.STAIRS) drawSprite('stairs', px, py);
          const shrine = SHRINE_SPRITE[t];
          if (shrine) {
            drawSprite(shrine, px, py);
            if (state.usedShrines.has(k)) {
              ctx.fillStyle = 'rgba(12,13,20,0.62)';
              ctx.fillRect(px, py, TILE_PX, TILE_PX);
            }
          }
        }
        if (!visible) {
          ctx.fillStyle = 'rgba(12,13,20,0.55)';
          ctx.fillRect(px, py, TILE_PX, TILE_PX);
        }
      }
    }

    const inView = (x, y) =>
      x >= cx && x < cx + VIEW_W && y >= cy && y < cy + VIEW_H && state.visible.has(key(x, y));

    // --- Corpses ---
    for (const c of state.corpses) {
      if (!inView(c.x, c.y)) continue;
      const [px, py] = toPx(c.x, c.y);
      ctx.globalAlpha = c.freshness < 15 ? 0.5 : 1;
      drawSprite('corpse', px, py);
      ctx.globalAlpha = 1;
    }

    // --- Pickups ---
    for (const p of state.pickups) {
      if (!inView(p.x, p.y)) continue;
      const [px, py] = toPx(p.x, p.y);
      const bob = Math.sin(now / 300 + p.x * 3) * 2;
      drawSprite(p.kind === 'essence' ? 'essence' : p.kind, px, py + bob);
    }

    // --- Enemies ---
    for (const e of state.enemies) {
      if (!inView(e.x, e.y)) continue;
      const [px, py] = toPx(e.x, e.y);
      drawSprite(e.type, px, py);
      // Possession glow when a soul could seize this enemy.
      if (state.player.form === 'soul') {
        const threshold = BODIES[e.type].boss ? 0.25 : state.mods.possessThreshold;
        if (e.hp / e.maxHp <= threshold) {
          ctx.strokeStyle = 'rgba(141,224,200,0.9)';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 2, py + 2, TILE_PX - 4, TILE_PX - 4);
        }
      }
      if (e.hp < e.maxHp) {
        ctx.fillStyle = '#11131c';
        ctx.fillRect(px + 4, py - 5, TILE_PX - 8, 4);
        ctx.fillStyle = '#d8434d';
        ctx.fillRect(px + 4, py - 5, (TILE_PX - 8) * (e.hp / e.maxHp), 4);
      }
      // Status pips.
      let pip = 0;
      const pipColors = { stun: '#ffd34d', root: '#cabdb4', slow: '#7fc4d8', burn: '#ff9c3f' };
      for (const [s, color] of Object.entries(pipColors)) {
        if (e.statuses[s] > 0) {
          ctx.fillStyle = color;
          ctx.fillRect(px + 3 + pip * 7, py + TILE_PX - 6, 5, 3);
          pip++;
        }
      }
    }

    // --- Player ---
    {
      const p = state.player;
      const [px, py] = toPx(p.x, p.y);
      if (p.form === 'soul') {
        const bob = Math.sin(now / 200) * 2.5;
        ctx.globalAlpha = p.grace > 0 ? 0.55 + 0.3 * Math.sin(now / 80) : 0.9;
        drawSprite('soul', px, py + bob);
        ctx.globalAlpha = 1;
      } else {
        drawSprite(p.bodyType, px, py);
        // Decay fraying: the body visibly tatters as it rots.
        const frac = p.decay / p.maxDecay;
        if (frac < 0.3) {
          ctx.fillStyle = `rgba(12,13,20,${0.45 * (1 - frac / 0.3)})`;
          ctx.fillRect(px, py, TILE_PX, TILE_PX);
        }
      }
      ctx.strokeStyle = 'rgba(238,245,255,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1, py + 1, TILE_PX - 2, TILE_PX - 2);
    }

    // --- Transient effects ---
    for (const fx of effects) {
      const t = (now - fx.start) / fx.dur;
      if (t >= 1) continue;
      if (fx.type === 'text') {
        const [px, py] = toPx(fx.x, fx.y);
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = fx.color;
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(fx.text, px + TILE_PX / 2, py - 2 - t * 18);
        ctx.globalAlpha = 1;
      } else if (fx.type === 'bolt') {
        const [x0, y0] = toPx(fx.fromX, fx.fromY);
        const [x1, y1] = toPx(fx.toX, fx.toY);
        const half = TILE_PX / 2;
        ctx.strokeStyle = fx.color || '#ffd34d';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.moveTo(x0 + half, y0 + half);
        ctx.lineTo(x0 + half + (x1 - x0) * t, y0 + half + (y1 - y0) * t);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  return { render, camera };
}
