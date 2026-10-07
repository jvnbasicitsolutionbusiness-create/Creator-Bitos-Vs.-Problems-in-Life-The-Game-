/**
 * api-test.js — end-to-end account + progression test against a running server.
 *
 * Usage: node tools/api-test.js [baseUrl]        (default http://127.0.0.1:3000)
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3000';

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

async function call(path, { method = 'GET', body = null, token = null } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : null
  });
  let json = null;
  try {
    json = await res.json();
  } catch { /* ignore */ }
  return { status: res.status, json };
}

const stamp = Date.now();
const user = `tester${stamp % 100000}`;
const email = `${user}@example.com`;
const password = 'bitos12345';

console.log('===============================================================');
console.log(`  CREATOR BITOS — API test @ ${BASE}`);
console.log('===============================================================\n');

/* ---------------------------------------------------------------- health */
{
  console.log('[1] Health');
  const { status, json } = await call('/api/health');
  check('health responds 200', status === 200 && json?.ok === true, JSON.stringify(json)?.slice(0, 120));
  check('database provider reported', Boolean(json?.database?.provider), JSON.stringify(json?.database));
}

/* ------------------------------------------------------------ validation */
{
  console.log('\n[2] Validation');
  let r = await call('/api/auth/register', { method: 'POST', body: { username: 'ab', email, password, confirmPassword: password } });
  check('short username rejected', r.status === 400 && r.json?.field === 'username', JSON.stringify(r.json));

  r = await call('/api/auth/register', { method: 'POST', body: { username: user, email: 'not-an-email', password, confirmPassword: password } });
  check('invalid email rejected', r.status === 400 && r.json?.field === 'email', JSON.stringify(r.json));

  r = await call('/api/auth/register', { method: 'POST', body: { username: user, email, password: 'short', confirmPassword: 'short' } });
  check('short password rejected', r.status === 400 && r.json?.field === 'password', JSON.stringify(r.json));

  r = await call('/api/auth/register', { method: 'POST', body: { username: user, email, password: 'onlyletters', confirmPassword: 'onlyletters' } });
  check('password without numbers rejected', r.status === 400, JSON.stringify(r.json));

  r = await call('/api/auth/register', { method: 'POST', body: { username: user, email, password, confirmPassword: 'mismatch123' } });
  check('password mismatch rejected', r.status === 400 && r.json?.field === 'confirmPassword', JSON.stringify(r.json));
}

/* ------------------------------------------------------------- register */
let token = null;
{
  console.log('\n[3] Register');
  const r = await call('/api/auth/register', { method: 'POST', body: { username: user, email, password, confirmPassword: password } });
  check('registration succeeds', r.status === 201 && r.json?.ok === true, JSON.stringify(r.json)?.slice(0, 160));
  check('token returned', Boolean(r.json?.token));
  check('password hash never sent to the client', !r.json?.player?.passwordHash && !JSON.stringify(r.json).includes('scrypt$'));
  check('starts with Bitos only', JSON.stringify(r.json?.player?.unlockedCharacters) === JSON.stringify(['creator-bitos']), JSON.stringify(r.json?.player?.unlockedCharacters));
  check('intro starts unwatched', r.json?.player?.hasSeenIntro === false);
  token = r.json?.token;

  const dupe = await call('/api/auth/register', { method: 'POST', body: { username: user, email: `other${stamp}@example.com`, password, confirmPassword: password } });
  check('duplicate username rejected', dupe.status === 409 && dupe.json?.field === 'username', JSON.stringify(dupe.json));

  const dupeEmail = await call('/api/auth/register', { method: 'POST', body: { username: `${user}x`, email, password, confirmPassword: password } });
  check('duplicate email rejected', dupeEmail.status === 409 && dupeEmail.json?.field === 'email', JSON.stringify(dupeEmail.json));
}

