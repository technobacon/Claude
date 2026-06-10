// The bestiary — and therefore the class system. Every enemy here is also a
// playable body once possessed. Stats serve double duty: what you fight is
// exactly what you become, which keeps balance honest by construction.
//
// speed: 'slow' acts every other turn, 'normal' every turn, 'fast' gets an
//        extra action every other turn.
// decay: turns a possessed body lasts before crumbling back to soul form.
// essence: drop on kill (also the corpse's "quality" signal to the player).

export const BODIES = {
  rat: {
    id: 'rat', name: 'Gravewarren Rat', tier: 1,
    hp: 8, atk: 3, def: 0, speed: 'fast', decay: 70, essence: 3, sight: 7,
    ability: { id: 'scurry', name: 'Scurry', cd: 6, desc: 'Dash 3 tiles in your last move direction.' },
    desc: 'Quick and fragile. Its legs are better than its teeth.',
  },
  bat: {
    id: 'bat', name: 'Crypt Bat', tier: 1,
    hp: 7, atk: 3, def: 0, speed: 'fast', decay: 55, essence: 3, sight: 8,
    ability: { id: 'shriek', name: 'Echo Shriek', cd: 8, desc: 'Stun all adjacent enemies for 2 turns.' },
    desc: 'Erratic wings, piercing voice.',
  },
  slime: {
    id: 'slime', name: 'Ossuary Slime', tier: 1,
    hp: 14, atk: 3, def: 1, speed: 'slow', decay: 100, essence: 4, sight: 5,
    ability: { id: 'regen', name: 'Reknit', cd: 9, desc: 'Restore 6 HP.' },
    desc: 'Slow, patient, and very hard to discourage.',
  },
  skeleton: {
    id: 'skeleton', name: 'Restless Skeleton', tier: 1,
    hp: 12, atk: 4, def: 1, speed: 'normal', decay: 110, essence: 5, sight: 7,
    ability: { id: 'bonetoss', name: 'Bone Toss', cd: 5, desc: 'Throw a rib at the nearest enemy (range 5, 4 dmg).' },
    desc: 'The dungeon standard. Reliable joints, detachable ammunition.',
  },
  goblin: {
    id: 'goblin', name: 'Tunnel Goblin', tier: 2,
    hp: 12, atk: 4, def: 1, speed: 'normal', decay: 90, essence: 6, sight: 8,
    ability: { id: 'shank', name: 'Shank', cd: 6, desc: 'Vicious melee strike for double damage.' },
    desc: 'Knows where the soft parts are.',
  },
  spider: {
    id: 'spider', name: 'Pale Weaver', tier: 2,
    hp: 11, atk: 4, def: 1, speed: 'fast', decay: 80, essence: 6, sight: 7,
    ability: { id: 'web', name: 'Web', cd: 8, desc: 'Root the nearest enemy in place for 3 turns (range 4).' },
    desc: 'Eight legs, one very specific plan.',
  },
  zombie: {
    id: 'zombie', name: 'Sodden Zombie', tier: 2,
    hp: 24, atk: 5, def: 1, speed: 'slow', decay: 150, essence: 7, sight: 6,
    ability: { id: 'devour', name: 'Devour', cd: 4, desc: 'Eat an adjacent corpse to restore 8 HP.' },
    desc: 'Eats corpses. Yes, the ones you wanted to wear.',
    eatsCorpses: true,
  },
  archer: {
    id: 'archer', name: 'Skeleton Archer', tier: 2,
    hp: 10, atk: 3, def: 1, speed: 'normal', decay: 100, essence: 7, sight: 9,
    ranged: { range: 5 },
    ability: { id: 'powershot', name: 'Power Shot', cd: 3, desc: 'Shoot the nearest enemy (range 6, atk +2 dmg).' },
    desc: 'Keeps its distance. As a body, so can you.',
  },
  cultist: {
    id: 'cultist', name: 'Ember Cultist', tier: 3,
    hp: 13, atk: 4, def: 1, speed: 'normal', decay: 95, essence: 9, sight: 8,
    ranged: { range: 5 },
    ability: { id: 'firebolt', name: 'Fire Bolt', cd: 3, desc: 'Burn the nearest enemy (range 5, atk dmg + burning).' },
    desc: 'Half a sermon, half a flamethrower.',
  },
  wraith: {
    id: 'wraith', name: 'Hollow Wraith', tier: 3,
    hp: 14, atk: 5, def: 1, speed: 'normal', decay: 60, essence: 10, sight: 8,
    phasing: true,
    ability: { id: 'drain', name: 'Soul Drain', cd: 7, desc: 'Drain 5 HP from an adjacent enemy, healing yourself.' },
    desc: 'Walks through walls. Decays alarmingly fast — momentum is mandatory.',
  },
  knight: {
    id: 'knight', name: 'Tomb Knight', tier: 3,
    hp: 26, atk: 6, def: 3, speed: 'normal', decay: 140, essence: 12, sight: 7, heavy: true,
    ability: { id: 'bash', name: 'Shield Bash', cd: 8, desc: 'Strike an adjacent enemy and stun it for 2 turns.' },
    desc: 'A walking fortress with excellent posture.',
  },
  frostmage: {
    id: 'frostmage', name: 'Rimecaller', tier: 3,
    hp: 14, atk: 5, def: 1, speed: 'normal', decay: 90, essence: 12, sight: 9,
    ranged: { range: 5 },
    ability: { id: 'frostlance', name: 'Frost Lance', cd: 4, desc: 'Pierce the nearest enemy (range 5, atk dmg + slowed 3 turns).' },
    desc: 'Cold hands, colder opinions.',
  },
  ogre: {
    id: 'ogre', name: 'Marrow Ogre', tier: 4,
    hp: 36, atk: 8, def: 2, speed: 'slow', decay: 160, essence: 14, sight: 6, heavy: true,
    ability: { id: 'smash', name: 'Smash', cd: 7, desc: 'Slam everything adjacent for full attack damage.' },
    desc: 'A blunt instrument the size of a doorway.',
  },
  elemental: {
    id: 'elemental', name: 'Forge Elemental', tier: 4,
    hp: 22, atk: 6, def: 1, speed: 'normal', decay: 75, essence: 14, sight: 8,
    burnImmune: true,
    ability: { id: 'flamewave', name: 'Flame Wave', cd: 8, desc: 'Ignite all enemies within 2 tiles (atk dmg + burning).' },
    desc: 'A grudge given temperature.',
  },
  warden: {
    id: 'warden', name: 'The Warden', tier: 5, boss: true,
    hp: 80, atk: 9, def: 2, speed: 'normal', decay: 250, essence: 100, sight: 12,
    ability: { id: 'summon', name: 'Toll the Bell', cd: 7, desc: 'Summon servants to the Warden\'s side.' },
    desc: 'Keeper of the deep door. Wearing it is the only way out.',
  },
};

