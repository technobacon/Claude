// tests/combat.test.js — run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDeck } from '../src/core/cards.js';
import {
  startCombat, playCard, endTurn, canPlay, aliveEnemies, intentPreview,
  HAND_SIZE, BASE_ENERGY,
} from '../src/core/combat.js';

// Build a combat whose opening hand is exactly `ids` (deck size <= HAND_SIZE so
// everything is drawn), against the given enemies.
function combatWith(ids, enemyIds, { hp = 60, maxHp = 80, seed = 123 } = {}) {
  return startCombat({
    player: { hp, maxHp },
    deck: makeDeck(ids),
    enemyIds,
    seed,
  });
}

// Find a card's current hand index by id (decks here are small & fully drawn).
function handIndexOf(state, id) {
  const i = state.hand.findIndex((c) => c.id === id);
  assert.notEqual(i, -1, `expected ${id} in hand`);
  return i;
}

test('startCombat draws a full hand, sets energy, and telegraphs intents', () => {
  const s = combatWith(['strike', 'strike', 'defend', 'defend', 'bash'], ['cultist']);
  assert.equal(s.hand.length, HAND_SIZE);
  assert.equal(s.player.energy, BASE_ENERGY);
  assert.equal(s.phase, 'player');
  assert.ok(s.enemies[0].intent, 'enemy should have an intent');
  assert.equal(s.drawPile.length, 0); // 5-card deck fully drawn
});

test('Strike deals 6 to the targeted enemy and costs 1 energy', () => {
  const s = combatWith(['strike', 'strike', 'strike', 'strike', 'strike'], ['cultist']);
  const before = s.enemies[0].hp;
  const after = playCard(s, handIndexOf(s, 'strike'), 0);
  assert.equal(after.enemies[0].hp, before - 6);
  assert.equal(after.player.energy, BASE_ENERGY - 1);
});

test('playCard does not mutate the input state', () => {
  const s = combatWith(['strike', 'strike', 'strike', 'strike', 'strike'], ['cultist']);
  const hpBefore = s.enemies[0].hp;
  playCard(s, 0, 0);
  assert.equal(s.enemies[0].hp, hpBefore, 'original state was mutated');
});

test('Defend grants block', () => {
  const s = combatWith(['defend', 'defend', 'defend', 'defend', 'defend'], ['cultist']);
  const after = playCard(s, 0, 0);
  assert.equal(after.player.block, 5);
});

test('Bash applies Vulnerable so the next attack hits 50% harder', () => {
  const s = combatWith(['bash', 'strike', 'defend', 'defend', 'defend'], ['cultist']);
  const before = s.enemies[0].hp;
  let next = playCard(s, handIndexOf(s, 'bash'), 0);     // 8 dmg + 2 vulnerable
  assert.equal(next.enemies[0].statuses.vulnerable, 2);
  next = playCard(next, handIndexOf(next, 'strike'), 0); // 6 * 1.5 = 9
  assert.equal(next.enemies[0].hp, before - 8 - 9);
});

test('Strength raises attack damage; Heavy Blade scales it x3', () => {
  const s = combatWith(['flex', 'heavyBlade', 'defend', 'defend', 'defend'], ['cultist']);
  const before = s.enemies[0].hp;
  let next = playCard(s, handIndexOf(s, 'flex'), 0);          // +2 strength
  assert.equal(next.player.statuses.strength, 2);
  next = playCard(next, handIndexOf(next, 'heavyBlade'), 0);  // 14 + 2*3 = 20
  assert.equal(next.enemies[0].hp, before - 20);
});

test('Twin Strike hits twice; Cleave hits every enemy', () => {
  const twin = combatWith(['twinStrike', 'strike', 'strike', 'strike', 'strike'], ['cultist']);
  const tBefore = twin.enemies[0].hp;
  const tAfter = playCard(twin, handIndexOf(twin, 'twinStrike'), 0);
  assert.equal(tAfter.enemies[0].hp, tBefore - 10); // 5 x2

  const cleave = combatWith(['cleave', 'strike', 'strike', 'strike', 'strike'],
    ['spikeSlime', 'spikeSlime']);
  const before0 = cleave.enemies[0].hp;
  const before1 = cleave.enemies[1].hp;
  const after = playCard(cleave, handIndexOf(cleave, 'cleave'), 0);
  assert.equal(after.enemies[0].hp, before0 - 8);
  assert.equal(after.enemies[1].hp, before1 - 8);
});

