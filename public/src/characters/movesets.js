/**
 * movesets.js — attack definitions and frame data.
 *
 * Frame counts are in 60 Hz ticks, so every attack has a real startup / active /
 * recovery window that combat resolves against actual hitboxes. Nothing here
 * "subtracts HP" without a hitbox connecting during the active frames.
 *
 * Hitbox space:  x = forward offset from the fighter's centre (facing space)
 *                y = height of the box's BOTTOM edge above the ground
 */

const BASE_MOVE = {
  type: 'light',
  anim: 'lightPunch',
  startup: 6,
  active: 3,
  recovery: 10,
  damage: 5,
  chip: 0.6,
  hitstun: 14,
  blockstun: 9,
  knockback: { x: 130, y: 0 },
  hitbox: { x: 20, y: 84, w: 52, h: 26 },
  meterGain: 6,
  meterCost: 0,
  level: 'high',
  airOk: false,
  crouchOk: false,
  cancelInto: [],
  effect: 'spark',
  hitstop: 0.055,
  shake: 3,
  sfx: 'punch',
  projectile: null,
  summon: null,
  armour: 0, // frames of super armour at the start of the move
  invuln: 0,
  launch: false,
  hits: 1
};

function move(def) {
  return { ...BASE_MOVE, ...def };
}

/** The shared skeleton every fighter builds from. */
export function baseMoveset() {
  return {
    lightPunch: move({
      id: 'lightPunch',
      name: 'LIGHT PUNCH',
      input: 'J',
      anim: 'lightPunch',
      startup: 5,
      active: 3,
      recovery: 9,
      damage: 5,
      hitstun: 14,
      blockstun: 9,
      knockback: { x: 120, y: 0 },
      hitbox: { x: 20, y: 84, w: 54, h: 26 },
      cancelInto: ['heavyPunch', 'lightKick', 'heavyKick', 'special', 'ultimate'],
      sfx: 'punch'
    }),

    heavyPunch: move({
      id: 'heavyPunch',
      name: 'HEAVY PUNCH',
      input: 'K',
      type: 'heavy',
      anim: 'heavyPunch',
      startup: 11,
      active: 4,
      recovery: 19,
      damage: 12,
      chip: 1.6,
      hitstun: 22,
      blockstun: 14,
      knockback: { x: 330, y: -40 },
      hitbox: { x: 24, y: 78, w: 66, h: 32 },
      meterGain: 10,
      hitstop: 0.09,
      shake: 7,
      cancelInto: ['special', 'ultimate'],
      sfx: 'heavy'
    }),

    lightKick: move({
      id: 'lightKick',
      name: 'LIGHT KICK',
      input: 'U',
      type: 'kick',
      anim: 'lightKick',
      startup: 7,
      active: 3,
      recovery: 12,
      damage: 7,
      hitstun: 16,
      blockstun: 10,
      knockback: { x: 180, y: 0 },
      hitbox: { x: 24, y: 50, w: 60, h: 28 },
      level: 'mid',
      meterGain: 7,
      cancelInto: ['heavyKick', 'special', 'ultimate'],
      sfx: 'kick'
    }),

    heavyKick: move({
      id: 'heavyKick',
      name: 'HEAVY KICK',
      input: 'I',
      type: 'heavy',
      anim: 'heavyKick',
      startup: 13,
      active: 5,
      recovery: 21,
      damage: 15,
      chip: 2,
      hitstun: 26,
      blockstun: 16,
      knockback: { x: 430, y: -180 },
      hitbox: { x: 26, y: 58, w: 72, h: 36 },
      level: 'high',
      meterGain: 12,
      hitstop: 0.1,
      shake: 9,
      launch: true,
      cancelInto: ['ultimate'],
      sfx: 'heavy'
    }),

    crouchPunch: move({
      id: 'crouchPunch',
      name: 'CROUCH PUNCH',
      input: 'S + J',
      anim: 'lightPunch',
      startup: 6,
      active: 3,
      recovery: 11,
      damage: 4,
      hitstun: 13,
      blockstun: 8,
      knockback: { x: 90, y: 0 },
      hitbox: { x: 20, y: 34, w: 50, h: 24 },
      level: 'low',
      crouchOk: true,
      requiresCrouch: true,
      meterGain: 5,
      sfx: 'punch'
    }),

    sweep: move({
      id: 'sweep',
      name: 'SWEEPING KICK',
      input: 'S + I',
      type: 'heavy',
      anim: 'sweep',
      startup: 10,
      active: 5,
      recovery: 24,
      damage: 11,
      chip: 1.4,
      hitstun: 30,
      blockstun: 12,
      knockback: { x: 260, y: 0 },
      hitbox: { x: 22, y: 0, w: 84, h: 30 },
      level: 'low',
      crouchOk: true,
      requiresCrouch: true,
      meterGain: 9,
      knockdown: true,
      hitstop: 0.08,
      shake: 6,
      sfx: 'sweep'
    }),

    jumpPunch: move({
      id: 'jumpPunch',
      name: 'JUMP PUNCH',
      input: 'AIR + J',
      anim: 'lightPunch',
      startup: 5,
      active: 6,
      recovery: 8,
      damage: 7,
      hitstun: 16,
      blockstun: 10,
      knockback: { x: 140, y: 60 },
      hitbox: { x: 18, y: 40, w: 54, h: 30 },
      level: 'high',
      airOk: true,
      requiresAir: true,
      meterGain: 7,
      sfx: 'punch'
    }),

    jumpKick: move({
      id: 'jumpKick',
      name: 'JUMP KICK',
      input: 'AIR + I',
      type: 'heavy',
      anim: 'jumpKick',
      startup: 7,
      active: 7,
      recovery: 12,
      damage: 12,
      chip: 1.5,
      hitstun: 20,
      blockstun: 12,
      knockback: { x: 260, y: 40 },
      hitbox: { x: 20, y: 20, w: 66, h: 40 },
      level: 'mid',
      airOk: true,
      requiresAir: true,
      meterGain: 10,
      hitstop: 0.08,
      shake: 6,
      sfx: 'kick'
    })
  };
}

