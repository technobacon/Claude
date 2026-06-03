// tests/chain.test.js — chain system unit tests
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeDeck, getCard } from '../src/core/cards.js';
import {
  startCombat, playCard, endTurn, canPlay, chainStatus, previewChain,
  aliveEnemies, BASE_TEMPO,
} from '../src/core/combat.js';

function mk(handIds, enemyIds = ['hushWisp'], opts = {}) {
  return startCombat({
    player: { hp: opts.hp ?? 60, maxHp: opts.maxHp ?? 80 },
    deck: makeDeck(handIds),
    enemyIds,
    seed: opts.seed ?? 1,
  });
}

function idx(state, id) {
  const i = state.hand.findIndex((c) => c.id === id);
  assert.notEqual(i, -1, `expected ${id} in hand`);
  return i;
}

// --- basic chain status -----------------------------------------------------

test('chainStatus is empty on a fresh turn', () => {
  const s = mk(['simpleStrike', 'restChord', 'tuneUp', 'simpleStrike', 'restChord']);
  assert.equal(chainStatus(s), 'empty');
});

test('neutral: same note twice gives no chain bonus', () => {
  const s = mk(['simpleStrike', 'simpleStrike', 'restChord', 'restChord', 'tuneUp']);
  const hpBefore = s.enemies[0].hp;
  let next = playCard(s, idx(s, 'simpleStrike'), 0); // first strike – no chain yet
  const hpAfter1 = next.enemies[0].hp;
  next = playCard(next, idx(next, 'simpleStrike'), 0); // second strike, same note → neutral
  const hpAfter2 = next.enemies[0].hp;
  // First hit: 7 dmg. Second hit: also 7, no Harmony bonus (+3 would make it 10).
  assert.equal(hpBefore - hpAfter1, 7, 'first strike');
  assert.equal(hpAfter1 - hpAfter2, 7, 'second strike neutral, no bonus');
  assert.equal(chainStatus(next), 'neutral');
});

test('harmony: strike after ward gives +3 damage', () => {
  const s = mk(['restChord', 'simpleStrike', 'tuneUp', 'tuneUp', 'tuneUp']);
  const hpBefore = s.enemies[0].hp;
  let next = playCard(s, idx(s, 'restChord'), 0);     // ward note
  next = playCard(next, idx(next, 'simpleStrike'), 0); // strike note → Harmony
  assert.equal(hpBefore - next.enemies[0].hp, 7 + 3, 'strike harmony +3');
  assert.equal(chainStatus(next), 'harmony');
});

test('harmony: ward after strike gives +3 block', () => {
  const s = mk(['simpleStrike', 'restChord', 'tuneUp', 'tuneUp', 'tuneUp']);
  let next = playCard(s, idx(s, 'simpleStrike'), 0);  // strike note
  const blockBefore = next.player.block;
  next = playCard(next, idx(next, 'restChord'), 0);   // ward note → Harmony
  assert.equal(next.player.block - blockBefore, 6 + 3, 'ward harmony +3 block');
});

test('harmony: verse after strike draws 1 extra card', () => {
  // Seed 8 with this 8-card deck produces hand [ward,strike,ward,verse,ward] + 3 in drawPile.
  // That gives us: a strike to play, then a verse for the harmony bonus, plus pile cards to draw.
  const s = mk([
    'simpleStrike','tuneUp','restChord','restChord','restChord',
    'restChord','restChord','restChord',
  ], ['hushWisp'], { seed: 8 });
  const si = s.hand.findIndex((c) => getCard(c.id).note === 'strike');
  const vi = s.hand.findIndex((c, i) => i !== si && getCard(c.id).note === 'verse');
  assert.notEqual(si, -1, 'strike in hand');
  assert.notEqual(vi, -1, 'verse in hand');
  let next = playCard(s, si, 0);                                    // strike
  const mid = next.hand.length;
  const vi2 = next.hand.findIndex((c) => getCard(c.id).note === 'verse');
  next = playCard(next, vi2, 0);                                    // verse → Harmony
  // verse harmony = draw 1 extra (on top of the verse card's own draw 2)
  // net: -1 (played verse) +2 (verse draw) +1 (harmony draw) = +2 from mid
  assert.ok(next.hand.length >= mid + 2, 'verse harmony draws extra card');
});

// --- crescendo --------------------------------------------------------------

test('crescendo fires once on 3 different notes in last 3 plays', () => {
  // Strike→Ward→Verse should crescendo on the Verse
  const s = mk(['simpleStrike', 'restChord', 'tuneUp', 'simpleStrike', 'restChord']);
  let next = playCard(s, idx(s, 'simpleStrike'), 0);  // strike
  next = playCard(next, idx(next, 'restChord'), 0);   // ward
  assert.equal(chainStatus(next), 'harmony');
  assert.equal(next.crescendoFired, false);
  next = playCard(next, idx(next, 'tuneUp'), 0);      // verse → CRESCENDO
  assert.equal(next.crescendoFired, true, 'crescendoFired should be true');
  assert.equal(chainStatus(next), 'crescendo');
});

