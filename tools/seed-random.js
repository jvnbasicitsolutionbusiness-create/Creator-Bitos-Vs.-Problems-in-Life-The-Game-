/**
 * seed-random.js — deterministic randomness for the test suites.
 *
 * Import this FIRST in any tool that measures behaviour. The game's AI, camera
 * shake and particles all use Math.random(), so an unseeded run makes
 * statistical assertions (like "harder difficulty lands a bigger share of the
 * hits") flaky for no good reason. Seeding makes every run identical while the
 * game itself is unchanged.
 *
 *   import './seed-random.js';   // must come before the game modules
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = Number(process.env.BITOS_SEED || 0x8b17c0de);
Math.random = mulberry32(SEED);

export const seed = SEED;
