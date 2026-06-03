// core/combat.js
//
// The combat engine. Pure, deterministic, browser-free. Every public function
// takes a combat state and returns a NEW combat state (the input is never
// mutated — we structuredClone up front and mutate the copy). Randomness is
// threaded through `state.rngSeed` so a clone of the state replays identically.
//
// Combat state shape:
//   {
//     rngSeed, turn, phase: 'player'|'enemy'|'won'|'lost',
//     player: { hp, maxHp, block, energy, maxEnergy,
//               statuses:{strength,vulnerable,weak}, powers:{metallicize?,demonForm?} },
//     enemies: [ enemy instance (see enemies.js) ],
//     drawPile|hand|discardPile|exhaustPile: [ {uid, id} ],
//     log: [string],
//   }

import { makeRng, shuffle } from './rng.js';
import { getCard } from './cards.js';
import { spawnEnemy, resolveIntent, getEnemy } from './enemies.js';

export const HAND_SIZE = 5;
export const BASE_ENERGY = 3;
export const MAX_HAND = 10;

// --- combat setup -----------------------------------------------------------

/**
 * Begin a combat.
 * @param {object} args
 * @param {{hp:number, maxHp:number}} args.player
 * @param {Array<{uid:number,id:string}>} args.deck the player's full deck
 * @param {string[]} args.enemyIds enemies to spawn, in slot order
 * @param {number} args.seed
 * @returns {object} combat state with phase 'player', a drawn hand, and intents
 */