export const BODY_IDS = Object.keys(BODIES);

// Spawn weights per floor depth (1-indexed). Tuned so each floor introduces
// something new while keeping a tail of familiar enemies as corpse fodder.
export const SPAWN_TABLES = {
  1: [['rat', 4], ['bat', 3], ['slime', 3], ['skeleton', 2]],
  2: [['rat', 3], ['bat', 2], ['slime', 2], ['skeleton', 3], ['goblin', 2]],
  3: [['skeleton', 2], ['goblin', 3], ['spider', 3], ['zombie', 2], ['archer', 2]],
  4: [['goblin', 2], ['spider', 2], ['zombie', 3], ['archer', 3], ['cultist', 2]],
  5: [['zombie', 2], ['archer', 2], ['cultist', 3], ['wraith', 2], ['knight', 2]],
  6: [['cultist', 2], ['wraith', 2], ['knight', 3], ['frostmage', 3], ['ogre', 1]],
  7: [['knight', 2], ['frostmage', 2], ['wraith', 2], ['ogre', 3], ['elemental', 3]],
  8: [['knight', 2], ['cultist', 2], ['elemental', 2]], // plus the Warden
};

export const MAX_DEPTH = 8;

// Enemies per floor: floors 1-2 stay gentle (onboarding), deep floors crowd.
export function enemyCountForDepth(depth) {
  if (depth === 1) return 5;
  if (depth === 2) return 7;
  return 6 + depth;
}
