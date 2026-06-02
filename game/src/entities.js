import { ENTITY_TYPE, TILE_SIZE, COLORS, SKILL, TILE, MAP_W, MAP_H } from './constants.js';

export class Entity {
  constructor(type, x, y) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.id = `${type}_${x}_${y}`;
    this.alive = true;
    this.blocksTile = true;
    this._shakeX = 0;
    this._shakeTimer = 0;
    this._respawnTimer = 0;

    switch (type) {
      case ENTITY_TYPE.TREE:
        this.hp = this.maxHp = 3;
        this.harvestTime = 1400;
        this.drops = [{ item: 'log', min: 1, max: 3 }];
        this.xpReward = { skill: SKILL.WOODCUTTING, amount: 25 };
        this._respawnTime = 25000;
        break;
      case ENTITY_TYPE.ROCK:
        this.hp = this.maxHp = 4;
        this.harvestTime = 1800;
        this.drops = [{ item: 'stone', min: 1, max: 2 }];
        this.xpReward = { skill: SKILL.MINING, amount: 35 };
        this._respawnTime = 40000;
        break;
      case ENTITY_TYPE.IRON_VEIN:
        this.hp = this.maxHp = 5;
        this.harvestTime = 2200;
        this.drops = [{ item: 'iron_ore', min: 1, max: 2 }];
        this.xpReward = { skill: SKILL.MINING, amount: 60 };
        this._respawnTime = 60000;
        break;
      case ENTITY_TYPE.GOBLIN:
        this.hp = this.maxHp = 8;
        this.harvestTime = 1200;
        this.drops = [{ item: 'stone', min: 1, max: 2 }];
        this.xpReward = { skill: SKILL.COMBAT, amount: 50 };
        this._respawnTime = 0;
        this._moveTimer = 0;
        this._moveInterval = 2500;
        break;
    }
  }

  hit(damage = 1) {
    this.hp = Math.max(0, this.hp - damage);
    this._shakeTimer = 180;
    this._shakeX = (Math.random() - 0.5) * 4;
    if (this.hp <= 0) {
      this.alive = false;
      this._respawnTimer = this._respawnTime;
    }
  }

  update(dt, world, entities) {
    if (this._shakeTimer > 0) this._shakeTimer -= dt;

    if (!this.alive) {
      if (this._respawnTime > 0) {
        this._respawnTimer -= dt;
        if (this._respawnTimer <= 0) {
          this.alive = true;
          this.hp = this.maxHp;
        }
      }
      return;
    }

    if (this.type === ENTITY_TYPE.GOBLIN) this._roam(dt, world, entities);
  }

  _roam(dt, world, entities) {
    this._moveTimer += dt;
    if (this._moveTimer < this._moveInterval) return;
    this._moveTimer = 0;

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const options = dirs
      .map(([dx, dy]) => ({ x: this.x + dx, y: this.y + dy }))
      .filter(({ x, y }) =>
        world.isWalkable(x, y) &&
        !entities.find(e => e !== this && e.alive && e.blocksTile && e.x === x && e.y === y)
      );
    if (!options.length) return;
    const next = options[Math.floor(Math.random() * options.length)];
    this.x = next.x;
    this.y = next.y;
  }

  draw(ctx, camera) {
    if (!this.alive) return;

    const shake = this._shakeTimer > 0 ? this._shakeX * (this._shakeTimer / 180) : 0;
    const px = Math.floor(this.x * TILE_SIZE - camera.x) + shake;
    const py = Math.floor(this.y * TILE_SIZE - camera.y);

    switch (this.type) {
      case ENTITY_TYPE.TREE:      this._drawTree(ctx, px, py); break;
      case ENTITY_TYPE.ROCK:      this._drawRock(ctx, px, py, false); break;
      case ENTITY_TYPE.IRON_VEIN: this._drawRock(ctx, px, py, true); break;
      case ENTITY_TYPE.GOBLIN:    this._drawGoblin(ctx, px, py); break;
    }

    if (this.hp < this.maxHp) {
      const bw = TILE_SIZE - 6, bx = px + 3, by = py - 7;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = COLORS.HP_GREEN;
      ctx.fillRect(bx, by, bw * (this.hp / this.maxHp), 4);
    }
  }

  _drawTree(ctx, px, py) {
    const cx = px + TILE_SIZE / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, py + TILE_SIZE - 4, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.TREE_TRUNK;
    ctx.fillRect(cx - 4, py + 15, 8, TILE_SIZE - 14);

    ctx.fillStyle = COLORS.TREE_LEAVES;
    ctx.beginPath();
    ctx.arc(cx, py + 14, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.TREE_LEAVES_LIGHT;
    ctx.beginPath();
    ctx.arc(cx - 2, py + 8, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.arc(cx - 4, py + 5, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawRock(ctx, px, py, isIron) {
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE - 10;

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.ROCK_DARK;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isIron ? '#8d6e63' : COLORS.ROCK;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 1, 14, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isIron ? '#a1887f' : COLORS.ROCK_LIGHT;
    ctx.beginPath();
    ctx.ellipse(cx - 3, cy - 4, 6, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();

    if (isIron) {
      ctx.fillStyle = COLORS.IRON_SPECK;
      [[cx - 3, cy - 2], [cx + 4, cy + 1], [cx, cy - 5]].forEach(([ix, iy]) => {
        ctx.beginPath();
        ctx.arc(ix, iy, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  _drawGoblin(ctx, px, py) {
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, py + TILE_SIZE - 4, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLORS.GOBLIN_BODY;
    ctx.fillRect(cx - 7, cy - 4, 14, 14);

    ctx.fillStyle = '#2e5c1a';
    ctx.fillRect(cx - 6, cy - 14, 12, 12);

    ctx.fillStyle = COLORS.GOBLIN_EYE;
    ctx.fillRect(cx - 4, cy - 11, 3, 3);
    ctx.fillRect(cx + 1, cy - 11, 3, 3);

    ctx.fillStyle = '#2e5c1a';
    ctx.fillRect(cx - 9, cy - 13, 4, 6);
    ctx.fillRect(cx + 5, cy - 13, 4, 6);
  }
}

export function spawnInitialEntities(world) {
  const entities = [];
  const cx = Math.floor(MAP_W / 2);
  const cy = Math.floor(MAP_H / 2);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (world.tileAt(x, y) !== TILE.GRASS) continue;
      if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1) continue;
      const r = Math.random();
      if (r < 0.12)      entities.push(new Entity(ENTITY_TYPE.TREE, x, y));
      else if (r < 0.18) entities.push(new Entity(ENTITY_TYPE.ROCK, x, y));
    }
  }

  entities.push(new Entity(ENTITY_TYPE.GOBLIN, cx + 4, cy + 3));
  return entities;
}
