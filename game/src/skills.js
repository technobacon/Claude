import { SKILL, XP_TABLE } from './constants.js';

export class Skills {
  constructor() {
    this._data = {};
    for (const s of Object.values(SKILL)) {
      this._data[s] = { xp: 0, level: 1 };
    }
    this._levelUps = [];
  }

  addXp(skill, amount) {
    const d = this._data[skill];
    if (!d) return;
    d.xp += amount;
    const newLevel = this._computeLevel(d.xp);
    if (newLevel > d.level) {
      d.level = newLevel;
      this._levelUps.push({ skill, level: newLevel });
    }
  }

  getLevel(skill) { return this._data[skill]?.level ?? 1; }
  getXp(skill) { return this._data[skill]?.xp ?? 0; }

  getProgress(skill) {
    const d = this._data[skill];
    if (!d) return { frac: 0, current: 0, needed: 0 };
    const level = d.level;
    const curThreshold = XP_TABLE[level - 1] ?? 0;
    const nextThreshold = XP_TABLE[level] ?? XP_TABLE[XP_TABLE.length - 1];
    const range = nextThreshold - curThreshold;
    const current = d.xp - curThreshold;
    return { frac: range > 0 ? current / range : 1, current, needed: range };
  }

  popLevelUp() { return this._levelUps.shift(); }

  _computeLevel(xp) {
    for (let i = XP_TABLE.length - 1; i >= 0; i--) {
      if (xp >= XP_TABLE[i]) return Math.min(i + 1, XP_TABLE.length);
    }
    return 1;
  }
}
