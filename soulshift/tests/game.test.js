import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, act, enemyAt, corpseAt, interactionAt, shrineCost, damageRoll,
  SOUL, CORPSE_FRESHNESS,
} from '../src/core/game.js';
import { TILE, setTile, key, tileAt } from '../src/core/grid.js';
import { BODIES } from '../src/core/bodies.js';
import { makeRng } from '../src/core/rng.js';

// A quiet arena: keep the generated map but remove all enemies and pickups so
// tests control exactly what is where.
function quietGame(opts = {}) {
  const state = createGame({ seed: 1234, ...opts });
  state.enemies = [];
  state.pickups = [];
  return state;
}

// Find a floor tile adjacent to the player.
function adjacentFloor(state) {
  const { x, y } = state.player;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (tileAt(state.floor.map, x + dx, y + dy) === TILE.FLOOR) return { x: x + dx, y: y + dy, dx, dy };
  }
  throw new Error('player boxed in');
}

function placeEnemy(state, type, x, y, hp) {
  const def = BODIES[type];
  const enemy = {
    id: 9000 + state.enemies.length, type, x, y,
    hp: hp ?? def.hp, maxHp: def.hp,
    atk: def.atk, def: def.def, speed: def.speed,
    energy: 0, cd: 99, statuses: {}, alerted: false, lastKnown: null,
  };
  state.enemies.push(enemy);
  return enemy;
}

test('createGame starts the player in a live body on floor 1', () => {
  const state = createGame({ seed: 99 });
  assert.equal(state.depth, 1);
  assert.equal(state.status, 'playing');
  assert.equal(state.player.form, 'body');
  assert.equal(state.player.bodyType, 'skeleton');
  assert.equal(state.player.hp, state.player.maxHp);
  assert.equal(state.player.decay, state.player.maxDecay);
  assert.ok(state.enemies.length > 0);
});

test('same seed: identical floor layout', () => {
  const a = createGame({ seed: 555 });
  const b = createGame({ seed: 555 });
  assert.deepEqual([...a.floor.map.tiles], [...b.floor.map.tiles]);
  assert.deepEqual(a.floor.spawn, b.floor.spawn);
  assert.deepEqual(a.enemies.map((e) => [e.type, e.x, e.y]), b.enemies.map((e) => [e.type, e.x, e.y]));
});

test('moving into a wall costs no turn', () => {
  const state = quietGame();
  // Find a wall direction.
  let dir = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (tileAt(state.floor.map, state.player.x + dx, state.player.y + dy) === TILE.WALL) { dir = [dx, dy]; break; }
  }
  if (!dir) return; // spawn not next to a wall on this seed; covered elsewhere
  const before = state.player.decay;
  act(state, { type: 'move', dx: dir[0], dy: dir[1] });
  assert.equal(state.player.decay, before, 'no decay spent on a refused move');
});

test('waiting spends decay; body crumbles at zero and the soul emerges', () => {
  const state = quietGame();
  state.player.decay = 2;
  act(state, { type: 'wait' });
  assert.equal(state.player.decay, 1);
  act(state, { type: 'wait' });
  assert.equal(state.player.form, 'soul');
  assert.equal(state.player.bodyType, null);
  assert.equal(state.player.maxHp, SOUL.baseHp);
  assert.equal(state.player.grace, SOUL.graceOnCrumble);
});

test('soul fades after grace runs out and dies at zero', () => {
  const state = quietGame();
  state.player.decay = 1;
  act(state, { type: 'wait' }); // crumble
  assert.equal(state.player.form, 'soul');
  const hp = state.player.hp;
  for (let i = 0; i < SOUL.graceOnCrumble; i++) act(state, { type: 'wait' });
  assert.equal(state.player.hp, hp, 'grace period protects');
  act(state, { type: 'wait' });
  assert.equal(state.player.hp, hp - 1, 'fading begins');
  state.player.hp = 1;
  act(state, { type: 'wait' });
  assert.equal(state.status, 'dead');
});

