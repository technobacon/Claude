// The SOULSHIFT turn engine. Pure logic: no DOM, no chrome, no timers.
// The UI layer calls act(state, action) and renders the events it gets back.
//
// THE TWIST, mechanically:
//  - The player has no body of their own. They wear enemies.
//  - Every kill leaves a corpse. Standing on one and possessing it makes that
//    enemy's stat block the player's character.
//  - Bodies decay one point per action. At zero they crumble and the player
//    drops into soul form: fragile, fading, but able to possess fresh corpses
//    — or living enemies weak enough to be overwhelmed.
//  - Losing a body to damage also ejects the soul (no corpse left). The run
//    only ends when the *soul* is destroyed.

import { makeRng } from './rng.js';
import {
  TILE, tileAt, isWalkable, key, dist, DIRS8, hasLOS, computeFOV, inBounds,
  nextStep as gridNextStep,
} from './grid.js';
import { generateFloor } from './dungeon.js';
import { BODIES, MAX_DEPTH } from './bodies.js';
import { perkMods } from './meta.js';

export const SOUL = {
  baseHp: 8,
  touchDamage: 3,
  // While grace lasts, the soul neither fades nor can be struck — it is a
  // flicker the world has not caught up to yet. This is the escape window
  // after losing a body; spend it diving for a corpse.
  graceOnCrumble: 3,
  graceOnDestroyed: 2,
  sight: 6,
};

export const CORPSE_FRESHNESS = 80;

const SPEED_GAIN = { slow: 50, normal: 100, fast: 150 };

// ---------------------------------------------------------------------------
// Construction

// The soul drives borrowed flesh harder than its original owner did: every
// possessed body strikes at +1 attack. This is the player's structural edge
// over a bestiary that otherwise shares their exact stat blocks.
export const SOUL_FURY = 1;

function bodyStats(typeId, mods, player) {
  const def = BODIES[typeId];
  const maxHp = Math.round(def.hp * mods.bodyHpMult) + (player ? player.empowerHp : 0);
  return {
    bodyType: typeId,
    maxHp,
    atk: def.atk + SOUL_FURY + mods.atkBonus + (player ? player.empowerAtk : 0),
    def: def.def,
    speed: def.speed,
    maxDecay: Math.round(def.decay * mods.decayMult),
    sight: def.sight,
  };
}

export function createGame({ seed = 1, perks = [], startBody = 'skeleton' } = {}) {
  const rng = makeRng(seed >>> 0);
  const mods = perkMods(perks);
  const state = {
    seed: seed >>> 0,
    rng,
    mods,
    depth: 0,
    status: 'playing',
    causeOfDeath: null,
    turnCount: 0,
    events: [],
    player: {
      x: 0, y: 0,
      form: 'body',
      bodyType: startBody,
      hp: 0, maxHp: 0, atk: 0, def: 0, speed: 'normal',
      decay: 0, maxDecay: 0, sight: 7,
      abilityCd: 0,
      energy: 100,
      grace: 0,
      statuses: {},
      lastDir: [0, 1],
      essence: 0,
      empowerAtk: 0,
      empowerHp: 0,
      kills: 0,
      wornBodies: [startBody],
    },
    enemies: [],
    corpses: [],
    pickups: [],
    usedShrines: new Set(),
    visible: new Set(),
    explored: new Set(),
  };
  const stats = bodyStats(startBody, mods, state.player);
  Object.assign(state.player, stats);
  state.player.hp = stats.maxHp;
  state.player.decay = stats.maxDecay;
  descend(state);
  state.events = [];
  emit(state, 'msg', { text: `You wake inside a ${BODIES[startBody].name.toLowerCase()}. It will not last. Nothing here does.`, cls: 'lore' });
  refreshFov(state);
  return state;
}

let nextEnemyId = 1;

function spawnEnemy(state, type, x, y) {
  const def = BODIES[type];
  const enemy = {
    id: nextEnemyId++,
    type, x, y,
    hp: def.hp, maxHp: def.hp,
    atk: def.atk, def: def.def, speed: def.speed,
    energy: state.rng.int(0, 60), // desync so packs don't move in lockstep
    cd: Math.ceil((def.ability?.cd ?? 0) / 2),
    statuses: {},
    alerted: false,
    lastKnown: null,
  };
  state.enemies.push(enemy);
  return enemy;
}

function descend(state) {
  state.depth += 1;
  const floor = generateFloor(state.rng, state.depth);
  state.floor = floor;
  state.enemies = [];
  state.corpses = [];
  state.pickups = floor.pickups.map((p) => ({ ...p }));
  state.usedShrines = new Set();
  state.explored = new Set();
  state.player.x = floor.spawn.x;
  state.player.y = floor.spawn.y;
  for (const e of floor.enemies) spawnEnemy(state, e.type, e.x, e.y);
  if (state.mods.graveSense) {
    for (let y = 0; y < floor.map.height; y++) {
      for (let x = 0; x < floor.map.width; x++) {
        const t = tileAt(floor.map, x, y);
        if (t >= TILE.STAIRS) state.explored.add(key(x, y));
      }
    }
  }
  if (floor.isBossFloor) {
    emit(state, 'msg', { text: 'The deep door. Something vast is wearing the dark like a robe.', cls: 'lore' });
    emit(state, 'sound', { id: 'boss' });
  } else {
    emit(state, 'msg', { text: `Depth ${state.depth}.`, cls: 'info' });
  }
}

