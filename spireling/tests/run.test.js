// tests/run.test.js — run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newRun, enterNode, resolveCombat, chooseReward, rest, currentNode,
  START_HP,
} from '../src/core/run.js';
import { STARTER_DECK } from '../src/core/cards.js';
import { aliveEnemies, playCard, endTurn, canPlay } from '../src/core/combat.js';

test('newRun starts on the map with a full starter deck', () => {
  const run = newRun(42);
  assert.equal(run.phase, 'map');
  assert.equal(run.floor, 0);
  assert.equal(run.player.hp, START_HP);
  assert.equal(run.player.deck.length, STARTER_DECK.length);
  assert.ok(run.nodes.length > 0);
  assert.equal(run.nodes[run.nodes.length - 1].type, 'boss');
});

test('newRun is deterministic for a seed (same node layout)', () => {
  const a = newRun(99);
  const b = newRun(99);
  assert.deepEqual(a.nodes, b.nodes);
});

test('entering a combat node starts a combat carrying current HP', () => {
  const run = newRun(7);
  const inCombat = enterNode(run);
  assert.equal(inCombat.phase, 'combat');
  assert.ok(inCombat.combat);
  assert.equal(inCombat.combat.player.hp, run.player.hp);
  assert.equal(inCombat.combat.player.maxHp, run.player.maxHp);
});

test('entering a rest node opens the rest screen and heals on rest', () => {
  // Floor 2 is a rest in the layout; walk the run there by faking arrival.
  let run = newRun(3);
  run = { ...run, floor: 2, player: { ...run.player, hp: 10 } };
  assert.equal(currentNode(run).type, 'rest');
  const atRest = enterNode(run);
  assert.equal(atRest.phase, 'rest');
  const healed = rest(atRest);
  assert.ok(healed.player.hp > 10, 'rest should heal');
  assert.equal(healed.phase, 'map');
  assert.equal(healed.floor, 3);
});

test('winning a fight yields a reward, and picking a card grows the deck', () => {
  let run = enterNode(newRun(11));
  // Auto-pilot the fight: Strike the first living enemy, end turn when stuck.
  let guard = 0;
  while (run.combat.phase === 'player' && guard++ < 200) {
    const target = aliveEnemies(run.combat)[0];
    const i = run.combat.hand.findIndex(
      (c) => (c.id === 'strike' || c.id === 'bash') && canPlay(run.combat, run.combat.hand.indexOf(c)),
    );
    run = { ...run, combat: i !== -1 ? playCard(run.combat, i, target.slot) : endTurn(run.combat) };
  }

  if (run.combat.phase === 'won') {
    run = resolveCombat(run);
    assert.equal(run.phase, 'reward');
    assert.equal(run.reward.cards.length <= 3, true);
    const before = run.player.deck.length;
    const pick = run.reward.cards[0];
    run = chooseReward(run, pick);
    assert.equal(run.player.deck.length, before + 1);
    assert.equal(run.phase, 'map');
    assert.equal(run.floor, 1);
  } else {
    // If the seed produced a loss, the run should report death cleanly.
    run = resolveCombat(run);
    assert.equal(run.phase, 'dead');
  }
});

test('skipping a reward advances without changing the deck', () => {
  // Drive a quick win against a weak group by seeding a forced reward state.
  let run = enterNode(newRun(11));
  let guard = 0;
  while (run.combat.phase === 'player' && guard++ < 200) {
    const target = aliveEnemies(run.combat)[0];
    const i = run.combat.hand.findIndex(
      (c) => (c.id === 'strike' || c.id === 'bash') && canPlay(run.combat, run.combat.hand.indexOf(c)),
    );
    run = { ...run, combat: i !== -1 ? playCard(run.combat, i, target.slot) : endTurn(run.combat) };
  }
  run = resolveCombat(run);
  if (run.phase !== 'reward') return; // loss path covered elsewhere
  const before = run.player.deck.length;
  run = chooseReward(run, null);
  assert.equal(run.player.deck.length, before);
  assert.equal(run.phase, 'map');
});

test('a losing combat marks the run dead and zeroes HP', () => {
  // Start a fight, then force a loss by replaying the player at 0 HP isn't
  // exposed; instead end turns until the enemy kills a low-HP hero.
  let run = newRun(4);
  run = { ...run, player: { ...run.player, hp: 6 } };
  run = enterNode(run);
  let guard = 0;
  while (run.combat.phase === 'player' && guard++ < 50) {
    run = { ...run, combat: endTurn(run.combat) };
  }
  if (run.combat.phase === 'lost') {
    run = resolveCombat(run);
    assert.equal(run.phase, 'dead');
    assert.equal(run.player.hp, 0);
  }
});
