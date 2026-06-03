// src/ui/app.js
//
// Thin presentation layer. It owns no game rules — it holds a `run` state,
// renders it to the DOM, and routes taps back into the pure core
// (run.js / combat.js). Re-render is dumb-simple: rebuild the screen from
// state on every change. Plenty fast for a card game, and it keeps the UI a
// pure function of state, mirroring the project's core/shell split.

import {
  newRun, enterNode, resolveCombat, chooseReward, rest, currentNode,
} from '../core/run.js';
import {
  playCard, endTurn, canPlay, aliveEnemies, isOver, intentPreview,
} from '../core/combat.js';
import { getCard } from '../core/cards.js';

const SAVE_KEY = 'spireling:run';
const app = document.getElementById('app');

let run = loadRun();
let selected = null; // selected hand index awaiting a target

// --- persistence ------------------------------------------------------------

function saveRun() {
  try {
    if (run) localStorage.setItem(SAVE_KEY, JSON.stringify(run));
    else localStorage.removeItem(SAVE_KEY);
  } catch { /* storage may be unavailable; the game still works in-memory */ }
}

function loadRun() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setRun(next) {
  run = next;
  selected = null;
  saveRun();
  render();
}

// --- tiny DOM helper --------------------------------------------------------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) { if (typeof v === 'function') node.addEventListener(k.slice(2), v); }
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function clear() { app.replaceChildren(); }

// --- top-level render -------------------------------------------------------

function render() {
  clear();
  if (!run) return renderTitle();
  if (run._showDeck) return renderDeckOverlay();
  switch (run.phase) {
    case 'map': return renderMap();
    case 'combat': return renderCombat();
    case 'reward': return renderReward();
    case 'rest': return renderRest();
    case 'dead': return renderEnd(false);
    case 'won': return renderEnd(true);
    default: return renderTitle();
  }
}

// --- screens ----------------------------------------------------------------

function renderTitle() {
  app.appendChild(el('div', { class: 'screen center' }, [
    el('h1', { class: 'logo', text: 'SPIRELING' }),
    el('p', { class: 'tag', text: 'A pocket deck-building roguelike.' }),
    el('button', { class: 'btn big', onclick: () => setRun(newRun(randomSeed())) }, 'New Run'),
    el('p', { class: 'hint', text: 'Climb 8 floors. Build a deck. Beat the Colossus.' }),
  ]));
}

function renderMap() {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(header());
  const list = el('div', { class: 'map' });
  run.nodes.forEach((node, i) => {
    const done = i < run.floor;
    const here = i === run.floor;
    const row = el('div', {
      class: `mapnode ${done ? 'done' : ''} ${here ? 'here' : ''}`,
    }, [
      el('span', { class: 'mapicon', text: nodeIcon(node.type) }),
      el('span', { class: 'maplabel', text: nodeLabel(node) }),
      here ? el('span', { class: 'maphere', text: '◀ you are here' }) : null,
    ]);
    list.appendChild(row);
  });
  screen.appendChild(list);

  const node = currentNode(run);
  const cta = node.type === 'rest' ? 'Rest' : node.type === 'boss' ? 'Face the Boss' : 'Enter';
  screen.appendChild(footer([
    el('button', { class: 'btn', onclick: () => setRun(viewDeck(run)) }, `Deck (${run.player.deck.length})`),
    el('button', { class: 'btn primary', onclick: () => setRun(enterNode(run)) }, cta),
  ]));
  app.appendChild(screen);
}

