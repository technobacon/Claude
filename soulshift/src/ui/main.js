// Browser shell: screens, input, HUD, effects, persistence.
// All rules live in src/core/ — this file only translates keys into actions
// and game events into pixels, text and sound.

import { createGame, act, interactionAt, shrineCost, SOUL } from '../core/game.js';
import { BODIES } from '../core/bodies.js';
import { TILE } from '../core/grid.js';
import {
  PERKS, STARTING_BODIES, newMeta, normalizeMeta, buyPerk, buyStart, bankRun,
} from '../core/meta.js';
import { makeRenderer } from './render.js';
import { playSound, setMuted, isMuted } from './audio.js';

const SAVE_KEY = 'soulshift:meta:v1';

// ---------------------------------------------------------------------------
// Persistence

function loadMeta() {
  try {
    return normalizeMeta(JSON.parse(localStorage.getItem(SAVE_KEY)));
  } catch {
    return newMeta();
  }
}

function saveMeta() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(meta));
  } catch { /* private mode etc. — play on without persistence */ }
}

// ---------------------------------------------------------------------------
// State

let meta = loadMeta();
let chosenStart = meta.unlockedStarts.includes('skeleton') ? 'skeleton' : meta.unlockedStarts[0];
let game = null;
let banked = false;
const effects = [];

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const renderer = makeRenderer(canvas);

// ---------------------------------------------------------------------------
// Screens

const SCREENS = ['title', 'perks', 'help', 'game', 'end'];
let current = 'title';
let helpReturnTo = 'title';

function show(name) {
  current = name;
  for (const s of SCREENS) $('screen-' + s).classList.toggle('hidden', s !== name);
  if (name === 'title') renderTitle();
  if (name === 'perks') renderPerks();
  if (name === 'help') renderHelp();
}

function renderTitle() {
  $('title-bank').textContent = meta.bank;
  const wrap = $('start-bodies');
  wrap.innerHTML = '';
  for (const id of meta.unlockedStarts) {
    const chip = document.createElement('div');
    chip.className = 'chip' + (id === chosenStart ? ' active' : '');
    chip.textContent = BODIES[id].name;
    chip.onclick = () => { chosenStart = id; renderTitle(); };
    wrap.appendChild(chip);
  }
  $('title-stats').textContent =
    `runs ${meta.runs} · victories ${meta.wins} · deepest floor ${meta.bestDepth} · bodies worn ${meta.bestiary.length}/${Object.keys(BODIES).length}`;
}

function renderPerks() {
  $('perks-bank').textContent = meta.bank;
  const list = $('perk-list');
  list.innerHTML = '';
  for (const perk of PERKS) {
    const owned = meta.perks.includes(perk.id);
    const card = document.createElement('div');
    card.className = 'card' + (owned ? ' owned' : '');
    card.innerHTML = `<div><div class="name">${perk.name}</div><div class="desc">${perk.desc}</div></div>`;
    const right = document.createElement('div');
    if (owned) {
      right.innerHTML = '<span class="cost">owned</span>';
    } else {
      const btn = document.createElement('button');
      btn.innerHTML = `${perk.cost} <span style="color:var(--accent)">◆</span>`;
      btn.disabled = meta.bank < perk.cost;
      btn.onclick = () => { if (buyPerk(meta, perk.id)) { saveMeta(); playSound('shrine'); renderPerks(); } };
      right.appendChild(btn);
    }
    card.appendChild(right);
    list.appendChild(card);
  }
  const shop = $('start-shop');
  shop.innerHTML = '';
  for (const start of STARTING_BODIES) {
    const def = BODIES[start.id];
    const owned = meta.unlockedStarts.includes(start.id);
    const card = document.createElement('div');
    card.className = 'card' + (owned ? ' owned' : '');
    card.innerHTML = `<div><div class="name">${def.name}</div><div class="desc">HP ${def.hp} · ATK ${def.atk} · DEF ${def.def} · ${def.speed} — ${def.ability.name}</div></div>`;
    const right = document.createElement('div');
    if (owned) {
      right.innerHTML = '<span class="cost">owned</span>';
    } else {
      const btn = document.createElement('button');
      btn.innerHTML = `${start.cost} <span style="color:var(--accent)">◆</span>`;
      btn.disabled = meta.bank < start.cost;
      btn.onclick = () => { if (buyStart(meta, start.id)) { saveMeta(); playSound('shrine'); renderPerks(); } };
      right.appendChild(btn);
    }
    card.appendChild(right);
    shop.appendChild(card);
  }
}

