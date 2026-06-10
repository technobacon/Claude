// Meta-progression (the "lite" in roguelite): banked essence persists across
// runs and buys permanent perks and new starting bodies. Pure logic — the UI
// layer owns localStorage.

export const PERKS = [
  { id: 'gravesense', name: 'Grave Sense', cost: 45, desc: 'Shrines and stairs are revealed when you enter a floor.' },
  { id: 'lingering', name: 'Lingering Will', cost: 50, desc: 'Soul form has +6 HP.' },
  { id: 'hoarder', name: 'Hoarder', cost: 60, desc: '+30% essence from all sources.' },
  { id: 'embalmer', name: 'Embalmer', cost: 75, desc: 'Bodies decay 35% slower.' },
  { id: 'predator', name: 'Predatory Soul', cost: 85, desc: 'Your soul can possess living enemies below 40% HP (base 30%).' },
  { id: 'irongrip', name: 'Iron Grip', cost: 100, desc: 'Possessed corpses wake at 90% HP (base 70%).' },
  { id: 'thickichor', name: 'Thick Ichor', cost: 120, desc: 'All bodies have +15% max HP.' },
  { id: 'sharpwill', name: 'Sharpened Will', cost: 150, desc: '+1 attack in every body.' },
];

export const STARTING_BODIES = [
  { id: 'skeleton', cost: 0 },
  { id: 'goblin', cost: 60 },
  { id: 'spider', cost: 80 },
  { id: 'archer', cost: 110 },
  { id: 'zombie', cost: 130 },
  { id: 'cultist', cost: 170 },
  { id: 'knight', cost: 220 },
  { id: 'wraith', cost: 260 },
];

export function newMeta() {
  return {
    bank: 0,
    perks: [],
    unlockedStarts: ['skeleton'],
    bestiary: [],          // body ids the player has possessed at least once
    runs: 0,
    wins: 0,
    bestDepth: 0,
  };
}

// Defensive merge for loading possibly-stale saves.
export function normalizeMeta(raw) {
  const base = newMeta();
  if (!raw || typeof raw !== 'object') return base;
  return {
    bank: Number.isFinite(raw.bank) ? Math.max(0, Math.floor(raw.bank)) : 0,
    perks: Array.isArray(raw.perks) ? raw.perks.filter((p) => PERKS.some((k) => k.id === p)) : [],
    unlockedStarts: Array.isArray(raw.unlockedStarts)
      ? [...new Set(['skeleton', ...raw.unlockedStarts.filter((b) => STARTING_BODIES.some((s) => s.id === b))])]
      : ['skeleton'],
    bestiary: Array.isArray(raw.bestiary) ? raw.bestiary : [],
    runs: raw.runs || 0,
    wins: raw.wins || 0,
    bestDepth: raw.bestDepth || 0,
  };
}

export function buyPerk(meta, perkId) {
  const perk = PERKS.find((p) => p.id === perkId);
  if (!perk || meta.perks.includes(perkId) || meta.bank < perk.cost) return false;
  meta.bank -= perk.cost;
  meta.perks.push(perkId);
  return true;
}

export function buyStart(meta, bodyId) {
  const start = STARTING_BODIES.find((s) => s.id === bodyId);
  if (!start || meta.unlockedStarts.includes(bodyId) || meta.bank < start.cost) return false;
  meta.bank -= start.cost;
  meta.unlockedStarts.push(bodyId);
  return true;
}

// Translate owned perks into the modifier object the game engine consumes.
export function perkMods(perks = []) {
  const has = (id) => perks.includes(id);
  return {
    soulHpBonus: has('lingering') ? 6 : 0,
    decayMult: has('embalmer') ? 1.35 : 1,
    essenceMult: has('hoarder') ? 1.3 : 1,
    possessHpFrac: has('irongrip') ? 0.9 : 0.7,
    possessThreshold: has('predator') ? 0.4 : 0.3,
    bodyHpMult: has('thickichor') ? 1.15 : 1,
    atkBonus: has('sharpwill') ? 1 : 0,
    graveSense: has('gravesense'),
  };
}

// Essence carried home at the end of a run.
export function bankRun(meta, state) {
  const frac = state.status === 'won' ? 1 : 0.6;
  const bonus = state.status === 'won' ? 150 : 0;
  const gained = Math.floor(state.player.essence * frac) + bonus;
  meta.bank += gained;
  meta.runs += 1;
  if (state.status === 'won') meta.wins += 1;
  meta.bestDepth = Math.max(meta.bestDepth, state.depth);
  for (const id of state.player.wornBodies || []) {
    if (!meta.bestiary.includes(id)) meta.bestiary.push(id);
  }
  return gained;
}
