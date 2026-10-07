/**
 * difficulty.js — how each difficulty reshapes enemy AI.
 *
 * Deliberately does NOT scale enemy HP (spec section 27): enemies think and
 * react differently instead of becoming damage sponges.
 */
export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: 'EASY',
    blurb: 'Problems hold back. Reactions are slow and combos stay short.',
    reactionFrames: 26,
    aggression: 0.42,
    blockChance: 0.18,
    comboChance: 0.22,
    specialChance: 0.18,
    antiAirChance: 0.1,
    punishWindow: 0.15,
    damageTaken: 1.15,
    damageDealt: 0.8,
    inputDelayFrames: 12,
    mixupRate: 0.1
  },
  normal: {
    id: 'normal',
    label: 'NORMAL',
    blurb: 'A fair fight. The problems read your habits and answer them.',
    reactionFrames: 16,
    aggression: 0.62,
    blockChance: 0.38,
    comboChance: 0.45,
    specialChance: 0.4,
    antiAirChance: 0.3,
    punishWindow: 0.3,
    damageTaken: 1.0,
    damageDealt: 1.0,
    inputDelayFrames: 7,
    mixupRate: 0.3
  },
  hard: {
    id: 'hard',
    label: 'HARD',
    blurb: 'Relentless pressure, fast punishes and frequent specials.',
    reactionFrames: 10,
    aggression: 0.8,
    blockChance: 0.55,
    comboChance: 0.65,
    specialChance: 0.6,
    antiAirChance: 0.5,
    punishWindow: 0.5,
    damageTaken: 0.92,
    damageDealt: 1.15,
    inputDelayFrames: 4,
    mixupRate: 0.5
  },
  veryHard: {
    id: 'veryHard',
    label: 'VERY HARD',
    blurb: 'Every problem fights at full intensity with near-perfect reads.',
    reactionFrames: 6,
    aggression: 0.94,
    blockChance: 0.7,
    comboChance: 0.82,
    specialChance: 0.78,
    antiAirChance: 0.7,
    punishWindow: 0.7,
    damageTaken: 0.85,
    damageDealt: 1.28,
    inputDelayFrames: 2,
    mixupRate: 0.7
  }
};

export function difficultyFor(id) {
  return DIFFICULTIES[id] || DIFFICULTIES.normal;
}

/** Round-based escalation: later problems are sharper even on the same setting. */
export function scaleDifficultyForRound(base, roundNumber, totalRounds = 10) {
  const t = Math.min(1, Math.max(0, (roundNumber - 1) / Math.max(1, totalRounds - 1)));
  return {
    ...base,
    reactionFrames: Math.max(4, Math.round(base.reactionFrames * (1 - 0.35 * t))),
    aggression: Math.min(1, base.aggression + 0.2 * t),
    blockChance: Math.min(0.85, base.blockChance + 0.2 * t),
    comboChance: Math.min(0.9, base.comboChance + 0.22 * t),
    specialChance: Math.min(0.9, base.specialChance + 0.25 * t),
    antiAirChance: Math.min(0.85, base.antiAirChance + 0.3 * t),
    inputDelayFrames: Math.max(1, Math.round(base.inputDelayFrames * (1 - 0.5 * t))),
    damageDealt: base.damageDealt * (1 + 0.18 * t),
    roundNumber
  };
}