// ---------------------------------------------------------------------------
// Events

function emit(state, type, data = {}) {
  state.events.push({ type, ...data });
}

function msg(state, text, cls = 'info') {
  emit(state, 'msg', { text, cls });
}

// ---------------------------------------------------------------------------
// Queries

export function enemyAt(state, x, y) {
  return state.enemies.find((e) => e.x === x && e.y === y) || null;
}

export function corpseAt(state, x, y) {
  // Newest corpse on the tile wins.
  for (let i = state.corpses.length - 1; i >= 0; i--) {
    const c = state.corpses[i];
    if (c.x === x && c.y === y) return c;
  }
  return null;
}

function pickupAt(state, x, y) {
  return state.pickups.find((p) => p.x === x && p.y === y) || null;
}

function blockedSet(state, exceptEnemy = null) {
  const set = new Set();
  for (const e of state.enemies) {
    if (e !== exceptEnemy) set.add(key(e.x, e.y));
  }
  return set;
}

function playerSight(state) {
  return state.player.form === 'soul' ? SOUL.sight : state.player.sight;
}

function refreshFov(state) {
  state.visible = computeFOV(state.floor.map, state.player.x, state.player.y, playerSight(state));
  for (const k of state.visible) state.explored.add(k);
}

export function nearestVisibleEnemy(state, range) {
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    const d = dist(state.player.x, state.player.y, e.x, e.y);
    if (d > range || d >= bestD) continue;
    if (!state.visible.has(key(e.x, e.y))) continue;
    best = e;
    bestD = d;
  }
  return best;
}

// What would the interact key do right now? Used by the engine and the UI hint.
export function interactionAt(state) {
  const { x, y } = state.player;
  const t = tileAt(state.floor.map, x, y);
  if (t === TILE.STAIRS) return { kind: 'stairs' };
  if (t === TILE.SHRINE_MEND || t === TILE.SHRINE_PRESERVE || t === TILE.SHRINE_EMPOWER) {
    if (state.usedShrines.has(key(x, y))) return { kind: 'shrine-used' };
    return { kind: 'shrine', tile: t, cost: shrineCost(state, t) };
  }
  const corpse = corpseAt(state, x, y);
  if (corpse) return { kind: 'possess', corpse };
  return null;
}

export function shrineCost(state, tile) {
  const d = state.depth;
  if (tile === TILE.SHRINE_MEND) return 6 + 2 * d;
  if (tile === TILE.SHRINE_PRESERVE) return 5 + 2 * d;
  return 12 + 3 * d; // empower
}

// ---------------------------------------------------------------------------
// Damage

// Player damage can crit (the soul's fury); enemy damage never does. Spike
// deaths from enemy crits feel like coin flips in 8-14 HP bodies, so the
// asymmetry is deliberate.
export function damageRoll(rng, atk, def, { canCrit = true } = {}) {
  let dmg = atk + rng.int(-1, 1);
  if (canCrit && rng.chance(0.1)) dmg = Math.round(dmg * 1.5);
  return Math.max(1, dmg - def);
}

function hurtEnemy(state, enemy, amount, opts = {}) {
  enemy.hp -= amount;
  emit(state, 'hit', { x: enemy.x, y: enemy.y, amount, target: 'enemy' });
  if (enemy.hp <= 0) killEnemy(state, enemy, opts);
}

function killEnemy(state, enemy, { silent = false } = {}) {
  state.enemies = state.enemies.filter((e) => e !== enemy);
  state.player.kills += 1;
  const def = BODIES[enemy.type];
  const gained = Math.round(def.essence * state.mods.essenceMult);
  state.player.essence += gained;
  emit(state, 'sound', { id: 'kill' });
  if (def.boss) {
    win(state, 'slain');
    return;
  }
  // The corpse is the loot.
  let cx = enemy.x, cy = enemy.y;
  if (!isWalkable(state.floor.map, cx, cy)) {
    const spot = nearestFloorTile(state, cx, cy);
    if (spot) { cx = spot.x; cy = spot.y; }
  }
  state.corpses.push({ type: enemy.type, x: cx, y: cy, freshness: CORPSE_FRESHNESS });
  if (!silent) msg(state, `The ${def.name.toLowerCase()} falls. +${gained} essence.`, 'good');
}

function hurtPlayer(state, amount, source) {
  const p = state.player;
  p.hp -= amount;
  emit(state, 'hit', { x: p.x, y: p.y, amount, target: 'player' });
  emit(state, 'sound', { id: 'hurt' });
  if (p.hp > 0) return;
  if (p.form === 'soul') {
    state.status = 'dead';
    state.causeOfDeath = source;
    msg(state, 'Your soul scatters like ash in a draft. The dungeon keeps what it takes.', 'bad');
    emit(state, 'sound', { id: 'death' });
  } else {
    // The body is destroyed — the soul is ejected, exposed and fading.
    msg(state, `Your ${BODIES[p.bodyType].name.toLowerCase()} is destroyed! Your soul spills out.`, 'bad');
    becomeSoul(state, SOUL.graceOnDestroyed);
  }
}

