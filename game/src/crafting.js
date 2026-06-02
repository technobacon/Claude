import { SKILL } from './constants.js';

export const RECIPES = [
  {
    id: 'wooden_axe',
    name: 'Wooden Axe',
    desc: 'Chop trees 30% faster',
    ingredients: [{ item: 'log', qty: 3 }],
    result: { item: 'wooden_axe', qty: 1 },
    xp: { skill: SKILL.CRAFTING, amount: 20 },
    reqLevel: { skill: SKILL.WOODCUTTING, level: 1 },
    effect: { skill: SKILL.WOODCUTTING, speedMult: 0.7 },
  },
  {
    id: 'stone_pickaxe',
    name: 'Stone Pickaxe',
    desc: 'Mine rocks 30% faster',
    ingredients: [{ item: 'stone', qty: 3 }, { item: 'log', qty: 1 }],
    result: { item: 'stone_pickaxe', qty: 1 },
    xp: { skill: SKILL.CRAFTING, amount: 30 },
    reqLevel: { skill: SKILL.MINING, level: 1 },
    effect: { skill: SKILL.MINING, speedMult: 0.7 },
  },
  {
    id: 'iron_bar',
    name: 'Iron Bar',
    desc: 'Smelt iron ore into bars',
    ingredients: [{ item: 'iron_ore', qty: 2 }, { item: 'stone', qty: 1 }],
    result: { item: 'iron_bar', qty: 1 },
    xp: { skill: SKILL.CRAFTING, amount: 50 },
    reqLevel: { skill: SKILL.CRAFTING, level: 2 },
    effect: null,
  },
  {
    id: 'iron_sword',
    name: 'Iron Sword',
    desc: 'Deal more damage to goblins',
    ingredients: [{ item: 'iron_bar', qty: 2 }, { item: 'log', qty: 1 }],
    result: { item: 'iron_sword', qty: 1 },
    xp: { skill: SKILL.CRAFTING, amount: 80 },
    reqLevel: { skill: SKILL.COMBAT, level: 1 },
    effect: { skill: SKILL.COMBAT, damage: 3 },
  },
];

export function canCraft(recipe, inventory, skills) {
  return (
    recipe.ingredients.every(({ item, qty }) => inventory.has(item, qty)) &&
    skills.getLevel(recipe.reqLevel.skill) >= recipe.reqLevel.level
  );
}

export function getToolSpeedMult(inventory, skill) {
  for (const recipe of RECIPES) {
    if (recipe.effect?.skill === skill && inventory.has(recipe.result.item)) {
      return recipe.effect.speedMult ?? 1;
    }
  }
  return 1;
}

export function getCombatDamage(inventory) {
  for (const recipe of RECIPES) {
    if (recipe.effect?.skill === 'combat' && inventory.has(recipe.result.item)) {
      return recipe.effect.damage ?? 1;
    }
  }
  return 1;
}