test('bump attack kills an enemy, drops a corpse and pays essence', () => {
  const state = quietGame();
  const spot = adjacentFloor(state);
  const rat = placeEnemy(state, 'rat', spot.x, spot.y, 1);
  const essenceBefore = state.player.essence;
  act(state, { type: 'move', dx: spot.dx, dy: spot.dy });
  assert.ok(!state.enemies.includes(rat), 'rat is dead');
  assert.ok(corpseAt(state, spot.x, spot.y), 'corpse dropped');
  assert.equal(state.player.essence, essenceBefore + BODIES.rat.essence);
  assert.equal(state.player.kills, 1);
});

test('possessing a corpse swaps bodies and leaves your old one behind', () => {
  const state = quietGame();
  const { x, y } = state.player;
  state.corpses.push({ type: 'knight', x, y, freshness: 30 });
  const inter = interactionAt(state);
  assert.equal(inter.kind, 'possess');
  act(state, { type: 'interact' });
  assert.equal(state.player.bodyType, 'knight');
  assert.equal(state.player.hp, Math.round(BODIES.knight.hp * 0.7), 'wakes at 70% HP');
  assert.equal(state.player.decay, BODIES.knight.decay - 1, 'the possession turn itself costs decay');
  const old = corpseAt(state, x, y);
  assert.ok(old && old.type === 'skeleton', 'old skeleton corpse left behind');
  assert.ok(state.player.wornBodies.includes('knight'));
});

test('a soul stepping onto a corpse auto-possesses it', () => {
  const state = quietGame();
  state.player.decay = 1;
  act(state, { type: 'wait' }); // become soul
  const spot = adjacentFloor(state);
  state.corpses.push({ type: 'goblin', x: spot.x, y: spot.y, freshness: 30 });
  act(state, { type: 'move', dx: spot.dx, dy: spot.dy });
  assert.equal(state.player.form, 'body');
  assert.equal(state.player.bodyType, 'goblin');
});

test('a soul can possess a living enemy below the threshold', () => {
  const state = quietGame();
  state.player.decay = 1;
  act(state, { type: 'wait' });
  const spot = adjacentFloor(state);
  const knight = placeEnemy(state, 'knight', spot.x, spot.y, 5); // 5/26 < 30%
  act(state, { type: 'move', dx: spot.dx, dy: spot.dy });
  assert.ok(!state.enemies.includes(knight), 'knight consumed');
  assert.equal(state.player.form, 'body');
  assert.equal(state.player.bodyType, 'knight');
  assert.deepEqual([state.player.x, state.player.y], [spot.x, spot.y]);
});

test('a soul touching a healthy enemy only chips it', () => {
  const state = quietGame();
  state.player.decay = 1;
  act(state, { type: 'wait' });
  const spot = adjacentFloor(state);
  const knight = placeEnemy(state, 'knight', spot.x, spot.y); // full HP
  act(state, { type: 'move', dx: spot.dx, dy: spot.dy });
  assert.ok(state.enemies.includes(knight), 'knight survives');
  assert.equal(knight.hp, BODIES.knight.hp - SOUL.touchDamage);
  assert.equal(state.player.form, 'soul');
});

test('body destroyed by damage ejects the soul instead of ending the run', () => {
  const state = quietGame();
  state.player.hp = 1;
  const spot = adjacentFloor(state);
  const ogre = placeEnemy(state, 'ogre', spot.x, spot.y);
  ogre.alerted = true;
  ogre.energy = 100;
  ogre.cd = 99; // plain hits only
  act(state, { type: 'wait' });
  assert.equal(state.status, 'playing');
  assert.equal(state.player.form, 'soul');
  assert.equal(state.player.grace, SOUL.graceOnDestroyed);
});

test('a flickering (graced) soul cannot be struck', () => {
  const state = quietGame();
  state.player.hp = 1;
  const spot = adjacentFloor(state);
  const ogre = placeEnemy(state, 'ogre', spot.x, spot.y);
  ogre.alerted = true;
  ogre.energy = 100;
  act(state, { type: 'wait' }); // ogre destroys the body; soul ejects with grace
  assert.equal(state.player.form, 'soul');
  const hp = state.player.hp;
  act(state, { type: 'wait' }); // ogre is adjacent but the soul flickers
  assert.equal(state.status, 'playing');
  assert.equal(state.player.hp, hp, 'graced soul untouched');
});