/* ---------------------------------------------------------------- login */
{
  console.log('\n[4] Login');
  let r = await call('/api/auth/login', { method: 'POST', body: { username: user, password: 'wrongpassword1' } });
  check('wrong password rejected', r.status === 401, JSON.stringify(r.json));

  r = await call('/api/auth/login', { method: 'POST', body: { username: 'nobody-here', password } });
  check('unknown user rejected', r.status === 401, JSON.stringify(r.json));

  r = await call('/api/auth/login', { method: 'POST', body: { username: user, password } });
  check('correct password accepted', r.status === 200 && Boolean(r.json?.token));
  token = r.json?.token;

  r = await call('/api/auth/login', { method: 'POST', body: { username: email, password } });
  check('login by email works', r.status === 200 && Boolean(r.json?.token));
}

/* ---------------------------------------------------------- progression */
{
  console.log('\n[5] Progression saves');
  let r = await call('/api/me', { token });
  check('session restores the player', r.status === 200 && r.json?.player?.username === user, JSON.stringify(r.json)?.slice(0, 120));

  r = await call('/api/me', { method: 'PATCH', token, body: { hasSeenIntro: true } });
  check('intro flag saves', r.status === 200 && r.json?.player?.hasSeenIntro === true, JSON.stringify(r.json)?.slice(0, 120));

  // Defeat every round and confirm multiplayer unlock payloads round-trip.
  const enemies = ['laziness', 'gadget', 'addiction', 'lust', 'society', 'suicide', 'suffering', 'wrath', 'school', 'seizure'];
  r = await call('/api/me', {
    method: 'PATCH', token,
    body: {
      campaignProgress: 10,
      defeatedEnemies: enemies,
      unlockedCharacters: ['creator-bitos', ...enemies],
      multiplayerUnlocked: true,
      campaignCompleted: true,
      settings: { masterVolume: 0.5, difficulty: 'hard' },
      stats: { matchesPlayed: 10, bestCombo: 9 }
    }
  });
  check('campaign progress saves', r.json?.player?.campaignProgress === 10, JSON.stringify(r.json?.player?.campaignProgress));
  check('all enemies recorded', r.json?.player?.defeatedEnemies?.length === 10);
  check('multiplayer unlock saves', r.json?.player?.multiplayerUnlocked === true);
  check('settings persist', r.json?.player?.settings?.difficulty === 'hard', JSON.stringify(r.json?.player?.settings));

  r = await call('/api/me', { token });
  check('progress reloads from the database (not just memory)',
    r.json?.player?.campaignProgress === 10 && r.json?.player?.multiplayerUnlocked === true,
    JSON.stringify({ p: r.json?.player?.campaignProgress, m: r.json?.player?.multiplayerUnlocked }));

  // Persistence survives a fresh token (simulated new session)
  const login = await call('/api/auth/login', { method: 'POST', body: { username: user, password } });
  check('progress survives a new login', login.json?.player?.campaignProgress === 10 && login.json?.player?.stats?.bestCombo === 9,
    JSON.stringify(login.json?.player?.stats));
}

/* --------------------------------------------------------- persistence */
{
  console.log('\n[6] On-disk persistence');
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(new URL('../server/data/players.json', import.meta.url), 'utf8').catch(() => '');
  check('player file written', raw.includes(user), `len=${raw.length}`);
  check('no plaintext password stored', !raw.includes(password), 'password found in file!');
  check('password stored as a scrypt hash', raw.includes('scrypt$'));
}

/* ---------------------------------------------------------- auth guards */
{
  console.log('\n[7] Auth guards');
  const r = await call('/api/me', { token: 'not.a.valid.token' });
  check('invalid token rejected', r.status === 401, JSON.stringify(r.json));

  const anon = await call('/api/me');
  check('anonymous request rejected', anon.status === 401, JSON.stringify(anon.json));
}

/* -------------------------------------------------------------- logout */
{
  console.log('\n[8] Logout');
  const r = await call('/api/auth/logout', { method: 'POST', token });
  check('logout succeeds', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json));
}

console.log('\n===============================================================');
console.log(`  ${checks - failures}/${checks} checks passed`);
console.log('===============================================================');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('API OK.');
