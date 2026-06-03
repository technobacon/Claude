// tests/run.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newRun, enterNode, resolveCombat, chooseReward,
  rest, startCompose, finishCompose, startTranscribe, finishTranscribe,
  currentNode, START_HP,
} from '../src/core/run.js';
import { STARTER_DECK } from '../src/core/cards.js';
import { aliveEnemies, playCard, endTurn, canPlay } from '../src/core/combat.js';

function autopilot(run, maxGuard = 300) {
  let r = run;
  let g = 0;
  while (r.phase === 'combat' && r.combat.phase === 'player' && g++ < maxGuard) {
    const c = r.combat;
    const target = aliveEnemies(c)[0];
    const i = c.hand.findIndex(
      (card, idx) => (card.id === 'simpleStrike' || card.id === 'staccato') && canPlay(c, idx),
    );
    if (i !== -1 && target) r = { ...r, combat: playCard(c, i, target.slot) };
    else r = { ...r, combat: endTurn(c) };
  }
  return r;
}

test('newRun creates correct structure', () => {
  const r = newRun(1);
  assert.equal(r.phase, 'map');
  assert.equal(r.floor, 0);
  assert.equal(r.player.hp, START_HP);
  assert.equal(r.player.deck.length, STARTER_DECK.length);
  assert.equal(r.nodes[r.nodes.length - 1].type, 'boss');
});

test('newRun is deterministic', () => {
  assert.deepEqual(newRun(77).nodes, newRun(77).nodes);
});

test('entering a combat node starts combat with player HP', () => {
  const r = enterNode(newRun(3));
  assert.equal(r.phase, 'combat');
  assert.ok(r.combat);
  assert.equal(r.combat.player.hp, START_HP);
});

test('entering a rest node opens rest screen', () => {
  // Floor 2 is rest in the layout
  let r = newRun(5);
  r = { ...r, floor: 2 };
  assert.equal(currentNode(r).type, 'rest');
  r = enterNode(r);
  assert.equal(r.phase, 'rest');
});

test('rest heals 30% max HP', () => {
  let r = newRun(5);
  r = { ...r, floor: 2, player: { ...r.player, hp: 10 } };
  r = enterNode(r);
  const healed = rest(r);
  assert.ok(healed.player.hp > 10);
  assert.ok(healed.player.hp <= healed.player.maxHp);
  assert.equal(healed.phase, 'map');
});

test('winning fight yields reward, picking card grows deck', () => {
  let r = enterNode(newRun(11));
  r = autopilot(r);
  r = resolveCombat(r);
  if (r.phase !== 'reward') return; // may be dead for some seeds
  assert.equal(r.reward.cards.length <= 3, true);
  const before = r.player.deck.length;
  r = chooseReward(r, r.reward.cards[0]);
  assert.equal(r.player.deck.length, before + 1);
  assert.equal(r.phase, 'map');
  assert.equal(r.floor, 1);
});

test('skipping reward does not change deck', () => {
  let r = enterNode(newRun(11));
  r = autopilot(r);
  r = resolveCombat(r);
  if (r.phase !== 'reward') return;
  const before = r.player.deck.length;
  r = chooseReward(r, null);
  assert.equal(r.player.deck.length, before);
});

test('losing combat marks run dead', () => {
  let r = newRun(4);
  r = { ...r, player: { ...r.player, hp: 5 } };
  r = enterNode(r);
  // Just end turns until death
  let g = 0;
  while (r.phase === 'combat' && r.combat.phase === 'player' && g++ < 50) {
    r = { ...r, combat: endTurn(r.combat) };
  }
  r = resolveCombat(r);
  if (r.phase === 'dead') {
    assert.equal(r.player.hp, 0);
  }
});

test('Compose peeks 5 cards and pinning one puts it first', () => {
  const r = newRun(5);
  const atRest = { ...r, floor: 2, phase: 'rest' };
  const composing = startCompose(atRest);
  assert.ok(composing.compose);
  assert.ok(composing.compose.peeked.length <= 5);
  const toPin = composing.compose.peeked[2];
  const done = finishCompose(composing, toPin.uid);
  assert.equal(done.player.deck[0].uid, toPin.uid, 'pinned card is first in deck');
  assert.equal(done.phase, 'map');
});

test('Transcribe marks a card upgraded', () => {
  const r = newRun(5);
  const atRest = { ...r, floor: 2, phase: 'rest' };
  const t = startTranscribe(atRest);
  assert.ok(t.transcribe);
  assert.ok(t.transcribe.options.length > 0);
  const target = t.transcribe.options[0];
  const done = finishTranscribe(t, target.uid);
  const upgraded = done.player.deck.find((c) => c.uid === target.uid);
  assert.equal(upgraded.upgraded, true);
  assert.equal(done.phase, 'map');
});
