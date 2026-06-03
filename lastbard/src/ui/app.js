// src/ui/app.js — The Last Bard UI orchestration.
//
// Owns no rules. It renders `run` state to the DOM, and for combat it drives
// the Arena (canvas) so that every pure-core state transition is *played out*
// with animation before the new state is committed. The arena persists across
// DOM re-renders (the canvas node is moved, not recreated) so its rAF loop and
// effects keep running smoothly.

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
import { createSpriteCanvas, ENEMY_SPRITE } from './sprites.js';
import { Arena } from './arena.js';

const SAVE_KEY = 'lastbard:run';
const NOTE_COLOR = { strike: '#ff5e7a', ward: '#3afae0', verse: '#ffe24a' };
const app = document.getElementById('app');

let run = loadRun();
let selectedHand = null;
let arena = null;
let arenaCanvas = null;
let mountedKey = null;
let animating = false;
let resizeObs = null;

// ── persistence ──────────────────────────────────────────────────────────────
function saveRun() {
  try { run ? localStorage.setItem(SAVE_KEY, JSON.stringify(run)) : localStorage.removeItem(SAVE_KEY); } catch {}
}
function loadRun() {
  try { const r = localStorage.getItem(SAVE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function setRun(next) { run = next; selectedHand = null; saveRun(); render(); }

// ── dom helper ────────────────────────────────────────────────────────────────
function el(tag, props = {}, kids = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) { if (c == null) continue; n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
  return n;
}
function clearApp() { app.replaceChildren(); }

// ── render dispatcher ─────────────────────────────────────────────────────────
function render() {
  // tear down arena when leaving combat
  if (run?.phase !== 'combat' && arena) { teardownArena(); }
  clearApp();
  if (!run) return renderTitle();
  if (run._deckView) return renderDeckView();
  if (run.compose) return renderCompose();
  if (run.transcribe) return renderTranscribe();
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

function teardownArena() {
  if (arena) arena.stop();
  if (resizeObs) { try { resizeObs.disconnect(); } catch {} resizeObs = null; }
  arena = null; arenaCanvas = null; mountedKey = null;
}

// ════════════════════════════════════════════════════════════════════════════
//  COMBAT
// ════════════════════════════════════════════════════════════════════════════
function renderCombat() {
  const c = run.combat;
  const key = `${run.seed}:${run.floor}`;

  const root = el('div', { class: 'combat' });
  const arenaWrap = el('div', { class: 'arena-wrap' });

  // (re)mount arena for a new fight, else reuse the live canvas
  if (key !== mountedKey || !arena) {
    teardownArena();
    arenaCanvas = el('canvas', { class: 'arena-canvas' });
    arenaWrap.appendChild(arenaCanvas);
    arena = new Arena(arenaCanvas);
    arena.onActorTap = onArenaTap;
    arena.setCombatants({ sprite: 'bard', hp: c.player.hp, maxHp: c.player.maxHp, block: c.player.block },
      enemyDescs(c));
    arena.start();
    mountedKey = key;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(() => arena && arena.resize());
      resizeObs.observe(arenaWrap);
    }
    requestAnimationFrame(() => arena && arena.resize());
  } else {
    arenaWrap.appendChild(arenaCanvas); // move existing canvas into fresh DOM
    if (!animating) arena.syncStats(c.player, enemyDescs(c));
    requestAnimationFrame(() => arena && arena.resize());
  }

  // HUD overlay (top): hp + tempo orbs + floor + menu
  arenaWrap.appendChild(buildHudTop(c));
  // HUD overlay (chain strip)
  arenaWrap.appendChild(buildChainStrip(c));
  root.appendChild(arenaWrap);

  // tray: fanned hand + footer
  root.appendChild(buildTray(c));
  app.appendChild(root);
}

function enemyDescs(c) {
  return c.enemies.map((e) => ({
    id: `e${e.slot}`, slot: e.slot, sprite: ENEMY_SPRITE[e.id] || 'hushWisp',
    hp: e.hp, maxHp: e.maxHp, block: e.block, intent: e.hp > 0 ? intentPreview(e) : null,
  }));
}

function buildHudTop(c) {
  const hud = el('div', { class: 'hud-top' });
  const left = el('div', { class: 'hud-left' });
  left.appendChild(el('div', { class: 'hud-hp' }, [
    el('span', { class: 'heart', text: '♥' }),
    el('span', { text: `${c.player.hp}/${c.player.maxHp}` }),
    c.player.block ? el('span', { class: 'hud-block', text: `▢${c.player.block}` }) : null,
  ]));
  // tempo orbs
  const orbs = el('div', { class: 'tempo-orbs' });
  for (let i = 0; i < c.player.maxTempo; i++) {
    orbs.appendChild(el('div', { class: `orb ${i < c.player.tempo ? 'full' : ''}` }));
  }
  left.appendChild(orbs);
  // player statuses
  left.appendChild(statusChips(c.player.statuses, true));
  hud.appendChild(left);

  const right = el('div', { class: 'hud-right' });
  right.appendChild(el('div', { class: 'hud-floor', text: `F${run.floor + 1}/${run.nodes.length}` }));
  right.appendChild(el('button', { class: 'icon-btn', onclick: () => { if (confirm('Abandon run?')) setRun(null); } }, '✕'));
  hud.appendChild(right);
  return hud;
}

function buildChainStrip(c) {
  const wrap = el('div', { class: 'hud-chain' });
  const strip = el('div', { class: 'chain-row' });
  const chain = c.chain.slice(-3);
  while (chain.length < 3) chain.unshift(null);
  chain.forEach((note, i) => {
    if (i > 0) strip.appendChild(el('div', { class: 'chain-link' }));
    const slot = el('div', { class: `chain-slot ${note ? 'f-' + note : ''}` });
    if (note) slot.appendChild(noteIcon(note, 2));
    else slot.appendChild(el('div', { class: 'chain-dot' }));
    strip.appendChild(slot);
  });
  const status = chainStatus(c);
  if (status === 'harmony') strip.appendChild(el('div', { class: 'chain-tag harmony', text: 'HARMONY' }));
  else if (status === 'crescendo') strip.appendChild(el('div', { class: 'chain-tag crescendo', text: '✦CRESCENDO' }));
  wrap.appendChild(strip);

  // muted note indicators (only show if any active)
  const anyMuted = ['strike', 'ward', 'verse'].some((nt) => c.player.muted[nt] > 0);
  if (anyMuted) {
    const mrow = el('div', { class: 'muted-row' });
    ['strike', 'ward', 'verse'].forEach((nt) => {
      const n = c.player.muted[nt] || 0;
      if (n > 0) mrow.appendChild(el('div', { class: 'muted-tag', text: `${noteGlyph(nt)} MUTED ${n}` }));
    });
    wrap.appendChild(mrow);
  }
  return wrap;
}

function buildTray(c) {
  const tray = el('div', { class: 'tray' });

  const hand = el('div', { class: 'hand' });
  const n = c.hand.length;
  c.hand.forEach((inst, i) => {
    const def = effectiveCard(inst);
    const playable = canPlay(c, i) && !animating;
    const isSel = selectedHand === i;
    const isMuted = (c.player.muted[def.note] || 0) > 0;
    const preview = playable ? previewChain(c, def.note, isMuted) : 'neutral';
    const card = buildCard(def, inst, { playable, selected: isSel, chainPreview: preview !== 'neutral' ? preview : null, muted: isMuted });
    // fan layout
    const mid = (n - 1) / 2;
    const off = i - mid;
    const rot = off * 4;
    const ty = Math.abs(off) ** 1.4 * 5;
    card.style.setProperty('--rot', `${rot}deg`);
    card.style.setProperty('--ty', `${ty}px`);
    card.style.zIndex = String(isSel ? 100 : 10 + i);
    if (playable) card.addEventListener('click', () => onCardTap(i));
    hand.appendChild(card);
  });
  tray.appendChild(hand);

  const foot = el('div', { class: 'tray-foot' });
  foot.appendChild(el('div', { class: 'piles' }, [
    el('span', { class: 'pile', text: `⛁ ${c.drawPile.length}` }),
    el('span', { class: 'pile', text: `♺ ${c.discardPile.length}` }),
    el('button', { class: 'mini-btn', onclick: () => setRun({ ...run, _deckView: true }) }, 'Deck'),
  ]));
  foot.appendChild(el('button', { class: 'btn end-turn', onclick: onEndTurn }, 'END TURN ▸'));
  tray.appendChild(foot);
  return tray;
}

// ── combat interactions ───────────────────────────────────────────────────────
function onCardTap(i) {
  if (animating) return;
  const c = run.combat;
  const inst = c.hand[i];
  if (!inst || !canPlay(c, i)) return;
  if (!needsTarget(inst) || aliveEnemies(c).length <= 1) {
    const t = aliveEnemies(c)[0];
    doPlay(i, t ? t.slot : 0);
    return;
  }
  if (selectedHand === i) { selectedHand = null; arena.setTargetable([]); renderCombatOverlayOnly(); return; }
  selectedHand = i;
  arena.setTargetable(aliveEnemies(c).map((e) => `e${e.slot}`));
  renderCombatOverlayOnly();
}

function onArenaTap(actorId) {
  if (animating) return;
  if (selectedHand === null) return;
  if (!actorId.startsWith('e')) return;
  const slot = parseInt(actorId.slice(1), 10);
  const e = run.combat.enemies.find((x) => x.slot === slot && x.hp > 0);
  if (!e) return;
  const idx = selectedHand;
  selectedHand = null;
  arena.setTargetable([]);
  doPlay(idx, slot);
}

// Lightweight refresh that keeps the arena but rebuilds HUD/tray (e.g. selection)
function renderCombatOverlayOnly() { render(); }

async function doPlay(handIndex, targetSlot) {
  if (animating) return;
  const prev = run.combat;
  if (!canPlay(prev, handIndex)) return;
  const inst = prev.hand[handIndex];
  const def = effectiveCard(inst);
  const next = playCard(prev, handIndex, targetSlot);
  if (next === prev) return;

  animating = true;
  arena.setTargetable([]);
  await animateCardPlay(prev, next, def, targetSlot);
  run = { ...run, combat: next };
  saveRun();
  animating = false;

  if (isOver(next)) {
    setTimeout(() => setRun(resolveCombat(run)), 450);
  } else {
    arena.syncStats(next.player, enemyDescs(next));
    render();
  }
}

async function animateCardPlay(prev, next, def, targetSlot) {
  const note = def.note;
  const color = NOTE_COLOR[note];
  const crescendoNow = next.crescendoFired && !prev.crescendoFired;
  const chainAdvanced = next.chain.length > prev.chain.length;
  const harmonyNow = !crescendoNow && chainAdvanced && chainStatus(next) === 'harmony';

  // enemy hp deltas by slot
  const deltas = prev.enemies.map((e) => {
    const after = next.enemies.find((x) => x.slot === e.slot);
    return { slot: e.slot, id: `e${e.slot}`, dmg: e.hp - (after ? after.hp : 0), killed: after && after.hp <= 0 && e.hp > 0 };
  });

  const applyImpact = () => {
    let any = false;
    for (const d of deltas) {
      if (d.dmg > 0) {
        any = true;
        arena.hurt(d.id, 'player', d.dmg);
        arena.floatText(d.id, `-${d.dmg}`, '#ff8a9e');
        const a = arena.actors.get(d.id); if (a) a.hp = next.enemies.find((x) => x.slot === d.slot).hp;
      }
    }
    if (any) arena.hitstop(70);
    if (crescendoNow) arena.crescendo();
    else if (harmonyNow) arena.harmonyPing(color);
  };

  if (note === 'strike') {
    const tslot = next.enemies.find((e) => e.slot === targetSlot) ? targetSlot : (aliveEnemies(prev)[0] || {}).slot;
    await arena.attack('player', `e${tslot}`, applyImpact);
    if (crescendoNow) { arena.floatText('player', '✦ CRESCENDO', '#ffd23f', true); }
  } else if (note === 'ward') {
    await arena.guard('player');
    const blockGain = next.player.block - prev.player.block;
    if (blockGain > 0) arena.floatText('player', `▢ +${blockGain}`, '#7fdcff');
    applyImpact(); // wards can still chain into crescendo (heal+block handled by stat sync)
    if (crescendoNow) arena.floatText('player', '✦ CRESCENDO', '#ffd23f', true);
  } else { // verse
    await arena.cast('player', color);
    applyImpact();
    if (crescendoNow) arena.floatText('player', '✦ CRESCENDO', '#ffd23f', true);
    else if (harmonyNow) arena.floatText('player', 'HARMONY', color);
  }

  // reconcile remaining stats (block/heal/intents/kills)
  arena.syncStats(next.player, enemyDescs(next));
  const heal = next.player.hp - prev.player.hp;
  if (heal > 0) arena.floatText('player', `+${heal}`, '#8fff9e');
  await wait(140);
}

async function onEndTurn() {
  if (animating) return;
  const prev = run.combat;
  if (prev.phase !== 'player') return;
  animating = true;
  arena.setTargetable([]);

  // gather telegraphed intents before resolving
  const actors = aliveEnemies(prev).map((e) => ({ id: `e${e.slot}`, slot: e.slot, preview: intentPreview(e) }));
  const next = endTurn(prev);

  for (const act of actors) {
    const pv = act.preview;
    if (!pv) continue;
    if (pv.damage > 0) {
      await arena.attack(act.id, 'player', () => {
        const dmg = pv.times > 1 ? pv.damage * pv.times : pv.damage;
        arena.hurt('player', 'enemy', dmg);
        arena.floatText('player', `-${dmg}`, '#ff5e7a');
        arena.hitstop(60);
      });
    } else if (pv.intent === 'defend' || pv.block > 0) {
      await arena.guard(act.id);
      arena.floatText(act.id, `▢ +${pv.block}`, '#7fdcff');
    } else {
      await arena.cast(act.id, '#b6b6cc');
      arena.floatText(act.id, pv.intent === 'buff' ? 'STR↑' : 'HEX', '#c9a0ff');
    }
    await wait(120);
  }

  // settle to truth
  run = { ...run, combat: next };
  saveRun();
  animating = false;

  if (isOver(next)) {
    arena.floatText('player', 'SILENCED', '#ff5e7a', true);
    setTimeout(() => setRun(resolveCombat(run)), 700);
  } else {
    arena.syncStats(next.player, enemyDescs(next));
    render();
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ════════════════════════════════════════════════════════════════════════════
//  NON-COMBAT SCREENS
// ════════════════════════════════════════════════════════════════════════════
function renderTitle() {
  const s = el('div', { class: 'screen center title-screen' });
  const stage = el('div', { class: 'title-stage' });
  stage.appendChild(createSpriteCanvas('bard', 5));
  s.appendChild(stage);
  s.appendChild(el('h1', { class: 'logo', text: 'THE LAST BARD' }));
  s.appendChild(el('p', { class: 'subtitle', text: 'The world has gone silent.\nOne melody remains.' }));
  s.appendChild(el('button', { class: 'btn big primary', onclick: () => setRun(newRun(rnd())) }, 'BEGIN'));
  app.appendChild(s);
}

function renderMap() {
  const s = el('div', { class: 'screen' });
  s.appendChild(topBar());
  const list = el('div', { class: 'map-list' });
  run.nodes.forEach((node, i) => {
    const done = i < run.floor, here = i === run.floor;
    const row = el('div', { class: `map-node ${done ? 'done' : ''} ${here ? 'here' : ''}` });
    row.appendChild(el('span', { class: 'map-icon', text: nodeIcon(node.type) }));
    row.appendChild(el('span', { class: 'map-label', text: nodeLabel(node) }));
    if (here) row.appendChild(el('span', { class: 'map-here', text: '◀' }));
    list.appendChild(row);
  });
  s.appendChild(list);
  const node = currentNode(run);
  const cta = node.type === 'rest' ? 'REST' : node.type === 'boss' ? 'FACE THE HUSH' : 'ENTER';
  s.appendChild(footer([
    el('button', { class: 'btn ghost', onclick: () => setRun({ ...run, _deckView: true }) }, `Deck ${run.player.deck.length}`),
    el('button', { class: 'btn primary', onclick: () => setRun(enterNode(run)) }, cta),
  ]));
  app.appendChild(s);
}

function renderReward() {
  const s = el('div', { class: 'screen' });
  s.appendChild(topBar());
  s.appendChild(el('h2', { class: 'screen-title', text: 'VICTORY' }));
  s.appendChild(el('p', { class: 'hint', text: `+${run.reward.gold} gold  ·  choose a card` }));
  const cards = el('div', { class: 'reward-cards' });
  run.reward.cards.forEach((id) => {
    const def = getCard(id);
    const card = buildCard(def, { id, upgraded: false }, { playable: true });
    card.addEventListener('click', () => setRun(chooseReward(run, id, null)));
    cards.appendChild(card);
  });
  s.appendChild(cards);
  if (run.reward.relicOffer?.length) {
    s.appendChild(el('p', { class: 'hint', text: 'elite relic — choose one' }));
    const row = el('div', { class: 'relic-row' });
    run.reward.relicOffer.forEach((relic) => {
      row.appendChild(el('div', { class: 'relic-card', onclick: () => setRun(chooseReward(run, null, relic.id)) }, [
        el('div', { class: 'relic-name', text: relic.name }),
        el('div', { class: 'relic-text', text: relic.text }),
      ]));
    });
    s.appendChild(row);
  }
  s.appendChild(footer([
    el('button', { class: 'btn ghost', onclick: () => setRun({ ...run, _deckView: true }) }, 'Deck'),
    el('button', { class: 'btn', onclick: () => setRun(chooseReward(run, null, null)) }, 'Skip'),
  ]));
  app.appendChild(s);
}

function renderRest() {
  const s = el('div', { class: 'screen' });
  s.appendChild(topBar());
  s.appendChild(el('h2', { class: 'screen-title', text: 'CAMPFIRE' }));
  const choices = el('div', { class: 'rest-choices' });
  const heal = Math.floor(run.player.maxHp * 0.3);
  restOpt(choices, 'RECOVER', `Heal ${heal} HP`, () => setRun(rest(run)));
  restOpt(choices, 'COMPOSE', 'Peek your next 5 draws, pin 1 to the top.', () => setRun(startCompose(run)));
  const up = run.player.deck.filter((c) => !c.upgraded && getCard(c.id).upgrade).length;
  if (up > 0) restOpt(choices, 'TRANSCRIBE', `Upgrade a card (${up} eligible).`, () => setRun(startTranscribe(run)));
  s.appendChild(choices);
  app.appendChild(s);
}
function restOpt(parent, title, desc, fn) {
  parent.appendChild(el('div', { class: 'rest-option', onclick: fn }, [
    el('div', { class: 'rest-title', text: title }),
    el('div', { class: 'rest-desc', text: desc }),
  ]));
}

function renderCompose() {
  const s = el('div', { class: 'screen' });
  s.appendChild(topBar());
  s.appendChild(el('h2', { class: 'screen-title', text: 'COMPOSE' }));
  s.appendChild(el('p', { class: 'hint', text: 'Pin one card as your first draw next fight.' }));
  const cards = el('div', { class: 'reward-cards' });
  run.compose.peeked.forEach((inst) => {
    const card = buildCard(effectiveCard(inst), inst, { playable: true });
    card.addEventListener('click', () => setRun(finishCompose(run, inst.uid)));
    cards.appendChild(card);
  });
  s.appendChild(cards);
  s.appendChild(footer([el('button', { class: 'btn', onclick: () => setRun(finishCompose(run, null)) }, 'Skip')]));
  app.appendChild(s);
}

function renderTranscribe() {
  const s = el('div', { class: 'screen' });
  s.appendChild(topBar());
  s.appendChild(el('h2', { class: 'screen-title', text: 'TRANSCRIBE' }));
  s.appendChild(el('p', { class: 'hint', text: 'Upgrade one card.' }));
  const grid = el('div', { class: 'deck-grid' });
  run.transcribe.options.forEach((inst) => {
    const card = buildCard(getCard(inst.id), inst, { mini: true, playable: true });
    card.addEventListener('click', () => setRun(finishTranscribe(run, inst.uid)));
    grid.appendChild(card);
  });
  s.appendChild(grid);
  s.appendChild(footer([el('button', { class: 'btn', onclick: () => setRun(finishTranscribe(run, null)) }, 'Skip')]));
  app.appendChild(s);
}

function renderDeckView() {
  const s = el('div', { class: 'screen' });
  s.appendChild(el('h2', { class: 'screen-title', text: `DECK · ${run.player.deck.length}` }));
  const grid = el('div', { class: 'deck-grid' });
  run.player.deck.forEach((inst) => grid.appendChild(buildCard(effectiveCard(inst), inst, { mini: true })));
  s.appendChild(grid);
  if (run.player.relics.length) {
    const rb = el('div', { class: 'relic-strip' });
    run.player.relics.forEach((r) => rb.appendChild(el('div', { class: 'relic-card mini' }, [
      el('div', { class: 'relic-name', text: r.name }), el('div', { class: 'relic-text', text: r.text }),
    ])));
    s.appendChild(rb);
  }
  s.appendChild(footer([el('button', { class: 'btn primary', onclick: () => setRun({ ...run, _deckView: false }) }, 'Back')]));
  app.appendChild(s);
}

function renderEnd(won) {
  const s = el('div', { class: 'screen center' });
  const stage = el('div', { class: 'title-stage' });
  stage.appendChild(createSpriteCanvas(won ? 'bard' : 'theHush', won ? 6 : 3));
  s.appendChild(stage);
  s.appendChild(el('h1', { class: `logo ${won ? 'won' : 'lost'}`, text: won ? 'THE HUSH FALLS' : 'SILENCED' }));
  s.appendChild(el('p', { class: 'hint', text: won ? 'The Last Melody echoes forever.' : `Fell on floor ${run.floor + 1}.` }));
  s.appendChild(el('button', { class: 'btn big primary', onclick: () => setRun(newRun(rnd())) }, 'PLAY AGAIN'));
  app.appendChild(s);
}

// ── shared widgets ────────────────────────────────────────────────────────────
function topBar() {
  return el('div', { class: 'topbar' }, [
    el('span', { class: 'pstat hp', text: `♥ ${run.player.hp}/${run.player.maxHp}` }),
    el('span', { class: 'pstat gold', text: `$ ${run.player.gold}` }),
    el('span', { class: 'pstat', text: `F${run.floor + 1}/${run.nodes.length}` }),
    el('button', { class: 'icon-btn', onclick: () => { if (confirm('Abandon run?')) setRun(null); } }, '✕'),
  ]);
}
function footer(kids) { return el('div', { class: 'footer' }, kids); }

function statusChips(st, isPlayer) {
  const row = el('div', { class: 'statuses' });
  if (st.forte) row.appendChild(chip('forte', `FRT ${st.forte}`));
  if (st.exposed) row.appendChild(chip('exposed', `EXP ${st.exposed}`));
  if (st.diminuendo) row.appendChild(chip('diminu', `DIM ${st.diminuendo}`));
  if (st.discordant) row.appendChild(chip('discord', `DIS ${st.discordant}`));
  if (isPlayer && st.resonant) row.appendChild(chip('resonant', `RES ${st.resonant}`));
  return row;
}
function chip(kind, text) { return el('span', { class: `chip ${kind}`, text }); }

function buildCard(def, inst, { playable = false, selected = false, mini = false, chainPreview = null, muted = false } = {}) {
  const upgraded = inst && inst.upgraded;
  const card = el('div', {
    class: ['card', `note-${def.note}`, !playable && !mini ? 'unplayable' : '', selected ? 'selected' : '',
      mini ? 'mini' : '', upgraded ? 'upgraded' : ''].filter(Boolean).join(' '),
  });
  card.appendChild(el('div', { class: 'card-cost', text: String(def.cost) }));
  const ni = noteIcon(def.note, 2); ni.className = 'card-note';
  card.appendChild(ni);
  card.appendChild(el('div', { class: 'card-name', text: def.name + (upgraded ? '+' : '') }));
  if (!mini) {
    card.appendChild(el('div', { class: 'card-text', text: def.text + (muted ? ' [MUTED +1]' : '') }));
    card.appendChild(el('div', { class: 'card-note-label', text: def.note }));
    if (chainPreview) card.appendChild(el('div', { class: `card-chain ${chainPreview}`, text: chainPreview === 'crescendo' ? '✦ CRESCENDO' : '♦ HARMONY' }));
  }
  return card;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function needsTarget(inst) {
  return effectiveCard(inst).effects.some((e) =>
    (e.kind === 'damage' && e.target === 'enemy') || e.kind === 'damageFromBlock' || (e.kind === 'status' && e.target === 'enemy'));
}
function noteIcon(note, scale) { return createSpriteCanvas(`note${cap(note)}`, scale); }
function noteGlyph(note) { return { strike: '♩', ward: '♪', verse: '♫' }[note] || '•'; }
function nodeIcon(t) { return { combat: '⚔', elite: '☠', rest: '🔥', boss: '💀' }[t] || '•'; }
function nodeLabel(node) { return { combat: 'Fight', elite: 'Elite', rest: 'Campfire', boss: 'THE HUSH' }[node.type] || node.type; }
function cap(s) { return s[0].toUpperCase() + s.slice(1); }
function rnd() { return (Math.random() * 0x7fffffff) >>> 0; }

render();