function becomeSoul(state, grace) {
  const p = state.player;
  p.form = 'soul';
  p.bodyType = null;
  p.maxHp = SOUL.baseHp + state.mods.soulHpBonus;
  p.hp = p.maxHp;
  p.atk = SOUL.touchDamage;
  p.def = 0;
  p.speed = 'normal';
  p.decay = 0;
  p.maxDecay = 0;
  p.grace = grace;
  p.graceFresh = true; // the birth action does not burn grace
  p.statuses = {};
  p.abilityCd = 0;
  // Ejected into a wall (wraith body): slide to open ground.
  if (!isWalkable(state.floor.map, p.x, p.y)) {
    const spot = nearestFloorTile(state, p.x, p.y);
    if (spot) { p.x = spot.x; p.y = spot.y; }
  }
  emit(state, 'sound', { id: 'soul' });
  msg(state, `You are a bare soul, flickering beyond reach for ${grace} ${grace === 1 ? 'turn' : 'turns'}. Find flesh.`, 'warn');
}

// A graced soul cannot be struck.
function playerUntouchable(state) {
  return state.player.form === 'soul' && state.player.grace > 0;
}

function possessBody(state, typeId, hpFrac, decayFrac = 1) {
  const p = state.player;
  // Leaving a body behind leaves something for later (or for the zombies).
  // Shed bodies remember their wounds and their rot — repossessing one gives
  // back exactly what was abandoned, so corpse-swapping is never free healing.
  if (p.form === 'body' && p.bodyType) {
    state.corpses.push({
      type: p.bodyType, x: p.x, y: p.y,
      freshness: Math.floor(CORPSE_FRESHNESS / 2),
      shed: { hpFrac: p.hp / p.maxHp, decayFrac: p.decay / p.maxDecay },
    });
  }
  const stats = bodyStats(typeId, state.mods, p);
  p.form = 'body';
  Object.assign(p, stats);
  p.hp = Math.max(1, Math.round(stats.maxHp * hpFrac));
  p.decay = Math.max(1, Math.round(stats.maxDecay * decayFrac));
  p.abilityCd = 0;
  p.statuses = {};
  p.grace = 0;
  if (!p.wornBodies.includes(typeId)) p.wornBodies.push(typeId);
  emit(state, 'sound', { id: 'shift' });
  msg(state, `You pour yourself into the ${BODIES[typeId].name.toLowerCase()}.`, 'good');
}

function win(state, how) {
  state.status = 'won';
  state.winHow = how;
  emit(state, 'sound', { id: 'win' });
  if (how === 'possessed') {
    msg(state, 'You slip inside the Warden while it still breathes. The deep door opens for its keeper.', 'good');
  } else {
    msg(state, 'The Warden collapses. You wear what remains and walk out of the deep door wearing the dungeon\'s own face.', 'good');
  }
}

