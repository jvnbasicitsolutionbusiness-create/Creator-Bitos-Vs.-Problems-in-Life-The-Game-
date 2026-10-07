/**
 * personalities.js — how each problem behaves.
 *
 * These are behaviour weights, not stat cheats. Combined with the difficulty
 * profile (config/difficulty.js) they produce noticeably different opponents:
 * Laziness stalls and counter-pokes; Wrath never stops swinging; Society holds
 * space and punishes commitment.
 */

const BASE = {
  preferredRange: 130,
  aggression: 0.6,
  patience: 0.4,
  jumpiness: 0.15,
  blockTendency: 0.4,
  specialLove: 0.4,
  antiAir: 0.3,
  mixup: 0.3,
  comboLength: 2,
  backdashLove: 0.2,
  projectileLove: 0.3,
  punishFocus: 0.5,
  lowHealthMode: 'desperate', // 'desperate' | 'turtle' | 'berserk'
  idleTaunt: 0.05,
  reactionBonus: 0
};

export const PERSONALITIES = {
  laziness: {
    ...BASE,
    preferredRange: 160,
    aggression: 0.34,
    patience: 0.85,
    jumpiness: 0.04,
    blockTendency: 0.55,
    specialLove: 0.35,
    antiAir: 0.12,
    comboLength: 1,
    projectileLove: 0.05,
    backdashLove: 0.1,
    punishFocus: 0.75,
    lowHealthMode: 'berserk',
    reactionBonus: 4
  },
  gadget: {
    ...BASE,
    preferredRange: 300,
    aggression: 0.45,
    patience: 0.5,
    jumpiness: 0.2,
    blockTendency: 0.3,
    specialLove: 0.9, // summons constantly while any remain
    antiAir: 0.25,
    comboLength: 2,
    projectileLove: 0.2,
    punishFocus: 0.4,
    lowHealthMode: 'desperate'
  },
  addiction: {
    ...BASE,
    preferredRange: 70,
    aggression: 0.95,
    patience: 0.12,
    jumpiness: 0.18,
    blockTendency: 0.22,
    specialLove: 0.6, // armoured dash
    antiAir: 0.3,
    comboLength: 3,
    backdashLove: 0.05,
    projectileLove: 0.0,
    punishFocus: 0.6,
    lowHealthMode: 'berserk'
  },
  lust: {
    ...BASE,
    preferredRange: 110,
    aggression: 0.7,
    patience: 0.35,
    jumpiness: 0.45,
    blockTendency: 0.28,
    specialLove: 0.75, // teleport mixups
    antiAir: 0.45,
    mixup: 0.8,
    comboLength: 2,
    backdashLove: 0.4,
    projectileLove: 0.05,
    punishFocus: 0.55,
    lowHealthMode: 'desperate'
  },
  society: {
    ...BASE,
    preferredRange: 190,
    aggression: 0.55,
    patience: 0.6,
    jumpiness: 0.08,
    blockTendency: 0.62,
    specialLove: 0.5,
    antiAir: 0.35,
    mixup: 0.35,
    comboLength: 2,
    projectileLove: 0.15,
    backdashLove: 0.3,
    punishFocus: 0.8,
    lowHealthMode: 'turtle',
    reactionBonus: -2
  },
  suicide: {
    ...BASE,
    preferredRange: 140,
    aggression: 0.42,
    patience: 0.7,
    jumpiness: 0.1,
    blockTendency: 0.5,
    specialLove: 0.55,
    antiAir: 0.2,
    comboLength: 2,
    projectileLove: 0.1,
    punishFocus: 0.5,
    lowHealthMode: 'turtle'
  },
  suffering: {
    ...BASE,
    preferredRange: 150,
    aggression: 0.62,
    patience: 0.55,
    jumpiness: 0.05,
    blockTendency: 0.45,
    specialLove: 0.55,
    antiAir: 0.25,
    comboLength: 2,
    projectileLove: 0.1,
    backdashLove: 0.15,
    punishFocus: 0.7,
    lowHealthMode: 'berserk',
    reactionBonus: -1
  },
  wrath: {
    ...BASE,
    preferredRange: 80,
    aggression: 1.0,
    patience: 0.08,
    jumpiness: 0.3,
    blockTendency: 0.18,
    specialLove: 0.85, // flurries
    antiAir: 0.4,
    mixup: 0.5,
    comboLength: 4,
    backdashLove: 0.05,
    projectileLove: 0.0,
    punishFocus: 0.5,
    lowHealthMode: 'berserk',
    reactionBonus: -2
  },
  school: {
    ...BASE,
    preferredRange: 260,
    aggression: 0.55,
    patience: 0.6,
    jumpiness: 0.14,
    blockTendency: 0.5,
    specialLove: 0.6,
    antiAir: 0.35,
    mixup: 0.45,
    comboLength: 2,
    projectileLove: 0.7,
    backdashLove: 0.35,
    punishFocus: 0.65,
    lowHealthMode: 'desperate'
  },
  seizure: {
    ...BASE,
    preferredRange: 120,
    aggression: 0.85,
    patience: 0.2,
    jumpiness: 0.35,
    blockTendency: 0.4,
    specialLove: 0.8,
    antiAir: 0.5,
    mixup: 0.85,
    comboLength: 3,
    backdashLove: 0.3,
    projectileLove: 0.2,
    punishFocus: 0.7,
    lowHealthMode: 'berserk',
    reactionBonus: -3
  },
  'creator-bitos': {
    ...BASE,
    preferredRange: 120,
    aggression: 0.65,
    patience: 0.4,
    jumpiness: 0.2,
    blockTendency: 0.45,
    specialLove: 0.5,
    antiAir: 0.35,
    comboLength: 2,
    projectileLove: 0.35,
    punishFocus: 0.6,
    lowHealthMode: 'desperate'
  }
};

export function personalityFor(id) {
  return PERSONALITIES[id] || { ...BASE };
}

/** Final-boss phase modifiers — Seizure changes the way it moves, not just its damage. */
export const PHASE_MODIFIERS = [
  { aggression: 1.0, speed: 1.0, specialLove: 1.0, jumpiness: 1.0 },
  { aggression: 1.15, speed: 1.12, specialLove: 1.2, jumpiness: 1.3 },
  { aggression: 1.3, speed: 1.24, specialLove: 1.45, jumpiness: 1.6 }
];
