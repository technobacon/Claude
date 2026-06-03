// core/run.js — The Last Bard run/map layer.
//
// Run phases: 'map' | 'combat' | 'reward' | 'rest' | 'dead' | 'won'.
// Rest choices: 'recover' (heal) | 'compose' (peek top 5, pin 1) | 'transcribe' (upgrade card).

import { makeRng, randInt, pick, shuffle } from './rng.js';
import { STARTER_DECK, makeDeck, rollRewards, effectiveCard } from './cards.js';
import { ENCOUNTERS } from './enemies.js';
import { startCombat } from './combat.js';

export const START_HP = 72;
export const REST_HEAL = 0.30;

// Act layout: 8 nodes, last is always boss.
const LAYOUT = ['combat', 'combat', 'rest', 'combat', 'elite', 'rest', 'combat', 'boss'];

export const RELICS = [
  { id: 'brokenLute',   name: 'Broken Lute String',    text: 'First Strike card each combat deals double damage.' },
  { id: 'metronome',    name: 'Metronome',              text: 'Each Harmony grants +1 Block.' },
  { id: 'ancientScore', name: 'Ancient Score',          text: 'Start each combat with 1 extra Tempo.' },
  { id: 'reedFragment', name: 'Reed Fragment',          text: 'If ≥3 Ward cards in hand at turn start, gain 5 Block.' },
  { id: 'conductorBaton', name: "Conductor's Baton",   text: 'Crescendo bonuses are 50% stronger.' },
  { id: 'tuningFork',   name: 'Resonant Tuning Fork',  text: 'Start each combat Resonant.' },
];

export function newRun(seed) {
  const rng = makeRng((seed >>> 0) || 1);
  const nodes = LAYOUT.map((type) => ({
    type,
    group: type === 'combat' ? pick(rng, ENCOUNTERS.normal)
         : type === 'elite'  ? pick(rng, ENCOUNTERS.elite)
         : type === 'boss'   ? pick(rng, ENCOUNTERS.boss)
         : null,
  }));
  const deck = makeDeck(STARTER_DECK);
  return {
    seed: (seed >>> 0) || 1,
    rngSeed: rng.state(),
    floor: 0,
    nodes,
    player: { hp: START_HP, maxHp: START_HP, gold: 0, deck, nextUid: deck.length + 1, relics: [] },
    phase: 'map',
    combat: null,
    reward: null,
    compose: null,   // { peeked: [{uid,id}], remaining: [...] }
    transcribe: null, // { options: [{uid,id,upgraded}] }  — deck cards to pick from
  };
}

export function currentNode(run) {
  return run.nodes[run.floor] ?? null;
}

export function enterNode(run) {
  if (run.phase !== 'map') return run;
  const node = currentNode(run);
  if (!node) return run;

  const s = structuredClone(run);
  if (node.type === 'rest') {
    s.phase = 'rest';
    return s;
  }

  const rng = makeRng(s.rngSeed);
  const combatSeed = (randInt(rng, 0x7fffffff) ^ (s.floor + 1)) >>> 0;
  s.rngSeed = rng.state();

  // Apply relic: Ancient Score → +1 max tempo (handled in startCombat via player obj)
  const hasAncientScore = s.player.relics.some((r) => r.id === 'ancientScore');
  const hasTuningFork = s.player.relics.some((r) => r.id === 'tuningFork');

  s.combat = startCombat({
    player: { hp: s.player.hp, maxHp: s.player.maxHp },
    deck: structuredClone(s.player.deck),
    enemyIds: node.group,
    seed: combatSeed,
  });

  // Post-spawn relic effects
  if (hasAncientScore) {
    s.combat.player.tempo += 1;
    s.combat.player.maxTempo += 1;
  }
  if (hasTuningFork) {
    s.combat.player.statuses.resonant = (s.combat.player.statuses.resonant || 0) + 1;
  }

  s.phase = 'combat';
  return s;
}