/* -------------------------------------------------------------------------- */
/* Archetype specials                                                          */
/* -------------------------------------------------------------------------- */

function projectileMove(overrides = {}) {
  return move({
    id: 'special',
    name: 'SPECIAL',
    input: 'O',
    type: 'special',
    anim: 'special',
    startup: 14,
    active: 4,
    recovery: 24,
    damage: 10,
    chip: 1.2,
    hitstun: 24,
    blockstun: 14,
    knockback: { x: 320, y: -60 },
    hitbox: { x: 26, y: 76, w: 60, h: 30 },
    level: 'mid',
    meterGain: 8,
    meterCost: 25,
    effect: 'energy',
    hitstop: 0.09,
    shake: 7,
    sfx: 'special',
    projectile: {
      speed: 620,
      w: 46,
      h: 40,
      y: 82,
      damage: 12,
      life: 1.5,
      color: '#ff2b3c',
      kind: 'wave',
      hitstun: 26,
      knockback: { x: 340, y: -70 }
    },
    ...overrides
  });
}

function ultimateMove(overrides = {}) {
  return move({
    id: 'ultimate',
    name: 'ULTIMATE',
    input: 'P',
    type: 'ultimate',
    anim: 'ultimate',
    startup: 18,
    active: 8,
    recovery: 34,
    damage: 30,
    chip: 4,
    hitstun: 40,
    blockstun: 22,
    knockback: { x: 560, y: -260 },
    hitbox: { x: 10, y: 0, w: 150, h: 150 },
    level: 'mid',
    meterGain: 0,
    meterCost: 100,
    effect: 'energy',
    hitstop: 0.16,
    shake: 18,
    sfx: 'ultimate',
    invuln: 18,
    cinematic: true,
    ...overrides
  });
}

/* -------------------------------------------------------------------------- */
/* Per-character move sets                                                     */
/* -------------------------------------------------------------------------- */