function nearestFloorTile(state, ox, oy) {
  for (let r = 1; r < 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = ox + dx, y = oy + dy;
        if (isWalkable(state.floor.map, x, y) && !enemyAt(state, x, y)) return { x, y };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Player actions

export function act(state, action) {
  if (state.status !== 'playing') return [];
  state.events = [];
  const p = state.player;

  if (p.statuses.stun > 0) {
    p.statuses.stun -= 1;
    msg(state, 'You are stunned and lose the turn.', 'warn');
    afterPlayerAction(state);
    return state.events;
  }

  let acted = false;
  switch (action.type) {
    case 'move': acted = doMove(state, action.dx, action.dy); break;
    case 'wait': acted = true; break;
    case 'ability': acted = doAbility(state); break;
    case 'interact': acted = doInteract(state); break;
    default: acted = false;
  }
  if (!acted) return state.events;
  afterPlayerAction(state);
  return state.events;
}

function doMove(state, dx, dy) {
  const p = state.player;
  if (dx === 0 && dy === 0) return false;
  dx = Math.sign(dx); dy = Math.sign(dy);
  p.lastDir = [dx, dy];
  const nx = p.x + dx, ny = p.y + dy;
  const enemy = enemyAt(state, nx, ny);
  if (enemy) return attackEnemy(state, enemy);
  if (p.statuses.root > 0) {
    msg(state, 'You are webbed in place!', 'warn');
    return true; // the struggle costs the turn
  }
  const phasing = p.form === 'body' && BODIES[p.bodyType]?.phasing;
  if (!isWalkable(state.floor.map, nx, ny) && !phasing) return false;
  if (!inBounds(state.floor.map, nx, ny)) return false;
  p.x = nx; p.y = ny;
  emit(state, 'sound', { id: 'step' });
  steppedOn(state);
  return true;
}

function attackEnemy(state, enemy) {
  const p = state.player;
  const def = BODIES[enemy.type];
  if (p.form === 'soul') {
    // The soul's touch: chip damage, or outright possession of the weak.
    const threshold = def.boss ? 0.25 : state.mods.possessThreshold;
    if (enemy.hp / enemy.maxHp <= threshold) {
      if (def.boss) { win(state, 'possessed'); return true; }
      state.enemies = state.enemies.filter((e) => e !== enemy);
      p.x = enemy.x; p.y = enemy.y;
      possessBody(state, enemy.type, Math.max(enemy.hp / enemy.maxHp, 0.35));
      steppedOn(state);
      return true;
    }
    hurtEnemy(state, enemy, SOUL.touchDamage);
    if (state.enemies.includes(enemy)) {
      // The grave-cold touch slows the living: a lone soul can outpace its hunter.
      enemy.statuses.slow = Math.max(enemy.statuses.slow || 0, 2);
    }
    emit(state, 'sound', { id: 'touch' });
    msg(state, `Your touch chills the ${def.name.toLowerCase()} — it slows.`, 'info');
    return true;
  }
  const dmg = damageRoll(state.rng, p.atk, enemy.def);
  hurtEnemy(state, enemy, dmg);
  emit(state, 'sound', { id: 'attack' });
  if (enemy.hp > 0) {
    msg(state, `You hit the ${def.name.toLowerCase()} for ${dmg}.`, 'info');
    if (BODIES[p.bodyType]?.id === 'elemental') {
      enemy.statuses.burn = Math.max(enemy.statuses.burn || 0, 2);
    }
  }
  return true;
}

function steppedOn(state) {
  const p = state.player;
  // Soul form: stepping onto a corpse is the possession.
  if (p.form === 'soul') {
    const corpse = corpseAt(state, p.x, p.y);
    if (corpse) {
      state.corpses = state.corpses.filter((c) => c !== corpse);
      possessBody(state, corpse.type, corpseHpFrac(state, corpse), corpse.shed?.decayFrac ?? 1);
    }
  }
  const pickup = pickupAt(state, p.x, p.y);
  if (pickup) applyPickup(state, pickup);
  const inter = interactionAt(state);
  if (inter && inter.kind !== 'shrine-used') {
    emit(state, 'hint', { interaction: inter });
  }
}

function applyPickup(state, pickup) {
  const p = state.player;
  if (pickup.kind === 'essence') {
    const amt = Math.round(pickup.amount * state.mods.essenceMult);
    p.essence += amt;
    msg(state, `You gather ${amt} essence.`, 'good');
    emit(state, 'sound', { id: 'pickup' });
  } else if (p.form === 'soul') {
    return; // a soul can't drink or carry — leave it for the next body
  } else if (pickup.kind === 'vial') {
    p.hp = p.maxHp;
    msg(state, 'You drain the vial. This body forgets its wounds.', 'good');
    emit(state, 'sound', { id: 'pickup' });
  } else if (pickup.kind === 'hourglass') {
    p.decay = Math.min(p.maxDecay, p.decay + 50);
    msg(state, 'The hourglass turns. Your body remembers being whole. +50 decay.', 'good');
    emit(state, 'sound', { id: 'pickup' });
  }
  state.pickups = state.pickups.filter((q) => q !== pickup);
}

function doInteract(state) {
  const inter = interactionAt(state);
  if (!inter) { msg(state, 'Nothing here to use.', 'info'); return false; }
  const p = state.player;
  if (inter.kind === 'stairs') {
    msg(state, 'You descend.', 'info');
    emit(state, 'sound', { id: 'stairs' });
    descend(state);
    return true;
  }
  if (inter.kind === 'shrine-used') {
    msg(state, 'The shrine is spent.', 'info');
    return false;
  }
  if (inter.kind === 'shrine') {
    if (p.essence < inter.cost) {
      msg(state, `The shrine wants ${inter.cost} essence. You have ${p.essence}.`, 'warn');
      return false;
    }
    p.essence -= inter.cost;
    state.usedShrines.add(key(p.x, p.y));
    emit(state, 'sound', { id: 'shrine' });
    if (inter.tile === TILE.SHRINE_MEND) {
      if (p.form === 'soul') { p.hp = p.maxHp; msg(state, 'The shrine steadies your fraying soul.', 'good'); }
      else { p.hp = p.maxHp; msg(state, 'The shrine knits your borrowed flesh whole.', 'good'); }
    } else if (inter.tile === TILE.SHRINE_PRESERVE) {
      if (p.form === 'body') {
        p.decay = p.maxDecay;
        msg(state, 'Cold balm seeps in. This body will keep a while longer.', 'good');
      } else {
        p.grace += 10;
        msg(state, 'The shrine slows your fading.', 'good');
      }
    } else {
      p.empowerAtk += 1;
      p.empowerHp += 4;
      p.atk += 1;
      if (p.form === 'body') { p.maxHp += 4; p.hp += 4; }
      msg(state, 'Your soul sharpens. +1 attack, +4 max HP — in this body and every body after.', 'good');
    }
    return true;
  }
  if (inter.kind === 'possess') {
    const corpse = inter.corpse;
    state.corpses = state.corpses.filter((c) => c !== corpse);
    possessBody(state, corpse.type, corpseHpFrac(state, corpse), corpse.shed?.decayFrac ?? 1);
    return true;
  }
  return false;
}

function corpseHpFrac(state, corpse) {
  const base = state.mods.possessHpFrac;
  return corpse.shed ? Math.min(base, corpse.shed.hpFrac) : base;
}

// ---------------------------------------------------------------------------
// Abilities (player-side)

function doAbility(state) {
  const p = state.player;
  if (p.form === 'soul') { msg(state, 'A bare soul has only its touch.', 'warn'); return false; }
  const def = BODIES[p.bodyType];
  if (!def.ability) { msg(state, 'This body has no special talent.', 'info'); return false; }
  if (p.abilityCd > 0) { msg(state, `${def.ability.name} is not ready (${p.abilityCd} turns).`, 'warn'); return false; }

  const fire = (used) => {
    if (used) {
      p.abilityCd = def.ability.cd;
      emit(state, 'sound', { id: 'ability' });
    }
    return used;
  };

  switch (def.ability.id) {
    case 'scurry': {
      const [dx, dy] = p.lastDir;
      let moved = 0;
      for (let i = 0; i < 3; i++) {
        const nx = p.x + dx, ny = p.y + dy;
        if (!isWalkable(state.floor.map, nx, ny) || enemyAt(state, nx, ny)) break;
        p.x = nx; p.y = ny; moved++;
        steppedOn(state);
        if (state.status !== 'playing') break;
      }
      if (!moved) { msg(state, 'No room to scurry.', 'warn'); return false; }
      msg(state, 'You scurry!', 'info');
      return fire(true);
    }
    case 'shriek': {
      let hit = 0;
      for (const e of adjacentEnemies(state)) {
        e.statuses.stun = Math.max(e.statuses.stun || 0, 2);
        hit++;
      }
      if (!hit) { msg(state, 'Nothing close enough to deafen.', 'warn'); return false; }
      msg(state, `Your shriek stuns ${hit} ${hit === 1 ? 'enemy' : 'enemies'}.`, 'good');
      return fire(true);
    }
    case 'regen': {
      if (p.hp >= p.maxHp) { msg(state, 'Already whole.', 'info'); return false; }
      p.hp = Math.min(p.maxHp, p.hp + 6);
      msg(state, 'Your body reknits. +6 HP.', 'good');
      return fire(true);
    }
    case 'bonetoss': return fire(rangedAbility(state, 5, () => 4, 'A rib whirls out'));
    case 'powershot': return fire(rangedAbility(state, 6, () => p.atk + 2, 'You loose a heavy shot'));
    case 'firebolt': return fire(rangedAbility(state, 5, () => p.atk, 'Fire leaps from your hands', { burn: 3 }));
    case 'frostlance': return fire(rangedAbility(state, 5, () => p.atk, 'A lance of rime flies', { slow: 3 }));
    case 'shank': {
      const target = adjacentEnemies(state)[0];
      if (!target) { msg(state, 'No one in reach to shank.', 'warn'); return false; }
      const dmg = damageRoll(state.rng, p.atk * 2, target.def);
      hurtEnemy(state, target, dmg);
      msg(state, `You shank it for ${dmg}!`, 'good');
      return fire(true);
    }
    case 'web': {
      const target = nearestVisibleEnemy(state, 4);
      if (!target) { msg(state, 'No prey in webbing range.', 'warn'); return false; }
      target.statuses.root = Math.max(target.statuses.root || 0, 3);
      msg(state, `You web the ${BODIES[target.type].name.toLowerCase()} in place.`, 'good');
      return fire(true);
    }
    case 'devour': {
      const corpse = findAdjacentCorpse(state);
      if (!corpse) { msg(state, 'No corpse in reach to devour.', 'warn'); return false; }
      state.corpses = state.corpses.filter((c) => c !== corpse);
      p.hp = Math.min(p.maxHp, p.hp + 8);
      msg(state, `You devour the ${BODIES[corpse.type].name.toLowerCase()}. +8 HP.`, 'good');
      return fire(true);
    }
    case 'drain': {
      const target = adjacentEnemies(state)[0];
      if (!target) { msg(state, 'Nothing adjacent to drain.', 'warn'); return false; }
      hurtEnemy(state, target, 5);
      p.hp = Math.min(p.maxHp, p.hp + 5);
      msg(state, 'You drink its warmth. +5 HP.', 'good');
      return fire(true);
    }
    case 'bash': {
      const target = adjacentEnemies(state)[0];
      if (!target) { msg(state, 'No one in reach to bash.', 'warn'); return false; }
      const dmg = damageRoll(state.rng, p.atk, target.def);
      hurtEnemy(state, target, dmg);
      if (target.hp > 0) target.statuses.stun = Math.max(target.statuses.stun || 0, 2);
      msg(state, `Shield bash for ${dmg} — it reels.`, 'good');
      return fire(true);
    }
    case 'smash': {
      const targets = adjacentEnemies(state);
      if (!targets.length) { msg(state, 'Nothing adjacent to smash.', 'warn'); return false; }
      for (const t of targets) hurtEnemy(state, t, damageRoll(state.rng, p.atk, t.def));
      emit(state, 'shake');
      msg(state, `You smash everything within reach (${targets.length} hit).`, 'good');
      return fire(true);
    }
    case 'flamewave': {
      const targets = state.enemies.filter((e) =>
        dist(p.x, p.y, e.x, e.y) <= 2 && state.visible.has(key(e.x, e.y)));
      if (!targets.length) { msg(state, 'No fuel in range.', 'warn'); return false; }
      for (const t of targets) {
        hurtEnemy(state, t, damageRoll(state.rng, p.atk, t.def));
        if (t.hp > 0 && !BODIES[t.type].burnImmune) t.statuses.burn = Math.max(t.statuses.burn || 0, 2);
      }
      emit(state, 'shake');
      msg(state, `A wave of flame engulfs ${targets.length} ${targets.length === 1 ? 'enemy' : 'enemies'}.`, 'good');
      return fire(true);
    }
    default:
      msg(state, 'The body refuses.', 'warn');
      return false;
  }
}

function rangedAbility(state, range, dmgFn, flavor, statuses = {}) {
  const target = nearestVisibleEnemy(state, range);
  if (!target) { msg(state, 'No target in range.', 'warn'); return false; }
  const dmg = Math.max(1, dmgFn() + state.rng.int(-1, 1) - target.def);
  emit(state, 'bolt', { fromX: state.player.x, fromY: state.player.y, toX: target.x, toY: target.y });
  hurtEnemy(state, target, dmg);
  if (target.hp > 0) {
    if (statuses.burn && !BODIES[target.type].burnImmune) {
      target.statuses.burn = Math.max(target.statuses.burn || 0, statuses.burn);
    }
    if (statuses.slow) target.statuses.slow = Math.max(target.statuses.slow || 0, statuses.slow);
  }
  msg(state, `${flavor} — ${dmg} damage.`, 'good');
  return true;
}

function adjacentEnemies(state) {
  return state.enemies.filter((e) => dist(state.player.x, state.player.y, e.x, e.y) === 1);
}

function findAdjacentCorpse(state) {
  return state.corpses.find((c) => dist(state.player.x, state.player.y, c.x, c.y) <= 1) || null;
}

// ---------------------------------------------------------------------------
// Turn resolution: the world ticks until the player can act again.

function afterPlayerAction(state) {
  const p = state.player;
  state.turnCount += 1;
  if (p.abilityCd > 0) p.abilityCd -= 1;
  for (const s of ['root', 'slow']) {
    if (p.statuses[s] > 0) p.statuses[s] -= 1;
  }

  // Decay: every action spends the flesh.
  if (p.form === 'body' && state.status === 'playing') {
    p.decay -= 1;
    if (p.decay <= 0) {
      msg(state, `Your ${BODIES[p.bodyType].name.toLowerCase()} sloughs apart beneath you.`, 'bad');
      becomeSoul(state, SOUL.graceOnCrumble);
    }
  }

  p.energy -= 100;
  // World ticks until the player has banked a full action again.
  let safety = 0;
  while (state.status === 'playing' && p.energy < 100 && safety++ < 10) {
    tickWorld(state);
    let gain = SPEED_GAIN[p.speed] || 100;
    if (p.statuses.slow > 0) gain = Math.floor(gain / 2);
    p.energy += gain;
  }
  p.energy = Math.min(p.energy, 200);

  // Grace burns down AFTER the world has ticked, so "flickering for N turns"
  // really protects through N world ticks. Fading starts once it is spent.
  if (p.form === 'soul' && state.status === 'playing') {
    if (p.graceFresh) p.graceFresh = false;
    else if (p.grace > 0) p.grace -= 1;
    else hurtPlayer(state, 1, 'faded to nothing');
  }
  if (state.status === 'playing') refreshFov(state);
}

function tickWorld(state) {
  state.tickId = (state.tickId || 0) + 1;
  // Burn damage on the player ticks with the world clock.
  const p = state.player;
  if (p.statuses.burn > 0) {
    p.statuses.burn -= 1;
    hurtPlayer(state, 2, 'burned away');
    msg(state, 'You burn! (-2)', 'bad');
    if (state.status !== 'playing') return;
  }
  // Corpses rot.
  for (const c of state.corpses) c.freshness -= 1;
  const before = state.corpses.length;
  state.corpses = state.corpses.filter((c) => c.freshness > 0);
  if (state.corpses.length < before) emit(state, 'sound', { id: 'crumble' });

  for (const enemy of state.enemies.slice()) {
    if (!state.enemies.includes(enemy)) continue;
    if (enemy.statuses.burn > 0) {
      enemy.statuses.burn -= 1;
      hurtEnemy(state, enemy, 2, { silent: false });
      if (!state.enemies.includes(enemy)) continue;
    }
    let gain = SPEED_GAIN[enemy.speed] || 100;
    if (enemy.statuses.slow > 0) { enemy.statuses.slow -= 1; gain = Math.floor(gain / 2); }
    enemy.energy = Math.min(enemy.energy + gain, 250);
    let acts = 0;
    while (enemy.energy >= 100 && acts++ < 2 && state.status === 'playing' && state.enemies.includes(enemy)) {
      enemy.energy -= 100;
      enemyAct(state, enemy);
    }
    if (state.status !== 'playing') return;
  }
}

// ---------------------------------------------------------------------------
// Enemy AI

function enemyAct(state, enemy) {
  const p = state.player;
  const def = BODIES[enemy.type];

  if (enemy.statuses.stun > 0) { enemy.statuses.stun -= 1; return; }

  // Perception: souls are dim and hard to spot.
  const sight = p.form === 'soul' ? Math.max(2, def.sight - 2) : def.sight;
  const d = dist(enemy.x, enemy.y, p.x, p.y);
  const sees = d <= sight && hasLOS(state.floor.map, enemy.x, enemy.y, p.x, p.y);
  if (sees) {
    if (!enemy.alerted) emit(state, 'sound', { id: 'alert' });
    enemy.alerted = true;
    enemy.lastKnown = { x: p.x, y: p.y };
  }

  // Warden pressure: summon reinforcements on cooldown once awake.
  if (def.boss && enemy.alerted) {
    if (enemy.hp <= enemy.maxHp / 3 && enemy.speed !== 'fast') {
      enemy.speed = 'fast';
      msg(state, 'The Warden tolls like a cracked bell and MOVES.', 'bad');
    }
    if (enemy.cd <= 0) {
      enemy.cd = def.ability.cd;
      summonServants(state, enemy);
      return;
    }
  }
  if (enemy.cd > 0) enemy.cd -= 1;

  // Special: zombies graze on corpses when hurt and unbothered.
  if (def.eatsCorpses && enemy.hp < enemy.maxHp && d > 1) {
    const corpse = state.corpses.find((c) => dist(enemy.x, enemy.y, c.x, c.y) <= 1);
    if (corpse) {
      state.corpses = state.corpses.filter((c) => c !== corpse);
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + 8);
      if (state.visible.has(key(enemy.x, enemy.y))) {
        msg(state, `The ${def.name.toLowerCase()} devours the ${BODIES[corpse.type].name.toLowerCase()}'s corpse.`, 'warn');
      }
      return;
    }
  }

  if (!enemy.alerted) {
    // Unbothered wandering.
    if (state.rng.chance(0.3)) {
      const [dx, dy] = state.rng.pick(DIRS8);
      tryStepEnemy(state, enemy, dx, dy);
    }
    return;
  }

  // Adjacent: melee (with on-hit riders and cooldown specials).
  if (d === 1) {
    if (playerUntouchable(state)) return; // the flickering soul slips the blow
    if (enemy.struckTick === state.tickId) return; // one strike per tick, even for the fast
    enemy.struckTick = state.tickId;
    enemyMelee(state, enemy, def);
    return;
  }

  // Ranged attackers shoot from distance, and back off if crowded.
  if (def.ranged && d <= def.ranged.range && hasLOS(state.floor.map, enemy.x, enemy.y, p.x, p.y) && sees && !playerUntouchable(state)) {
    if (d <= 2 && state.rng.chance(0.5) && !(enemy.statuses.root > 0)) {
      const dx = Math.sign(enemy.x - p.x), dy = Math.sign(enemy.y - p.y);
      if (tryStepEnemy(state, enemy, dx, dy)) return;
    }
    enemyShoot(state, enemy, def);
    return;
  }

  // Spider web from range.
  if (enemy.type === 'spider' && enemy.cd <= 0 && d <= 4 && sees && !(p.statuses.root > 0) && !playerUntouchable(state)) {
    enemy.cd = def.ability.cd;
    p.statuses.root = Math.max(p.statuses.root || 0, 3);
    msg(state, 'Sticky silk lashes around your legs — you are webbed!', 'bad');
    return;
  }

  // Elemental flame wave when close.
  if (enemy.type === 'elemental' && enemy.cd <= 0 && d <= 2 && sees && !playerUntouchable(state)) {
    enemy.cd = def.ability.cd;
    const dmg = Math.max(1, enemy.atk + state.rng.int(-1, 1) - p.def);
    hurtPlayer(state, dmg, 'burned by a forge elemental');
    if (state.status === 'playing' && p.form === 'body') {
      p.statuses.burn = Math.max(p.statuses.burn || 0, 2);
    }
    msg(state, `A wave of flame rolls over you (-${dmg}, burning).`, 'bad');
    emit(state, 'shake');
    return;
  }

  // Otherwise: close in.
  if (enemy.statuses.root > 0) { enemy.statuses.root -= 1; return; }
  chase(state, enemy, def);
}

function enemyMelee(state, enemy, def) {
  const p = state.player;
  // Cooldown specials in melee.
  if (enemy.cd <= 0) {
    if (enemy.type === 'knight') {
      enemy.cd = def.ability.cd;
      const dmg = Math.max(1, enemy.atk + state.rng.int(-1, 1) - p.def);
      hurtPlayer(state, dmg, 'bashed flat by a tomb knight');
      if (state.status === 'playing') {
        p.statuses.stun = Math.max(p.statuses.stun || 0, 1);
        msg(state, `Shield bash! -${dmg}, you are stunned.`, 'bad');
      }
      return;
    }
    if (enemy.type === 'goblin') {
      enemy.cd = def.ability.cd;
      const dmg = Math.max(1, enemy.atk * 2 + state.rng.int(-1, 1) - p.def);
      hurtPlayer(state, dmg, 'shanked in the dark');
      if (state.status === 'playing') msg(state, `The goblin finds a gap — shanked for ${dmg}!`, 'bad');
      return;
    }
    if (enemy.type === 'wraith') {
      enemy.cd = def.ability.cd;
      hurtPlayer(state, 5, 'drained hollow by a wraith');
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + 5);
      if (state.status === 'playing') msg(state, 'The wraith drinks your warmth (-5).', 'bad');
      return;
    }
    if (enemy.type === 'ogre') {
      enemy.cd = def.ability.cd;
      const dmg = Math.max(1, Math.round(enemy.atk * 1.3) + state.rng.int(-1, 1) - p.def);
      hurtPlayer(state, dmg, 'flattened by a marrow ogre');
      emit(state, 'shake');
      if (state.status === 'playing') msg(state, `The ogre SMASHES you for ${dmg}!`, 'bad');
      return;
    }
  }
  const dmg = damageRoll(state.rng, enemy.atk, p.def, { canCrit: false });
  hurtPlayer(state, dmg, `killed by ${aOrAn(def.name)}`);
  if (state.status === 'playing') {
    msg(state, `The ${def.name.toLowerCase()} hits you for ${dmg}.`, 'bad');
    if (enemy.type === 'elemental' && p.form === 'body') {
      p.statuses.burn = Math.max(p.statuses.burn || 0, 2);
    }
  }
}

