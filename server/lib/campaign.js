/**
 * campaign.js — server-side mirror of the campaign ladder.
 * Imported by api.js; kept in sync with the client copy by tools/check.js.
 */
import { CHARACTER_IDS } from './roster.js';

export const CHARACTER_IDS_REEXPORT = CHARACTER_IDS;

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

export default { CAMPAIGN_ROUNDS };
