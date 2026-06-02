import { TILE_SIZE, COLORS } from './constants.js';

export class Player {
  constructor(x, y) {
    this.tileX = x;
    this.tileY = y;
    this.px = x * TILE_SIZE;
    this.py = y * TILE_SIZE;
    this.speed = 160; // px/s

    this.path = [];
    this.moving = false;
    this.facingRight = true;

    this.action = null; // { type, target, duration, onComplete }
    this.actionProgress = 0;
    this._actionTimer = 0;

    this.pendingAction = null;

    this._walkTimer = 0;
    this._walkFrame = 0;
    this._bobY = 0;
  }

  startPath(path, onArrival) {
    this.path = path.slice();
    this.moving = path.length > 0;
    this.action = null;
    this.actionProgress = 0;
    this._actionTimer = 0;
    this.pendingAction = onArrival ?? null;
  }

  startAction(type, target, duration, onComplete) {
    this.action = { type, target, duration, onComplete };
    this.actionProgress = 0;
    this._actionTimer = 0;
  }

  cancelAction() {
    this.action = null;
    this.actionProgress = 0;
    this._actionTimer = 0;
    this.pendingAction = null;
  }

  get isIdle() {
    return !this.moving && !this.action;
  }

  update(dt) {
    if (this.moving) {
      this._stepMovement(dt);
    } else if (this.action) {
      this._stepAction(dt);
    }

    if (this.moving) {
      this._walkTimer += dt;
      if (this._walkTimer > 140) {
        this._walkTimer = 0;
        this._walkFrame = (this._walkFrame + 1) % 4;
      }
      this._bobY = Math.sin(this._walkFrame * Math.PI / 2) * 1.5;
    } else {
      this._walkFrame = 0;
      this._bobY = 0;
    }
  }

  _stepMovement(dt) {
    if (this.path.length === 0) {
      this.moving = false;
      if (this.pendingAction) {
        const cb = this.pendingAction;
        this.pendingAction = null;
        cb();
      }
      return;
    }

    const next = this.path[0];
    const tx = next.x * TILE_SIZE;
    const ty = next.y * TILE_SIZE;
    const dx = tx - this.px;
    const dy = ty - this.py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = this.speed * dt / 1000;

    if (dx > 0.5) this.facingRight = true;
    else if (dx < -0.5) this.facingRight = false;

    if (dist <= step + 0.5) {
      this.px = tx;
      this.py = ty;
      this.tileX = next.x;
      this.tileY = next.y;
      this.path.shift();
      if (this.path.length === 0) {
        this.moving = false;
        if (this.pendingAction) {
          const cb = this.pendingAction;
          this.pendingAction = null;
          cb();
        }
      }
    } else {
      this.px += (dx / dist) * step;
      this.py += (dy / dist) * step;
    }
  }

  _stepAction(dt) {
    this._actionTimer += dt;
    this.actionProgress = Math.min(1, this._actionTimer / this.action.duration);
    if (this._actionTimer >= this.action.duration) {
      const cb = this.action.onComplete;
      this.action = null;
      this.actionProgress = 0;
      this._actionTimer = 0;
      if (cb) cb();
    }
  }

  draw(ctx, camera) {
    const px = Math.floor(this.px - camera.x);
    const py = Math.floor(this.py - camera.y);
    this._drawChar(ctx, px, py);

    if (this.action) {
      const bw = TILE_SIZE - 6;
      const bx = px + 3, by = py - 11;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
      ctx.fillStyle = COLORS.XP_COLOR;
      ctx.fillRect(bx, by, bw * this.actionProgress, 4);
    }
  }

  _drawChar(ctx, px, py) {
    const cx = px + TILE_SIZE / 2;
    const bob = this._bobY;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, py + TILE_SIZE - 3, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    const legSwing = this.moving ? (this._walkFrame % 2 === 0 ? 4 : -4) : 0;
    ctx.fillStyle = COLORS.PLAYER_LEGS;
    ctx.fillRect(cx - 5, py + 24 + bob, 4, 8 + legSwing * 0.4);
    ctx.fillRect(cx + 1, py + 24 + bob, 4, 8 - legSwing * 0.4);

    // Body
    ctx.fillStyle = COLORS.PLAYER_BODY;
    ctx.fillRect(cx - 6, py + 13 + bob, 12, 13);

    // Head
    ctx.fillStyle = COLORS.PLAYER_SKIN;
    ctx.fillRect(cx - 5, py + 4 + bob, 10, 10);

    // Eyes
    ctx.fillStyle = '#5d4037';
    if (this.facingRight) {
      ctx.fillRect(cx + 1, py + 7 + bob, 2, 2);
    } else {
      ctx.fillRect(cx - 3, py + 7 + bob, 2, 2);
    }

    // Tool animation while harvesting
    if (this.action) {
      const swing = Math.sin(this.actionProgress * Math.PI * 4) * 0.4;
      ctx.save();
      ctx.translate(this.facingRight ? cx + 6 : cx - 6, py + 18 + bob);
      ctx.rotate(this.facingRight ? -swing : swing);
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(-1, -10, 3, 16);
      ctx.fillStyle = '#607d8b';
      ctx.fillRect(-4, -13, 8, 5);
      ctx.restore();
    }
  }
}
