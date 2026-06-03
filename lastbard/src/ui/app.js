// src/ui/app.js — The Last Bard UI layer.
// Owns no game rules: holds a `run` state, renders it, routes taps.

import {
  newRun, enterNode, resolveCombat, chooseReward,
  rest, startCompose, finishCompose, startTranscribe, finishTranscribe,
  currentNode,
} from '../core/run.js';
import {
  playCard, endTurn, canPlay, aliveEnemies, isOver, intentPreview,
  chainStatus, previewChain,
} from '../core/combat.js';
import { getCard, effectiveCard } from '../core/cards.js';
import { createSpriteCanvas, createGlowCanvas } from './sprites.js';

const SAVE_KEY = 'lastbard:run';
const app = document.getElementById('app');
let run = loadRun();
let selectedHand = null;  // hand index selected awaiting a target
let glowHandle = null;    // for cancelling crescendo glow anim

// ─── persistence ────────────────────────────────────────────────────────────
function saveRun() {
  try { if (run) localStorage.setItem(SAVE_KEY, JSON.stringify(run)); else localStorage.removeItem(SAVE_KEY); }
  catch { /* ok */ }
}
function loadRun() {
  try { const r = localStorage.getItem(SAVE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function setRun(next) {
  run = next; selectedHand = null; saveRun(); render();
}

// ─── tiny DOM helper ─────────────────────────────────────────────────────────
function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}
function clear() { app.replaceChildren(); if (glowHandle) { glowHandle.stop(); glowHandle = null; } }

// ─── render dispatcher ───────────────────────────────────────────────────────
function render() {
  clear();
  if (!run) return renderTitle();
  if (run._deckView) return renderDeckView();
  if (run.compose) return renderCompose();
  if (run.transcribe) return renderTranscribe();
  switch (run.phase) {
    case 'map':    return renderMap();
    case 'combat': return renderCombat();
    case 'reward': return renderReward();
    case 'rest':   return renderRest();
    case 'dead':   return renderEnd(false);
    case 'won':    return renderEnd(true);
    default:       return renderTitle();
  }
}

// ─── TITLE ───────────────────────────────────────────────────────────────────
function renderTitle() {
  const screen = el('div', { class: 'screen center' });
  // Bard sprite, large
  const bardWrap = el('div', { style: 'position:relative;' });
  bardWrap.appendChild(createSpriteCanvas('bard', 3));
  screen.appendChild(bardWrap);
  screen.appendChild(el('h1', { class: 'logo', text: 'THE LAST BARD' }));
  screen.appendChild(el('p', { class: 'subtitle', text: 'The world has gone silent.\nOne melody remains.' }));
  screen.appendChild(el('button', { class: 'btn big primary', onclick: () => setRun(newRun(rnd())) }, 'Begin'));
  if (run === null) {
    screen.appendChild(el('p', { class: 'hint', text: 'Climb 8 floors.\nBuild your melody.\nBreak The Hush.' }));
  }
  app.appendChild(screen);
}

// ─── MAP ─────────────────────────────────────────────────────────────────────
function renderMap() {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(topBar());

  const list = el('div', { class: 'map-list' });
  run.nodes.forEach((node, i) => {
    const done = i < run.floor;
    const here = i === run.floor;
    const row = el('div', { class: `map-node ${done?'done':''} ${here?'here':''}` });
    row.appendChild(el('span', { class: 'map-icon', text: nodeIcon(node.type) }));
    row.appendChild(el('span', { class: 'map-label', text: nodeLabel(node, i) }));
    if (here) row.appendChild(el('span', { class: 'map-here', text: '◀' }));
    list.appendChild(row);
  });
  screen.appendChild(list);

  const node = currentNode(run);
  const cta = node.type === 'rest' ? 'Rest Here' : node.type === 'boss' ? 'Face the Hush' : 'Enter';
  screen.appendChild(footer([
    el('button', { class: 'btn tiny', onclick: () => setRun({ ...run, _deckView: true }) },
      `Deck (${run.player.deck.length})`),
    el('button', { class: 'btn primary', onclick: () => setRun(enterNode(run)) }, cta),
  ]));
  app.appendChild(screen);
}

// ─── COMBAT ──────────────────────────────────────────────────────────────────
function renderCombat() {
  const c = run.combat;
  const screen = el('div', { class: 'screen combat' });

  // Enemies row
  const enemyRow = el('div', { class: 'enemies-row' });
  c.enemies.forEach((e) => {
    const dead = e.hp <= 0;
    const targetable = selectedHand !== null && !dead && needsTarget(c.hand[selectedHand]);
    const card = el('div', {
      class: `enemy-card ${dead?'dead':''} ${targetable?'targetable':''}`,
      onclick: targetable ? () => playSelected(e.slot) : undefined,
    });
    const spriteWrap = el('div', { class: 'enemy-sprite-wrap' });
    spriteWrap.appendChild(createSpriteCanvas(spriteKey(e.id), 3));
    card.appendChild(el('div', { class: 'intent-text', text: dead ? '' : intentText(e) }));
    card.appendChild(spriteWrap);
    card.appendChild(el('div', { class: 'enemy-name', text: e.name }));
    card.appendChild(hpBar(e.hp, e.maxHp, e.block));
    card.appendChild(statusChips(e.statuses, false));
    enemyRow.appendChild(card);
  });
  screen.appendChild(enemyRow);

  // Chain strip
  screen.appendChild(buildChainStrip(c));

  // Player bar
  const pBar = el('div', { class: 'player-bar' });
  pBar.appendChild(el('span', { class: 'pstat hp', text: `♥ ${c.player.hp}/${c.player.maxHp}` }));
  if (c.player.block) pBar.appendChild(el('span', { class: 'pstat block', text: `◼ ${c.player.block}` }));
  pBar.appendChild(el('span', { class: 'pstat tempo', text: `♩ ${c.player.tempo}/${c.player.maxTempo}` }));
  pBar.appendChild(statusChips(c.player.statuses, true));
  screen.appendChild(pBar);

  // Hand
  const hand = el('div', { class: 'hand' });
  c.hand.forEach((inst, i) => {
    const def = effectiveCard(inst);
    const playable = canPlay(c, i);
    const isSel = selectedHand === i;
    const isMuted = (c.player.muted[def.note] || 0) > 0;
    const chainPreview = playable ? previewChain(c, def.note, isMuted) : 'neutral';
    const cardEl = buildCard(def, inst, {
      playable, selected: isSel, mini: false,
      chainPreview: chainPreview !== 'neutral' ? chainPreview : null,
      muted: isMuted,
    });
    if (playable) cardEl.addEventListener('click', () => onCardTap(i));
    hand.appendChild(cardEl);
  });
  screen.appendChild(hand);

  screen.appendChild(footer([
    el('div', { class: 'pile-info' }, [
      `Draw ${c.drawPile.length}`,
      el('br'),
      `Disc ${c.discardPile.length}`,
    ]),
    el('button', { class: 'btn primary', onclick: onEndTurn }, 'End Turn'),
  ]));

  app.appendChild(screen);
  if (isOver(c)) setTimeout(() => setRun(resolveCombat(run)), 400);
}

// ─── chain strip widget ───────────────────────────────────────────────────────
function buildChainStrip(c) {
  const wrap = el('div', { class: 'chain-strip' });

  // 3 slots showing last 3 notes in chain (or padded with empty)
  const chain = c.chain.slice(-3);
  while (chain.length < 3) chain.unshift(null);
  chain.forEach((note, i) => {
    const slot = el('div', { class: `chain-slot ${note ? `filled-${note}` : ''}` });
    if (note) {
      slot.appendChild(createSpriteCanvas(`note${cap(note)}`, 2));
    } else {
      slot.appendChild(el('div', { class: 'chain-dot' }));
    }
    wrap.appendChild(slot);
    if (i < 2) wrap.appendChild(el('div', { style: 'width:6px;height:4px;background:var(--border);margin-top:10px;' }));
  });

  // Chain status label
  const status = chainStatus(c);
  let label = '';
  if (status === 'harmony') label = 'HARMONY';
  else if (status === 'crescendo') label = '✦ CRESCENDO';
  if (label) wrap.appendChild(el('span', { class: `chain-label ${status}`, text: label }));

  // Muted indicator
  const muteRow = el('div', { class: 'muted-bar' });
  ['strike', 'ward', 'verse'].forEach((note) => {
    const n = c.player.muted[note] || 0;
    muteRow.appendChild(el('span', {
      class: `muted-chip ${n > 0 ? 'active' : ''}`,
      text: `${noteSymbol(note)}${n > 0 ? ' MUTED' : ''}`,
    }));
  });
  const container = el('div');
  container.appendChild(wrap);
  container.appendChild(muteRow);
  return container;
}

// ─── REWARD ───────────────────────────────────────────────────────────────────
function renderReward() {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(topBar());
  screen.appendChild(el('h2', { class: 'screen-title', text: 'VICTORY' }));
  screen.appendChild(el('p', { class: 'hint', text: `+${run.reward.gold} gold  |  Choose a card` }));

  const cards = el('div', { class: 'reward-cards' });
  run.reward.cards.forEach((id) => {
    const def = getCard(id);
    const cardEl = buildCard(def, { id, upgraded: false }, { playable: true });
    cardEl.classList.add('reward-card');
    cardEl.addEventListener('click', () => setRun(chooseReward(run, id, null)));
    cards.appendChild(cardEl);
  });
  screen.appendChild(cards);

  if (run.reward.relicOffer && run.reward.relicOffer.length) {
    screen.appendChild(el('p', { class: 'hint', text: 'Elite relic  —  choose one:' }));
    const relicRow = el('div', { class: 'relic-row' });
    run.reward.relicOffer.forEach((relic) => {
      const rc = el('div', { class: 'relic-card', onclick: () => setRun(chooseReward(run, null, relic.id)) });
      rc.appendChild(el('div', { class: 'relic-name', text: relic.name }));
      rc.appendChild(el('div', { class: 'relic-text', text: relic.text }));
      relicRow.appendChild(rc);
    });
    screen.appendChild(relicRow);
  }

  screen.appendChild(footer([
    el('button', { class: 'btn tiny', onclick: () => setRun({ ...run, _deckView: true }) }, 'View Deck'),
    el('button', { class: 'btn', onclick: () => setRun(chooseReward(run, null, null)) }, 'Skip'),
  ]));
  app.appendChild(screen);
}

// ─── REST ─────────────────────────────────────────────────────────────────────
function renderRest() {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(topBar());
  screen.appendChild(el('h2', { class: 'screen-title', text: 'CAMPFIRE' }));
  screen.appendChild(el('p', { class: 'hint', text: 'Catch your breath.' }));

  const choices = el('div', { class: 'rest-choices' });

  const heal = Math.floor(run.player.maxHp * 0.30);
  addRestChoice(choices, 'RECOVER', `Heal ${heal} HP (${run.player.hp}→${Math.min(run.player.maxHp, run.player.hp+heal)})`,
    () => setRun(rest(run)));
  addRestChoice(choices, 'COMPOSE', 'Peek your next 5 draws and pin 1 to the top.',
    () => setRun(startCompose(run)));
  const upgradeable = run.player.deck.filter((c) => !c.upgraded && getCard(c.id).upgrade).length;
  if (upgradeable > 0) {
    addRestChoice(choices, 'TRANSCRIBE', `Upgrade a card in your deck (${upgradeable} eligible).`,
      () => setRun(startTranscribe(run)));
  }
  screen.appendChild(choices);
  app.appendChild(screen);
}

function addRestChoice(parent, title, desc, fn) {
  const opt = el('div', { class: 'rest-option', onclick: fn });
  opt.appendChild(el('div', { class: 'rest-option-title', text: title }));
  opt.appendChild(el('div', { class: 'rest-option-desc', text: desc }));
  parent.appendChild(opt);
}

// ─── COMPOSE ─────────────────────────────────────────────────────────────────
function renderCompose() {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(topBar());
  screen.appendChild(el('h2', { class: 'screen-title', text: 'COMPOSE' }));
  screen.appendChild(el('p', { class: 'hint', text: 'Tap a card to pin it as your first draw next fight.' }));
  const cards = el('div', { class: 'compose-cards' });
  run.compose.peeked.forEach((inst) => {
    const def = effectiveCard(inst);
    const c = buildCard(def, inst, { playable: true, mini: false });
    c.classList.add('compose-card');
    c.addEventListener('click', () => setRun(finishCompose(run, inst.uid)));
    cards.appendChild(c);
  });
  screen.appendChild(cards);
  screen.appendChild(footer([
    el('button', { class: 'btn', onclick: () => setRun(finishCompose(run, null)) }, 'Skip'),
  ]));
  app.appendChild(screen);
}

// ─── TRANSCRIBE ───────────────────────────────────────────────────────────────
function renderTranscribe() {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(topBar());
  screen.appendChild(el('h2', { class: 'screen-title', text: 'TRANSCRIBE' }));
  screen.appendChild(el('p', { class: 'hint', text: 'Upgrade one card.' }));
  const grid = el('div', { class: 'deck-grid' });
  run.transcribe.options.forEach((inst) => {
    const def = getCard(inst.id);
    const c = buildCard(def, inst, { mini: true, playable: true });
    c.addEventListener('click', () => setRun(finishTranscribe(run, inst.uid)));
    grid.appendChild(c);
  });
  screen.appendChild(grid);
  screen.appendChild(footer([
    el('button', { class: 'btn', onclick: () => setRun(finishTranscribe(run, null)) }, 'Skip'),
  ]));
  app.appendChild(screen);
}

// ─── DECK VIEW ───────────────────────────────────────────────────────────────
function renderDeckView() {
  const screen = el('div', { class: 'screen' });
  const isInCombat = run.phase === 'combat';
  screen.appendChild(el('h2', { class: 'screen-title', text: `DECK (${run.player.deck.length})` }));
  const grid = el('div', { class: 'deck-grid' });
  run.player.deck.forEach((inst) => {
    const def = effectiveCard(inst);
    grid.appendChild(buildCard(def, inst, { mini: true }));
  });
  screen.appendChild(grid);
  screen.appendChild(footer([
    el('button', { class: 'btn primary', onclick: () => setRun({ ...run, _deckView: false }) }, 'Back'),
  ]));
  if (run.player.relics.length) {
    const relicBar = el('div', { style: 'padding:6px 2px;' });
    relicBar.appendChild(el('p', { class: 'hint', text: 'Relics:' }));
    run.player.relics.forEach((r) => {
      relicBar.appendChild(el('div', { class: 'relic-card', style: 'cursor:default;' }, [
        el('div', { class: 'relic-name', text: r.name }),
        el('div', { class: 'relic-text', text: r.text }),
      ]));
    });
    screen.appendChild(relicBar);
  }
  app.appendChild(screen);
}

// ─── END ─────────────────────────────────────────────────────────────────────
function renderEnd(won) {
  const screen = el('div', { class: 'screen' });
  const end = el('div', { class: 'end-screen' });
  // Show bard sprite or Hush depending on outcome
  end.appendChild(createSpriteCanvas(won ? 'bard' : 'theHush', won ? 4 : 2));
  end.appendChild(el('div', { class: `end-title ${won?'won':'lost'}`, text: won ? 'THE HUSH FALLS' : 'SILENCED' }));
  end.appendChild(el('p', { class: 'hint', text: won ? 'The Last Melody echoes forever.' : `Fell on floor ${run.floor + 1}.` }));
  end.appendChild(el('button', { class: 'btn big primary', onclick: () => setRun(newRun(rnd())) }, 'Play Again'));
  screen.appendChild(end);
  app.appendChild(screen);
}

// ─── shared widgets ──────────────────────────────────────────────────────────
function topBar() {
  const bar = el('div', { class: 'topbar' });
  bar.appendChild(el('span', { class: 'pstat hp', text: `♥ ${run.player.hp}/${run.player.maxHp}` }));
  bar.appendChild(el('span', { class: 'pstat gold', text: `$ ${run.player.gold}` }));
  bar.appendChild(el('span', { class: 'pstat', text: `F${run.floor + 1}/${run.nodes.length}` }));
  bar.appendChild(el('button', {
    class: 'btn tiny',
    onclick: () => { if (confirm('Abandon run?')) setRun(null); },
  }, '✕'));
  return bar;
}

function footer(children) {
  return el('div', { class: 'footer' }, children);
}

function hpBar(hp, maxHp, block = 0) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const bar = el('div', { class: 'hpbar' });
  bar.appendChild(el('div', { class: 'hpfill', style: `width:${pct}%` }));
  bar.appendChild(el('div', { class: 'hptext', text: block > 0 ? `◼${block} ${hp}/${maxHp}` : `${hp}/${maxHp}` }));
  return bar;
}

function statusChips(statuses, isPlayer) {
  const row = el('div', { class: 'statuses' });
  if (statuses.forte)     row.appendChild(el('span', { class: 'chip forte',   text: `FRT ${statuses.forte}` }));
  if (statuses.exposed)   row.appendChild(el('span', { class: 'chip exposed', text: `EXP ${statuses.exposed}` }));
  if (statuses.diminuendo)row.appendChild(el('span', { class: 'chip diminu',  text: `DIM ${statuses.diminuendo}` }));
  if (statuses.discordant)row.appendChild(el('span', { class: 'chip discord', text: `DIS ${statuses.discordant}` }));
  if (isPlayer && statuses.resonant) row.appendChild(el('span', { class: 'chip resonant', text: `RES ${statuses.resonant}` }));
  return row;
}

function buildCard(def, inst, { playable = false, selected = false, mini = false, chainPreview = null, muted = false } = {}) {
  const upgraded = inst && inst.upgraded;
  const card = el('div', {
    class: [
      'card',
      `note-${def.note}`,
      !playable && !mini ? 'unplayable' : '',
      selected ? 'selected' : '',
      mini ? 'mini' : '',
      upgraded ? 'upgraded' : '',
    ].filter(Boolean).join(' '),
  });
  card.appendChild(el('div', { class: 'card-cost', text: String(def.cost) }));
  // Note icon via sprite canvas
  const noteCanvas = createSpriteCanvas(`note${cap(def.note)}`, 2);
  noteCanvas.className = 'card-note-icon';
  card.appendChild(noteCanvas);
  card.appendChild(el('div', { class: 'card-name', text: def.name + (upgraded ? '+' : '') }));
  if (!mini) {
    card.appendChild(el('div', { class: 'card-text', text: def.text + (muted ? ' [MUTED +1]' : '') }));
    card.appendChild(el('div', { class: 'card-type-badge', text: def.note.toUpperCase() }));
    if (chainPreview) {
      card.appendChild(el('div', {
        class: `card-chain-preview ${chainPreview}`,
        text: chainPreview === 'crescendo' ? '✦ CRESCENDO' : '♦ HARMONY',
      }));
    }
  }
  return card;
}

// ─── interaction handlers ─────────────────────────────────────────────────────
function onCardTap(i) {
  const c = run.combat;
  const inst = c.hand[i];
  if (!inst) return;
  if (!needsTarget(inst) || aliveEnemies(c).length <= 1) {
    const target = aliveEnemies(c)[0];
    doPlay(i, target ? target.slot : 0);
    return;
  }
  selectedHand = selectedHand === i ? null : i;
  render();
}

function playSelected(slot) {
  if (selectedHand === null) return;
  doPlay(selectedHand, slot);
}

function doPlay(handIndex, targetSlot) {
  const next = playCard(run.combat, handIndex, targetSlot);
  run = { ...run, combat: next };
  selectedHand = null;
  saveRun();
  if (isOver(next)) { setTimeout(() => setRun(resolveCombat(run)), 400); }
  else render();
}

function onEndTurn() {
  const next = endTurn(run.combat);
  run = { ...run, combat: next };
  selectedHand = null;
  saveRun();
  if (isOver(next)) setRun(resolveCombat(run));
  else render();
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function needsTarget(inst) {
  if (!inst) return false;
  return effectiveCard(inst).effects.some((e) =>
    (e.kind === 'damage' && e.target === 'enemy')
    || e.kind === 'damageFromBlock'
    || (e.kind === 'status' && e.target === 'enemy'),
  );
}

function intentText(e) {
  const p = intentPreview(e);
  if (!p) return '?';
  const parts = [];
  if (p.damage > 0) parts.push(p.times > 1 ? `⚔ ${p.damage}×${p.times}` : `⚔ ${p.damage}`);
  if (p.block > 0)  parts.push(`◼ ${p.block}`);
  if (!parts.length) {
    const icons = { buff:'💪', debuff:'☣', defend:'◼' };
    return icons[p.intent] || '…';
  }
  return parts.join(' ');
}

function nodeIcon(t) { return { combat:'⚔', elite:'☠', rest:'🔥', boss:'💀' }[t] || '•'; }
function nodeLabel(node, i) {
  const labels = { combat:`Fight`, elite:`Elite`, rest:`Campfire`, boss:`THE HUSH` };
  return labels[node.type] || node.type;
}
function spriteKey(id) {
  const map = {
    hushWisp:'hushWisp', paleMinstrel:'paleMinstrel',
    echoPhantom:'echoPhantom', discordSprite:'discordSprite',
    brokenConductor:'brokenConductor', theHush:'theHush',
  };
  return map[id] || 'hushWisp';
}
function noteSymbol(note) { return { strike:'♩', ward:'♪', verse:'♫' }[note] || '•'; }
function cap(s) { return s[0].toUpperCase() + s.slice(1); }
function rnd() { return (Math.random() * 0x7fffffff) >>> 0; }

render();