test('canPlay / playCard reject a card the player cannot afford', () => {
  // Bash costs 2; spend energy down to 1 with two strikes first... instead
  // drain energy: play a 1-cost then check a 2-cost still affordable, then drain.
  let s = combatWith(['bash', 'strike', 'strike', 'strike', 'strike'], ['cultist']);
  s = playCard(s, handIndexOf(s, 'strike'), 0); // energy 2
  s = playCard(s, handIndexOf(s, 'strike'), 0); // energy 1
  const bashIdx = handIndexOf(s, 'bash');
  assert.equal(canPlay(s, bashIdx), false);
  const unchanged = playCard(s, bashIdx, 0);
  assert.equal(unchanged.player.energy, 1, 'illegal play should be a no-op');
});

test('endTurn lets the enemy act; block soaks damage', () => {
  // Spike Slime opens with Flame Tongue (8 dmg), deterministically.
  const s = combatWith(['defend', 'defend', 'defend', 'defend', 'defend'],
    ['spikeSlime'], { hp: 50, maxHp: 50 });
  const blocked = playCard(s, 0, 0); // +5 block
  const next = endTurn(blocked);     // takes 8, block 5 → 3 to HP
  assert.equal(next.player.hp, 47);
  assert.equal(next.player.block, 0, 'block clears at the start of the new turn');
  assert.equal(next.turn, 2);
});

test('Weak reduces the enemy outgoing damage', () => {
  const s = combatWith(['clothesline', 'strike', 'strike', 'strike', 'strike'],
    ['spikeSlime'], { hp: 50, maxHp: 50 });
  const weakened = playCard(s, handIndexOf(s, 'clothesline'), 0); // 12 dmg + 2 weak
  const next = endTurn(weakened); // Flame Tongue 8 → floor(8*0.75)=6
  assert.equal(next.player.hp, 44);
});

test('killing all enemies wins; lethal self-damage loses', () => {
  // Win: a near-dead slime, finished by a Strike.
  const win = startCombat({
    player: { hp: 50, maxHp: 50 },
    deck: makeDeck(['strike', 'strike', 'strike', 'strike', 'strike']),
    enemyIds: ['spikeSlime'],
    seed: 5,
  });
  let w = win;
  while (aliveEnemies(w).length > 0 && w.phase === 'player') {
    const i = w.hand.findIndex((c) => c.id === 'strike');
    if (i === -1 || !canPlay(w, i)) w = endTurn(w);
    else w = playCard(w, i, 0);
  }
  assert.ok(w.phase === 'won' || aliveEnemies(w).length === 0);

  // Lose: Bloodletting costs 3 HP; at 2 HP that is lethal.
  const lose = combatWith(['bloodletting', 'strike', 'strike', 'strike', 'strike'],
    ['cultist'], { hp: 2, maxHp: 50 });
  const dead = playCard(lose, handIndexOf(lose, 'bloodletting'), 0);
  assert.equal(dead.phase, 'lost');
  assert.equal(dead.player.hp, 0);
});

test('powers: Metallicize is recorded; Demon Form adds strength each turn', () => {
  const metal = combatWith(['metallicize', 'strike', 'strike', 'strike', 'strike'], ['cultist']);
  const m = playCard(metal, handIndexOf(metal, 'metallicize'), 0);
  assert.equal(m.player.powers.metallicize, 3);

  const demon = combatWith(['demonForm', 'strike', 'strike', 'strike', 'strike'], ['cultist']);
  const d = playCard(demon, handIndexOf(demon, 'demonForm'), 0); // costs all 3 energy
  assert.equal(d.player.statuses.strength, 0, 'no strength yet, only next turn');
  const nextTurn = endTurn(d);
  assert.equal(nextTurn.player.statuses.strength, 2, 'Demon Form grants +2 at turn start');
});

test('power cards exhaust (do not return to the deck)', () => {
  const s = combatWith(['inflame', 'strike', 'strike', 'strike', 'strike'], ['cultist']);
  const after = playCard(s, handIndexOf(s, 'inflame'), 0);
  assert.equal(after.exhaustPile.length, 1);
  assert.equal(after.discardPile.length, 0);
});

test('intentPreview reflects strength buffs', () => {
  // Cultist buffs (+3 strength) turn 1, then attacks for 6+3 = 9.
  const s = combatWith(['strike', 'strike', 'strike', 'strike', 'strike'], ['cultist'],
    { hp: 80, maxHp: 80 });
  const t2 = endTurn(s); // cultist did Incantation; now intent is Dark Strike
  const preview = intentPreview(t2.enemies[0]);
  assert.equal(preview.intent, 'attack');
  assert.equal(preview.damage, 9);
});

test('a full state is reproducible: same seed + actions → identical result', () => {
  const mk = () => combatWith(['strike', 'defend', 'bash', 'strike', 'defend'],
    ['jawWorm', 'spikeSlime'], { seed: 777 });
  const run = (s) => endTurn(playCard(playCard(s, 0, 0), 0, 0));
  assert.deepEqual(run(mk()), run(mk()));
});