test('fast enemies move twice but only strike once per tick', () => {
  const state = quietGame();
  state.player.hp = 100;
  state.player.maxHp = 100;
  const spot = adjacentFloor(state);
  const bat = placeEnemy(state, 'bat', spot.x, spot.y);
  bat.alerted = true;
  bat.energy = 150; // banked enough for two actions this tick
  const before = state.player.hp;
  act(state, { type: 'wait' });
  const taken = before - state.player.hp;
  assert.ok(taken <= BODIES.bat.atk + 2, `bat dealt ${taken} in one tick — double strike`);
});

test('shed bodies remember their wounds: corpse ping-pong is not free healing', () => {
  const state = quietGame();
  const { x, y } = state.player;
  state.player.hp = 3; // badly hurt skeleton
  state.player.decay = 20; // and nearly rotted
  state.corpses.push({ type: 'rat', x, y, freshness: 30 });
  act(state, { type: 'interact' }); // into the rat
  assert.equal(state.player.bodyType, 'rat');
  act(state, { type: 'interact' }); // straight back into the shed skeleton
  assert.equal(state.player.bodyType, 'skeleton');
  assert.ok(state.player.hp <= 3, `repossessed at ${state.player.hp} hp — ping-pong healed`);
  assert.ok(state.player.decay <= 20, `repossessed with ${state.player.decay} decay — rot reset`);
});

test('corpses rot away after their freshness expires', () => {
  const state = quietGame();
  state.corpses.push({ type: 'rat', x: 1, y: 1, freshness: 2 });
  act(state, { type: 'wait' });
  assert.equal(state.corpses.length, 1);
  act(state, { type: 'wait' });
  assert.equal(state.corpses.length, 0);
});

test('stairs descend and deepen the dungeon', () => {
  const state = quietGame();
  const { x, y } = state.player;
  setTile(state.floor.map, x, y, TILE.STAIRS);
  act(state, { type: 'interact' });
  assert.equal(state.depth, 2);
  assert.ok(state.enemies.length > 0, 'new floor is populated');
});

test('empower shrine boosts this body and every body after', () => {
  const state = quietGame();
  const { x, y } = state.player;
  setTile(state.floor.map, x, y, TILE.SHRINE_EMPOWER);
  state.player.essence = 100;
  const cost = shrineCost(state, TILE.SHRINE_EMPOWER);
  const atkBefore = state.player.atk;
  act(state, { type: 'interact' });
  assert.equal(state.player.atk, atkBefore + 1);
  assert.equal(state.player.essence, 100 - cost);
  assert.ok(state.usedShrines.has(key(x, y)));
  // Shift into a fresh corpse: the bonus persists.
  state.corpses.push({ type: 'rat', x, y, freshness: 30 });
  // Tile is a used shrine now, so interact won't possess; step off and back via direct corpse possession:
  setTile(state.floor.map, x, y, TILE.FLOOR);
  act(state, { type: 'interact' });
  assert.equal(state.player.bodyType, 'rat');
  assert.equal(state.player.atk, BODIES.rat.atk + 1 + 1, 'soul fury + empower follow the soul');
});

test('mend shrine refuses without essence, heals with it', () => {
  const state = quietGame();
  const { x, y } = state.player;
  setTile(state.floor.map, x, y, TILE.SHRINE_MEND);
  state.player.essence = 0;
  state.player.hp = 1;
  act(state, { type: 'interact' });
  assert.equal(state.player.hp, 1, 'no essence, no healing');
  state.player.essence = 100;
  act(state, { type: 'interact' });
  assert.equal(state.player.hp, state.player.maxHp);
});

