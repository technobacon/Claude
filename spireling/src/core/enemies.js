// core/enemies.js
//
// Enemy data + their move-selection AI. Like cards, a "move" is declarative
// data with an `effects` list that combat.js executes — but here the effects
// describe what the ENEMY does on its turn (attack the player, gain block,
// buff itself). The intent shown to the player is just the chosen move.
//
// Each enemy has a `chooseMove(self, rng)` that returns a move id. It is
// deterministic given the rng state, and may read `self.history` (ids of the
// enemy's previous moves) to avoid repetitive or illegal sequences.

import { pick } from './rng.js';

/**
 * Enemy catalog keyed by id. `hp` is a [min, max] range rolled at spawn.
 * Moves' effects target 'player' for damage; 'self' for block/buff.
 */
export const ENEMIES = {
  // --- Normal -------------------------------------------------------------
  cultist: {
    id: 'cultist', name: 'Cultist', hp: [48, 54], tier: 'normal',
    moves: {
      incantation: { id: 'incantation', name: 'Incantation', intent: 'buff',
        effects: [{ kind: 'status', status: 'strength', amount: 3, target: 'self' }] },
      darkStrike: { id: 'darkStrike', name: 'Dark Strike', intent: 'attack',
        effects: [{ kind: 'damage', amount: 6, target: 'player' }] },
    },
    // Ritual first, then attack forever.
    chooseMove(self) {
      return self.history.length === 0 ? 'incantation' : 'darkStrike';
    },
  },

  jawWorm: {
    id: 'jawWorm', name: 'Jaw Worm', hp: [40, 44], tier: 'normal',
    moves: {
      chomp: { id: 'chomp', name: 'Chomp', intent: 'attack',
        effects: [{ kind: 'damage', amount: 11, target: 'player' }] },
      thrash: { id: 'thrash', name: 'Thrash', intent: 'attackdefend',
        effects: [
          { kind: 'damage', amount: 7, target: 'player' },
          { kind: 'block', amount: 5 },
        ] },
      bellow: { id: 'bellow', name: 'Bellow', intent: 'buff',
        effects: [
          { kind: 'status', status: 'strength', amount: 3, target: 'self' },
          { kind: 'block', amount: 6 },
        ] },
    },
    chooseMove(self, rng) {
      const last = self.history[self.history.length - 1];
      const roll = rng();
      if (roll < 0.45 && last !== 'bellow') return 'bellow';
      if (roll < 0.75 && last !== 'chomp') return 'chomp';
      return 'thrash';
    },
  },

  spikeSlime: {
    id: 'spikeSlime', name: 'Spike Slime', hp: [28, 32], tier: 'normal',
    moves: {
      flameTongue: { id: 'flameTongue', name: 'Flame Tongue', intent: 'attack',
        effects: [{ kind: 'damage', amount: 8, target: 'player' }] },
      lick: { id: 'lick', name: 'Lick', intent: 'debuff',
        effects: [{ kind: 'status', status: 'weak', amount: 1, target: 'player' }] },
    },
    chooseMove(self, rng) {
      const last = self.history[self.history.length - 1];
      if (last === 'flameTongue') return rng() < 0.5 ? 'lick' : 'flameTongue';
      return 'flameTongue';
    },
  },

  fungiBeast: {
    id: 'fungiBeast', name: 'Fungi Beast', hp: [22, 28], tier: 'normal',
    moves: {
      bite: { id: 'bite', name: 'Bite', intent: 'attack',
        effects: [{ kind: 'damage', amount: 6, target: 'player' }] },
      grow: { id: 'grow', name: 'Grow', intent: 'buff',
        effects: [{ kind: 'status', status: 'strength', amount: 3, target: 'self' }] },
    },
    chooseMove(self, rng) {
      const last = self.history[self.history.length - 1];
      if (last !== 'grow' && rng() < 0.4) return 'grow';
      return 'bite';
    },
  },

  // --- Elite --------------------------------------------------------------
  gremlinNob: {
    id: 'gremlinNob', name: 'Gremlin Nob', hp: [82, 86], tier: 'elite',
    moves: {
      bellow: { id: 'bellow', name: 'Bellow', intent: 'buff',
        effects: [{ kind: 'status', status: 'strength', amount: 2, target: 'self' }] },
      skullBash: { id: 'skullBash', name: 'Skull Bash', intent: 'attackdebuff',
        effects: [
          { kind: 'damage', amount: 8, target: 'player' },
          { kind: 'status', status: 'vulnerable', amount: 2, target: 'player' },
        ] },
      rush: { id: 'rush', name: 'Rush', intent: 'attack',
        effects: [{ kind: 'damage', amount: 14, target: 'player' }] },
    },
    chooseMove(self, rng) {
      if (self.history.length === 0) return 'bellow';
      return rng() < 0.33 ? 'skullBash' : 'rush';
    },
  },

  // --- Boss ---------------------------------------------------------------
  theColossus: {
    id: 'theColossus', name: 'The Colossus', hp: [140, 140], tier: 'boss',
    moves: {
      slam: { id: 'slam', name: 'Slam', intent: 'attack',
        effects: [{ kind: 'damage', amount: 16, target: 'player' }] },
      bulwark: { id: 'bulwark', name: 'Bulwark', intent: 'defend',
        effects: [{ kind: 'block', amount: 18 }] },
      quake: { id: 'quake', name: 'Quake', intent: 'attackdebuff',
        effects: [
          { kind: 'damage', amount: 10, target: 'player' },
          { kind: 'status', status: 'weak', amount: 2, target: 'player' },
        ] },
      enrage: { id: 'enrage', name: 'Enrage', intent: 'buff',
        effects: [{ kind: 'status', status: 'strength', amount: 4, target: 'self' }] },
    },
    // A telegraphed loop with a buff turn that rewards racing it down.
    chooseMove(self) {
      const cycle = ['quake', 'slam', 'bulwark', 'enrage', 'slam'];
      return cycle[self.history.length % cycle.length];
    },
  },
};

