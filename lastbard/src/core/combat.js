// core/combat.js — The Last Bard combat engine.
//
// The key addition over a standard roguelike engine is the CHAIN SYSTEM:
//   chain[]         note types played this turn (chronological)
//   crescendoFired  true once Crescendo triggers; resets each turn
//
// Chain resolution (checked after each card play):
//   neutral  – same note as last play OR note is muted → no bonus
//   harmony  – different note from last play            → small bonus
//   crescendo– all 3 note types appear in last 3 plays  → big bonus (once/turn)
//
// Statuses: forte (damage up), exposed (incoming ×1.5), diminuendo (outgoing ×0.75),
//           resonant (next chain bonus doubled), discordant (enemy outgoing ×0.75).
// Muted: per note-type counter on the player; muted notes cost +1 tempo and
//        are transparent to chain tracking.

import { makeRng, shuffle, pick } from './rng.js';
import { effectiveCard, getCard } from './cards.js';
import { spawnEnemy, resolveIntent, getEnemy } from './enemies.js';

export const HAND_SIZE = 5;
export const BASE_TEMPO = 3;
export const MAX_HAND = 10;

// --- setup ------------------------------------------------------------------

export function startCombat({ player, deck, enemyIds, seed }) {
  const rng = makeRng((seed >>> 0) || 1);
  const state = {
    rngSeed: 0,
    turn: 1,
    phase: 'player',
    player: {
      hp: player.hp, maxHp: player.maxHp,
      block: 0, tempo: BASE_TEMPO, maxTempo: BASE_TEMPO,
      statuses: { forte: 0, exposed: 0, diminuendo: 0, resonant: 0 },
      muted: { strike: 0, ward: 0, verse: 0 },
      powers: {},
    },
    enemies: enemyIds.map((id, i) => spawnEnemy(id, rng, i)),
    chain: [],
    crescendoFired: false,
    lastPlayed: null,   // { id, note } – for Improvise / Echo Phantom mirror
    drawPile: shuffle(deck.map((c) => ({ ...c })), rng),
    hand: [],
    discardPile: [],
    exhaustPile: [],
    log: [],
  };
  drawCards(state, HAND_SIZE, rng);
  for (const e of state.enemies) resolveIntent(e, rng);
  state.rngSeed = rng.state();
  return state;
}

// --- queries ----------------------------------------------------------------

export function aliveEnemies(state) {
  return state.enemies.filter((e) => e.hp > 0);
}

export function isOver(state) {
  return state.phase === 'won' || state.phase === 'lost';
}

export function canPlay(state, handIndex) {
  if (state.phase !== 'player') return false;
  const inst = state.hand[handIndex];
  if (!inst) return false;
  const def = effectiveCard(inst);
  if (def.crescendoOnly && !state.crescendoFired) return false;
  const muted = (state.player.muted[def.note] || 0) > 0;
  return (def.cost + (muted ? 1 : 0)) <= state.player.tempo;
}

export function chainStatus(state) {
  const len = state.chain.length;
  if (len === 0) return 'empty';
  if (len >= 2 && state.chain[len - 1] !== state.chain[len - 2]) {
    if (len >= 3 && new Set(state.chain.slice(-3)).size === 3) return 'crescendo';
    return 'harmony';
  }
  return 'neutral';
}

/** Preview what would happen to chain if `noteType` is played next. */
export function previewChain(state, noteType, isMuted) {
  if (isMuted) return 'neutral';
  const prev = state.chain[state.chain.length - 1];
  if (!prev || prev === noteType) return 'neutral';
  const projected = [...state.chain, noteType];
  if (projected.length >= 3 && new Set(projected.slice(-3)).size === 3) return 'crescendo';
  return 'harmony';
}

export function intentPreview(enemy) {
  const def = getEnemy(enemy.id);
  const move = def.moves[enemy.intent];
  if (!move) return null;
  let damage = 0, times = 1, block = 0;
  for (const eff of move.effects) {
    if (eff.kind === 'damage') {
      times = eff.times || 1;
      let d = eff.amount + (enemy.statuses.forte || 0);
      if ((enemy.statuses.diminuendo || 0) > 0) d = Math.floor(d * 0.75);
      if ((enemy.statuses.discordant || 0) > 0) d = Math.floor(d * 0.75);
      damage = Math.max(0, d);
    } else if (eff.kind === 'block') {
      block += eff.amount;
    } else if (eff.kind === 'voidPulse') {
      damage = eff.base + eff.bonus; // worst case shown
    } else if (eff.kind === 'finalSilence') {
      damage = eff.amount || 16;
    }
  }
  return { name: move.name, intent: move.intent, damage, times, block };
}

