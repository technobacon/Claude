// core/enemies.js — The Last Bard enemy definitions.
//
// Enemies are creatures of The Hush — mostly grey, silence-themed, and several
// directly attack the player's chain system by applying Muted.
// Move effects targeting 'player' deal damage or apply debuffs to the player.

import { pick } from './rng.js';

export const ENEMIES = {
  // --- Normal -------------------------------------------------------------
  hushWisp: {
    id: 'hushWisp', name: 'Hush Wisp', hp: [28, 34], tier: 'normal',
    moves: {
      whisper: {
        id: 'whisper', name: 'Whisper', intent: 'debuff',
        effects: [{ kind: 'mute', note: 'strike', amount: 2, target: 'player' }],
      },
      drain: {
        id: 'drain', name: 'Drain', intent: 'attack',
        effects: [{ kind: 'damage', amount: 6, target: 'player' }],
      },
    },
    chooseMove(self) {
      // Whisper first turn, then alternate
      if (self.history.length === 0) return 'whisper';
      return self.history[self.history.length - 1] === 'whisper' ? 'drain' : 'whisper';
    },
  },

  paleMinstrel: {
    id: 'paleMinstrel', name: 'Pale Minstrel', hp: [36, 42], tier: 'normal',
    moves: {
      offKey: {
        id: 'offKey', name: 'Off-Key', intent: 'attackdebuff',
        effects: [
          { kind: 'damage', amount: 7, target: 'player' },
          { kind: 'status', status: 'discordant', amount: 1, target: 'player' },
        ],
      },
      wail: {
        id: 'wail', name: 'Wail', intent: 'attack',
        effects: [{ kind: 'damage', amount: 10, target: 'player' }],
      },
    },
    chooseMove(self) {
      const idx = self.history.length;
      // Pattern: offKey, wail, wail, offKey, wail, wail …
      return idx % 3 === 0 ? 'offKey' : 'wail';
    },
  },

  echoPhantom: {
    id: 'echoPhantom', name: 'Echo Phantom', hp: [24, 30], tier: 'normal',
    moves: {
      fade: {
        id: 'fade', name: 'Fade', intent: 'defend',
        effects: [{ kind: 'block', amount: 8 }],
      },
      mirror: {
        id: 'mirror', name: 'Mirror', intent: 'attack',
        // Special: copies last card played. Handled in combat.js executeEnemyMove.
        effects: [{ kind: 'mirrorLast' }],
      },
    },
    chooseMove(self) {
      if (self.history.length === 0) return 'fade';
      return 'mirror';
    },
  },

  discordSprite: {
    id: 'discordSprite', name: 'Discord Sprite', hp: [30, 36], tier: 'normal',
    // Passive: gains 2 Forte each time the player achieves Crescendo.
    crescendoEnrage: 2,
    moves: {
      feedback: {
        id: 'feedback', name: 'Feedback', intent: 'attack',
        effects: [{ kind: 'damage', amount: 8, target: 'player' }],
      },
      cacophony: {
        id: 'cacophony', name: 'Cacophony', intent: 'attackdebuff',
        effects: [
          { kind: 'damage', amount: 5, target: 'player' },
          { kind: 'mute', note: 'random', amount: 1, target: 'player' },
        ],
      },
    },
    chooseMove(self) {
      const idx = self.history.length;
      return idx % 3 === 2 ? 'cacophony' : 'feedback';
    },
  },

  // --- Elite --------------------------------------------------------------
  brokenConductor: {
    id: 'brokenConductor', name: 'Broken Conductor', hp: [90, 96], tier: 'elite',
    moves: {
      batonDown: {
        id: 'batonDown', name: 'Baton Down', intent: 'attackdebuff',
        effects: [
          { kind: 'status', status: 'exposed', amount: 2, target: 'player' },
          { kind: 'block', amount: 8 },
        ],
      },
      diminish: {
        id: 'diminish', name: 'Diminish', intent: 'attackdebuff',
        effects: [
          { kind: 'damage', amount: 9, target: 'player' },
          { kind: 'mute', note: 'ward', amount: 2, target: 'player' },
        ],
      },
      fortissimoAtk: {
        id: 'fortissimoAtk', name: 'Fortissimo', intent: 'attack',
        effects: [{ kind: 'damage', amount: 18, target: 'player' }],
      },
    },
    chooseMove(self) {
      const cycle = ['batonDown', 'diminish', 'fortissimoAtk'];
      return cycle[self.history.length % cycle.length];
    },
  },

  // --- Boss ---------------------------------------------------------------
  theHush: {
    id: 'theHush', name: 'The Hush', hp: [160, 160], tier: 'boss',
    // Phase 2 kicks in at 80 HP.
    phase2Threshold: 80,
    moves: {
      silence: {
        id: 'silence', name: 'Grand Silence', intent: 'debuff',
        effects: [
          { kind: 'mute', note: 'strike', amount: 2, target: 'player' },
          { kind: 'mute', note: 'ward', amount: 2, target: 'player' },
          { kind: 'mute', note: 'verse', amount: 2, target: 'player' },
        ],
      },
      consume: {
        id: 'consume', name: 'Consume', intent: 'attackbuff',
        effects: [
          { kind: 'damage', amount: 12, target: 'player' },
          { kind: 'status', status: 'forte', amount: 2, target: 'self' },
        ],
      },
      voidPulse: {
        id: 'voidPulse', name: 'Void Pulse', intent: 'attack',
        // Special: deals 10 + 10 if player hasn't Crescendoed this turn.
        effects: [{ kind: 'voidPulse', base: 10, bonus: 10 }],
      },
      erasure: {
        id: 'erasure', name: 'Erasure', intent: 'attackdebuff',
        // Clears player's chain strip in addition to dealing damage.
        effects: [
          { kind: 'damage', amount: 12, target: 'player' },
          { kind: 'clearChain' },
        ],
      },
      grandPause: {
        id: 'grandPause', name: 'Grand Pause', intent: 'buff',
        // Does nothing this turn; next turn plays two moves.
        effects: [{ kind: 'chargeUp' }],
      },
      finalSilence: {
        id: 'finalSilence', name: 'Final Silence', intent: 'debuff',
        effects: [
          { kind: 'damage', amount: 16, target: 'player' },
          { kind: 'mute', note: 'strike', amount: 3, target: 'player' },
          { kind: 'mute', note: 'ward', amount: 3, target: 'player' },
          { kind: 'mute', note: 'verse', amount: 3, target: 'player' },
        ],
      },
    },
    chooseMove(self) {
      const phase1 = ['silence', 'consume', 'voidPulse', 'erasure', 'consume', 'voidPulse'];
      const phase2 = ['silence', 'consume', 'voidPulse', 'grandPause', 'finalSilence', 'erasure', 'consume', 'voidPulse'];
      const cycle = self.phase2 ? phase2 : phase1;
      return cycle[self.history.length % cycle.length];
    },
  },
};

