// core/cards.js — The Last Bard card catalog.
//
// Each card has a `note` ('strike'|'ward'|'verse') for the chain system,
// and a `type` ('attack'|'skill'|'power') for mechanical rules (powers exhaust).
// Effects are declarative; combat.js interprets them.
//
// Effect kinds:
//   { kind:'damage', amount, target, times?, forteMult? }
//   { kind:'damageFromBlock', target }
//   { kind:'block', amount }
//   { kind:'draw', amount }
//   { kind:'tempo', amount }        gain tempo mid-turn
//   { kind:'hpLoss', amount }
//   { kind:'status', status, amount, target }  forte/exposed/diminuendo/resonant/discordant
//   { kind:'power', power, amount }
//   { kind:'mute', note, amount, target }      mute a note type
//   { kind:'allDamage', amount }    hit all enemies
//   { kind:'reaper', amount }       hit all, heal unblocked

import { pick } from './rng.js';

export const CARDS = {
  // --- Starter ------------------------------------------------------------
  simpleStrike: {
    id: 'simpleStrike', name: 'Simple Strike', note: 'strike', type: 'attack',
    cost: 1, rarity: 'starter', text: 'Deal 7 damage.',
    effects: [{ kind: 'damage', amount: 7, target: 'enemy' }],
    upgrade: { text: 'Deal 10 damage.', effects: [{ kind: 'damage', amount: 10, target: 'enemy' }] },
  },
  tuneUp: {
    id: 'tuneUp', name: 'Tune Up', note: 'verse', type: 'skill',
    cost: 1, rarity: 'starter', text: 'Draw 2 cards.',
    effects: [{ kind: 'draw', amount: 2 }],
    upgrade: { text: 'Draw 3 cards.', effects: [{ kind: 'draw', amount: 3 }] },
  },
  restChord: {
    id: 'restChord', name: 'Rest Chord', note: 'ward', type: 'skill',
    cost: 1, rarity: 'starter', text: 'Gain 6 Block.',
    effects: [{ kind: 'block', amount: 6 }],
    upgrade: { text: 'Gain 9 Block.', effects: [{ kind: 'block', amount: 9 }] },
  },
  ballad: {
    id: 'ballad', name: 'Ballad', note: 'strike', type: 'power',
    cost: 2, rarity: 'starter', text: 'Gain 2 Forte each turn.',
    effects: [{ kind: 'power', power: 'ballad', amount: 2 }],
    upgrade: { text: 'Gain 3 Forte each turn.', effects: [{ kind: 'power', power: 'ballad', amount: 3 }] },
  },

  // --- Common -------------------------------------------------------------
  sharpVerse: {
    id: 'sharpVerse', name: 'Sharp Verse', note: 'strike', type: 'attack',
    cost: 1, rarity: 'common', text: 'Deal 9 damage.',
    effects: [{ kind: 'damage', amount: 9, target: 'enemy' }],
    upgrade: { text: 'Deal 12 damage.', effects: [{ kind: 'damage', amount: 12, target: 'enemy' }] },
  },
  twinNotes: {
    id: 'twinNotes', name: 'Twin Notes', note: 'strike', type: 'attack',
    cost: 1, rarity: 'common', text: 'Deal 5 damage twice.',
    effects: [{ kind: 'damage', amount: 5, target: 'enemy', times: 2 }],
    upgrade: { text: 'Deal 6 damage twice.', effects: [{ kind: 'damage', amount: 6, target: 'enemy', times: 2 }] },
  },
  staccato: {
    id: 'staccato', name: 'Staccato', note: 'strike', type: 'attack',
    cost: 1, rarity: 'common', text: 'Deal 6 damage. Apply 1 Discordant.',
    effects: [
      { kind: 'damage', amount: 6, target: 'enemy' },
      { kind: 'status', status: 'discordant', amount: 1, target: 'enemy' },
    ],
    upgrade: { text: 'Deal 8 damage. Apply 2 Discordant.', effects: [
      { kind: 'damage', amount: 8, target: 'enemy' },
      { kind: 'status', status: 'discordant', amount: 2, target: 'enemy' },
    ]},
  },
  lullaby: {
    id: 'lullaby', name: 'Lullaby', note: 'ward', type: 'skill',
    cost: 1, rarity: 'common', text: 'Gain 8 Block.',
    effects: [{ kind: 'block', amount: 8 }],
    upgrade: { text: 'Gain 11 Block.', effects: [{ kind: 'block', amount: 11 }] },
  },
  counterpoint: {
    id: 'counterpoint', name: 'Counterpoint', note: 'ward', type: 'skill',
    cost: 1, rarity: 'common', text: 'Gain 5 Block. Draw 1.',
    effects: [{ kind: 'block', amount: 5 }, { kind: 'draw', amount: 1 }],
    upgrade: { text: 'Gain 7 Block. Draw 1.', effects: [{ kind: 'block', amount: 7 }, { kind: 'draw', amount: 1 }] },
  },
  sostenuto: {
    id: 'sostenuto', name: 'Sostenuto', note: 'ward', type: 'skill',
    cost: 0, rarity: 'common', text: 'Gain 4 Block.',
    effects: [{ kind: 'block', amount: 4 }],
    upgrade: { text: 'Gain 6 Block.', effects: [{ kind: 'block', amount: 6 }] },
  },
  quickVerse: {
    id: 'quickVerse', name: 'Quick Verse', note: 'verse', type: 'skill',
    cost: 0, rarity: 'common', text: 'Draw 2 cards.',
    effects: [{ kind: 'draw', amount: 2 }],
    upgrade: { text: 'Draw 3 cards.', effects: [{ kind: 'draw', amount: 3 }] },
  },
  tempoMark: {
    id: 'tempoMark', name: 'Tempo Mark', note: 'verse', type: 'skill',
    cost: 1, rarity: 'common', text: 'Gain 2 Tempo.',
    effects: [{ kind: 'tempo', amount: 2 }],
    upgrade: { text: 'Gain 3 Tempo.', effects: [{ kind: 'tempo', amount: 3 }] },
  },
  diminuendoCard: {
    id: 'diminuendoCard', name: 'Diminuendo', note: 'verse', type: 'skill',
    cost: 1, rarity: 'common', text: 'Apply 2 Diminuendo to enemy. Draw 1.',
    effects: [
      { kind: 'status', status: 'diminuendo', amount: 2, target: 'enemy' },
      { kind: 'draw', amount: 1 },
    ],
    upgrade: { text: 'Apply 3 Diminuendo to enemy. Draw 1.', effects: [
      { kind: 'status', status: 'diminuendo', amount: 3, target: 'enemy' },
      { kind: 'draw', amount: 1 },
    ]},
  },

  // --- Uncommon -----------------------------------------------------------
  fortissimo: {
    id: 'fortissimo', name: 'Fortissimo', note: 'strike', type: 'attack',
    cost: 2, rarity: 'uncommon', text: 'Deal 14 damage. Forte applies ×3.',
    effects: [{ kind: 'damage', amount: 14, target: 'enemy', forteMult: 3 }],
    upgrade: { text: 'Deal 18 damage. Forte applies ×3.', effects: [{ kind: 'damage', amount: 18, target: 'enemy', forteMult: 3 }] },
  },
  bodyOfSong: {
    id: 'bodyOfSong', name: 'Body of Song', note: 'ward', type: 'attack',
    cost: 1, rarity: 'uncommon', text: 'Deal damage equal to your Block.',
    effects: [{ kind: 'damageFromBlock', target: 'enemy' }],
    upgrade: { cost: 0, text: '(0) Deal damage equal to your Block.', effects: [{ kind: 'damageFromBlock', target: 'enemy' }] },
  },
  dissonantBlade: {
    id: 'dissonantBlade', name: 'Dissonant Blade', note: 'strike', type: 'attack',
    cost: 1, rarity: 'uncommon', text: 'Deal 10 damage. Apply 2 Exposed.',
    effects: [
      { kind: 'damage', amount: 10, target: 'enemy' },
      { kind: 'status', status: 'exposed', amount: 2, target: 'enemy' },
    ],
    upgrade: { text: 'Deal 13 damage. Apply 3 Exposed.', effects: [
      { kind: 'damage', amount: 13, target: 'enemy' },
      { kind: 'status', status: 'exposed', amount: 3, target: 'enemy' },
    ]},
  },
  battleHymn: {
    id: 'battleHymn', name: 'Battle Hymn', note: 'strike', type: 'attack',
    cost: 1, rarity: 'uncommon', text: 'Deal 8 damage. Gain 4 Block.',
    effects: [
      { kind: 'damage', amount: 8, target: 'enemy' },
      { kind: 'block', amount: 4 },
    ],
    upgrade: { text: 'Deal 10 damage. Gain 6 Block.', effects: [
      { kind: 'damage', amount: 10, target: 'enemy' },
      { kind: 'block', amount: 6 },
    ]},
  },
  resonantWall: {
    id: 'resonantWall', name: 'Resonant Wall', note: 'ward', type: 'skill',
    cost: 1, rarity: 'uncommon', text: 'Gain 11 Block. Gain Resonant.',
    effects: [
      { kind: 'block', amount: 11 },
      { kind: 'status', status: 'resonant', amount: 1, target: 'self' },
    ],
    upgrade: { text: 'Gain 14 Block. Gain Resonant.', effects: [
      { kind: 'block', amount: 14 },
      { kind: 'status', status: 'resonant', amount: 1, target: 'self' },
    ]},
  },
  interlude: {
    id: 'interlude', name: 'Interlude', note: 'ward', type: 'skill',
    cost: 2, rarity: 'uncommon', text: 'Gain 20 Block.',
    effects: [{ kind: 'block', amount: 20 }],
    upgrade: { cost: 1, text: '(1) Gain 20 Block.', effects: [{ kind: 'block', amount: 20 }] },
  },
  aria: {
    id: 'aria', name: 'Aria', note: 'verse', type: 'skill',
    cost: 1, rarity: 'uncommon', text: 'Draw 3 cards.',
    effects: [{ kind: 'draw', amount: 3 }],
    upgrade: { cost: 0, text: '(0) Draw 3 cards.', effects: [{ kind: 'draw', amount: 3 }] },
  },
  coda: {
    id: 'coda', name: 'Coda', note: 'verse', type: 'skill',
    cost: 1, rarity: 'uncommon', text: 'Gain 2 Forte. Draw 2.',
    effects: [
      { kind: 'status', status: 'forte', amount: 2, target: 'self' },
      { kind: 'draw', amount: 2 },
    ],
    upgrade: { text: 'Gain 3 Forte. Draw 2.', effects: [
      { kind: 'status', status: 'forte', amount: 3, target: 'self' },
      { kind: 'draw', amount: 2 },
    ]},
  },
  crescendoPower: {
    id: 'crescendoPower', name: 'Crescendo', note: 'verse', type: 'power',
    cost: 1, rarity: 'uncommon', text: 'Crescendo bonuses are +4.',
    effects: [{ kind: 'power', power: 'crescendoBonus', amount: 4 }],
    upgrade: { text: 'Crescendo bonuses are +6.', effects: [{ kind: 'power', power: 'crescendoBonus', amount: 6 }] },
  },

  // --- Rare ---------------------------------------------------------------
  requiem: {
    id: 'requiem', name: 'Requiem', note: 'strike', type: 'attack',
    cost: 2, rarity: 'rare', text: 'Deal 6 damage to ALL. Heal HP equal to unblocked damage.',
    effects: [{ kind: 'reaper', amount: 6 }],
    upgrade: { text: 'Deal 9 damage to ALL. Heal HP equal to unblocked damage.', effects: [{ kind: 'reaper', amount: 9 }] },
  },
  theLastNote: {
    id: 'theLastNote', name: 'The Last Note', note: 'strike', type: 'attack',
    cost: 3, rarity: 'rare', text: 'Deal 30 damage. Can only play on a Crescendo turn.',
    effects: [{ kind: 'damage', amount: 30, target: 'enemy' }],
    crescendoOnly: true,
    upgrade: { text: 'Deal 40 damage. Can only play on a Crescendo turn.', effects: [{ kind: 'damage', amount: 40, target: 'enemy' }] },
  },
  maestro: {
    id: 'maestro', name: 'Maestro', note: 'strike', type: 'power',
    cost: 3, rarity: 'rare', text: 'Gain 2 Forte at the start of each turn.',
    effects: [{ kind: 'power', power: 'maestro', amount: 2 }],
    upgrade: { text: 'Gain 3 Forte at the start of each turn.', effects: [{ kind: 'power', power: 'maestro', amount: 3 }] },
  },
  eternalRefrain: {
    id: 'eternalRefrain', name: 'Eternal Refrain', note: 'ward', type: 'power',
    cost: 1, rarity: 'rare', text: 'Gain 4 Block at the end of each turn.',
    effects: [{ kind: 'power', power: 'eternalRefrain', amount: 4 }],
    upgrade: { text: 'Gain 6 Block at the end of each turn.', effects: [{ kind: 'power', power: 'eternalRefrain', amount: 6 }] },
  },
  perfectPitch: {
    id: 'perfectPitch', name: 'Perfect Pitch', note: 'verse', type: 'power',
    cost: 1, rarity: 'rare', text: 'Each Harmony draws 1 extra card.',
    effects: [{ kind: 'power', power: 'perfectPitch', amount: 1 }],
    upgrade: { text: 'Each Harmony draws 2 extra cards.', effects: [{ kind: 'power', power: 'perfectPitch', amount: 2 }] },
  },
  improvise: {
    id: 'improvise', name: 'Improvise', note: 'verse', type: 'skill',
    cost: 0, rarity: 'rare', text: 'Copy the last card you played.',
    effects: [{ kind: 'copyLast' }],
    upgrade: { text: 'Copy the last card you played twice.', effects: [{ kind: 'copyLast', times: 2 }] },
  },
};