function renderCombat() {
  const c = run.combat;
  const screen = el('div', { class: 'screen combat' });

  // Enemies
  const enemyRow = el('div', { class: 'enemies' });
  c.enemies.forEach((e) => {
    const dead = e.hp <= 0;
    const targetable = selected !== null && needsTarget(c.hand[selected]) && !dead;
    const card = el('div', {
      class: `enemy ${dead ? 'dead' : ''} ${targetable ? 'targetable' : ''}`,
      onclick: targetable ? () => play(selected, e.slot) : undefined,
    }, [
      el('div', { class: 'intent', text: intentText(e) }),
      el('div', { class: 'sprite', text: dead ? '💀' : enemySprite(e.id) }),
      el('div', { class: 'ename', text: e.name }),
      hpBar(e.hp, e.maxHp, e.block),
      statusRow(e.statuses),
    ]);
    enemyRow.appendChild(card);
  });
  screen.appendChild(enemyRow);

  // Player status bar
  screen.appendChild(el('div', { class: 'playerbar' }, [
    el('div', { class: 'pstat hp', text: `❤ ${c.player.hp}/${c.player.maxHp}` }),
    c.player.block > 0 ? el('div', { class: 'pstat block', text: `🛡 ${c.player.block}` }) : null,
    el('div', { class: 'pstat energy', text: `⚡ ${c.player.energy}/${c.player.maxEnergy}` }),
    statusRow(c.player.statuses, true),
  ]));

  // Hand
  const hand = el('div', { class: 'hand' });
  c.hand.forEach((card, i) => {
    const def = getCard(card.id);
    const playable = canPlay(c, i);
    const isSel = selected === i;
    hand.appendChild(el('div', {
      class: `card type-${def.type} ${playable ? '' : 'unplayable'} ${isSel ? 'selected' : ''}`,
      onclick: playable ? () => onCardTap(i) : undefined,
    }, [
      el('div', { class: 'cost', text: String(def.cost) }),
      el('div', { class: 'cname', text: def.name }),
      el('div', { class: 'ctext', text: def.text }),
    ]));
  });
  screen.appendChild(hand);

  screen.appendChild(footer([
    el('div', { class: 'piles', text: `Draw ${c.drawPile.length} · Disc ${c.discardPile.length}` }),
    el('button', { class: 'btn primary', onclick: onEndTurn }, 'End Turn'),
  ]));
  app.appendChild(screen);

  // If combat already resolved (e.g. fatal self-damage), surface it.
  if (isOver(c)) setTimeout(() => setRun(resolveCombat(run)), 350);
}

function renderReward() {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(el('h2', { class: 'title', text: 'Victory!' }));
  screen.appendChild(el('p', { class: 'hint', text: `+${run.reward.gold} gold · pick a card` }));
  const cards = el('div', { class: 'rewardcards' });
  run.reward.cards.forEach((id) => {
    const def = getCard(id);
    cards.appendChild(el('div', {
      class: `card type-${def.type}`,
      onclick: () => setRun(chooseReward(run, id)),
    }, [
      el('div', { class: 'cost', text: String(def.cost) }),
      el('div', { class: 'cname', text: def.name }),
      el('div', { class: 'ctext', text: def.text }),
    ]));
  });
  screen.appendChild(cards);
  screen.appendChild(footer([
    el('button', { class: 'btn', onclick: () => setRun(chooseReward(run, null)) }, 'Skip'),
  ]));
  app.appendChild(screen);
}

function renderRest() {
  const heal = Math.floor(run.player.maxHp * 0.3);
  app.appendChild(el('div', { class: 'screen center' }, [
    el('div', { class: 'sprite big', text: '🔥' }),
    el('h2', { class: 'title', text: 'A campfire' }),
    el('p', { class: 'hint', text: `Rest to heal ${heal} HP (${run.player.hp}/${run.player.maxHp}).` }),
    el('button', { class: 'btn big primary', onclick: () => setRun(rest(run)) }, 'Rest'),
  ]));
}

function renderEnd(won) {
  app.appendChild(el('div', { class: 'screen center' }, [
    el('div', { class: 'sprite big', text: won ? '👑' : '☠️' }),
    el('h1', { class: 'logo', text: won ? 'YOU WIN' : 'YOU DIED' }),
    el('p', { class: 'hint', text: won ? 'The Colossus falls. The spire is yours.' : `Fell on floor ${run.floor + 1}.` }),
    el('button', { class: 'btn big primary', onclick: () => setRun(newRun(randomSeed())) }, 'New Run'),
  ]));
}

// A read-only deck view stored as a transient flag on the run.
function viewDeck(r) { return { ...r, _showDeck: true }; }

// --- shared bits ------------------------------------------------------------

function header() {
  return el('div', { class: 'topbar' }, [
    el('div', { class: 'pstat hp', text: `❤ ${run.player.hp}/${run.player.maxHp}` }),
    el('div', { class: 'pstat', text: `Floor ${run.floor + 1}/${run.nodes.length}` }),
    el('div', { class: 'pstat', text: `🪙 ${run.player.gold}` }),
    el('button', { class: 'btn tiny', onclick: () => { if (confirm('Abandon this run?')) setRun(null); } }, '✕'),
  ]);
}

