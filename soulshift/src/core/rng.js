// Seeded RNG (mulberry32). Every piece of game randomness flows through one
// of these so runs are reproducible and tests are deterministic.

export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    // float in [0, 1)
    float: next,
    // integer in [a, b] inclusive
    int(a, b) {
      return a + Math.floor(next() * (b - a + 1));
    },
    chance(p) {
      return next() < p;
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    // Weighted pick from [{item, weight}, ...]
    weighted(entries) {
      let total = 0;
      for (const e of entries) total += e.weight;
      let roll = next() * total;
      for (const e of entries) {
        roll -= e.weight;
        if (roll <= 0) return e.item;
      }
      return entries[entries.length - 1].item;
    },
    // Derive a fresh, independent seed (e.g., one per floor).
    fork() {
      return Math.floor(next() * 0xffffffff) >>> 0;
    },
  };
}

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