export function getEnemy(id) {
  const e = ENEMIES[id];
  if (!e) throw new Error(`Unknown enemy id: ${id}`);
  return e;
}

export function spawnEnemy(id, rng, index) {
  const def = getEnemy(id);
  const [lo, hi] = def.hp;
  const maxHp = lo + Math.floor(rng() * (hi - lo + 1));
  return {
    slot: index, id, name: def.name, tier: def.tier,
    hp: maxHp, maxHp, block: 0,
    statuses: { forte: 0, exposed: 0, diminuendo: 0, discordant: 0 },
    history: [], intent: null,
    phase2: false,  // for The Hush
    chargedUp: false,  // for Grand Pause
  };
}

export function resolveIntent(enemy, rng) {
  const def = getEnemy(enemy.id);
  // Check phase2 transition for The Hush
  if (def.phase2Threshold && enemy.hp <= def.phase2Threshold) {
    enemy.phase2 = true;
  }
  const moveId = def.chooseMove(enemy, rng) ?? pick(rng, Object.keys(def.moves));
  enemy.intent = moveId;
  return def.moves[moveId];
}

export const ENCOUNTERS = {
  normal: [
    ['hushWisp'],
    ['paleMinstrel'],
    ['echoPhantom'],
    ['discordSprite'],
    ['hushWisp', 'echoPhantom'],
    ['paleMinstrel', 'hushWisp'],
  ],
  elite: [['brokenConductor']],
  boss: [['theHush']],
};
