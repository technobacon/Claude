import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, hashSeed } from '../src/core/rng.js';

test('same seed produces identical sequences', () => {
  const a = makeRng(12345);
  const b = makeRng(12345);
  for (let i = 0; i < 100; i++) assert.equal(a.float(), b.float());
});

test('different seeds diverge', () => {
  const a = makeRng(1);
  const b = makeRng(2);
  const seqA = Array.from({ length: 10 }, () => a.float());
  const seqB = Array.from({ length: 10 }, () => b.float());
  assert.notDeepEqual(seqA, seqB);
});

test('int stays in inclusive bounds and hits both ends', () => {
  const rng = makeRng(7);
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const v = rng.int(2, 5);
    assert.ok(v >= 2 && v <= 5);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
});

test('pick and shuffle only use given elements', () => {
  const rng = makeRng(9);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) assert.ok(arr.includes(rng.pick(arr)));
  const shuffled = rng.shuffle(arr);
  assert.deepEqual([...shuffled].sort(), ['a', 'b', 'c']);
  assert.deepEqual(arr, ['a', 'b', 'c'], 'shuffle must not mutate input');
});

test('weighted respects zero-ish weights statistically', () => {
  const rng = makeRng(11);
  let heavy = 0;
  for (let i = 0; i < 1000; i++) {
    const v = rng.weighted([{ item: 'heavy', weight: 9 }, { item: 'light', weight: 1 }]);
    if (v === 'heavy') heavy++;
  }
  assert.ok(heavy > 800 && heavy < 980, `heavy picked ${heavy}/1000`);
});

test('hashSeed is deterministic and spreads', () => {
  assert.equal(hashSeed('abc'), hashSeed('abc'));
  assert.notEqual(hashSeed('abc'), hashSeed('abd'));
});
