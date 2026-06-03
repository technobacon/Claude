// tests/rng.test.js — run with: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeRng, randInt, pick, shuffle, pickWeighted } from '../src/core/rng.js';

test('makeRng is deterministic for a given seed', () => {
  const a = makeRng(12345);
  const b = makeRng(12345);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('different seeds produce different streams', () => {
  const a = makeRng(1);
  const b = makeRng(2);
  assert.notEqual(a(), b());
});

test('rng values are in [0,1)', () => {
  const r = makeRng(99);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});

test('state() lets a stream be resumed exactly', () => {
  const r = makeRng(7);
  r(); r(); r();
  const resumed = makeRng(r.state());
  const continued = makeRng(7);
  continued(); continued(); continued();
  assert.equal(resumed(), continued());
});

test('randInt stays within [0, n)', () => {
  const r = makeRng(3);
  for (let i = 0; i < 500; i++) {
    const v = randInt(r, 6);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 6);
  }
});

test('shuffle does not mutate input and preserves elements', () => {
  const input = [1, 2, 3, 4, 5];
  const copy = input.slice();
  const out = shuffle(input, makeRng(42));
  assert.deepEqual(input, copy, 'input was mutated');
  assert.deepEqual([...out].sort((a, b) => a - b), copy);
});

test('pick returns undefined for empty arrays', () => {
  assert.equal(pick(makeRng(1), []), undefined);
});

test('pickWeighted respects weights (weight 0 never chosen)', () => {
  const r = makeRng(5);
  for (let i = 0; i < 200; i++) {
    const v = pickWeighted(r, [['a', 1], ['b', 0]]);
    assert.equal(v, 'a');
  }
});
