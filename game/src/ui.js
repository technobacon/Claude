import { CANVAS_W, CANVAS_H, UI_H, SKILL, COLORS } from './constants.js';

const SKILL_META = [
  { id: SKILL.WOODCUTTING, label: 'Woodcutting', icon: '🌲', color: '#66bb6a' },
  { id: SKILL.MINING,      label: 'Mining',      icon: '⛏',  color: '#90a4ae' },
  { id: SKILL.CRAFTING,    label: 'Crafting',    icon: '🔨', color: '#ce93d8' },
  { id: SKILL.COMBAT,      label: 'Combat',      icon: '⚔',  color: '#ef9a9a' },
];

const ITEM_COLORS = {
  log:           '#8d6e63',
  stone:         '#90a4ae',
  iron_ore:      '#a1887f',
  iron_bar:      '#78909c',
  wooden_axe:    '#a1887f',
  stone_pickaxe: '#90a4ae',
  iron_sword:    '#cfd8dc',
};

const TABS = ['inventory', 'skills', 'crafting'];

export class UI {
  constructor() {
    this._activeTab = 'inventory';
    // tracks craft button hit areas: [{x,y,w,h, recipeIdx}]
    this._craftButtons = [];
  }

  get activeTab() { return this._activeTab; }

  handleTap(lx, ly, recipes, canCraftFn) {
    // ly is relative to the UI panel top
    const TAB_H = 36;
    if (ly < TAB_H) {
      const tabW = CANVAS_W / TABS.length;
      const i = Math.floor(lx / tabW);
      if (TABS[i]) this._activeTab = TABS[i];
      return null;
    }

    if (this._activeTab === 'crafting') {
      for (const btn of this._craftButtons) {
        if (lx >= btn.x && lx <= btn.x + btn.w && ly >= btn.y && ly <= btn.y + btn.h) {
          const recipe = recipes[btn.recipeIdx];
          if (recipe && canCraftFn(recipe)) return { action: 'craft', recipe };
        }
      }
    }
    return null;
  }

  draw(ctx, inventory, skills, recipes, canCraftFn, expandCost, expandable) {
    const viewH = CANVAS_H - UI_H;
    ctx.fillStyle = COLORS.UI_BG;
    ctx.fillRect(0, viewH, CANVAS_W, UI_H);

    // Separator line
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, viewH, CANVAS_W, 1);

    this._drawTabs(ctx, viewH);