export function resolveCombat(run) {
  if (run.phase !== 'combat' || !run.combat) return run;
  const combat = run.combat;
  if (combat.phase !== 'won' && combat.phase !== 'lost') return run;

  const s = structuredClone(run);
  s.player.hp = Math.max(0, combat.player.hp);

  if (combat.phase === 'lost') { s.phase = 'dead'; return s; }
  if (currentNode(s).type === 'boss') { s.phase = 'won'; return s; }

  const rng = makeRng(s.rngSeed);
  const gold = 10 + randInt(rng, 16);
  s.player.gold += gold;

  let relicOffer = null;
  if (currentNode(s).type === 'elite') {
    const available = RELICS.filter((r) => !s.player.relics.find((pr) => pr.id === r.id));
    if (available.length >= 2) {
      relicOffer = [pick(rng, available)];
      const remaining = available.filter((r) => r.id !== relicOffer[0].id);
      if (remaining.length) relicOffer.push(pick(rng, remaining));
    }
  }

  s.reward = { cards: rollRewards(rng), gold, relicOffer };
  s.rngSeed = rng.state();
  s.phase = 'reward';
  return s;
}

export function chooseReward(run, cardId, relicId) {
  if (run.phase !== 'reward' || !run.reward) return run;
  const s = structuredClone(run);
  if (cardId && s.reward.cards.includes(cardId)) {
    s.player.deck.push({ uid: s.player.nextUid, id: cardId, upgraded: false });
    s.player.nextUid += 1;
  }
  if (relicId && s.reward.relicOffer) {
    const relic = s.reward.relicOffer.find((r) => r.id === relicId);
    if (relic) s.player.relics.push(relic);
  }
  s.reward = null;
  return advance(s);
}

// --- rest choices -----------------------------------------------------------

/** Start the Compose flow: peek top 5 cards; player will pin one. */
export function startCompose(run) {
  if (run.phase !== 'rest') return run;
  const s = structuredClone(run);
  const rng = makeRng(s.rngSeed);
  const shuffled = shuffle(structuredClone(s.player.deck), rng);
  s.rngSeed = rng.state();
  const peeked = shuffled.slice(0, Math.min(5, shuffled.length));
  s.compose = { peeked };
  return s;
}

/** Finish Compose: pin `pinnedUid` as guaranteed first draw next combat. */
export function finishCompose(run, pinnedUid) {
  if (!run.compose) return run;
  const s = structuredClone(run);
  // Move pinned card to front of deck
  const idx = s.player.deck.findIndex((c) => c.uid === pinnedUid);
  if (idx !== -1) {
    const [card] = s.player.deck.splice(idx, 1);
    s.player.deck.unshift(card);
  }
  s.compose = null;
  return advance(s);
}

/** Start Transcribe: choose a card in deck to upgrade. */
export function startTranscribe(run) {
  if (run.phase !== 'rest') return run;
  const s = structuredClone(run);
  // Only cards that have an upgrade and aren't already upgraded
  const upgradeable = s.player.deck.filter((c) => {
    const def = effectiveCard(c);
    return !c.upgraded && def.upgrade;
  });
  s.transcribe = { options: upgradeable };
  return s;
}

/** Finish Transcribe: upgrade card with `uid`. */
export function finishTranscribe(run, uid) {
  if (!run.transcribe) return run;
  const s = structuredClone(run);
  const card = s.player.deck.find((c) => c.uid === uid);
  if (card) card.upgraded = true;
  s.transcribe = null;
  return advance(s);
}

/** Standard rest: heal then advance. */
export function rest(run) {
  if (run.phase !== 'rest') return run;
  const s = structuredClone(run);
  s.player.hp = Math.min(s.player.maxHp, s.player.hp + Math.floor(s.player.maxHp * REST_HEAL));
  return advance(s);
}

function advance(s) {
  s.combat = null;
  s.compose = null;
  s.transcribe = null;
  s.floor += 1;
  s.phase = s.floor >= s.nodes.length ? 'won' : 'map';
  return s;
}
