import { CANVAS_W, CANVAS_H, UI_H, TILE_SIZE, MAP_W, MAP_H, TILE, ENTITY_TYPE, SKILL } from './constants.js';
import { World } from './world.js';
import { Entity, spawnInitialEntities } from './entities.js';
import { Player } from './player.js';
import { Skills } from './skills.js';
import { Inventory } from './inventory.js';
import { RECIPES, canCraft, getToolSpeedMult, getCombatDamage } from './crafting.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { findPath, adjacentTo } from './pathfinding.js';

const VIEW_H = CANVAS_H - UI_H;

const NOTIF_COLOR = {
  ITEM: '#a5d6a7',
  XP: '#fff59d',
  LEVEL: '#ffd740',
  ERROR: '#ef9a9a',
  EXPAND: '#ce93d8',
};

// ── Game state ─────────────────────────────────────────────────────────────

let canvas, ctx;
let world, entities, player, skills, inventory;
let input, ui;
let notifications = [];
let expandCost = { stone: 5, log: 3 };
let lastTime = 0;

// ── Boot ───────────────────────────────────────────────────────────────────

function init() {
  canvas = document.getElementById('game');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  ctx = canvas.getContext('2d');

  world = new World();
  entities = spawnInitialEntities(world);
  player = new Player(11, 15);
  skills = new Skills();
  inventory = new Inventory();
  input = new Input(canvas);
  ui = new UI();

  input.on('tap', onTap);
  requestAnimationFrame(loop);
}

// ── Loop ───────────────────────────────────────────────────────────────────

function loop(ts) {
  const dt = Math.min(ts - lastTime, 80);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function update(dt) {
  world.update(dt);
  player.update(dt);
  entities.forEach(e => e.update(dt, world, entities));

  notifications = notifications.filter(n => {
    n.timer -= dt;
    n.y += n.vy * dt;
    n.alpha = Math.min(1, n.timer / 400);
    return n.timer > 0;
  });

  let lu;
  while ((lu = skills.popLevelUp())) {
    addNotif(`🎉 ${lu.skill} Lv ${lu.level}!`, NOTIF_COLOR.LEVEL, VIEW_H / 2 - 40);
  }
}

function camera() {
  const cx = player.px + TILE_SIZE / 2;
  const cy = player.py + TILE_SIZE / 2;
  return {
    x: Math.max(0, Math.min(cx - CANVAS_W / 2, MAP_W * TILE_SIZE - CANVAS_W)),
    y: Math.max(0, Math.min(cy - VIEW_H / 2, MAP_H * TILE_SIZE - VIEW_H)),
    viewW: CANVAS_W,
    viewH: VIEW_H,
  };
}

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  const cam = camera();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, CANVAS_W, VIEW_H);
  ctx.clip();

  world.draw(ctx, cam);
  entities.forEach(e => e.draw(ctx, cam));
  player.draw(ctx, cam);

  notifications.forEach(n => {
    ctx.globalAlpha = n.alpha;
    ctx.fillStyle = n.color;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(n.text, n.x, n.y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  });

  ctx.restore();

  ui.draw(ctx, inventory, skills, RECIPES,
    r => canCraft(r, inventory, skills),
    expandCost,
    world._expandable.size > 0
  );
}

// ── Notifications ──────────────────────────────────────────────────────────

function addNotif(text, color, y) {
  notifications.push({
    text, color,
    x: CANVAS_W / 2,
    y: y ?? VIEW_H * 0.55,
    vy: -0.035,
    timer: 1800,
    alpha: 1,
  });
}

// ── Input ──────────────────────────────────────────────────────────────────

function onTap({ x, y }) {
  if (y >= VIEW_H) {
    const result = ui.handleTap(x, y - VIEW_H, RECIPES,
      r => canCraft(r, inventory, skills));
    if (result?.action === 'craft') doCraft(result.recipe);
    return;
  }

  const cam = camera();
  const tx = Math.floor((x + cam.x) / TILE_SIZE);
  const ty = Math.floor((y + cam.y) / TILE_SIZE);

  const entity = entities.find(e => e.alive && e.x === tx && e.y === ty);
  if (entity) { tapEntity(entity); return; }

  if (world.canExpand(tx, ty)) { tapExpand(tx, ty); return; }

  if (world.isWalkable(tx, ty)) {
    const path = findPath(world, entities, player.tileX, player.tileY, tx, ty);
    player.startPath(path);
  }
}

