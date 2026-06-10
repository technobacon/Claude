// Balance is enforced, not hoped for. These tests encode the design contract:
// tier-for-tier fair fights, an essence economy that can actually afford
// shrines, decay windows long enough to cross a floor, and a winnable boss.
// Plus a fuzz bot and a greedy "speedrun bot" that play whole runs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BODIES, SPAWN_TABLES, MAX_DEPTH, enemyCountForDepth } from '../src/core/bodies.js';
import { createGame, act, interactionAt, corpseAt } from '../src/core/game.js';
import { shrineCost } from '../src/core/game.js';
import { TILE, key, dist, nextStep, isWalkable } from '../src/core/grid.js';

const SPEED_MULT = { slow: 0.5, normal: 1, fast: 1.5 };

// Expected damage per world tick, ignoring variance/crits (those average out
// slightly in the attacker's favor, so this is conservative for the player).
function dpt(attacker, defender) {
  return Math.max(1, attacker.atk - defender.def) * SPEED_MULT[attacker.speed];
}

// Does body A (possessed at 70% HP, +1 soul fury, striking first) beat enemy B?
// extraAtk/extraHp model banked Empower shrines.
function playerWinsTrade(bodyId, enemyId, extraAtk = 0, extraHp = 0) {
  const a = BODIES[bodyId];
  const b = BODIES[enemyId];
  const player = { ...a, atk: a.atk + 1 + extraAtk };
  const playerHp = Math.round(a.hp * 0.7) + extraHp;
  const turnsToKill = Math.ceil(b.hp / dpt(player, b));
  const turnsToDie = Math.ceil(playerHp / dpt(b, player));
  return turnsToKill <= turnsToDie;
}

test('tier-for-tier fights are winnable: every enemy loses to some same-tier body', () => {
  const byTier = {};
  for (const def of Object.values(BODIES)) {
    if (def.boss) continue;
    (byTier[def.tier] ||= []).push(def.id);
  }
  for (const [tier, ids] of Object.entries(byTier)) {
    for (const enemyId of ids) {
      // Heavies (knight, ogre) are deliberately trade-proof until the player
      // has banked one Empower shrine (+1 atk, +4 HP) — status abilities and
      // kiting are the intended counterplay before that.
      const heavy = BODIES[enemyId].heavy;
      const beatenBy = ids.filter((bodyId) =>
        playerWinsTrade(bodyId, enemyId, heavy ? 1 : 0, heavy ? 4 : 0));
      assert.ok(beatenBy.length > 0,
        `tier ${tier}: no same-tier body beats ${enemyId} in a straight trade`);
    }
  }
});

test('most same-tier matchups favor the player (first strike + 60% HP)', () => {
  let wins = 0, total = 0;
  for (const a of Object.values(BODIES)) {
    if (a.boss) continue;
    for (const b of Object.values(BODIES)) {
      if (b.boss || b.tier !== a.tier) continue;
      total++;
      if (playerWinsTrade(a.id, b.id)) wins++;
    }
  }
  const rate = wins / total;
  assert.ok(rate >= 0.55, `same-tier trade win rate ${(rate * 100).toFixed(0)}% — too punishing`);
  assert.ok(rate <= 0.95, `same-tier trade win rate ${(rate * 100).toFixed(0)}% — too easy`);
});

test('difficulty rises with tier (enemy threat is monotonic)', () => {
  const threat = (def) => def.hp * dpt(def, { def: 1 });
  const tiers = [1, 2, 3, 4];
  const avg = tiers.map((t) => {
    const defs = Object.values(BODIES).filter((d) => d.tier === t && !d.boss);
    return defs.reduce((s, d) => s + threat(d), 0) / defs.length;
  });
  for (let i = 1; i < avg.length; i++) {
    assert.ok(avg[i] > avg[i - 1], `tier ${tiers[i]} (${avg[i].toFixed(0)}) not scarier than tier ${tiers[i - 1]} (${avg[i - 1].toFixed(0)})`);
  }
});

test('essence economy: each floor can fund roughly two shrine uses', () => {
  for (let depth = 1; depth < MAX_DEPTH; depth++) {
    const table = SPAWN_TABLES[depth];
    const totalW = table.reduce((s, [, w]) => s + w, 0);
    const avgEssence = table.reduce((s, [id, w]) => s + BODIES[id].essence * w, 0) / totalW;
    // Assume the player clears ~70% of a floor and finds one essence pile.
    const income = avgEssence * enemyCountForDepth(depth) * 0.7 + (3 + depth);
    const fakeState = { depth };
    const outlay = shrineCost(fakeState, TILE.SHRINE_MEND) + shrineCost(fakeState, TILE.SHRINE_PRESERVE);
    assert.ok(income >= outlay,
      `depth ${depth}: income ~${income.toFixed(0)} cannot fund mend+preserve (${outlay})`);
  }
});

test('decay windows are generous enough to matter', () => {
  for (const def of Object.values(BODIES)) {
    if (def.boss) continue;
    assert.ok(def.decay >= 50, `${def.id} decays in ${def.decay} — shorter than a floor crossing`);
    assert.ok(def.decay <= 200, `${def.id} lasts ${def.decay} — decay never matters`);
  }
});

