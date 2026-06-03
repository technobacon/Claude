// core/rng.js
//
// Seeded, serializable pseudo-random number generator. The entire game is
// deterministic given a seed: same seed → same shuffles, same enemy moves,
// same card rewards. That makes runs reproducible and — crucially — lets the
// combat/run logic be unit-tested without flakiness.
//
// The generator is mulberry32: tiny, fast, and its whole state is a single
// 32-bit integer, so we can stash it inside a (JSON-serializable) game state
// and thread it through pure transitions instead of relying on a hidden global.

/**
 * Create a PRNG from a numeric seed.
 * The returned function yields floats in [0, 1). `next.state()` reads back the
 * current internal state so it can be persisted and resumed later.
 * @param {number} seed
 * @returns {(() => number) & { state: () => number }}
 */
export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.state = () => s >>> 0;
  return next;
}

/**
 * Integer in [0, n). Uses one draw from `rng`.
 * @param {() => number} rng
 * @param {number} n
 * @returns {number}
 */
export function randInt(rng, n) {
  return Math.floor(rng() * n);
}

/**
 * Pick a random element from a non-empty array. Returns undefined if empty.
 * @template T
 * @param {() => number} rng
 * @param {T[]} arr
 * @returns {T｜undefined}
 */
export function pick(rng, arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[randInt(rng, arr.length)];
}

/**
 * Return a NEW array that is a Fisher–Yates shuffle of `arr`. Does not mutate
 * the input. Deterministic for a given rng state.
 * @template T
 * @param {T[]} arr
 * @param {() => number} rng
 * @returns {T[]}
 */
export function shuffle(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Weighted pick. `weighted` is an array of [item, weight] pairs.
 * @template T
 * @param {() => number} rng
 * @param {Array<[T, number]>} weighted
 * @returns {T｜undefined}
 */
export function pickWeighted(rng, weighted) {
  const total = weighted.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const [item, w] of weighted) {
    r -= w;
    if (r < 0) return item;
  }
  return weighted[weighted.length - 1][0];
}