export const STARTER_DECK = [
  'simpleStrike', 'simpleStrike', 'simpleStrike', 'simpleStrike',
  'tuneUp', 'tuneUp',
  'restChord', 'restChord', 'restChord',
  'ballad',
];

export const REWARD_POOL = {
  common: ['sharpVerse','twinNotes','staccato','lullaby','counterpoint','sostenuto','quickVerse','tempoMark','diminuendoCard'],
  uncommon: ['fortissimo','bodyOfSong','dissonantBlade','battleHymn','resonantWall','interlude','aria','coda','crescendoPower'],
  rare: ['requiem','theLastNote','maestro','eternalRefrain','perfectPitch','improvise'],
};

export function getCard(id) {
  const c = CARDS[id];
  if (!c) throw new Error(`Unknown card id: ${id}`);
  return c;
}

/** Build card instances from id list. Each gets a unique uid. */
export function makeDeck(ids, startUid = 1) {
  return ids.map((id, i) => ({ uid: startUid + i, id, upgraded: false }));
}

/** Roll 3 distinct reward cards weighted by rarity. */
export function rollRewards(rng) {
  const out = [];
  let guard = 0;
  while (out.length < 3 && guard++ < 50) {
    const roll = rng();
    const rarity = roll < 0.58 ? 'common' : roll < 0.88 ? 'uncommon' : 'rare';
    const id = pick(rng, REWARD_POOL[rarity]);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Effective stats for a card instance (applies upgrade if flagged). */
export function effectiveCard(instance) {
  const base = getCard(instance.id);
  if (!instance.upgraded || !base.upgrade) return base;
  return { ...base, ...base.upgrade };
}