function tapEntity(entity) {
  if (adjacentTo(player.tileX, player.tileY, entity.x, entity.y) && !player.moving) {
    startInteract(entity);
    return;
  }

  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const candidates = dirs
    .map(([dx, dy]) => ({ x: entity.x + dx, y: entity.y + dy }))
    .filter(({ x, y }) =>
      world.isWalkable(x, y) &&
      !entities.find(e => e.alive && e.blocksTile && e !== entity && e.x === x && e.y === y)
    )
    .sort((a, b) =>
      (Math.abs(a.x - player.tileX) + Math.abs(a.y - player.tileY)) -
      (Math.abs(b.x - player.tileX) + Math.abs(b.y - player.tileY))
    );

  if (!candidates.length) return;
  const dest = candidates[0];
  const path = findPath(world, entities.filter(e => e !== entity),
    player.tileX, player.tileY, dest.x, dest.y);
  player.startPath(path, () => startInteract(entity));
}

function startInteract(entity) {
  if (!entity.alive) return;
  entity.type === ENTITY_TYPE.GOBLIN ? startAttack(entity) : startHarvest(entity);
}

function startHarvest(entity) {
  if (!entity.alive) return;
  const skillKey = entity.type === ENTITY_TYPE.TREE ? SKILL.WOODCUTTING : SKILL.MINING;
  const duration = entity.harvestTime * getToolSpeedMult(inventory, skillKey);

  player.startAction('harvest', entity, duration, () => {
    entity.hit();
    if (!entity.alive) {
      entity.drops.forEach(({ item, min, max }) => {
        const qty = min + Math.floor(Math.random() * (max - min + 1));
        inventory.add(item, qty);
        addNotif(`+${qty} ${fmtItem(item)}`, NOTIF_COLOR.ITEM);
      });
      skills.addXp(entity.xpReward.skill, entity.xpReward.amount);
      addNotif(`+${entity.xpReward.amount} XP`, NOTIF_COLOR.XP);
    } else {
      startHarvest(entity); // keep going
    }
  });
}

function startAttack(entity) {
  if (!entity.alive) return;
  const damage = getCombatDamage(inventory);

  player.startAction('attack', entity, entity.harvestTime, () => {
    if (!entity.alive) return;
    entity.hit(damage);
    if (!entity.alive) {
      entity.drops.forEach(({ item, min, max }) => {
        const qty = min + Math.floor(Math.random() * (max - min + 1));
        inventory.add(item, qty);
        addNotif(`+${qty} ${fmtItem(item)}`, NOTIF_COLOR.ITEM);
      });
      skills.addXp(entity.xpReward.skill, entity.xpReward.amount);
      addNotif(`+${entity.xpReward.amount} combat XP`, NOTIF_COLOR.XP);
    } else {
      startAttack(entity);
    }
  });
}

function tapExpand(tx, ty) {
  const { stone, log } = expandCost;
  if (inventory.has('stone', stone) && inventory.has('log', log)) {
    inventory.remove('stone', stone);
    inventory.remove('log', log);
    world.expand(tx, ty);
    if (Math.random() < 0.35) {
      const type = Math.random() < 0.55 ? ENTITY_TYPE.TREE : ENTITY_TYPE.ROCK;
      entities.push(new Entity(type, tx, ty));
    }
    addNotif('Island expanded! 🏝', NOTIF_COLOR.EXPAND, VIEW_H * 0.3);
    expandCost = { stone: Math.ceil(stone * 1.6), log: Math.ceil(log * 1.5) };
  } else {
    addNotif(`Need ${stone} stone + ${log} logs`, NOTIF_COLOR.ERROR);
  }
}

function doCraft(recipe) {
  recipe.ingredients.forEach(({ item, qty }) => inventory.remove(item, qty));
  inventory.add(recipe.result.item, recipe.result.qty);
  skills.addXp(recipe.xp.skill, recipe.xp.amount);
  addNotif(`Crafted ${recipe.name}!`, '#b39ddb', VIEW_H / 2 - 20);
}

function fmtItem(id) {
  return id.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

window.addEventListener('load', init);