    const contentY = viewH + 36;
    const contentH = UI_H - 36;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, contentY, CANVAS_W, contentH);
    ctx.clip();

    switch (this._activeTab) {
      case 'inventory': this._drawInventory(ctx, inventory, contentY); break;
      case 'skills':    this._drawSkills(ctx, skills, contentY, expandCost, expandable); break;
      case 'crafting':  this._drawCrafting(ctx, recipes, canCraftFn, contentY); break;
    }

    ctx.restore();
  }

  _drawTabs(ctx, baseY) {
    const tabW = CANVAS_W / TABS.length;
    TABS.forEach((tab, i) => {
      const x = i * tabW;
      const active = tab === this._activeTab;
      ctx.fillStyle = active ? COLORS.UI_PANEL_LIGHT : COLORS.UI_BG;
      ctx.fillRect(x, baseY, tabW, 36);

      if (active) {
        ctx.fillStyle = COLORS.UI_ACCENT;
        ctx.fillRect(x, baseY, tabW, 3);
      }

      ctx.fillStyle = active ? COLORS.TEXT : COLORS.TEXT_DIM;
      ctx.font = `${active ? 'bold ' : ''}12px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(tab[0].toUpperCase() + tab.slice(1), x + tabW / 2, baseY + 23);
    });
  }

  _drawInventory(ctx, inventory, y) {
    const items = inventory.toArray();
    if (items.length === 0) {
      ctx.fillStyle = COLORS.TEXT_DIM;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tap trees or rocks to gather resources', CANVAS_W / 2, y + 50);
      return;
    }

    const cell = 50, pad = 6;
    const cols = Math.floor((CANVAS_W - pad * 2) / cell);
    const offsetX = pad + (CANVAS_W - pad * 2 - cols * cell) / 2;

    items.forEach(({ item, qty }, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = offsetX + col * cell;
      const cy = y + 4 + row * cell;

      ctx.fillStyle = COLORS.UI_PANEL;
      roundRect(ctx, cx, cy, cell - 4, cell - 4, 6);
      ctx.fill();

      this._drawItemIcon(ctx, item, cx + (cell - 4) / 2, cy + 16);

      ctx.fillStyle = COLORS.TEXT;
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(qty, cx + (cell - 4) / 2, cy + cell - 9);

      ctx.fillStyle = COLORS.TEXT_DIM;
      ctx.font = '9px sans-serif';
      ctx.fillText(fmtItem(item), cx + (cell - 4) / 2, cy + cell - 1);
    });
  }

  _drawItemIcon(ctx, item, cx, cy) {
    const color = ITEM_COLORS[item] ?? '#aaa';
    ctx.fillStyle = color;

    switch (item) {
      case 'log':
        ctx.fillRect(cx - 8, cy - 6, 16, 10);
        ctx.fillStyle = '#6d4c41';
        ctx.fillRect(cx - 8, cy - 6, 3, 10);
        break;
      case 'stone':
      case 'iron_ore':
        ctx.beginPath();
        ctx.arc(cx, cy - 1, 8, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'iron_bar':
        ctx.fillRect(cx - 9, cy - 4, 18, 8);
        break;
      case 'wooden_axe':
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(cx - 2, cy - 11, 4, 18);
        ctx.fillStyle = '#6d4c41';
        roundRect(ctx, cx + 2, cy - 12, 8, 6, 2);
        ctx.fill();
        break;
      case 'stone_pickaxe':
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(cx - 2, cy, 4, 12);
        ctx.fillStyle = '#90a4ae';
        ctx.fillRect(cx - 9, cy - 5, 18, 5);
        break;
      case 'iron_sword':
        ctx.fillStyle = '#cfd8dc';
        ctx.fillRect(cx - 2, cy - 12, 4, 18);
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(cx - 7, cy + 3, 14, 3);
        break;
      default:
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fill();
    }
  }

  _drawSkills(ctx, skills, y, expandCost, expandable) {
    const rowH = 30;
    SKILL_META.forEach((meta, i) => {
      const iy = y + 4 + i * rowH;
      const level = skills.getLevel(meta.id);
      const prog = skills.getProgress(meta.id);

      ctx.fillStyle = COLORS.UI_PANEL;
      ctx.fillRect(8, iy, CANVAS_W - 16, rowH - 4);

      ctx.fillStyle = meta.color;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(meta.label, 18, iy + 16);

      ctx.fillStyle = COLORS.TEXT;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Lv ${level}`, CANVAS_W - 16, iy + 16);

      const bw = CANVAS_W - 100;
      const bx = 18, by = iy + 19;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, bw, 3);
      ctx.fillStyle = meta.color;
      ctx.fillRect(bx, by, bw * prog.frac, 3);
    });

    // Expand cost hint
    if (expandable) {
      const ey = y + 4 + SKILL_META.length * rowH + 2;
      ctx.fillStyle = COLORS.TEXT_DIM;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `Expand island: ${expandCost.stone} stone + ${expandCost.log} logs (tap purple tiles)`,
        CANVAS_W / 2, ey + 12
      );
    }
  }

  _drawCrafting(ctx, recipes, canCraftFn, y) {
    this._craftButtons = [];
    const rowH = 54;

    recipes.forEach((recipe, i) => {
      const iy = y + 4 + i * rowH;
      const craftable = canCraftFn(recipe);

      ctx.fillStyle = craftable ? COLORS.UI_PANEL : 'rgba(22,33,62,0.7)';
      roundRect(ctx, 8, iy, CANVAS_W - 16, rowH - 4, 6);
      ctx.fill();

      ctx.fillStyle = craftable ? COLORS.TEXT : COLORS.TEXT_DIM;
      ctx.font = `bold 12px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(recipe.name, 16, iy + 15);

      ctx.font = '10px sans-serif';
      ctx.fillStyle = COLORS.TEXT_DIM;
      const ing = recipe.ingredients.map(({ item, qty }) => `${qty}× ${fmtItem(item)}`).join('  ');
      ctx.fillText(ing, 16, iy + 28);

      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#90a4ae';
      ctx.fillText(recipe.desc, 16, iy + 40);

      if (craftable) {
        const bx = CANVAS_W - 76, bw = 62, bh = 26, bby = iy + (rowH - 4) / 2 - 13;
        ctx.fillStyle = COLORS.UI_ACCENT;
        roundRect(ctx, bx, bby, bw, bh, 6);
        ctx.fill();
        ctx.fillStyle = COLORS.TEXT;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('CRAFT', bx + bw / 2, bby + 17);
        // bby is canvas y; handleTap receives ly = canvasY - VIEW_H, content starts at ly=36
        this._craftButtons.push({ x: bx, y: bby - y + 36, w: bw, h: bh, recipeIdx: i });
      }
    });
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fmtItem(id) {
  return id.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}