export function startCombat({ player, deck, enemyIds, seed }) {
  const rng = makeRng((seed >>> 0) || 1);
  const state = {
    rngSeed: 0,
    turn: 1,
    phase: 'player',
    player: {
      hp: player.hp,
      maxHp: player.maxHp,
      block: 0,
      energy: BASE_ENERGY,
      maxEnergy: BASE_ENERGY,
      statuses: { strength: 0, vulnerable: 0, weak: 0 },
      powers: {},
    },
    enemies: enemyIds.map((id, i) => spawnEnemy(id, rng, i)),
    drawPile: shuffle(deck, rng),
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

// --- queries (pure, no clone needed) ----------------------------------------

/** Enemies that are still alive. */
export function aliveEnemies(state) {
  return state.enemies.filter((e) => e.hp > 0);
}

/** Is the combat finished? */
export function isOver(state) {
  return state.phase === 'won' || state.phase === 'lost';
}

/** Can the card at `handIndex` legally be played right now? */
export function canPlay(state, handIndex) {
  if (state.phase !== 'player') return false;
  const card = state.hand[handIndex];
  if (!card) return false;
  return getCard(card.id).cost <= state.player.energy;
}

/**
 * What the enemy's telegraphed move will do, with current modifiers folded in
 * (strength added, weak applied). For the UI's intent display and for tests.
 * @param {object} enemy
 * @returns {{name:string,intent:string,damage:number,times:number,block:number}|null}
 */
export function intentPreview(enemy) {
  const def = getEnemy(enemy.id);
  const move = def.moves[enemy.intent];
  if (!move) return null;
  let damage = 0;
  let times = 1;
  let block = 0;
  for (const eff of move.effects) {
    if (eff.kind === 'damage') {
      times = eff.times || 1;
      let d = eff.amount + (enemy.statuses.strength || 0);
      if ((enemy.statuses.weak || 0) > 0) d = Math.floor(d * 0.75);
      damage = Math.max(0, d);
    } else if (eff.kind === 'block') {
      block += eff.amount;
    }
  }
  return { name: move.name, intent: move.intent, damage, times, block };
}

// --- the player's turn ------------------------------------------------------

/**
 * Play the card at `handIndex`, optionally targeting the enemy in `targetSlot`.
 * No-ops (returns the same state) if the move is illegal so the UI can call it
 * freely.
 * @param {object} state
 * @param {number} handIndex
 * @param {number} [targetSlot]
 * @returns {object} new state
 */
export function playCard(state, handIndex, targetSlot) {
  if (state.phase !== 'player') return state;
  const card = state.hand[handIndex];
  if (!card) return state;
  const def = getCard(card.id);
  if (def.cost > state.player.energy) return state;

  const s = structuredClone(state);
  const rng = makeRng(s.rngSeed);
  s.player.energy -= def.cost;

  for (const eff of def.effects) {
    applyCardEffect(s, eff, targetSlot, rng);
    if (s.player.hp <= 0) break; // self-damage (e.g. Bloodletting) can be lethal
  }

  // Card leaves the hand: powers are removed for the rest of combat (exhaust),
  // everything else goes to the discard pile.
  s.hand.splice(handIndex, 1);
  if (def.type === 'power') s.exhaustPile.push(card);
  else s.discardPile.push(card);

  settleOutcome(s);
  s.rngSeed = rng.state();
  return s;
}

/**
 * End the player's turn: trigger end-of-turn powers, let every living enemy
 * act on its intent, then start a fresh player turn (unless the combat ended).
 * @param {object} state
 * @returns {object} new state
 */
export function endTurn(state) {
  if (state.phase !== 'player') return state;
  const s = structuredClone(state);
  const rng = makeRng(s.rngSeed);

  // End-of-player-turn powers, then player debuffs tick down.
  if (s.player.powers.metallicize) s.player.block += s.player.powers.metallicize;
  tickDebuffs(s.player.statuses);

  // Whole hand is discarded at end of turn.
  s.discardPile.push(...s.hand);
  s.hand = [];

  s.phase = 'enemy';
  for (const enemy of s.enemies) {
    if (enemy.hp <= 0) continue;
    enemy.block = 0; // block from the enemy's last turn clears as it acts again
    executeEnemyMove(s, enemy);
    enemy.history.push(enemy.intent);
    tickDebuffs(enemy.statuses);
    if (s.player.hp <= 0) {
      s.player.hp = 0;
      s.phase = 'lost';
      s.rngSeed = rng.state();
      return s;
    }
  }

  // Start the player's next turn.
  s.turn += 1;
  s.player.block = 0;
  if (s.player.powers.demonForm) s.player.statuses.strength += s.player.powers.demonForm;
  s.player.energy = s.player.maxEnergy;
  drawCards(s, HAND_SIZE, rng);
  for (const e of aliveEnemies(s)) resolveIntent(e, rng);
  s.phase = 'player';

  s.rngSeed = rng.state();
  return s;
}

// --- effect execution -------------------------------------------------------

function applyCardEffect(s, eff, targetSlot, rng) {
  switch (eff.kind) {
    case 'damage': {
      const times = eff.times || 1;
      const base = attackPower(eff.amount, s.player.statuses, eff.strengthMult || 1);
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
    case 'damageFromBlock': {
      // Body Slam: damage equals current block (strength does not apply, but
      // Weak still reduces it like any other attack).
      let base = s.player.block;
      if ((s.player.statuses.weak || 0) > 0) base = Math.floor(base * 0.75);
      const e = chosenEnemy(s, targetSlot);
      if (e) dealToEnemy(e, Math.max(0, base));
      break;
    }
    case 'reaper': {
      // Hit all enemies; heal for total UNBLOCKED damage dealt.
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
    case 'energy':
      s.player.energy += eff.amount;
      break;
    case 'hpLoss':
      s.player.hp -= eff.amount; // ignores block, by design
      break;
    case 'status': {
      if (eff.target === 'self') {
        s.player.statuses[eff.status] = (s.player.statuses[eff.status] || 0) + eff.amount;
      } else {
        const e = chosenEnemy(s, targetSlot);
        if (e) e.statuses[eff.status] = (e.statuses[eff.status] || 0) + eff.amount;
      }
      break;
    }
    case 'power':
      s.player.powers[eff.power] = (s.player.powers[eff.power] || 0) + eff.amount;
      break;
    case 'doubleStrength':
      s.player.statuses.strength *= 2;
      break;
    default:
      throw new Error(`Unknown card effect kind: ${eff.kind}`);
  }
}

function executeEnemyMove(s, enemy) {
  const def = getEnemy(enemy.id);
  const move = def.moves[enemy.intent];
  if (!move) return;
  for (const eff of move.effects) {
    switch (eff.kind) {
      case 'damage': {
        const times = eff.times || 1;
        let d = eff.amount + (enemy.statuses.strength || 0);
        if ((enemy.statuses.weak || 0) > 0) d = Math.floor(d * 0.75);
        d = Math.max(0, d);
        if ((s.player.statuses.vulnerable || 0) > 0) d = Math.floor(d * 1.5);
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
      default:
        throw new Error(`Unknown enemy effect kind: ${eff.kind}`);
    }
  }
}

// --- damage math ------------------------------------------------------------

/** Outgoing attack value before the target's Vulnerable is applied. */
function attackPower(base, attackerStatuses, strengthMult) {
  let dmg = base + (attackerStatuses.strength || 0) * strengthMult;
  if ((attackerStatuses.weak || 0) > 0) dmg = Math.floor(dmg * 0.75);
  return Math.max(0, dmg);
}

/** Apply an attack to an enemy (folds in its Vulnerable). Returns unblocked dmg. */
function dealToEnemy(enemy, base) {
  let dmg = base;
  if ((enemy.statuses.vulnerable || 0) > 0) dmg = Math.floor(dmg * 1.5);
  return dealToUnit(enemy, dmg);
}

/** Subtract `dmg` from a unit's block then HP. Returns HP actually lost. */
function dealToUnit(unit, dmg) {
  const blocked = Math.min(unit.block, dmg);
  unit.block -= blocked;
  const hpLoss = dmg - blocked;
  unit.hp -= hpLoss;
  return hpLoss;
}

// --- piles & bookkeeping ----------------------------------------------------

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

function tickDebuffs(statuses) {
  if (statuses.vulnerable > 0) statuses.vulnerable -= 1;
  if (statuses.weak > 0) statuses.weak -= 1;
}

/** Resolve the intended target enemy, falling back to the first living one. */
function chosenEnemy(s, targetSlot) {
  const target = s.enemies.find((e) => e.slot === targetSlot && e.hp > 0);
  if (target) return target;
  return aliveEnemies(s)[0] || null;
}

/** Flip phase to 'won'/'lost' if the board says so. */
function settleOutcome(s) {
  if (s.player.hp <= 0) {
    s.player.hp = 0;
    s.phase = 'lost';
  } else if (aliveEnemies(s).length === 0) {
    s.phase = 'won';
  }
}
