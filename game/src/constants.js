export const TILE = Object.freeze({
  DEEP_WATER: 0,
  WATER: 1,
  SAND: 2,
  GRASS: 3,
});

export const ENTITY_TYPE = Object.freeze({
  TREE: 'tree',
  ROCK: 'rock',
  IRON_VEIN: 'iron_vein',
  GOBLIN: 'goblin',
});

export const ITEM = Object.freeze({
  LOG: 'log',
  STONE: 'stone',
  IRON_ORE: 'iron_ore',
  IRON_BAR: 'iron_bar',
  WOODEN_AXE: 'wooden_axe',
  STONE_PICKAXE: 'stone_pickaxe',
  IRON_SWORD: 'iron_sword',
});

export const SKILL = Object.freeze({
  WOODCUTTING: 'woodcutting',
  MINING: 'mining',
  CRAFTING: 'crafting',
  COMBAT: 'combat',
});

// XP required to reach level N (index = level - 1)
export const XP_TABLE = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];

export const TILE_SIZE = 40;
export const MAP_W = 22;
export const MAP_H = 30;

export const CANVAS_W = 360;
export const CANVAS_H = 640;
export const UI_H = 185;

export const COLORS = {
  DEEP_WATER: '#1565c0',
  WATER: '#1e88e5',
  WATER_LIGHT: '#42a5f5',
  SAND: '#ffe082',
  SAND_DARK: '#ffd54f',
  GRASS: '#558b2f',
  GRASS_LIGHT: '#689f38',
  GRASS_DARK: '#33691e',
  DIRT: '#795548',
  TREE_TRUNK: '#4e342e',
  TREE_LEAVES: '#2e7d32',
  TREE_LEAVES_LIGHT: '#388e3c',
  ROCK: '#607d8b',
  ROCK_DARK: '#455a64',
  ROCK_LIGHT: '#78909c',
  IRON_SPECK: '#90a4ae',
  PLAYER_BODY: '#e64a19',
  PLAYER_SKIN: '#ffcc80',
  PLAYER_LEGS: '#4e342e',
  GOBLIN_BODY: '#558b2f',
  GOBLIN_EYE: '#f44336',
  UI_BG: '#1a1a2e',
  UI_PANEL: '#16213e',
  UI_PANEL_LIGHT: '#0f3460',
  UI_ACCENT: '#7c4dff',
  UI_ACCENT_HOVER: '#9c6fff',
  XP_COLOR: '#ffd740',
  TEXT: '#eceff1',
  TEXT_DIM: '#78909c',
  HP_RED: '#f44336',
  HP_GREEN: '#4caf50',
  EXPAND_FILL: 'rgba(124,77,255,0.25)',
  EXPAND_BORDER: 'rgba(124,77,255,0.9)',
  NOTIF_ITEM: '#a5d6a7',
  NOTIF_XP: '#fff59d',
  NOTIF_LEVEL: '#ffd740',
  NOTIF_ERROR: '#ef9a9a',
  NOTIF_EXPAND: '#ce93d8',
};