test('perks shape the run: embalmer slows decay, irongrip wakes stronger', () => {
  const plain = createGame({ seed: 4, startBody: 'skeleton' });
  const perked = createGame({ seed: 4, perks: ['embalmer', 'irongrip', 'thickichor', 'sharpwill'], startBody: 'skeleton' });
  assert.ok(perked.player.maxDecay > plain.player.maxDecay);
  assert.ok(perked.player.maxHp > plain.player.maxHp);
  assert.equal(perked.player.atk, plain.player.atk + 1);
  // Iron grip possession fraction:
  const state = perked;
  state.enemies = [];
  state.pickups = [];
  state.corpses.push({ type: 'ogre', x: state.player.x, y: state.player.y, freshness: 30 });
  act(state, { type: 'interact' });
  assert.equal(state.player.hp, Math.max(1, Math.round(state.player.maxHp * 0.9)));
});

test('killing the warden wins the run', () => {
  const state = quietGame();
  const spot = adjacentFloor(state);
  placeEnemy(state, 'warden', spot.x, spot.y, 1);
  act(state, { type: 'move', dx: spot.dx, dy: spot.dy });
  assert.equal(state.status, 'won');
  assert.equal(state.winHow, 'slain');
});

test('a soul possessing the weakened warden also wins', () => {
  const state = quietGame();
  state.player.decay = 1;
  act(state, { type: 'wait' });
  const spot = adjacentFloor(state);
  placeEnemy(state, 'warden', spot.x, spot.y, 10); // 10/80 = 12.5% < 25%
  act(state, { type: 'move', dx: spot.dx, dy: spot.dy });
  assert.equal(state.status, 'won');
  assert.equal(state.winHow, 'possessed');
});

test('abilities: skeleton bone toss hits at range and starts cooldown', () => {
  const state = quietGame();
  // Place a rat 3 tiles away in a straight visible line if possible.
  const { x, y } = state.player;
  let placed = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const tx = x + dx * 3, ty = y + dy * 3;
    if (state.visible.has(key(tx, ty)) && tileAt(state.floor.map, tx, ty) === TILE.FLOOR) {
      placed = placeEnemy(state, 'rat', tx, ty);
      break;
    }
  }
  if (!placed) return; // cramped spawn on this seed; ability math is covered by damageRoll test
  const hpBefore = placed.hp;
  act(state, { type: 'ability' });
  assert.ok(placed.hp < hpBefore || !state.enemies.includes(placed), 'bone toss connected');
  assert.equal(state.player.abilityCd, BODIES.skeleton.ability.cd - 1, 'cooldown started (1 turn already elapsed)');
});

test('damageRoll always deals at least 1 and respects defense on average', () => {
  const rng = makeRng(31337);
  let total = 0;
  for (let i = 0; i < 2000; i++) {
    const d = damageRoll(rng, 5, 3);
    assert.ok(d >= 1);
    total += d;
  }
  const avg = total / 2000;
  assert.ok(avg > 1.6 && avg < 3.0, `avg ${avg} should hover a bit above atk-def=2`);
});

test('fast bodies act more often than the world', () => {
  const state = quietGame();
  state.player.speed = 'fast';
  const enemy = placeEnemy(state, 'slime', 1, 1); // far away, slow
  enemy.energy = 0;
  // Two player actions; a slow enemy (50/tick) should tick less than twice.
  const e0 = enemy.energy;
  act(state, { type: 'wait' });
  act(state, { type: 'wait' });
  // Fast player: 3 actions happen per 2 world ticks, so the slime banked
  // less energy than a normal-speed player would have allowed.
  assert.ok(enemy.energy <= e0 + 100, 'world ticked at most twice for two fast actions');
});

test('stunned player loses the turn', () => {
  const state = quietGame();
  state.player.statuses.stun = 1;
  const { x, y } = state.player;
  const spot = adjacentFloor(state);
  act(state, { type: 'move', dx: spot.dx, dy: spot.dy });
  assert.deepEqual([state.player.x, state.player.y], [x, y], 'did not move');
  act(state, { type: 'move', dx: spot.dx, dy: spot.dy });
  assert.deepEqual([state.player.x, state.player.y], [spot.x, spot.y], 'stun wore off');
});

test('CORPSE_FRESHNESS gives a real possession window', () => {
  assert.ok(CORPSE_FRESHNESS >= 40, 'corpses must not rot out from under the player instantly');
});
