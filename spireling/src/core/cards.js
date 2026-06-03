// core/cards.js
//
// Card data + small pure helpers. A card is plain data: its `effects` are a
// list of declarative steps that combat.js knows how to execute. Keeping the
// card "language" data-only (no functions) means cards serialize cleanly and
// the rules of each card are inspectable and testable.
//
// Effect kinds understood by combat.js:
//   { kind:'damage', amount, target, times?, strengthMult? }  deal damage
//   { kind:'damageFromBlock', target }                        damage = your block
//   { kind:'reaper', amount }                                 hit all, heal unblocked
//   { kind:'block', amount }                                  gain block
//   { kind:'draw', amount }                                   draw cards
//   { kind:'energy', amount }                                 gain energy
//   { kind:'hpLoss', amount }                                 lose HP (self)
//   { kind:'status', status, amount, target }                 apply vulnerable/weak/strength
//   { kind:'power', power, amount }                           install a per-turn power
//   { kind:'doubleStrength' }                                 double current strength
//
// target is 'enemy' (the chosen one), 'allEnemies', or 'self' (default for
// non-damage effects).

import { pick } from './rng.js';

/** @typedef {'attack'|'skill'|'power'} CardType */
/** @typedef {'starter'|'common'|'uncommon'|'rare'} Rarity */

/**
 * The full card catalog, keyed by id. UI text is derived but kept here so the
 * card "reads" the same in tests and on screen.
 */
export const CARDS = {
  // --- Starter ------------------------------------------------------------
  strike: {
    id: 'strike', name: 'Strike', type: 'attack', cost: 1, rarity: 'starter',
    text: 'Deal 6 damage.',
    effects: [{ kind: 'damage', amount: 6, target: 'enemy' }],
  },
  defend: {
    id: 'defend', name: 'Defend', type: 'skill', cost: 1, rarity: 'starter',
    text: 'Gain 5 Block.',
    effects: [{ kind: 'block', amount: 5 }],
  },
  bash: {
    id: 'bash', name: 'Bash', type: 'attack', cost: 2, rarity: 'starter',
    text: 'Deal 8 damage. Apply 2 Vulnerable.',
    effects: [
      { kind: 'damage', amount: 8, target: 'enemy' },
      { kind: 'status', status: 'vulnerable', amount: 2, target: 'enemy' },
    ],
  },

  // --- Common -------------------------------------------------------------
  cleave: {
    id: 'cleave', name: 'Cleave', type: 'attack', cost: 1, rarity: 'common',
    text: 'Deal 8 damage to ALL enemies.',
    effects: [{ kind: 'damage', amount: 8, target: 'allEnemies' }],
  },
  ironWave: {
    id: 'ironWave', name: 'Iron Wave', type: 'attack', cost: 1, rarity: 'common',
    text: 'Deal 5 damage. Gain 5 Block.',
    effects: [
      { kind: 'damage', amount: 5, target: 'enemy' },
      { kind: 'block', amount: 5 },
    ],
  },
  pommelStrike: {
    id: 'pommelStrike', name: 'Pommel Strike', type: 'attack', cost: 1, rarity: 'common',
    text: 'Deal 9 damage. Draw 1 card.',
    effects: [
      { kind: 'damage', amount: 9, target: 'enemy' },
      { kind: 'draw', amount: 1 },
    ],
  },
  twinStrike: {
    id: 'twinStrike', name: 'Twin Strike', type: 'attack', cost: 1, rarity: 'common',
    text: 'Deal 5 damage twice.',
    effects: [{ kind: 'damage', amount: 5, target: 'enemy', times: 2 }],
  },
  shrugItOff: {
    id: 'shrugItOff', name: 'Shrug It Off', type: 'skill', cost: 1, rarity: 'common',
    text: 'Gain 8 Block. Draw 1 card.',
    effects: [
      { kind: 'block', amount: 8 },
      { kind: 'draw', amount: 1 },
    ],
  },
  flex: {
    id: 'flex', name: 'Flex', type: 'skill', cost: 0, rarity: 'common',
    text: 'Gain 2 Strength.',
    effects: [{ kind: 'status', status: 'strength', amount: 2, target: 'self' }],
  },
  clothesline: {
    id: 'clothesline', name: 'Clothesline', type: 'attack', cost: 2, rarity: 'common',
    text: 'Deal 12 damage. Apply 2 Weak.',
    effects: [
      { kind: 'damage', amount: 12, target: 'enemy' },
      { kind: 'status', status: 'weak', amount: 2, target: 'enemy' },
    ],
  },

  // --- Uncommon -----------------------------------------------------------
  heavyBlade: {
    id: 'heavyBlade', name: 'Heavy Blade', type: 'attack', cost: 2, rarity: 'uncommon',
    text: 'Deal 14 damage. Strength affects this card 3 times.',
    effects: [{ kind: 'damage', amount: 14, target: 'enemy', strengthMult: 3 }],
  },
  bodySlam: {
    id: 'bodySlam', name: 'Body Slam', type: 'attack', cost: 1, rarity: 'uncommon',
    text: 'Deal damage equal to your Block.',
    effects: [{ kind: 'damageFromBlock', target: 'enemy' }],
  },
  battleTrance: {
    id: 'battleTrance', name: 'Battle Trance', type: 'skill', cost: 0, rarity: 'uncommon',
    text: 'Draw 3 cards.',
    effects: [{ kind: 'draw', amount: 3 }],
  },
  bloodletting: {
    id: 'bloodletting', name: 'Bloodletting', type: 'skill', cost: 0, rarity: 'uncommon',
    text: 'Lose 3 HP. Gain 2 Energy.',
    effects: [
      { kind: 'hpLoss', amount: 3 },
      { kind: 'energy', amount: 2 },
    ],
  },
  whirlwind: {
    id: 'whirlwind', name: 'Whirlwind', type: 'attack', cost: 2, rarity: 'uncommon',
    text: 'Deal 6 damage to ALL enemies twice.',
    effects: [{ kind: 'damage', amount: 6, target: 'allEnemies', times: 2 }],
  },
  metallicize: {
    id: 'metallicize', name: 'Metallicize', type: 'power', cost: 1, rarity: 'uncommon',
    text: 'At the end of your turn, gain 3 Block.',
    effects: [{ kind: 'power', power: 'metallicize', amount: 3 }],
  },
  inflame: {
    id: 'inflame', name: 'Inflame', type: 'power', cost: 1, rarity: 'uncommon',
    text: 'Gain 3 Strength.',
    effects: [{ kind: 'status', status: 'strength', amount: 3, target: 'self' }],
  },

  // --- Rare ---------------------------------------------------------------
  demonForm: {
    id: 'demonForm', name: 'Demon Form', type: 'power', cost: 3, rarity: 'rare',
    text: 'At the start of each turn, gain 2 Strength.',
    effects: [{ kind: 'power', power: 'demonForm', amount: 2 }],
  },
  limitBreak: {
    id: 'limitBreak', name: 'Limit Break', type: 'skill', cost: 1, rarity: 'rare',
    text: 'Double your Strength.',
    effects: [{ kind: 'doubleStrength' }],
  },
  reaper: {
    id: 'reaper', name: 'Reaper', type: 'attack', cost: 2, rarity: 'rare',
    text: 'Deal 6 damage to ALL enemies. Heal HP equal to unblocked damage.',
    effects: [{ kind: 'reaper', amount: 6 }],
  },
};

