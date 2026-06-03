// core/run.js
//
// The meta-game above combat: a linear climb of nodes (fights, an elite, rest
// stops, and a boss), the player's persistent deck/HP, and the reward flow
// between fights. Pure and deterministic given the run seed — combat states
// are produced by combat.js and stored on `run.combat`; this module only owns
// the progression and the deck.
//
// Run phases: 'map' | 'combat' | 'reward' | 'rest' | 'dead' | 'won'.

import { makeRng, randInt, pick } from './rng.js';
import { STARTER_DECK, makeDeck, rollRewards } from './cards.js';
import { ENCOUNTERS } from './enemies.js';
import { startCombat } from './combat.js';

export const START_HP = 72;
export const REST_HEAL_FRACTION = 0.3;

/** The fixed shape of an act. Enemy groups for each node are rolled per-seed. */
const LAYOUT = ['combat', 'combat', 'rest', 'combat', 'elite', 'rest', 'combat', 'boss'];

/**
 * Create a fresh run from a seed.
 * @param {number} seed
 * @returns {object} run state in the 'map' phase at floor 0
 */
export function newRun(seed) {
  const rng = makeRng((seed >>> 0) || 1);
  const nodes = LAYOUT.map((type) => {
    if (type === 'combat') return { type, group: pick(rng, ENCOUNTERS.normal) };
    if (type === 'elite') return { type, group: pick(rng, ENCOUNTERS.elite) };
    if (type === 'boss') return { type, group: pick(rng, ENCOUNTERS.boss) };
    return { type }; // rest
  });
  const deck = makeDeck(STARTER_DECK, 1);
  return {
    seed: (seed >>> 0) || 1,
    rngSeed: rng.state(),
    floor: 0,
    nodes,
    player: { hp: START_HP, maxHp: START_HP, gold: 0, deck, nextUid: deck.length + 1 },
    phase: 'map',
    combat: null,
    reward: null,
  };
}

/** The node the player is currently standing on. */
export function currentNode(run) {
  return run.nodes[run.floor] ?? null;
}

/**
 * Enter the current node: start a combat (for fight/elite/boss nodes) or move
 * into the rest screen. No-op unless we're on the map.
 * @param {object} run
 * @returns {object} new run
 */
export function enterNode(run) {
  if (run.phase !== 'map') return run;
  const node = currentNode(run);
  if (!node) return run;

  const s = structuredClone(run);
  if (node.type === 'rest') {
    s.phase = 'rest';
    return s;
  }

  // Combat-type node. Derive a fresh, stable seed for this fight.
  const rng = makeRng(s.rngSeed);
  const combatSeed = (randInt(rng, 0x7fffffff) ^ (s.floor + 1)) >>> 0;
  s.rngSeed = rng.state();
  s.combat = startCombat({
    player: { hp: s.player.hp, maxHp: s.player.maxHp },
    deck: structuredClone(s.player.deck),
    enemyIds: node.group,
    seed: combatSeed,
  });
  s.phase = 'combat';
  return s;
}

/**
 * Fold a finished combat back into the run: carry over the player's HP, then
 * route to a reward (normal win), victory (boss win), or death.
 * Call this once `run.combat.phase` is 'won' or 'lost'.
 * @param {object} run
 * @returns {object} new run
 */
export function resolveCombat(run) {
  if (run.phase !== 'combat' || !run.combat) return run;
  const combat = run.combat;
  if (combat.phase !== 'won' && combat.phase !== 'lost') return run;

  const s = structuredClone(run);
  s.player.hp = Math.max(0, combat.player.hp);

  if (combat.phase === 'lost') {
    s.phase = 'dead';
    return s;
  }

  if (currentNode(s).type === 'boss') {
    s.phase = 'won';
    return s;
  }

  const rng = makeRng(s.rngSeed);
  s.reward = { cards: rollRewards(rng), gold: 10 + randInt(rng, 16) };
  s.player.gold += s.reward.gold;
  s.rngSeed = rng.state();
  s.phase = 'reward';
  return s;
}

/**
 * Take a card from the current reward (or skip with `cardId === null`), then
 * advance to the next node.
 * @param {object} run
 * @param {string|null} cardId must be one of `run.reward.cards`, or null to skip
 * @returns {object} new run
 */
export function chooseReward(run, cardId) {
  if (run.phase !== 'reward' || !run.reward) return run;
  const s = structuredClone(run);
  if (cardId && s.reward.cards.includes(cardId)) {
    s.player.deck.push({ uid: s.player.nextUid, id: cardId });
    s.player.nextUid += 1;
  }
  s.reward = null;
  return advance(s);
}

/**
 * Rest at a campfire: heal a fraction of max HP, then advance.
 * @param {object} run
 * @returns {object} new run
 */
export function rest(run) {
  if (run.phase !== 'rest') return run;
  const s = structuredClone(run);
  const heal = Math.floor(s.player.maxHp * REST_HEAL_FRACTION);
  s.player.hp = Math.min(s.player.maxHp, s.player.hp + heal);
  return advance(s);
}

/** Step to the next node (or declare victory after the final node). */
function advance(s) {
  s.combat = null;
  s.floor += 1;
  if (s.floor >= s.nodes.length) {
    s.phase = 'won';
  } else {
    s.phase = 'map';
  }
  return s;
}