function enemyShoot(state, enemy, def) {
  const p = state.player;
  const dmg = Math.max(1, enemy.atk + state.rng.int(-1, 1) - p.def);
  emit(state, 'bolt', { fromX: enemy.x, fromY: enemy.y, toX: p.x, toY: p.y });
  hurtPlayer(state, dmg, `shot down by ${aOrAn(def.name)}`);
  if (state.status !== 'playing') return;
  if (enemy.type === 'cultist' && p.form === 'body') {
    p.statuses.burn = Math.max(p.statuses.burn || 0, 2);
    msg(state, `A fire bolt sears you for ${dmg} — you are burning!`, 'bad');
  } else if (enemy.type === 'frostmage') {
    p.statuses.slow = Math.max(p.statuses.slow || 0, 3);
    msg(state, `A frost lance pierces you for ${dmg} — you are slowed.`, 'bad');
  } else {
    msg(state, `An arrow finds you for ${dmg}.`, 'bad');
  }
}

function chase(state, enemy, def) {
  const target = enemy.lastKnown || { x: state.player.x, y: state.player.y };
  if (def.phasing) {
    // Wraiths drift straight through stone.
    const dx = Math.sign(target.x - enemy.x), dy = Math.sign(target.y - enemy.y);
    const nx = enemy.x + dx, ny = enemy.y + dy;
    if (!enemyAt(state, nx, ny) && !(state.player.x === nx && state.player.y === ny) && inBounds(state.floor.map, nx, ny)) {
      enemy.x = nx; enemy.y = ny;
    }
    return;
  }
  const step = nextStep(state, enemy, target);
  if (step) {
    tryStepEnemy(state, enemy, step[0], step[1]);
  } else if (enemy.lastKnown && enemy.x === enemy.lastKnown.x && enemy.y === enemy.lastKnown.y) {
    enemy.alerted = false; // trail went cold
    enemy.lastKnown = null;
  }
}