/** Ids that make up the fresh starting deck (in display order). */
export const STARTER_DECK = [
  'strike', 'strike', 'strike', 'strike', 'strike',
  'defend', 'defend', 'defend', 'defend',
  'bash',
];

/** Cards that can appear as combat rewards, grouped by rarity. */
export const REWARD_POOL = {
  common: ['cleave', 'ironWave', 'pommelStrike', 'twinStrike', 'shrugItOff', 'flex', 'clothesline'],
  uncommon: ['heavyBlade', 'bodySlam', 'battleTrance', 'bloodletting', 'whirlwind', 'metallicize', 'inflame'],
  rare: ['demonForm', 'limitBreak', 'reaper'],
};

/**
 * Look up a card definition by id.
 * @param {string} id
 * @returns {object}
 */
export function getCard(id) {
  const card = CARDS[id];
  if (!card) throw new Error(`Unknown card id: ${id}`);
  return card;
}

/**
 * Build a deck of card instances from a list of ids. Each instance gets a
 * stable `uid` so duplicates are distinct (needed for hand/pile bookkeeping).
 * @param {string[]} ids
 * @param {number} [startUid]
 * @returns {Array<{uid:number, id:string}>}
 */
export function makeDeck(ids, startUid = 1) {
  return ids.map((id, i) => ({ uid: startUid + i, id }));
}

/**
 * Roll three distinct card rewards. Rarity is rolled per-card (rares are
 * rare); duplicates within the same offer are avoided.
 * @param {() => number} rng
 * @returns {string[]} up to 3 card ids
 */
export function rollRewards(rng) {
  const out = [];
  let guard = 0;
  while (out.length < 3 && guard++ < 50) {
    const roll = rng();
    const rarity = roll < 0.6 ? 'common' : roll < 0.9 ? 'uncommon' : 'rare';
    const id = pick(rng, REWARD_POOL[rarity]);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}