test('crescendo on Strike: deals 8 to ALL enemies', () => {
  // Ward→Verse→Strike sequence triggers Crescendo on the Strike
  const s = mk(['restChord', 'tuneUp', 'simpleStrike', 'simpleStrike', 'restChord'],
    ['hushWisp', 'hushWisp']);
  let next = playCard(s, idx(s, 'restChord'), 0);    // ward
  next = playCard(next, idx(next, 'tuneUp'), 0);     // verse
  const hp0 = next.enemies[0].hp;
  const hp1 = next.enemies[1].hp;
  next = playCard(next, idx(next, 'simpleStrike'), 0); // strike → Crescendo
  // Crescendo strike: 8 dmg to ALL (on top of the normal 7+3=10 to chosen)
  // Enemy 0: 7+3 (strike + harmony) + 8 (crescendo to all) = 18 total
  // Enemy 1: 8 (crescendo to all only)
  assert.equal(hp0 - next.enemies[0].hp, 7 + 3 + 8, 'crescendo hit chosen + all');
  assert.equal(hp1 - next.enemies[1].hp, 8, 'crescendo hits other enemy');
});

test('crescendo fires only once per turn', () => {
  // Play S→W→V (crescendo), then play S→W→V again: second set is just harmony
  const s = mk(['simpleStrike', 'restChord', 'tuneUp', 'simpleStrike', 'restChord'],
    ['hushWisp']);
  let next = playCard(s, idx(s, 'simpleStrike'), 0);   // strike
  next = playCard(next, idx(next, 'restChord'), 0);    // ward
  next = playCard(next, idx(next, 'tuneUp'), 0);       // verse → crescendo #1
  assert.equal(next.crescendoFired, true);
  // Now play another strike
  next = playCard(next, idx(next, 'simpleStrike'), 0); // strike: harmony only, no crescendo
  assert.equal(next.crescendoFired, true, 'still true after second crescendo attempt');
});

test('chain resets at start of next turn', () => {
  const s = mk(['simpleStrike', 'restChord', 'tuneUp', 'simpleStrike', 'restChord']);
  let next = playCard(s, idx(s, 'simpleStrike'), 0);
  next = playCard(next, idx(next, 'restChord'), 0);
  next = endTurn(next);
  assert.deepEqual(next.chain, [], 'chain resets on new turn');
  assert.equal(next.crescendoFired, false, 'crescendoFired resets');
});

// --- muted ------------------------------------------------------------------

test('muted notes do not contribute to chain', () => {
  const s = mk(['simpleStrike', 'simpleStrike', 'restChord', 'tuneUp', 'tuneUp']);
  // Manually mute strike
  const muted = { ...s, player: { ...s.player, muted: { strike: 2, ward: 0, verse: 0 } } };
  // Play strike (muted) then ward: chain should not advance for the strike
  let next = playCard(muted, idx(muted, 'simpleStrike'), 0); // muted strike
  assert.deepEqual(next.chain, [], 'muted card not added to chain');
  // Playing ward after a muted strike: chain is empty → neutral
  next = playCard(next, idx(next, 'restChord'), 0);
  assert.deepEqual(next.chain, ['ward'], 'ward was added normally');
});

test('muted notes cost +1 tempo', () => {
  const s = mk(['simpleStrike', 'simpleStrike', 'restChord', 'tuneUp', 'tuneUp']);
  const muted = { ...s, player: { ...s.player, muted: { strike: 1, ward: 0, verse: 0 }, tempo: 1 } };
  // Strike costs 1, muted = 2 → can't play with 1 tempo
  assert.equal(canPlay(muted, idx(muted, 'simpleStrike')), false, 'too expensive when muted');
});

// --- previewChain -----------------------------------------------------------

test('previewChain correctly forecasts chain result', () => {
  const s = mk(['simpleStrike', 'restChord', 'tuneUp', 'simpleStrike', 'restChord']);
  assert.equal(previewChain(s, 'strike', false), 'neutral'); // first card
  let next = playCard(s, idx(s, 'simpleStrike'), 0);
  assert.equal(previewChain(next, 'ward', false), 'harmony');
  next = playCard(next, idx(next, 'restChord'), 0);
  assert.equal(previewChain(next, 'verse', false), 'crescendo');
});

// --- Resonant doubles chain bonus -------------------------------------------

test('Resonant doubles Harmony bonus', () => {
  const s = mk(['simpleStrike', 'restChord', 'tuneUp', 'tuneUp', 'tuneUp']);
  // Give player Resonant manually
  const resonant = {
    ...s,
    player: { ...s.player, statuses: { ...s.player.statuses, resonant: 1 } },
  };
  const hpBefore = resonant.enemies[0].hp;
  let next = playCard(resonant, idx(resonant, 'restChord'), 0); // ward first
  next = playCard(next, idx(next, 'simpleStrike'), 0); // strike → Harmony × resonant
  // Normal strike 7, harmony +3, resonant doubles harmony so +6 total = 7+6=13
  assert.equal(hpBefore - next.enemies[0].hp, 7 + 6, 'resonant doubles harmony bonus');
  assert.equal(next.player.statuses.resonant, 0, 'resonant consumed');
});