/**
 * Look up an enemy definition by id.
 * @param {string} id
 * @returns {object}
 */
export function getEnemy(id) {
  const e = ENEMIES[id];
  if (!e) throw new Error(`Unknown enemy id: ${id}`);
  return e;
}

/**
 * Spawn a combat-ready enemy instance from its id, rolling HP from its range.
 * `history` tracks chosen move ids for the AI; `intent` is filled in by combat.
 * @param {string} id
 * @param {() => number} rng
 * @param {number} index unique slot index within the encounter
 * @returns {object} enemy combat instance
 */
export function spawnEnemy(id, rng, index) {
  const def = getEnemy(id);
  const [lo, hi] = def.hp;
  const maxHp = lo + Math.floor(rng() * (hi - lo + 1));
  return {
    slot: index,
    id,
    name: def.name,
    tier: def.tier,
    hp: maxHp,
    maxHp,
    block: 0,
    statuses: { strength: 0, vulnerable: 0, weak: 0 },
    history: [],
    intent: null, // { move id } resolved at the start of each enemy turn
  };
}

/**
 * Resolve and record the enemy's next move id (its telegraphed intent).
 * @param {object} enemy enemy instance (mutated: history/intent updated)
 * @param {() => number} rng
 * @returns {object} the chosen move definition
 */
export function resolveIntent(enemy, rng) {
  const def = getEnemy(enemy.id);
  const moveId = def.chooseMove(enemy, rng) ?? pick(rng, Object.keys(def.moves));
  enemy.intent = moveId;
  return def.moves[moveId];
}

/**
 * Encounter groups for each node tier. One is chosen per node.
 */
export const ENCOUNTERS = {
  normal: [
    ['jawWorm'],
    ['cultist'],
    ['spikeSlime', 'spikeSlime'],
    ['fungiBeast', 'fungiBeast'],
    ['cultist', 'spikeSlime'],
  ],
  elite: [
    ['gremlinNob'],
  ],
  boss: [
    ['theColossus'],
  ],
};