function footer(children) {
  return el('div', { class: 'footer' }, children);
}

function hpBar(hp, maxHp, block = 0) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  return el('div', { class: 'hpbar' }, [
    el('div', { class: 'hpfill', style: `width:${pct}%` }),
    el('div', { class: 'hptext', text: block > 0 ? `🛡${block}  ${hp}/${maxHp}` : `${hp}/${maxHp}` }),
  ]);
}

function statusRow(statuses, isPlayer = false) {
  const chips = [];
  if (statuses.strength) chips.push(chip('STR', statuses.strength, 'str'));
  if (statuses.vulnerable) chips.push(chip('VULN', statuses.vulnerable, 'vuln'));
  if (statuses.weak) chips.push(chip('WEAK', statuses.weak, 'weak'));
  return el('div', { class: `statuses ${isPlayer ? 'pstatuses' : ''}` }, chips);
}

function chip(label, n, kind) {
  return el('span', { class: `chip ${kind}`, text: `${label} ${n}` });
}

function intentText(e) {
  if (e.hp <= 0) return '';
  const p = intentPreview(e);
  if (!p) return '';
  if (p.damage > 0) return p.times > 1 ? `⚔ ${p.damage}×${p.times}` : `⚔ ${p.damage}`;
  if (p.intent === 'defend') return `🛡 ${p.block}`;
  if (p.intent === 'buff') return '💪 buff';
  if (p.intent === 'debuff') return '☣ debuff';
  return '…';
}

function nodeIcon(t) {
  return { combat: '⚔', elite: '☠', rest: '🔥', boss: '👑' }[t] || '•';
}
function nodeLabel(node) {
  if (node.type === 'rest') return 'Campfire';
  if (node.type === 'boss') return 'Boss · The Colossus';
  if (node.type === 'elite') return 'Elite';
  return 'Fight';
}
function enemySprite(id) {
  return {
    cultist: '🧙', jawWorm: '🪱', spikeSlime: '🟢', fungiBeast: '🍄',
    gremlinNob: '👹', theColossus: '🗿',
  }[id] || '👾';
}

function randomSeed() { return (Math.random() * 0x7fffffff) >>> 0; }

// --- interactions -----------------------------------------------------------

function onCardTap(i) {
  const c = run.combat;
  const card = c.hand[i];
  if (!needsTarget(card) || aliveEnemies(c).length === 1) {
    const target = aliveEnemies(c)[0];
    play(i, target ? target.slot : undefined);
    return;
  }
  selected = selected === i ? null : i; // toggle; enemies become tappable
  render();
}

function play(handIndex, targetSlot) {
  const next = playCard(run.combat, handIndex, targetSlot);
  run = { ...run, combat: next };
  selected = null;
  saveRun();
  if (isOver(next)) setRun(resolveCombat(run));
  else render();
}

function onEndTurn() {
  const next = endTurn(run.combat);
  run = { ...run, combat: next };
  selected = null;
  saveRun();
  if (isOver(next)) setRun(resolveCombat(run));
  else render();
}

/** Does playing this card require the player to choose a single enemy? */
function needsTarget(card) {
  if (!card) return false;
  return getCard(card.id).effects.some(
    (eff) => (eff.kind === 'damage' && eff.target === 'enemy')
      || eff.kind === 'damageFromBlock'
      || (eff.kind === 'status' && eff.target === 'enemy'),
  );
}

// --- deck overlay -----------------------------------------------------------

function renderDeckOverlay() {
  clear();
  const screen = el('div', { class: 'screen' });
  screen.appendChild(el('h2', { class: 'title', text: `Your Deck (${run.player.deck.length})` }));
  const grid = el('div', { class: 'deckgrid' });
  run.player.deck.forEach((card) => {
    const def = getCard(card.id);
    grid.appendChild(el('div', { class: `card mini type-${def.type}` }, [
      el('div', { class: 'cost', text: String(def.cost) }),
      el('div', { class: 'cname', text: def.name }),
    ]));
  });
  screen.appendChild(grid);
  screen.appendChild(footer([
    el('button', { class: 'btn primary', onclick: () => setRun({ ...run, _showDeck: false }) }, 'Back'),
  ]));
  app.appendChild(screen);
}

render();
