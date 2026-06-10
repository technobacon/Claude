import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERKS, STARTING_BODIES, newMeta, normalizeMeta, buyPerk, buyStart, perkMods, bankRun,
} from '../src/core/meta.js';
import { BODIES } from '../src/core/bodies.js';

test('perk purchases respect the bank and never double-buy', () => {
  const meta = newMeta();
  assert.equal(buyPerk(meta, 'hoarder'), false, 'broke');
  meta.bank = 200;
  assert.equal(buyPerk(meta, 'hoarder'), true);
  assert.equal(meta.bank, 200 - PERKS.find((p) => p.id === 'hoarder').cost);
  assert.equal(buyPerk(meta, 'hoarder'), false, 'already owned');
  assert.equal(buyPerk(meta, 'nonsense'), false);
});

test('starting bodies unlock with essence and exist in the bestiary', () => {
  for (const s of STARTING_BODIES) assert.ok(BODIES[s.id], `unknown starter ${s.id}`);
  const meta = newMeta();
  meta.bank = 1000;
  assert.equal(buyStart(meta, 'knight'), true);
  assert.ok(meta.unlockedStarts.includes('knight'));
  assert.equal(buyStart(meta, 'knight'), false);
});

test('perkMods reflects ownership', () => {
  const none = perkMods([]);
  assert.equal(none.decayMult, 1);
  assert.equal(none.possessHpFrac, 0.7);
  const all = perkMods(PERKS.map((p) => p.id));
  assert.ok(all.decayMult > 1);
  assert.equal(all.possessHpFrac, 0.9);
  assert.equal(all.possessThreshold, 0.4);
  assert.ok(all.graveSense);
});

test('banking: wins pay full plus bonus, deaths pay 60%', () => {
  const meta = newMeta();
  const dead = { status: 'dead', depth: 4, player: { essence: 100, wornBodies: ['skeleton', 'rat'] } };
  const gained = bankRun(meta, dead);
  assert.equal(gained, 60);
  assert.equal(meta.bank, 60);
  assert.equal(meta.bestDepth, 4);
  assert.deepEqual(meta.bestiary, ['skeleton', 'rat']);
  const won = { status: 'won', depth: 8, player: { essence: 50, wornBodies: [] } };
  assert.equal(bankRun(meta, won), 200);
  assert.equal(meta.wins, 1);
});

test('normalizeMeta survives garbage saves', () => {
  assert.deepEqual(normalizeMeta(null), newMeta());
  const fixed = normalizeMeta({ bank: -5, perks: ['hoarder', 'fake'], unlockedStarts: ['knight', 'fake'] });
  assert.equal(fixed.bank, 0);
  assert.deepEqual(fixed.perks, ['hoarder']);
  assert.ok(fixed.unlockedStarts.includes('skeleton'), 'skeleton always available');
  assert.ok(fixed.unlockedStarts.includes('knight'));
  assert.ok(!fixed.unlockedStarts.includes('fake'));
});