function renderHelp() {
  const wrap = $('bestiary');
  wrap.innerHTML = '';
  for (const def of Object.values(BODIES)) {
    const known = meta.bestiary.includes(def.id) || (game && game.player.wornBodies.includes(def.id));
    const div = document.createElement('div');
    div.className = 'beast' + (known ? '' : ' unknown');
    div.innerHTML = known
      ? `<b>${def.name}</b>HP ${def.hp} · ATK ${def.atk} · DEF ${def.def}<br>${def.speed} · rots in ${def.decay}<br><i>${def.ability.name}</i>`
      : '<b>?????</b>an unworn skin';
    wrap.appendChild(div);
  }
}

// ---------------------------------------------------------------------------
// Run lifecycle

function newRun() {
  const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
  game = createGame({ seed, perks: meta.perks, startBody: chosenStart });
  banked = false;
  effects.length = 0;
  $('log').innerHTML = '';
  logMsg(`You slip into the catacombs wearing a ${BODIES[chosenStart].name.toLowerCase()}.`, 'lore');
  show('game');
  updateHud();
}

function endRun() {
  if (!banked) {
    const gained = bankRun(meta, game);
    game.bankedGained = gained;
    banked = true;
    saveMeta();
  }
  const won = game.status === 'won';
  const t = $('end-title');
  t.textContent = won ? 'THE DEEP DOOR OPENS' : 'YOUR SOUL SCATTERS';
  t.className = won ? 'won' : 'dead';
  $('end-flavor').textContent = won
    ? (game.winHow === 'possessed'
      ? 'You seized the Warden while it still drew breath. The dungeon has a new keeper.'
      : 'You walk out wearing the Warden\'s shape. Outside, the morning does not recognize you.')
    : `The dungeon keeps what it takes. ${game.causeOfDeath ? 'You were ' + game.causeOfDeath + '.' : ''}`;
  $('end-stats').innerHTML =
    `Depth <b>${game.depth}</b> · Kills <b>${game.player.kills}</b> · Turns <b>${game.turnCount}</b><br>` +
    `Bodies worn: <b>${game.player.wornBodies.map((b) => BODIES[b].name).join(', ')}</b><br>` +
    `<span class="gain">+${game.bankedGained} essence banked (${meta.bank} total)</span>`;
  show('end');
}

// ---------------------------------------------------------------------------
// HUD + log

function logMsg(text, cls = 'info') {
  const log = $('log');
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = text;
  log.appendChild(div);
  while (log.children.length > 80) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function updateHud() {
  const p = game.player;
  $('hud-depth').textContent = `DEPTH ${game.depth} / 8`;
  if (p.form === 'soul') {
    $('hud-body').innerHTML = `Bare Soul<small>flickering, fading — find flesh</small>`;
    $('hud-decay-label').textContent = 'FLICKER';
    $('hud-decay-text').textContent = p.grace > 0 ? `${p.grace} turns` : 'fading!';
    $('hud-decay').style.width = (p.grace > 0 ? 100 : 0) + '%';
  } else {
    const def = BODIES[p.bodyType];
    $('hud-body').innerHTML = `${def.name}<small>${def.desc}</small>`;
    $('hud-decay-label').textContent = 'DECAY';
    $('hud-decay-text').textContent = `${p.decay} / ${p.maxDecay}`;
    $('hud-decay').style.width = Math.max(0, (p.decay / p.maxDecay) * 100) + '%';
  }
  $('hud-hp-text').textContent = `${Math.max(0, p.hp)} / ${p.maxHp}`;
  $('hud-hp').style.width = Math.max(0, (p.hp / p.maxHp) * 100) + '%';
  $('hud-essence').innerHTML =
    `Essence <b>◆ ${p.essence}</b> &nbsp;·&nbsp; ATK ${p.atk} · DEF ${p.def} · ${p.speed}`;

  const ab = $('hud-ability');
  if (p.form === 'soul') {
    ab.innerHTML = `<span class="ab-name">Chilling Touch</span> <span class="ab-ready">passive</span>
      <div class="ab-desc">Bump: ${SOUL.touchDamage} dmg, slows. Seizes the living below ${Math.round(game.mods.possessThreshold * 100)}% HP.</div>`;
  } else {
    const def = BODIES[p.bodyType];
    const ready = p.abilityCd === 0;
    ab.innerHTML = `<span class="ab-name">${def.ability.name}</span>
      <span class="${ready ? 'ab-ready' : 'ab-cd'}">${ready ? 'READY (Space)' : 'ready in ' + p.abilityCd}</span>
      <div class="ab-desc">${def.ability.desc}</div>`;
  }

  const statuses = Object.entries(p.statuses).filter(([, v]) => v > 0)
    .map(([k, v]) => `${k} ${v}`).join(' · ');
  $('hud-statuses').textContent = statuses ? `Afflicted: ${statuses}` : '';

  const inter = interactionAt(game);
  const hint = $('hud-hint');
  if (!inter) hint.textContent = '';
  else if (inter.kind === 'stairs') hint.innerHTML = 'Stairs down — press <span class="kbd">G</span> to descend';
  else if (inter.kind === 'possess') {
    const def = BODIES[inter.corpse.type];
    const worn = inter.corpse.shed ? ' (worn before — it remembers its wounds)' : '';
    hint.innerHTML = `${def.name} corpse${worn} — <span class="kbd">G</span> to possess`;
  } else if (inter.kind === 'shrine') {
    const names = { [TILE.SHRINE_MEND]: 'Mend shrine (full heal)', [TILE.SHRINE_PRESERVE]: 'Preserve shrine (reset decay)', [TILE.SHRINE_EMPOWER]: 'Empower shrine (+1 atk, +4 HP, permanent)' };
    hint.innerHTML = `${names[inter.tile]} — <span class="kbd">G</span> for ◆ ${inter.cost}`;
  } else if (inter.kind === 'shrine-used') hint.textContent = 'This shrine is spent.';
}

// ---------------------------------------------------------------------------
// Game events → presentation

function handleEvents(events) {
  for (const e of events) {
    if (e.type === 'msg') logMsg(e.text, e.cls);
    else if (e.type === 'sound') playSound(e.id);
    else if (e.type === 'hit') {
      effects.push({
        type: 'text', x: e.x, y: e.y, text: '-' + e.amount,
        color: e.target === 'player' ? '#ff7a70' : '#ffd34d',
        start: performance.now(), dur: 600,
      });
    } else if (e.type === 'bolt') {
      effects.push({ ...e, start: performance.now(), dur: 160 });
    } else if (e.type === 'shake') {
      effects.push({ type: 'shake', start: performance.now(), dur: 250 });
    }
  }
}

function doAction(action) {
  if (!game || game.status !== 'playing') return;
  const events = act(game, action);
  handleEvents(events);
  updateHud();
  if (game.status !== 'playing') {
    setTimeout(endRun, 900);
  }
}

// ---------------------------------------------------------------------------
// Input

const MOVES = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
  y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
  q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1],
  Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0],
  Numpad7: [-1, -1], Numpad9: [1, -1], Numpad1: [-1, 1], Numpad3: [1, 1],
};