const MOVESETS = {
  'creator-bitos': (base) => ({
    ...base,
    special: projectileMove({
      name: 'FOCUS BURST',
      damage: 10,
      startup: 13,
      recovery: 22,
      projectile: {
        speed: 660,
        w: 52,
        h: 44,
        y: 84,
        damage: 12,
        life: 1.4,
        color: '#ff2b3c',
        kind: 'wave',
        hitstun: 26,
        knockback: { x: 340, y: -70 }
      }
    }),
    ultimate: ultimateMove({
      name: 'UNBREAKABLE FOCUS',
      damage: 30,
      armour: 20,
      projectile: {
        speed: 900,
        w: 120,
        h: 110,
        y: 40,
        damage: 30,
        life: 1.1,
        color: '#ff6b6b',
        kind: 'beam',
        hitstun: 44,
        knockback: { x: 620, y: -240 },
        hits: 1
      }
    })
  }),

  laziness: (base) => ({
    ...base,
    lightPunch: { ...base.lightPunch, startup: 7, recovery: 13, damage: 5 },
    heavyPunch: { ...base.heavyPunch, startup: 14, recovery: 24, damage: 13, hitbox: { x: 26, y: 74, w: 74, h: 34 } },
    heavyKick: { ...base.heavyKick, startup: 16, recovery: 26, damage: 16, hitbox: { x: 28, y: 52, w: 82, h: 38 } },
    special: move({
      id: 'special',
      name: 'FIVE MORE MINUTES',
      input: 'O',
      type: 'special',
      anim: 'special',
      startup: 16,
      active: 5,
      recovery: 28,
      damage: 14,
      hitstun: 34,
      blockstun: 0,
      knockback: { x: 220, y: 0 },
      hitbox: { x: 16, y: 30, w: 74, h: 90 },
      level: 'mid',
      meterGain: 10,
      meterCost: 25,
      effect: 'dark',
      hitstop: 0.1,
      shake: 8,
      sfx: 'grab',
      grab: true,
      unblockable: true
    }),
    ultimate: ultimateMove({
      name: 'THE BIG YAWN',
      damage: 26,
      startup: 22,
      active: 12,
      recovery: 38,
      hitbox: { x: -40, y: 0, w: 240, h: 140 },
      effect: 'dark',
      shake: 14,
      drainsMeter: 40
    })
  }),

  gadget: (base) => ({
    ...base,
    lightPunch: { ...base.lightPunch, startup: 4, recovery: 8, damage: 4 },
    lightKick: { ...base.lightKick, startup: 6, recovery: 11, damage: 6 },
    special: move({
      id: 'special',
      name: 'JUST ONE MORE THING',
      input: 'O',
      type: 'special',
      anim: 'special',
      startup: 18,
      active: 3,
      recovery: 30,
      damage: 0,
      hitstun: 0,
      blockstun: 0,
      knockback: { x: 0, y: 0 },
      hitbox: { x: 0, y: 0, w: 0, h: 0 },
      meterGain: 12,
      meterCost: 25,
      effect: 'energy',
      sfx: 'summon',
      summon: { count: 1 },
      shake: 3
    }),
    ultimate: ultimateMove({
      name: 'DOOMSCROLL OVERLOAD',
      damage: 24,
      startup: 24,
      active: 14,
      recovery: 40,
      hitbox: { x: -60, y: 0, w: 320, h: 160 },
      effect: 'energy',
      shake: 12,
      summonAll: true
    })
  }),

  addiction: (base) => ({
    ...base,
    heavyPunch: { ...base.heavyPunch, startup: 12, damage: 13, armour: 8 },
    special: move({
      id: 'special',
      name: 'ONE MORE TIME',
      input: 'O',
      type: 'special',
      anim: 'special',
      startup: 15,
      active: 8,
      recovery: 26,
      damage: 16,
      chip: 2,
      hitstun: 28,
      blockstun: 16,
      knockback: { x: 380, y: -80 },
      hitbox: { x: 24, y: 40, w: 90, h: 80 },
      level: 'mid',
      meterGain: 10,
      meterCost: 25,
      effect: 'dark',
      hitstop: 0.1,
      shake: 9,
      sfx: 'dash',
      armour: 14,
      dash: { distance: 330, frames: 12 }
    }),
    ultimate: ultimateMove({
      name: 'RELAPSE SPIRAL',
      damage: 28,
      hits: 6,
      startup: 16,
      active: 30,
      recovery: 36,
      hitbox: { x: 10, y: 20, w: 120, h: 120 },
      effect: 'dark',
      shake: 14,
      multihit: { hits: 6, interval: 5, damage: 5 }
    })
  }),

  lust: (base) => ({
    ...base,
    lightPunch: { ...base.lightPunch, startup: 4, recovery: 8, damage: 4 },
    heavyKick: { ...base.heavyKick, startup: 11, recovery: 20, damage: 13 },
    special: move({
      id: 'special',
      name: 'LOOK OVER HERE',
      input: 'O',
      type: 'special',
      anim: 'special',
      startup: 12,
      active: 5,
      recovery: 22,
      damage: 12,
      hitstun: 24,
      blockstun: 14,
      knockback: { x: 300, y: -50 },
      hitbox: { x: 18, y: 60, w: 70, h: 50 },
      level: 'mid',
      meterGain: 10,
      meterCost: 25,
      effect: 'energy',
      hitstop: 0.08,
      shake: 6,
      sfx: 'teleport',
      teleport: { behind: true, offset: 72 }
    }),
    ultimate: ultimateMove({
      name: 'DISTRACTION FINALE',
      damage: 26,
      hits: 5,
      startup: 16,
      active: 26,
      recovery: 34,
      hitbox: { x: 10, y: 20, w: 130, h: 130 },
      effect: 'energy',
      shake: 12,
      multihit: { hits: 5, interval: 5, damage: 5.5 }
    })
  }),

  society: (base) => ({
    ...base,
    lightPunch: { ...base.lightPunch, hitbox: { x: 24, y: 82, w: 66, h: 26 }, damage: 6 },
    heavyPunch: { ...base.heavyPunch, hitbox: { x: 28, y: 76, w: 84, h: 34 }, damage: 14 },
    special: move({
      id: 'special',
      name: 'EXPECTATIONS',
      input: 'O',
      type: 'special',
      anim: 'special',
      startup: 17,
      active: 6,
      recovery: 28,
      damage: 14,
      chip: 2,
      hitstun: 26,
      blockstun: 16,
      knockback: { x: 300, y: -30 },
      hitbox: { x: 20, y: 0, w: 100, h: 46 },
      level: 'low',
      meterGain: 10,
      meterCost: 25,
      effect: 'shockwave',
      hitstop: 0.09,
      shake: 10,
      sfx: 'shockwave'
    }),
    ultimate: ultimateMove({
      name: 'JUDGEMENT OF THE CROWD',
      damage: 32,
      startup: 24,
      active: 14,
      recovery: 42,
      hitbox: { x: -80, y: 0, w: 420, h: 120 },
      effect: 'shockwave',
      shake: 20
    })
  }),

  suicide: (base) => ({
    ...base,
    heavyPunch: { ...base.heavyPunch, damage: 11, startup: 13 },
    special: move({
      id: 'special',
      name: 'THE QUIET ROOM',
      input: 'O',
      type: 'special',
      anim: 'special',
      startup: 18,
      active: 10,
      recovery: 26,
      damage: 9,
      chip: 1,
      hitstun: 20,
      blockstun: 14,
      knockback: { x: 180, y: 0 },
      hitbox: { x: -30, y: 0, w: 190, h: 130 },
      level: 'mid',
      meterGain: 14,
      meterCost: 25,
      effect: 'dark',
      hitstop: 0.08,
      shake: 6,
      sfx: 'aura',
      drainsMeter: 25,
      slowOpponent: { duration: 1.6, scale: 0.75 }
    }),
    ultimate: ultimateMove({
      name: 'STAY — PLEASE STAY',
      damage: 26,
      startup: 24,
      active: 16,
      recovery: 40,
      hitbox: { x: -40, y: 0, w: 260, h: 150 },
      effect: 'dark',
      shake: 10,
      drainsMeter: 60
    })
  }),

  suffering: (base) => ({
    ...base,
    lightPunch: { ...base.lightPunch, startup: 7, damage: 6, hitbox: { x: 24, y: 80, w: 60, h: 28 } },
    heavyPunch: { ...base.heavyPunch, startup: 15, recovery: 26, damage: 17, armour: 12, hitbox: { x: 28, y: 72, w: 78, h: 36 } },
    heavyKick: { ...base.heavyKick, startup: 16, recovery: 26, damage: 18, armour: 10 },
    special: move({
      id: 'special',
      name: 'HEAVY HOURS',
      input: 'O',
      type: 'special',
      anim: 'special',
      startup: 20,
      active: 8,
      recovery: 32,
      damage: 18,
      chip: 2.4,
      hitstun: 32,
      blockstun: 18,
      knockback: { x: 420, y: -40 },
      hitbox: { x: 22, y: 0, w: 120, h: 60 },
      level: 'low',
      meterGain: 10,
      meterCost: 25,
      effect: 'shockwave',
      hitstop: 0.11,
      shake: 12,
      sfx: 'shockwave',
      armour: 16
    }),
    ultimate: ultimateMove({
      name: 'THE LONG NIGHT',
      damage: 34,
      startup: 28,
      active: 16,
      recovery: 46,
      hitbox: { x: -60, y: 0, w: 360, h: 160 },
      effect: 'shockwave',
      shake: 22,
      armour: 20
    })
  }),

  wrath: (base) => ({
    ...base,
    lightPunch: { ...base.lightPunch, startup: 4, recovery: 7, damage: 5, meterGain: 8 },
    lightKick: { ...base.lightKick, startup: 5, recovery: 10, damage: 7, meterGain: 9 },
    heavyPunch: { ...base.heavyPunch, startup: 9, recovery: 18, damage: 13, meterGain: 14 },
    special: move({
      id: 'special',
      name: 'SHORT FUSE',
      input: 'O',
      type: 'special',
      anim: 'special',
      startup: 10,
      active: 22,
      recovery: 26,
      damage: 20,
      chip: 1.2,
      hitstun: 18,
      blockstun: 12,
      knockback: { x: 340, y: -60 },
      hitbox: { x: 22, y: 50, w: 80, h: 70 },
      level: 'mid',
      meterGain: 16,
      meterCost: 25,
      effect: 'flame',
      hitstop: 0.05,
      shake: 8,
      sfx: 'flurry',
      multihit: { hits: 5, interval: 4, damage: 4 }
    }),
    ultimate: ultimateMove({
      name: 'EVERYTHING, ALL AT ONCE',
      damage: 32,
      startup: 16,
      active: 34,
      recovery: 40,
      hitbox: { x: 10, y: 20, w: 140, h: 130 },
      effect: 'flame',
      shake: 18,
      multihit: { hits: 8, interval: 4, damage: 4.2 }
    })
  }),

  school: (base) => ({
    ...base,
    special: projectileMove({
      name: 'DEADLINE',
      damage: 9,
      startup: 15,
      recovery: 24,
      projectile: {
        speed: 540,
        w: 44,
        h: 56,
        y: 74,
        damage: 11,
        life: 1.8,
        color: '#f5c518',
        kind: 'paper',
        hitstun: 24,
        knockback: { x: 300, y: -40 }
      }
    }),
    ultimate: ultimateMove({
      name: 'FINALS WEEK',
      damage: 30,
      startup: 22,
      active: 18,
      recovery: 38,
      hitbox: { x: 0, y: 0, w: 200, h: 150 },
      effect: 'energy',
      shake: 16,
      projectile: {
        speed: 620,
        w: 90,
        h: 80,
        y: 60,
        damage: 26,
        life: 1.4,
        color: '#ffd75e',
        kind: 'wave',
        hitstun: 40,
        knockback: { x: 520, y: -200 }
      }
    })
  }),

  seizure: (base) => ({
    ...base,
    lightPunch: { ...base.lightPunch, startup: 4, recovery: 9, damage: 6 },
    heavyKick: { ...base.heavyKick, startup: 11, damage: 16, hitbox: { x: 28, y: 50, w: 80, h: 40 } },
    special: move({
      id: 'special',
      name: 'SIGNAL LOST',
      input: 'O',
      type: 'special',
      anim: 'special',
      startup: 13,
      active: 6,
      recovery: 24,
      damage: 13,
      hitstun: 26,
      blockstun: 15,
      knockback: { x: 320, y: -60 },
      hitbox: { x: 20, y: 40, w: 80, h: 80 },
      level: 'mid',
      meterGain: 12,
      meterCost: 25,
      effect: 'energy',
      hitstop: 0.09,
      shake: 8,
      sfx: 'teleport',
      teleport: { behind: true, offset: 84, afterimage: true }
    }),
    ultimate: ultimateMove({
      name: 'THE UNSTABLE HOUR',
      damage: 32,
      startup: 20,
      active: 30,
      recovery: 42,
      hitbox: { x: -30, y: 0, w: 280, h: 170 },
      effect: 'energy',
      shake: 16,
      multihit: { hits: 7, interval: 4, damage: 4.6 }
    })
  })
};

const cache = new Map();

/** Fully-resolved moveset for a character id. */
export function movesetFor(characterId) {
  if (cache.has(characterId)) return cache.get(characterId);
  const base = baseMoveset();
  const customise = MOVESETS[characterId];
  const set = customise ? customise(base) : { ...base, special: projectileMove(), ultimate: ultimateMove() };
  for (const key of Object.keys(set)) set[key].id = key;
  cache.set(characterId, set);
  return set;
}

/** Moves a fighter can start from the ground, in input-priority order. */
export const GROUND_MOVE_PRIORITY = ['ultimate', 'special', 'heavyKick', 'heavyPunch', 'lightKick', 'lightPunch', 'sweep', 'crouchPunch'];
export const AIR_MOVE_PRIORITY = ['jumpKick', 'jumpPunch'];