test('the Warden is killable by a deep-floor body within one decay window', () => {
  const warden = BODIES.warden;
  // A knight found on floor 6-7 with soul fury and two empower shrines (+3 atk).
  const knight = { ...BODIES.knight, atk: BODIES.knight.atk + 3 };
  const turnsToKill = Math.ceil(warden.hp / dpt(knight, warden));
  assert.ok(turnsToKill < BODIES.knight.decay * 0.6,
    `killing the Warden takes ${turnsToKill} turns of a ${BODIES.knight.decay}-turn body`);
  // And the soul-possess finisher threshold is a meaningful target:
  assert.ok(warden.hp * 0.25 >= 15, 'possession window is reachable without pixel-perfect play');
});

test('every body has a usable identity (ability + sane stats)', () => {
  for (const def of Object.values(BODIES)) {
    assert.ok(def.ability && def.ability.cd >= 2, `${def.id} ability misconfigured`);
    assert.ok(def.hp > 0 && def.atk > 0 && def.essence > 0);
    assert.ok(['slow', 'normal', 'fast'].includes(def.speed));
    assert.ok(def.sight >= 5 && def.sight <= 12);
  }
});

// ---------------------------------------------------------------------------
// Fuzz bot: random legal inputs must never crash the engine or corrupt state.