document.addEventListener('keydown', (ev) => {
  const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
  const code = ev.code;

  if (current === 'game') {
    if (k === '?' || (k === '/' && ev.shiftKey)) { helpReturnTo = 'game'; show('help'); ev.preventDefault(); return; }
    if (k === 'm') { setMuted(!isMuted()); logMsg(isMuted() ? 'Muted.' : 'Sound on.', 'info'); return; }
    const move = MOVES[k] || MOVES[code];
    if (move) { doAction({ type: 'move', dx: move[0], dy: move[1] }); ev.preventDefault(); return; }
    if (k === '.' || code === 'Numpad5') { doAction({ type: 'wait' }); ev.preventDefault(); return; }
    if (k === 'g' || k === 'Enter') { doAction({ type: 'interact' }); ev.preventDefault(); return; }
    if (k === ' ' || k === 'f') { doAction({ type: 'ability' }); ev.preventDefault(); return; }
  } else if (current === 'title') {
    if (k === 'Enter') { newRun(); ev.preventDefault(); }
  } else if (current === 'end') {
    if (k === 'Enter') { newRun(); ev.preventDefault(); }
  } else if (current === 'perks' || current === 'help') {
    if (k === 'Escape') { show(current === 'help' ? helpReturnTo : 'title'); ev.preventDefault(); }
  }
});

// ---------------------------------------------------------------------------
// Buttons

$('btn-start').onclick = newRun;
$('btn-perks').onclick = () => show('perks');
$('btn-help').onclick = () => { helpReturnTo = 'title'; show('help'); };
$('btn-perks-back').onclick = () => show('title');
$('btn-help-back').onclick = () => show(helpReturnTo);
$('btn-again').onclick = newRun;
$('btn-end-perks').onclick = () => show('perks');
$('btn-end-title').onclick = () => show('title');

// ---------------------------------------------------------------------------
// Render loop

function frame(now) {
  if (current === 'game' && game) {
    // Drop finished effects.
    for (let i = effects.length - 1; i >= 0; i--) {
      if (now - effects[i].start > effects[i].dur) effects.splice(i, 1);
    }
    renderer.render(game, effects, now);
  }
  requestAnimationFrame(frame);
}

show('title');
requestAnimationFrame(frame);
