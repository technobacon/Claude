// src/ui/arena.js
//
// The 2.5D combat arena: a self-contained canvas renderer with its own rAF
// loop and a juice/effects system. The pure game core stays instantaneous;
// the arena is what makes a state transition *feel* like something — lunges,
// hitstop, screenshake, particles, floating numbers, tweened HP bars.
//
// HD-2D-ish layering each frame:
//   sky gradient → far spire silhouettes (parallax) → drifting dust →
//   perspective ground plane + point-light pools → actor shadows →
//   actors (procedurally animated) → particles → floating text → vignette.
//
// The app drives it through a small imperative API (attack/guard/cast/hurt/
// die/setStat/floatText/shake/hitstop/crescendo/harmonyPing). Animation
// methods that the sequencer needs to await return Promises.

// ── easing ───────────────────────────────────────────────────────────────────
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => { const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const easeInQuad = (t) => t * t;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class Arena {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.actors = new Map();   // id -> actor
    this.particles = [];
    this.floats = [];
    this.dust = [];
    this.spires = [];
    this.shakeMag = 0;
    this.frozenUntil = 0;      // hitstop
    this.flashScreen = 0;      // full-screen flash alpha (crescendo)
    this.t = 0;                // world clock (paused during hitstop)
    this.last = now();
    this.running = false;
    this.dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    this.onActorTap = null;    // (id) => void
    this._raf = null;
    this._spritesByActor = new Map();
    this.resize();
    canvas.addEventListener('pointerdown', (e) => this._handleTap(e));
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this.last = now();
    const loop = () => {
      if (!this.running) return;
      this._tick();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect
      ? this.canvas.getBoundingClientRect()
      : { width: this.canvas.width || 360, height: this.canvas.height || 240 };
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    this.cssW = w; this.cssH = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.horizonY = Math.floor(h * 0.46);
    this.groundY = Math.floor(h * 0.78);   // where actors stand (feet baseline)
    this._initBackground();
    this._layoutActors();
  }

  // ── scene population ─────────────────────────────────────────────────────────
  /**
   * @param {object} player  { sprite, hp, maxHp, block }
   * @param {Array}  enemies [{ id, sprite, hp, maxHp, block, intent }]
   */
  setCombatants(player, enemies) {
    this.actors.clear();
    this.actors.set('player', this._makeActor('player', player.sprite, 'player', player));
    enemies.forEach((e, i) => {
      this.actors.set(e.id, this._makeActor(e.id, e.sprite, 'enemy', e, i, enemies.length));
    });
    this._layoutActors();
  }

  _makeActor(id, sprite, side, stat, index = 0, count = 1) {
    return {
      id, sprite, side,
      hp: stat.hp, maxHp: stat.maxHp, block: stat.block || 0,
      displayHp: stat.hp, ghostHp: stat.hp,
      intent: stat.intent || null,
      index, count,
      scale: side === 'player' ? 5.0 : 4.2,   // depth: enemies a touch smaller
      depth: side === 'player' ? 1 : 0.86,    // atmospheric darkening
      bx: 0, by: 0,                            // base anchor (set in layout)
      lungeX: 0, lungeY: 0, rot: 0, squashX: 1, squashY: 1,
      flash: 0, alpha: 1, dead: false,
      seed: Math.random() * 9,
      targetable: false, selected: false,
      anim: null,
    };
  }

  _layoutActors() {
    const w = this.cssW, h = this.cssH;
    const player = this.actors.get('player');
    if (player) { player.bx = Math.floor(w * 0.24); player.by = this.groundY + 6; }
    const enemies = [...this.actors.values()].filter((a) => a.side === 'enemy');
    const n = enemies.length;
    enemies.forEach((e, i) => {
      const spread = n === 1 ? 0 : (i - (n - 1) / 2);
      e.bx = Math.floor(w * 0.70 + spread * Math.min(120, w * 0.22));
      e.by = this.horizonY + Math.floor((this.groundY - this.horizonY) * 0.62) + (i % 2) * 10;
    });
  }

  _initBackground() {
    // Far ruined spires (parallax silhouettes)
    this.spires = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
      this.spires.push({
        x: (i + 0.5) / count,
        w: 0.04 + (i % 3) * 0.02,
        h: 0.18 + ((i * 37) % 100) / 100 * 0.22,
      });
    }
    // Drifting dust motes
    this.dust = [];
    for (let i = 0; i < 34; i++) {
      this.dust.push({
        x: Math.random(), y: Math.random(),
        vy: -0.004 - Math.random() * 0.006,
        vx: (Math.random() - 0.5) * 0.003,
        s: Math.random() < 0.3 ? 2 : 1,
        a: 0.15 + Math.random() * 0.35,
      });
    }
  }

  // ── stat sync ────────────────────────────────────────────────────────────────
  syncStats(player, enemies) {
    const p = this.actors.get('player');
    if (p) { p.maxHp = player.maxHp; p.hp = player.hp; p.block = player.block || 0; }
    for (const e of enemies) {
      const a = this.actors.get(e.id);
      if (!a) continue;
      a.hp = e.hp; a.maxHp = e.maxHp; a.block = e.block || 0; a.intent = e.intent;
      if (e.hp <= 0 && !a.dead) this.die(e.id);
    }
  }
  setIntent(id, intent) { const a = this.actors.get(id); if (a) a.intent = intent; }
  setTargetable(ids) {
    for (const a of this.actors.values()) { a.targetable = false; a.selected = false; }
    for (const id of ids || []) { const a = this.actors.get(id); if (a) a.targetable = true; }
  }

  // ── animation API (Promises) ─────────────────────────────────────────────────
  _animate(actor, dur, fn) {
    return new Promise((resolve) => {
      actor.anim = { t0: this.t, dur, fn, resolve, fired: false };
    });
  }

  /** Lunge from `id` toward `targetId`, firing onImpact at the strike apex. */
  attack(id, targetId, onImpact) {
    const a = this.actors.get(id);
    if (!a) return Promise.resolve();
    const dir = a.side === 'player' ? 1 : -1;
    return this._animate(a, 460, (p, self) => {
      // windup → strike → recover
      if (p < 0.30) {                       // anticipation: pull back + crouch
        const k = easeOutCubic(p / 0.30);
        self.lungeX = -dir * 12 * k;
        self.squashY = 1 - 0.10 * k; self.squashX = 1 + 0.08 * k;
        self.rot = -dir * 0.05 * k;
      } else if (p < 0.46) {                // strike: snap forward
        const k = easeOutCubic((p - 0.30) / 0.16);
        self.lungeX = lerp(-12 * dir, 46 * dir, k);
        self.squashY = lerp(0.90, 1.12, k); self.squashX = lerp(1.08, 0.92, k);
        self.rot = lerp(-dir * 0.05, dir * 0.10, k);
      } else {                              // recover: ease home
        const k = easeOutCubic((p - 0.46) / 0.54);
        self.lungeX = lerp(46 * dir, 0, k);
        self.squashY = lerp(1.12, 1, k); self.squashX = lerp(0.92, 1, k);
        self.rot = lerp(dir * 0.10, 0, k);
      }
      if (!self.anim.fired && p >= 0.44) {
        self.anim.fired = true;
        if (onImpact) onImpact();
      }
    });
  }

  /** Defensive flourish: a small hop + cyan shield shimmer. */
  guard(id) {
    const a = this.actors.get(id);
    if (!a) return Promise.resolve();
    this.burst(a.bx, a.by - a.scale * 9, { n: 14, color: '#3afae0', spread: 2.2, up: 1.6, size: 3, life: 520 });
    return this._animate(a, 360, (p, self) => {
      const k = Math.sin(p * Math.PI);
      self.lungeY = -10 * k;
      self.squashX = 1 - 0.06 * k; self.squashY = 1 + 0.06 * k;
    });
  }

  /** Verse flourish: rise + spin a vivid note upward. */
  cast(id, color = '#ffe24a') {
    const a = this.actors.get(id);
    if (!a) return Promise.resolve();
    this.spawnNote(a.bx + 14, a.by - a.scale * 12, color);
    return this._animate(a, 360, (p, self) => {
      const k = Math.sin(p * Math.PI);
      self.lungeY = -8 * k;
      self.rot = Math.sin(p * Math.PI * 2) * 0.04;
    });
  }

  /** Reactive hurt: white flash, knockback, shake (scaled by damage). */
  hurt(id, fromSide, dmg = 0) {
    const a = this.actors.get(id);
    if (!a || a.dead) return;
    a.flash = 1;
    const dir = fromSide === 'player' ? 1 : -1; // pushed away from attacker
    a.anim = null;
    const start = this.t;
    const knock = clamp(6 + dmg * 0.5, 6, 22);
    a._hurt = { start, dur: 300, knock, dir };
    this.shake(clamp(2 + dmg * 0.35, 2, 9));
    this.burst(a.bx, a.by - a.scale * 8, {
      n: clamp(4 + dmg * 0.4, 4, 16), color: a.side === 'player' ? '#ff5e7a' : '#cfcfde',
      spread: 2.6, up: 0.6, size: 2, life: 420,
    });
  }

  die(id) {
    const a = this.actors.get(id);
    if (!a || a.dead) return;
    a.dead = true;
    a._death = { start: this.t, dur: 700 };
    this.burst(a.bx, a.by - a.scale * 8, { n: 22, color: '#84849e', spread: 3, up: 1.2, size: 3, life: 800 });
  }

  // ── effects ──────────────────────────────────────────────────────────────────
  shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); }
  hitstop(ms) { this.frozenUntil = Math.max(this.frozenUntil, now() + ms); }

  burst(x, y, { n = 10, color = '#fff', spread = 2, up = 1, size = 2, life = 500, gravity = 0.00018 } = {}) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Math.random() * spread;
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - up,
        life, max: life, color, size, gravity,
      });
    }
  }

  spawnNote(x, y, color) {
    this.particles.push({
      x, y, vx: (Math.random() - 0.5) * 0.05, vy: -0.10 - Math.random() * 0.04,
      life: 900, max: 900, color, size: 4, gravity: -0.00002, note: true,
      wobble: Math.random() * 6,
    });
  }

  floatText(id, text, color = '#fff', big = false) {
    const a = this.actors.get(id);
    const x = a ? a.bx : this.cssW / 2;
    const y = a ? a.by - a.scale * (big ? 14 : 11) : this.cssH / 2;
    this.floats.push({ x, y, text, color, born: this.t, life: big ? 1100 : 850, big, dx: (Math.random() - 0.5) * 0.3 });
  }

  /** The signature moment: full-screen gold flash + radial note burst + shake. */
  crescendo(color = '#ffd23f') {
    this.flashScreen = 0.55;
    this.shake(9);
    this.hitstop(90);
    const cx = this.cssW / 2, cy = this.cssH * 0.5;
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * Math.PI * 2;
      const sp = 1.6 + Math.random() * 1.8;
      this.particles.push({
        x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        life: 760, max: 760, color: i % 3 === 0 ? '#fff4c2' : color, size: 3, gravity: 0,
      });
    }
  }

  harmonyPing(color = '#3afae0') {
    this.flashScreen = Math.max(this.flashScreen, 0.18);
    this.burst(this.cssW / 2, this.cssH * 0.5, { n: 14, color, spread: 1.6, up: 0, size: 2, life: 480 });
  }

  // ── main loop ─────────────────────────────────────────────────────────────────
  _tick() {
    const t = now();
    let dt = t - this.last;
    this.last = t;
    if (dt > 60) dt = 60;                  // clamp after tab-away
    const frozen = t < this.frozenUntil;
    if (!frozen) this.t += dt;             // hitstop freezes the world clock
    this._update(frozen ? 0 : dt);
    this._render();
  }

  _update(dt) {
    // shake decay
    this.shakeMag *= Math.pow(0.86, dt / 16);
    if (this.shakeMag < 0.2) this.shakeMag = 0;
    this.flashScreen *= Math.pow(0.86, dt / 16);

    // dust
    for (const d of this.dust) {
      d.x += d.vx * dt / 16; d.y += d.vy * dt / 16;
      if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); }
      if (d.x < 0) d.x = 1; if (d.x > 1) d.x = 0;
    }

    // particles
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += p.gravity * dt * dt;
      if (p.note) { p.wobble += dt * 0.01; p.x += Math.sin(p.wobble) * 0.15; }
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    // floats
    for (const f of this.floats) { f.y -= dt * 0.022; f.x += f.dx; }
    this.floats = this.floats.filter((f) => this.t - f.born < f.life);

    // actors
    for (const a of this.actors.values()) this._updateActor(a, dt);
  }

  _updateActor(a, dt) {
    // reset per-frame transform, then apply idle + active anim
    a.lungeX = 0; a.lungeY = 0; a.rot = 0; a.squashX = 1; a.squashY = 1;

    // idle breathing (skip if dead)
    if (!a.dead) {
      const phase = this.t * 0.0028 + a.seed;
      a.squashY = 1 + Math.sin(phase) * 0.028;
      a.squashX = 1 - Math.sin(phase) * 0.022;
      a.lungeY = Math.sin(phase) * 2.2;
      if (a.side === 'enemy') a.lungeY += Math.sin(this.t * 0.0016 + a.seed) * 3; // float
    }

    // active scripted anim
    if (a.anim) {
      const p = clamp((this.t - a.anim.t0) / a.anim.dur, 0, 1);
      a.anim.fn(p, a);
      if (p >= 1) { const r = a.anim.resolve; a.anim = null; if (r) r(); }
    }

    // hurt knockback overlay
    if (a._hurt) {
      const hp = clamp((this.t - a._hurt.start) / a._hurt.dur, 0, 1);
      const k = (1 - hp) * Math.sin(hp * Math.PI);
      a.lungeX += a._hurt.dir * a._hurt.knock * (1 - easeOutCubic(hp));
      a.rot += a._hurt.dir * 0.06 * (1 - hp);
      if (hp >= 1) a._hurt = null;
    }
    a.flash *= Math.pow(0.82, dt / 16);
    if (a.flash < 0.03) a.flash = 0;

    // death dissolve
    if (a._death) {
      const dp = clamp((this.t - a._death.start) / a._death.dur, 0, 1);
      a.alpha = 1 - dp;
      a.lungeY = 14 * easeInQuad(dp);
      a.rot = 0.4 * dp;
      if (dp >= 1) a._death = null;
    }

    // hp bar tweening
    a.displayHp = lerp(a.displayHp, a.hp, clamp(dt / 90, 0, 1));
    if (Math.abs(a.displayHp - a.hp) < 0.5) a.displayHp = a.hp;
    if (a.ghostHp > a.displayHp) a.ghostHp = lerp(a.ghostHp, a.displayHp, clamp(dt / 240, 0, 1));
    else a.ghostHp = a.displayHp;
  }

  // ── render ────────────────────────────────────────────────────────────────────
  _render() {
    const ctx = this.ctx;
    const W = this.cssW, H = this.cssH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);

    // screenshake offset
    const sx = this.shakeMag ? (Math.random() * 2 - 1) * this.shakeMag : 0;
    const sy = this.shakeMag ? (Math.random() * 2 - 1) * this.shakeMag : 0;
    ctx.save();
    ctx.translate(sx, sy);

    this._drawSky(ctx, W, H);
    this._drawSpires(ctx, W, H);
    this._drawDust(ctx, W, H);
    this._drawGround(ctx, W, H);
    this._drawShadows(ctx);

    // actors back-to-front (enemies first, player last)
    const order = [...this.actors.values()].sort((a, b) => (a.side === 'player' ? 1 : 0) - (b.side === 'player' ? 1 : 0));
    for (const a of order) this._drawActor(ctx, a);

    this._drawParticles(ctx);
    this._drawFloats(ctx);
    ctx.restore();

    this._drawVignette(ctx, W, H);
    if (this.flashScreen > 0.01) {
      ctx.fillStyle = `rgba(255,232,120,${this.flashScreen})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  _drawSky(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a0a14');
    g.addColorStop(0.45, '#13121f');
    g.addColorStop(0.7, '#1a1726');
    g.addColorStop(1, '#0d0c16');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // cold moon glow
    const r = Math.min(W, H) * 0.5;
    const mg = ctx.createRadialGradient(W * 0.72, H * 0.2, 0, W * 0.72, H * 0.2, r);
    mg.addColorStop(0, 'rgba(90,110,160,0.22)');
    mg.addColorStop(1, 'rgba(90,110,160,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, W, H);
  }

  _drawSpires(ctx, W, H) {
    ctx.fillStyle = '#0e0d18';
    const base = this.horizonY + 4;
    for (const s of this.spires) {
      const x = s.x * W;
      const w = s.w * W;
      const h = s.h * H;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, base);
      ctx.lineTo(x, base - h);
      ctx.lineTo(x + w / 2, base);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#0b0a14';
    ctx.fillRect(0, base - 1, W, 3);
  }

  _drawDust(ctx, W, H) {
    for (const d of this.dust) {
      ctx.fillStyle = `rgba(180,190,220,${d.a})`;
      ctx.fillRect(Math.floor(d.x * W), Math.floor(d.y * H), d.s, d.s);
    }
  }

  _drawGround(ctx, W, H) {
    const hy = this.horizonY;
    // ground gradient
    const g = ctx.createLinearGradient(0, hy, 0, H);
    g.addColorStop(0, '#14141f');
    g.addColorStop(0.5, '#1c1c2b');
    g.addColorStop(1, '#0f0f18');
    ctx.fillStyle = g;
    ctx.fillRect(0, hy, W, H - hy);
    // perspective tile lines (receding)
    ctx.strokeStyle = 'rgba(120,130,170,0.06)';
    ctx.lineWidth = 1;
    const rows = 9;
    for (let i = 1; i <= rows; i++) {
      const tt = i / rows;
      const y = hy + (H - hy) * (tt * tt);              // squared → perspective compression
      const inset = (1 - tt) * W * 0.42;
      ctx.beginPath();
      ctx.moveTo(inset, y);
      ctx.lineTo(W - inset, y);
      ctx.stroke();
    }
    // converging verticals
    const vx = W / 2;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(vx + i * (W * 0.12), hy);
      ctx.lineTo(vx + i * (W * 0.42), H);
      ctx.stroke();
    }
    // warm light pool under bard, cold under enemies
    this._lightPool(ctx, W * 0.24, this.groundY + 6, W * 0.30, 'rgba(255,210,120,0.10)');
    this._lightPool(ctx, W * 0.70, this.groundY - 8, W * 0.34, 'rgba(120,140,200,0.07)');
  }

  _lightPool(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  _drawShadows(ctx) {
    for (const a of this.actors.values()) {
      if (a.alpha <= 0.02) continue;
      const lift = -a.lungeY;                          // higher off ground → smaller shadow
      const f = clamp(1 - lift / 40, 0.5, 1);
      const w = a.sprite ? 1 : 1;
      const sw = (getW(a) * a.scale) * 0.42 * f;
      ctx.fillStyle = `rgba(0,0,0,${0.34 * a.alpha * f})`;
      ctx.beginPath();
      ctx.ellipse(a.bx + a.lungeX * 0.4, a.by + 2, sw, sw * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawActor(ctx, a) {
    const f = getFrame(a.sprite);
    if (!f || a.alpha <= 0.02) return;
    const w = f.w * a.scale * a.squashX;
    const h = f.h * a.scale * a.squashY;
    const cx = a.bx + a.lungeX;
    const footY = a.by + a.lungeY;
    ctx.save();
    ctx.globalAlpha = a.alpha;
    ctx.translate(cx, footY);
    ctx.rotate(a.rot);
    // atmospheric depth: darken far actors slightly
    if (a.depth < 1) {
      ctx.globalAlpha = a.alpha;
    }
    ctx.drawImage(f.canvas, -w / 2, -h, w, h);
    // far-depth tint
    if (a.depth < 1) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(20,22,40,${(1 - a.depth) * 1.4})`;
      ctx.fillRect(-w / 2, -h, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    // selected target highlight
    if (a.targetable) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 0.008);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(255,94,122,${0.18 + pulse * 0.22})`;
      ctx.fillRect(-w / 2, -h, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    // hit flash
    if (a.flash > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(255,255,255,${a.flash})`;
      ctx.fillRect(-w / 2, -h, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // bard eye-glow bloom
    if (a.id === 'player' && !a.dead) {
      const gy = footY - h * 0.70;
      const gl = ctx.createRadialGradient(cx, gy, 0, cx, gy, 16);
      gl.addColorStop(0, 'rgba(58,250,224,0.30)');
      gl.addColorStop(1, 'rgba(58,250,224,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(cx - 16, gy - 16, 32, 32);
    }

    if (a.side === 'enemy') this._drawEnemyUI(ctx, a, h);
    if (a.targetable) this._drawTargetRing(ctx, a, h);
  }

  _drawTargetRing(ctx, a, h) {
    const y = a.by + a.lungeY + 6;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 0.008);
    ctx.strokeStyle = `rgba(255,94,122,${0.5 + pulse * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(a.bx + a.lungeX, y, getW(a) * a.scale * 0.40, getW(a) * a.scale * 0.13, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawEnemyUI(ctx, a, h) {
    const cx = a.bx + a.lungeX;
    const top = a.by + a.lungeY - h - 8;
    // intent bubble
    if (a.intent && !a.dead) {
      const label = intentLabel(a.intent);
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(10,10,18,0.85)';
      ctx.fillRect(cx - tw / 2, top - 16, tw, 14);
      ctx.strokeStyle = a.intent.damage > 0 ? 'rgba(255,94,122,0.8)' : 'rgba(132,132,158,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - tw / 2, top - 16, tw, 14);
      ctx.fillStyle = a.intent.damage > 0 ? '#ff8a9e' : '#b6b6cc';
      ctx.fillText(label, cx, top - 5);
    }
    // hp bar
    if (!a.dead) {
      const bw = Math.max(40, getW(a) * a.scale * 0.7);
      const bx = cx - bw / 2;
      const by = top + 2;
      ctx.fillStyle = '#0c0c14';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
      // ghost (recent damage)
      ctx.fillStyle = '#7a2030';
      ctx.fillRect(bx, by, bw * clamp(a.ghostHp / a.maxHp, 0, 1), 5);
      ctx.fillStyle = '#cc4444';
      ctx.fillRect(bx, by, bw * clamp(a.displayHp / a.maxHp, 0, 1), 5);
      if (a.block > 0) {
        ctx.fillStyle = '#4488aa';
        ctx.fillRect(bx - 1, by - 1, 5, 7);
      }
    }
  }

  _drawParticles(ctx) {
    for (const p of this.particles) {
      const al = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = al;
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), s, s);
      if (p.note) { // little tail
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y) + s, Math.max(1, s - 1), s);
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawFloats(ctx) {
    for (const f of this.floats) {
      const age = (this.t - f.born) / f.life;
      const pop = age < 0.18 ? easeOutBack(age / 0.18) : 1;
      const al = age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1;
      ctx.globalAlpha = clamp(al, 0, 1);
      const size = (f.big ? 18 : 13) * pop;
      ctx.font = `${Math.max(8, size)}px 'Press Start 2P', monospace`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  _drawVignette(ctx, W, H) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // ── input ─────────────────────────────────────────────────────────────────────
  _handleTap(e) {
    if (!this.onActorTap) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    const hit = this.hitTest(x, y);
    if (hit) this.onActorTap(hit);
  }

  hitTest(x, y) {
    // front-to-back: prefer player then enemies; generous bounds
    const list = [...this.actors.values()].filter((a) => !a.dead);
    for (const a of list) {
      const f = getFrame(a.sprite);
      if (!f) continue;
      const w = f.w * a.scale, h = f.h * a.scale;
      const cx = a.bx + a.lungeX;
      const top = a.by + a.lungeY - h;
      if (x >= cx - w / 2 - 6 && x <= cx + w / 2 + 6 && y >= top - 18 && y <= a.by + 8) {
        return a.id;
      }
    }
    return null;
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────
function getW(a) {
  const f = getFrame(a.sprite);
  return f ? f.w : 14;
}

function intentLabel(intent) {
  if (!intent) return '';
  if (intent.damage > 0) {
    return intent.times > 1 ? `⚔ ${intent.damage}x${intent.times}` : `⚔ ${intent.damage}`;
  }
  if (intent.block > 0) return `▢ ${intent.block}`;
  const m = { buff: 'STR↑', debuff: 'HEX', defend: '▢' };
  return m[intent.intent] || '…';
}

// getFrame is imported lazily to avoid a hard import cycle in some bundlers.
import { getFrame } from './sprites.js';