// --- player turn ------------------------------------------------------------

export function playCard(state, handIndex, targetSlot) {
  if (state.phase !== 'player') return state;
  const inst = state.hand[handIndex];
  if (!inst) return state;
  const def = effectiveCard(inst);
  const noteType = def.note;
  const isMuted = (state.player.muted[noteType] || 0) > 0;
  const effectiveCost = def.cost + (isMuted ? 1 : 0);
  if (effectiveCost > state.player.tempo) return state;
  if (def.crescendoOnly && !state.crescendoFired) return state;

  const s = structuredClone(state);
  const rng = makeRng(s.rngSeed);
  s.player.tempo -= effectiveCost;

  // Determine chain result BEFORE mutating chain
  const chainResult = isMuted ? 'neutral' : computeChainResult(s.chain, noteType);

  // Apply card effects
  for (const eff of def.effects) {
    applyCardEffect(s, eff, targetSlot, rng, inst);
    if (s.player.hp <= 0) break;
  }

  // Update chain (muted cards don't contribute)
  if (!isMuted) s.chain.push(noteType);
  s.lastPlayed = { id: inst.id, note: noteType };

  // Apply chain bonus
  if (chainResult !== 'neutral') {
    applyChainBonus(s, chainResult, noteType, targetSlot, rng);
  }

  // Move card out of hand
  s.hand.splice(handIndex, 1);
  const isPower = getCard(inst.id).type === 'power';
  if (isPower) s.exhaustPile.push(inst);
  else s.discardPile.push(inst);

  settleOutcome(s);
  s.rngSeed = rng.state();
  return s;
}

export function endTurn(state) {
  if (state.phase !== 'player') return state;
  const s = structuredClone(state);
  const rng = makeRng(s.rngSeed);

  // End-of-turn powers
  if (s.player.powers.eternalRefrain) s.player.block += s.player.powers.eternalRefrain;

  tickPlayerDebuffs(s.player);
  tickMuted(s.player);

  s.discardPile.push(...s.hand);
  s.hand = [];
  s.phase = 'enemy';

  for (const enemy of s.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.block = 0;
    executeEnemyMove(s, enemy, rng);
    enemy.history.push(enemy.intent);
    tickEnemyDebuffs(enemy.statuses);
    if (s.player.hp <= 0) {
      s.player.hp = 0;
      s.phase = 'lost';
      s.rngSeed = rng.state();
      return s;
    }
  }

  // Start next player turn
  s.turn += 1;
  s.player.block = 0;
  s.chain = [];
  s.crescendoFired = false;
  if (s.player.powers.maestro) s.player.statuses.forte += s.player.powers.maestro;
  if (s.player.powers.ballad) s.player.statuses.forte += s.player.powers.ballad;
  s.player.tempo = s.player.maxTempo;
  drawCards(s, HAND_SIZE, rng);
  for (const e of aliveEnemies(s)) resolveIntent(e, rng);
  s.phase = 'player';

  s.rngSeed = rng.state();
  return s;
}

// --- chain ------------------------------------------------------------------

function computeChainResult(chain, newNote) {
  const prev = chain[chain.length - 1];
  if (!prev || prev === newNote) return 'neutral';
  const projected = [...chain, newNote];
  if (projected.length >= 3 && new Set(projected.slice(-3)).size === 3) return 'crescendo';
  return 'harmony';
}

function applyChainBonus(s, result, noteType, targetSlot, rng) {
  const resonant = (s.player.statuses.resonant || 0) > 0;
  const mult = resonant ? 2 : 1;
  if (resonant) s.player.statuses.resonant -= 1;

  // Harmony bonus (always applied for harmony and crescendo)
  let harmonyDraw = 0;
  if (noteType === 'strike') {
    const e = chosenEnemy(s, targetSlot);
    if (e) dealToEnemy(e, 3 * mult);
  } else if (noteType === 'ward') {
    s.player.block += 3 * mult;
  } else if (noteType === 'verse') {
    harmonyDraw = 1 * mult;
  }
  // Perfect Pitch: extra draw on Harmony for non-verse notes
  const ppBonus = s.player.powers.perfectPitch || 0;
  if (ppBonus && noteType !== 'verse') harmonyDraw += ppBonus;
  if (harmonyDraw > 0) drawCards(s, harmonyDraw, rng);

  // Crescendo bonus (once per turn, in addition to Harmony)
  if (result === 'crescendo' && !s.crescendoFired) {
    s.crescendoFired = true;
    const bonus = s.player.powers.crescendoBonus || 0;
    if (noteType === 'strike') {
      const dmg = 8 + bonus;
      for (const e of aliveEnemies(s)) dealToEnemy(e, dmg);
      // Discord Sprite passive: gains forte when player crescendos
      for (const e of aliveEnemies(s)) {
        const def = getEnemy(e.id);
        if (def.crescendoEnrage) e.statuses.forte += def.crescendoEnrage;
      }
    } else if (noteType === 'ward') {
      s.player.block += 8 + bonus;
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 4 + Math.floor(bonus / 2));
    } else if (noteType === 'verse') {
      drawCards(s, 3 + Math.floor(bonus / 2), rng);
      s.player.tempo = Math.min(s.player.tempo + 1, s.player.maxTempo + 2);
    }
  }
}

