/**
 * roster.js — canonical character + campaign data, shared by server and client.
 *
 * The server uses it to validate progression payloads; the client imports the
 * mirrored copy in /public/src/characters/roster.js for gameplay.
 */

export const CHARACTER_IDS = [
  'creator-bitos',
  'laziness',
  'gadget',
  'addiction',
  'lust',
  'society',
  'suicide',
  'suffering',
  'wrath',
  'school',
  'seizure'
];

/** The order of the campaign. Index 0 is round 1. */
export const CAMPAIGN_ROUNDS = [
  'laziness',
  'gadget',
  'addiction',
  'lust',
  'society',
  'suicide',
  'suffering',
  'wrath',
  'school',
  'seizure'
];

/** Summonable distractions Gadget can call (each one only once per battle). */
export const GADGET_SUMMONS = [
  'social-media',
  'adult-content',
  'gaming',
  'gambling',
  'endless-scrolling',
  'notifications'
];

export const ROSTER = CHARACTER_IDS.map((id) => ({ id, playable: id === 'creator-bitos' ? true : false }));

export function roundNumberOf(enemyId) {
  const idx = CAMPAIGN_ROUNDS.indexOf(enemyId);
  return idx === -1 ? null : idx + 1;
}

export function isFinalRound(enemyId) {
  return CAMPAIGN_ROUNDS.indexOf(enemyId) === CAMPAIGN_ROUNDS.length - 1;
}