function nextStep(state, enemy, target) {
  const blocked = blockedSet(state, enemy);
  blocked.add(key(state.player.x, state.player.y)); // can't walk through the player
  // grid.nextStep allows entering the goal tile; the goal here is the player's
  // last known position which may be the player — melee handles adjacency first.
  return gridNextStep(state.floor.map, enemy.x, enemy.y, target.x, target.y, blocked);
}

function tryStepEnemy(state, enemy, dx, dy) {
  const nx = enemy.x + dx, ny = enemy.y + dy;
  if (!isWalkable(state.floor.map, nx, ny)) return false;
  if (enemyAt(state, nx, ny)) return false;
  if (state.player.x === nx && state.player.y === ny) return false;
  enemy.x = nx; enemy.y = ny;
  return true;
}

function summonServants(state, warden) {
  const pool = ['cultist', 'knight', 'elemental'];
  const existing = state.enemies.length - 1;
  const room = Math.max(0, 5 - existing);
  const count = Math.min(2, room);
  if (count <= 0) return;
  let spawned = 0;
  for (const [dx, dy] of state.rng.shuffle(DIRS8)) {
    if (spawned >= count) break;
    const x = warden.x + dx * 2, y = warden.y + dy * 2;
    if (!isWalkable(state.floor.map, x, y)) continue;
    if (enemyAt(state, x, y) || (state.player.x === x && state.player.y === y)) continue;
    const e = spawnEnemy(state, state.rng.pick(pool), x, y);
    e.alerted = true;
    spawned++;
  }
  if (spawned) {
    msg(state, `The Warden tolls. ${spawned === 1 ? 'A servant answers' : 'Servants answer'}.`, 'bad');
    emit(state, 'sound', { id: 'summon' });
  }
}

function aOrAn(name) {
  return (/^[aeiou]/i.test(name) ? 'an ' : 'a ') + name.toLowerCase();
}