// --- card effects -----------------------------------------------------------

function applyCardEffect(s, eff, targetSlot, rng, sourceInst) {
  switch (eff.kind) {
    case 'damage': {
      const times = eff.times || 1;
      const base = attackPower(eff.amount, s.player.statuses, eff.forteMult || 1);
      for (let t = 0; t < times; t++) {
        if (eff.target === 'allEnemies') {
          for (const e of aliveEnemies(s)) dealToEnemy(e, base);
        } else {
          const e = chosenEnemy(s, targetSlot);
          if (e) dealToEnemy(e, base);
        }
      }
      break;
    }
    case 'allDamage': {
      const base = attackPower(eff.amount, s.player.statuses, 1);
      for (const e of aliveEnemies(s)) dealToEnemy(e, base);
      break;
    }
    case 'damageFromBlock': {
      let base = s.player.block;
      if ((s.player.statuses.diminuendo || 0) > 0) base = Math.floor(base * 0.75);
      const e = chosenEnemy(s, targetSlot);
      if (e) dealToEnemy(e, Math.max(0, base));
      break;
    }
    case 'reaper': {
      const base = attackPower(eff.amount, s.player.statuses, 1);
      let healed = 0;
      for (const e of aliveEnemies(s)) healed += dealToEnemy(e, base);
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + healed);
      break;
    }
    case 'block':
      s.player.block += eff.amount;
      break;
    case 'draw':
      drawCards(s, eff.amount, rng);
      break;
    case 'tempo':
      s.player.tempo += eff.amount;
      break;
    case 'hpLoss':
      s.player.hp -= eff.amount;
      break;
    case 'status':
      if (eff.target === 'self') {
        s.player.statuses[eff.status] = (s.player.statuses[eff.status] || 0) + eff.amount;
      } else {
        const e = chosenEnemy(s, targetSlot);
        if (e) e.statuses[eff.status] = (e.statuses[eff.status] || 0) + eff.amount;
      }
      break;
    case 'power':
      s.player.powers[eff.power] = (s.player.powers[eff.power] || 0) + eff.amount;
      break;
    case 'mute':
      applyMute(s, eff, rng);
      break;
    case 'copyLast': {
      if (!s.lastPlayed) break;
      const copyDef = effectiveCard({ id: s.lastPlayed.id, upgraded: false });
      const times = eff.times || 1;
      for (let t = 0; t < times; t++) {
        for (const cEff of copyDef.effects) {
          applyCardEffect(s, cEff, targetSlot, rng, null);
        }
      }
      break;
    }
    default:
      // clearChain, chargeUp, voidPulse handled in enemy execution
      break;
  }
}

function applyMute(s, eff, rng) {
  // 'random' note type picks one that isn't already muted (or just picks randomly)
  let note = eff.note;
  if (note === 'random') {
    const candidates = ['strike', 'ward', 'verse'].filter((n) => !s.player.muted[n]);
    note = candidates.length > 0 ? pick(rng, candidates) : pick(rng, ['strike', 'ward', 'verse']);
  }
  if (eff.target === 'player') {
    s.player.muted[note] = (s.player.muted[note] || 0) + eff.amount;
  }
}

// --- enemy execution --------------------------------------------------------

function executeEnemyMove(s, enemy, rng) {
  const def = getEnemy(enemy.id);
  const move = def.moves[enemy.intent];
  if (!move) return;

  // Grand Pause charges up; next turn the enemy acts twice
  if (enemy.chargedUp) {
    enemy.chargedUp = false;
    // Execute the NEXT move in cycle as well
    const nextMoveId = def.chooseMove({ ...enemy, history: [...enemy.history, enemy.intent] }, rng);
    const nextMove = def.moves[nextMoveId];
    if (nextMove) executeMovEffects(s, enemy, nextMove.effects, rng);
  }

  executeMovEffects(s, enemy, move.effects, rng);
}

