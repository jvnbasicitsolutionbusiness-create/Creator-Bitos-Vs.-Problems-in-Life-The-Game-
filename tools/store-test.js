/**
 * store-test.js — database adapter unit tests (no network required).
 *
 * Verifies the shared record contract every adapter must honour: field
 * serialisation for spreadsheets, array/boolean/number round-trips, atomic
 * writes, and reload-from-disk behaviour.
 */
import { createPlayerRecord, serializeRecord, deserializeRecord, PLAYER_FIELDS } from '../server/lib/store-interface.js';
import { JsonPlayerStore } from '../server/adapters/json-store.js';
import { GoogleSheetsPlayerStore, extractSheetId } from '../server/adapters/google-sheets-store.js';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from '../server/lib/auth.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let checks = 0;
let failures = 0;
function check(label, condition, detail = '') {
  checks += 1;
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label} ${detail}`);
  }
}

console.log('===============================================================');
console.log('  CREATOR BITOS — storage & auth unit tests');
console.log('===============================================================\n');

/* ------------------------------------------------------------ record */
{
  console.log('[1] Player record contract');
  const rec = createPlayerRecord({ id: 'p1', username: 'bitos', email: 'a@b.co', passwordHash: 'hash' });
  check('defaults: intro unwatched', rec.hasSeenIntro === false);
  check('defaults: multiplayer locked', rec.multiplayerUnlocked === false);
  check('defaults: only Bitos unlocked', JSON.stringify(rec.unlockedCharacters) === JSON.stringify(['creator-bitos']));
  const flat = serializeRecord(rec);
  check('serialises to one cell per field', flat.length === PLAYER_FIELDS.length, `${flat.length} vs ${PLAYER_FIELDS.length}`);
  check('serialised cells are spreadsheet-safe (no raw objects)', flat.every((v) => typeof v === 'string'));
  const back = deserializeRecord(Object.fromEntries(PLAYER_FIELDS.map((f, i) => [f, flat[i]])));
  check('round-trip keeps arrays as arrays', Array.isArray(back.unlockedCharacters));
  check('round-trip keeps booleans', back.hasSeenIntro === false && back.multiplayerUnlocked === false);
  check('round-trip keeps numbers', back.campaignProgress === 0);
  check('round-trip keeps nested settings', typeof back.settings === 'object');
  check('round-trip keeps stats', typeof back.stats === 'object' && back.stats.bestCombo === 0);

  const progressed = deserializeRecord({
    ...Object.fromEntries(PLAYER_FIELDS.map((f, i) => [f, flat[i]])),
    defeatedEnemies: JSON.stringify(['laziness', 'gadget']),
    unlockedCharacters: JSON.stringify(['creator-bitos', 'laziness', 'gadget']),
    campaignProgress: '2',
    hasSeenIntro: 'TRUE',
    multiplayerUnlocked: 'TRUE',
    settings: JSON.stringify({ difficulty: 'hard' }),
    stats: JSON.stringify({ bestCombo: 9 })
  });
  check('arrays survive a second round-trip', progressed.defeatedEnemies.length === 2, JSON.stringify(progressed.defeatedEnemies));
  check('unlocked characters survive', progressed.unlockedCharacters.length === 3, JSON.stringify(progressed.unlockedCharacters));
  check('numbers survive', progressed.campaignProgress === 2);
  check('booleans survive', progressed.hasSeenIntro === true && progressed.multiplayerUnlocked === true);
  check('nested objects survive', progressed.settings.difficulty === 'hard' && progressed.stats.bestCombo === 9);

  // Legacy comma-separated values (as typed by hand into a sheet) still load.
  const legacy = deserializeRecord({ defeatedEnemies: 'laziness, gadget' , id: 'x'});
  check('comma-separated legacy values load', legacy.defeatedEnemies.length === 2, JSON.stringify(legacy.defeatedEnemies));
}

/* --------------------------------------------------------- json store */
{
  console.log('\n[2] JSON adapter');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bitos-store-'));
  const file = path.join(dir, 'players.json');
  const store = new JsonPlayerStore();
  await store.init({ filePath: file });

  await store.insert(createPlayerRecord({ id: 'p1', username: 'Alpha', email: 'a@b.co', passwordHash: 'hash1' }));
  await store.insert(createPlayerRecord({ id: 'p2', username: 'Beta', email: 'b@b.co', passwordHash: 'hash2' }));

  check('find by username', (await store.findByUsername('alpha'))?.id === 'p1');
  check('username lookup is case-insensitive', (await store.findByUsername('ALPHA'))?.id === 'p1');
  check('find by email', (await store.findByEmail('B@B.CO'))?.id === 'p2');
  check('find by id', (await store.findById('p2'))?.username === 'Beta');
  check('unknown user returns null', (await store.findByUsername('nobody')) === null);

  await store.update('p1', { campaignProgress: 3, defeatedEnemies: ['laziness'], hasSeenIntro: true });
  check('update persists fields', (await store.findById('p1')).campaignProgress === 3);
  check('update persists arrays', (await store.findById('p1')).defeatedEnemies.length === 1);

  // Reload from the same file to prove it really hit the disk.
  const reloaded = new JsonPlayerStore();
  await reloaded.init({ filePath: file });
  check('data survives a restart', (await reloaded.findById('p1')).campaignProgress === 3);
  check('all() returns every player', (await reloaded.all()).length === 2);
  check('backend name reported', reloaded.backendName() === 'local-json');

  // Concurrent writes must not lose data.
  await Promise.all([
    store.update('p1', { campaignProgress: 4 }),
    store.update('p2', { campaignProgress: 5 })
  ]);
  const after = await store.all();
  check('concurrent updates do not clobber each other',
    after.find((p) => p.id === 'p1').campaignProgress === 4 && after.find((p) => p.id === 'p2').campaignProgress === 5,
    JSON.stringify(after.map((p) => [p.id, p.campaignProgress])));

  // Corrupt file recovery
  await fs.writeFile(file, '{ this is not json', 'utf8');
  const recovered = new JsonPlayerStore();
  await recovered.init({ filePath: file });
  check('corrupt file does not crash the game', (await recovered.all()).length === 0);

  await fs.rm(dir, { recursive: true, force: true });
}

/* -------------------------------------------------------- sheets helper */
{
  console.log('\n[3] Google Sheets helpers');
  check('sheet id extracted from a URL',
    extractSheetId('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit#gid=0') === '1AbCdEfGhIjKlMnOpQrStUvWxYz');
  check('raw id passes through', extractSheetId('1AbCdEfGhIjKlMnOpQrStUvWxYz') === '1AbCdEfGhIjKlMnOpQrStUvWxYz');
  const store = new GoogleSheetsPlayerStore();
  let threw = false;
  try {
    await store.init({ sheetId: 'x', serviceAccountEmail: 'a@b.co', privateKey: 'nope' });
  } catch (err) {
    threw = true;
    check('bad credentials fail with a helpful message', /PRIVATE KEY/.test(err.message), err.message);
  }
  check('bad credentials are rejected', threw);
  let missingId = false;
  try {
    await store.init({ serviceAccountEmail: 'a@b.co', privateKey: 'nope' });
  } catch (err) {
    missingId = /GOOGLE_SHEET_ID/.test(err.message);
  }
  check('missing sheet id is reported clearly', missingId);
}

/* ---------------------------------------------------------------- auth */
{
  console.log('\n[4] Password hashing & sessions');
  const hash = hashPassword('bitos12345');
  check('hash is scrypt', hash.startsWith('scrypt$'));
  check('hash does not contain the password', !hash.includes('bitos12345'));
  check('correct password verifies', verifyPassword('bitos12345', hash) === true);
  check('wrong password fails', verifyPassword('bitos12346', hash) === false);
  check('two hashes of the same password differ (salted)', hashPassword('bitos12345') !== hash);
  check('garbage hash fails safely', verifyPassword('x', 'not-a-hash') === false);

  const token = createSessionToken('p1');
  check('session verifies', verifySessionToken(token)?.pid === 'p1');
  check('tampered session rejected', verifySessionToken(`${token}tampered`) === null);
  check('garbage session rejected', verifySessionToken('abc.def') === null);
}

console.log('\n===============================================================');
console.log(`  ${checks - failures}/${checks} checks passed`);
console.log('===============================================================');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('Storage & auth OK.');