test('fuzz: 600 random actions across 20 seeds never break invariants', () => {
  const actions = [
    ...[[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]
      .map(([dx, dy]) => ({ type: 'move', dx, dy })),
    { type: 'wait' }, { type: 'ability' }, { type: 'interact' },
  ];
  for (let seed = 1; seed <= 20; seed++) {
    const state = createGame({ seed: seed * 1337 });
    let i = 0;
    for (; i < 600 && state.status === 'playing'; i++) {
      const action = actions[(seed * 31 + i * 17) % actions.length];
      act(state, action);
      const p = state.player;
      assert.ok(p.hp <= p.maxHp, `seed ${seed}: hp ${p.hp} > max ${p.maxHp}`);
      assert.ok(p.essence >= 0, `seed ${seed}: negative essence`);
      assert.ok(Number.isFinite(p.hp) && Number.isFinite(p.decay), `seed ${seed}: NaN stats`);
      if (state.status === 'playing') assert.ok(p.hp > 0, `seed ${seed}: alive at ${p.hp} hp`);
      assert.ok(['body', 'soul'].includes(p.form));
      if (p.form === 'body') assert.ok(BODIES[p.bodyType], `seed ${seed}: unknown body`);
      for (const e of state.enemies) {
        assert.ok(e.hp > 0, `seed ${seed}: zombie-state enemy`);
        assert.ok(!(e.x === p.x && e.y === p.y), `seed ${seed}: enemy stacked on player`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Speedrun bot: greedy descent. Validates that real runs progress, fights are
// survivable, possession keeps the run alive, and deaths are honest.

// Would taking this corpse actually leave the bot better off?
function worthPossessing(state, corpse) {
  const p = state.player;
  const def = BODIES[corpse.type];
  const frac = corpse.shed ? Math.min(0.7, corpse.shed.hpFrac) : 0.7;
  const newHp = Math.round(def.hp * frac);
  const newDecay = Math.round(def.decay * (corpse.shed?.decayFrac ?? 1));
  if (p.form === 'soul') return true;
  // Possession is the healing loop: chain into fresh meat whenever it is a
  // real upgrade, not only in emergencies.
  const desperate = p.hp <= p.maxHp * 0.45 || p.decay < 30;
  return (desperate && newHp > p.hp && newDecay > p.decay) ||
         (newHp > p.hp + 4 && newDecay > p.decay && def.hp >= BODIES[p.bodyType].hp);
}

function botAction(state, lastFailed) {
  const p = state.player;
  const inter = interactionAt(state);
  // Use whatever we are standing on, when it helps.
  if (inter?.kind === 'stairs') return { type: 'interact' };
  if (inter?.kind === 'possess' && worthPossessing(state, inter.corpse)) return { type: 'interact' };
  if (inter?.kind === 'shrine' && p.essence >= inter.cost && (
    (inter.tile === TILE.SHRINE_MEND && p.hp < p.maxHp * 0.6) ||
    (inter.tile === TILE.SHRINE_PRESERVE && p.decay < p.maxDecay * 0.4) ||
    inter.tile === TILE.SHRINE_EMPOWER)) return { type: 'interact' };

  // In a body: fight whatever is adjacent, leading with the ability — but at
  // critical HP, disengage toward fresh flesh instead of trading to zero.
  if (p.form === 'body') {
    const adjacent = state.enemies.find((e) => dist(p.x, p.y, e.x, e.y) === 1);
    if (adjacent) {
      if (p.hp <= p.maxHp * 0.3) {
        let bestD = Infinity, refuge = null;
        for (const c of state.corpses) {
          if (!worthPossessing(state, c)) continue;
          const d = dist(p.x, p.y, c.x, c.y);
          if (d > 0 && d < bestD && d <= 8) { bestD = d; refuge = c; }
        }
        if (refuge) {
          const step = nextStep(state.floor.map, p.x, p.y, refuge.x, refuge.y,
            new Set(state.enemies.map((e) => key(e.x, e.y))));
          if (step) return { type: 'move', dx: step[0], dy: step[1] };
        }
      }
      if (p.abilityCd === 0 && !lastFailed) return { type: 'ability' };
      return { type: 'move', dx: Math.sign(adjacent.x - p.x), dy: Math.sign(adjacent.y - p.y) };
    }
  }

  // As a soul: seize a weak adjacent enemy, otherwise dive for a corpse —
  // never slug it out bare.
  let target = null;
  if (p.form === 'soul') {
    for (const e of state.enemies) {
      if (dist(p.x, p.y, e.x, e.y) === 1 && e.hp / e.maxHp <= 0.3) {
        return { type: 'move', dx: Math.sign(e.x - p.x), dy: Math.sign(e.y - p.y) };
      }
    }
    let bestD = Infinity;
    for (const c of state.corpses) {
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < bestD) { bestD = d; target = { x: c.x, y: c.y }; }
    }
    // No flesh anywhere: sprint for the stairs (a soul can descend) and slip
    // away from whatever is closest, stepping only onto open ground.
    if (!target && state.enemies.length) {
      let near = null, nd = Infinity;
      for (const e of state.enemies) {
        const d = dist(p.x, p.y, e.x, e.y);
        if (d < nd) { nd = d; near = e; }
      }
      if (near && nd <= 2) {
        let best = null, bestGain = -Infinity;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const nx = p.x + dx, ny = p.y + dy;
          if (!isWalkable(state.floor.map, nx, ny)) continue;
          if (state.enemies.some((e) => e.x === nx && e.y === ny)) continue;
          const gain = dist(nx, ny, near.x, near.y);
          if (gain > bestGain) { bestGain = gain; best = { dx, dy } }
        }
        if (best) return { type: 'move', ...best };
      }
    }
  }
  // Wounded in a body: detour to a worthwhile corpse before pressing on.
  if (!target && p.form === 'body' && (p.hp < p.maxHp * 0.55 || p.decay < 35)) {
    let bestD = Infinity;
    for (const c of state.corpses) {
      if (!worthPossessing(state, c)) continue;
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < bestD && d <= 8) { bestD = d; target = { x: c.x, y: c.y }; }
    }
  }
  if (!target) {
    // Head for the stairs (or the Warden on the boss floor).
    if (state.floor.stairs) target = state.floor.stairs;
    else {
      const boss = state.enemies.find((e) => e.type === 'warden');
      target = boss ? { x: boss.x, y: boss.y } : null;
    }
  }
  if (target) {
    const blocked = new Set(state.enemies.map((e) => key(e.x, e.y)));
    const step = nextStep(state.floor.map, p.x, p.y, target.x, target.y, blocked);
    if (step) return { type: 'move', dx: step[0], dy: step[1] };
    // Path blocked by a lurker: shove toward the target anyway (attack or wall-bump).
    const step2 = nextStep(state.floor.map, p.x, p.y, target.x, target.y);
    if (step2) return { type: 'move', dx: step2[0], dy: step2[1] };
  }
  return { type: 'wait' };
}

test('speedrun bot: runs progress, possession sustains them, no crashes', () => {
  const results = [];
  for (let seed = 1; seed <= 14; seed++) {
    const state = createGame({ seed: seed * 7717 + 3 });
    let stuck = 0;
    let lastFailed = false;
    for (let i = 0; i < 3000 && state.status === 'playing'; i++) {
      const before = state.turnCount;
      act(state, botAction(state, lastFailed));
      lastFailed = state.turnCount === before;
      if (lastFailed) {
        stuck++;
        if (stuck > 25) act(state, { type: 'wait' });
      } else stuck = 0;
    }
    results.push({ depth: state.depth, status: state.status, bodies: state.player.wornBodies.length });
  }
  const reached2 = results.filter((r) => r.depth >= 2).length;
  const reached3 = results.filter((r) => r.depth >= 3).length;
  const shifted = results.filter((r) => r.bodies >= 2).length;
  // Calibrated against the current engine: this bot never kites, never rests,
  // and beelines the stairs — it is a floor-2-to-3 player by construction.
  // A regression below these floors means the early game got meaner.
  assert.ok(reached2 >= 11, `only ${reached2}/14 greedy runs cleared floor 1: ${JSON.stringify(results)}`);
  assert.ok(reached3 >= 3, `only ${reached3}/14 greedy runs reached depth 3: ${JSON.stringify(results)}`);
  // Possession must be load-bearing, not decorative.
  assert.ok(shifted >= 9, `only ${shifted}/14 runs ever shifted bodies: ${JSON.stringify(results)}`);
  // And the dungeon must NOT be facerollable blind.
  const wins = results.filter((r) => r.status === 'won').length;
  assert.ok(wins <= 7, `greedy bot won ${wins}/14 runs — the dungeon is a pushover`);
});