function executeMovEffects(s, enemy, effects, rng) {
  for (const eff of effects) {
    switch (eff.kind) {
      case 'damage': {
        const times = eff.times || 1;
        let d = eff.amount + (enemy.statuses.forte || 0);
        if ((enemy.statuses.diminuendo || 0) > 0) d = Math.floor(d * 0.75);
        if ((enemy.statuses.discordant || 0) > 0) d = Math.floor(d * 0.75);
        d = Math.max(0, d);
        for (let t = 0; t < times; t++) {
          dealToUnit(s.player, d);
          if (s.player.hp <= 0) return;
        }
        break;
      }
      case 'block':
        enemy.block += eff.amount;
        break;
      case 'status':
        if (eff.target === 'self') {
          enemy.statuses[eff.status] = (enemy.statuses[eff.status] || 0) + eff.amount;
        } else {
          s.player.statuses[eff.status] = (s.player.statuses[eff.status] || 0) + eff.amount;
        }
        break;
      case 'mute':
        applyMute(s, eff, rng);
        break;
      case 'mirrorLast': {
        if (!s.lastPlayed) break;
        const mirrorDef = getCard(s.lastPlayed.id);
        // Mirror only damage effects, and deal them to the player
        for (const mEff of mirrorDef.effects) {
          if (mEff.kind === 'damage') {
            let d = mEff.amount + (enemy.statuses.forte || 0);
            d = Math.max(0, d);
            dealToUnit(s.player, d);
          }
        }
        break;
      }
      case 'voidPulse': {
        let d = eff.base + (enemy.statuses.forte || 0);
        if (!s.crescendoFired) d += eff.bonus;
        d = Math.max(0, d);
        dealToUnit(s.player, d);
        break;
      }
      case 'clearChain':
        // Deals damage then clears chain
        if (eff.amount) {
          let d = eff.amount + (enemy.statuses.forte || 0);
          d = Math.max(0, d);
          dealToUnit(s.player, d);
        }
        s.chain = [];
        s.crescendoFired = false;
        break;
      case 'chargeUp':
        enemy.chargedUp = true;
        break;
      default:
        break;
    }
  }
}

// --- damage math ------------------------------------------------------------

function attackPower(base, attackerStatuses, forteMult) {
  let dmg = base + (attackerStatuses.forte || 0) * forteMult;
  if ((attackerStatuses.diminuendo || 0) > 0) dmg = Math.floor(dmg * 0.75);
  return Math.max(0, dmg);
}

function dealToEnemy(enemy, base) {
  let dmg = base;
  if ((enemy.statuses.exposed || 0) > 0) dmg = Math.floor(dmg * 1.5);
  return dealToUnit(enemy, dmg);
}

function dealToUnit(unit, dmg) {
  const blocked = Math.min(unit.block, dmg);
  unit.block -= blocked;
  const hpLoss = dmg - blocked;
  unit.hp -= hpLoss;
  return hpLoss;
}

// --- piles ------------------------------------------------------------------

function drawCards(s, n, rng) {
  for (let i = 0; i < n; i++) {
    if (s.hand.length >= MAX_HAND) break;
    if (s.drawPile.length === 0) {
      if (s.discardPile.length === 0) break;
      s.drawPile = shuffle(s.discardPile, rng);
      s.discardPile = [];
    }
    s.hand.push(s.drawPile.shift());
  }
}

function tickPlayerDebuffs(player) {
  const st = player.statuses;
  if (st.exposed > 0) st.exposed -= 1;
  if (st.diminuendo > 0) st.diminuendo -= 1;
  if (st.discordant > 0) st.discordant -= 1;
}

function tickMuted(player) {
  for (const note of ['strike', 'ward', 'verse']) {
    if (player.muted[note] > 0) player.muted[note] -= 1;
  }
}

function tickEnemyDebuffs(statuses) {
  if (statuses.exposed > 0) statuses.exposed -= 1;
  if (statuses.diminuendo > 0) statuses.diminuendo -= 1;
  if (statuses.discordant > 0) statuses.discordant -= 1;
}

function chosenEnemy(s, targetSlot) {
  const target = s.enemies.find((e) => e.slot === targetSlot && e.hp > 0);
  return target ?? (aliveEnemies(s)[0] || null);
}

function settleOutcome(s) {
  if (s.player.hp <= 0) { s.player.hp = 0; s.phase = 'lost'; }
  else if (aliveEnemies(s).length === 0) s.phase = 'won';
}
