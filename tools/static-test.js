/**
 * static-test.js — proves the game runs with no backend at all.
 *
 * This is the deployment contract: a static folder (`public/`) served by any
 * dumb web host, with accounts kept in the browser. It boots the real static
 * server, fetches every asset the browser will ask for, and drives the real
 * offline account flow end to end.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.STATIC_TEST_PORT || 4399);
const BASE = `http://127.0.0.1:${PORT}`;

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

async function waitForServer(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

console.log('===============================================================');
console.log('  CREATOR BITOS — static deployment test');
console.log('===============================================================\n');

const server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.js')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
});
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

const up = await waitForServer(`${BASE}/public/index.html`);
check('static server starts', up);
if (!up) {
  server.kill();
  process.exit(1);
}

try {
  /* ------------------------------------------------------------ entry */
  console.log('[1] Entry points');
  const rootRes = await fetch(`${BASE}/`);
  const rootHtml = await rootRes.text();
  check('root URL serves a page (not a 404)', rootRes.status === 200, `status=${rootRes.status}`);
  check('root page forwards into the game', /public\/index\.html/.test(rootHtml));

  const gameRes = await fetch(`${BASE}/public/index.html`);
  const gameHtml = await gameRes.text();
  check('the game page loads', gameRes.status === 200 && /game-canvas/.test(gameHtml));
  check('the game page loads main.js as a module', /type="module" src="\.\/src\/main\.js"/.test(gameHtml));

  // GitHub Pages / Netlify / Vercel publish public/ directly.
  check('public/index.html exists on disk', fs.existsSync(path.join(ROOT, 'public', 'index.html')));
  check('.nojekyll present (stops GitHub mangling the build)',
    fs.existsSync(path.join(ROOT, 'public', '.nojekyll')) && fs.existsSync(path.join(ROOT, '.nojekyll')));

  /* ----------------------------------------------------------- assets */
  console.log('\n[2] Every asset the browser will request');
  const publicDir = path.join(ROOT, 'public');
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(path.relative(publicDir, full).split(path.sep).join('/'));
    }
  };
  walk(publicDir);

  let bad = [];
  for (const file of files) {
    const res = await fetch(`${BASE}/public/${file}`);
    const type = res.headers.get('content-type') || '';
    if (!res.ok) bad.push(`${file} -> ${res.status}`);
    else if (file.endsWith('.js') && !/javascript/.test(type)) bad.push(`${file} -> MIME ${type}`);
    else if (file.endsWith('.css') && !/text\/css/.test(type)) bad.push(`${file} -> MIME ${type}`);
  }
  check(`all ${files.length} files serve correctly`, bad.length === 0, bad.slice(0, 5).join(' | '));

  // Every module the game imports must be reachable over HTTP too.
  const missingImports = new Set();
  for (const file of files.filter((f) => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(publicDir, file), 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s+['"](\.[^'"]+)['"]/g)) {
      const resolved = path.relative(publicDir, path.resolve(path.dirname(path.join(publicDir, file)), m[1])).split(path.sep).join('/');
      if (!files.includes(resolved)) missingImports.add(`${file} -> ${m[1]}`);
    }
  }
  check('every import resolves over HTTP', missingImports.size === 0, [...missingImports].slice(0, 5).join(' | '));

  /* -------------------------------------------------------- no backend */
  console.log('\n[3] Behaving correctly with no backend');
  const apiRes = await fetch(`${BASE}/api/health`);
  check('/api/health is absent on a static host', apiRes.status === 404, `status=${apiRes.status}`);

  /* ------------------------------------------------- offline accounts */
  console.log('\n[4] Offline accounts (no server, real hashing)');
  const { installDomStub } = await import('./canvas-stub.js');
  installDomStub();

  const { api } = await import('../public/src/core/api.js');
  const { localAccounts } = await import('../public/src/core/local-accounts.js');
  const { gameState } = await import('../public/src/core/state.js');

  const mode = await api.detectMode({ timeout: 4000 });
  check('api detects that there is no server', mode === 'offline', `mode=${mode}`);

  const reg = await api.register({ username: 'Bitos', email: 'bitos@example.com', password: 'bitos12345', confirmPassword: 'bitos12345' });
  check('sign up works offline', reg.ok === true && Boolean(api.token), JSON.stringify(reg.player?.username));
  check('the password hash is never handed to the game', !JSON.stringify(reg.player).includes('pbkdf2'));

  await api.save({ campaignProgress: 2, defeatedEnemies: ['laziness', 'gadget'], hasSeenIntro: true });
  const me = await api.me();
  check('progression saves and reloads offline', me.player.campaignProgress === 2 && me.player.defeatedEnemies.length === 2,
    JSON.stringify(me.player.defeatedEnemies));

  const restored = await gameState.restore();
  check('game state restores from the offline account', gameState.isSignedIn === true, `restored=${!!restored}`);

  await api.logout();
  check('sign out clears the session', api.isSignedIn === false);

  const login = await api.login({ username: 'Bitos', password: 'bitos12345' });
  check('sign in works offline', login.ok === true && login.player.campaignProgress === 2, `progress=${login.player?.campaignProgress}`);
  check('progress survived signing out and back in', login.player.defeatedEnemies.length === 2);

  const wrong = await api.login({ username: 'Bitos', password: 'nope12345' }).catch((e) => e);
  check('wrong password is rejected offline', wrong instanceof Error && /password/i.test(wrong.message), wrong.message);

  const dupe = await api.register({ username: 'bitos', email: 'other@example.com', password: 'bitos12345', confirmPassword: 'bitos12345' }).catch((e) => e);
  check('duplicate username is rejected offline', dupe instanceof Error && dupe.field === 'username', dupe.message);

  const shortPw = await localAccounts.register({ username: 'Someone', email: 's@example.com', password: 'abc', confirmPassword: 'abc' }).catch((e) => e);
  check('weak passwords are rejected offline', shortPw instanceof Error, shortPw.message);

  const raw = globalThis.localStorage.getItem('bitos.accounts.v1') || '';
  check('no plaintext password is ever written to storage', !raw.includes('bitos12345'));
  check('passwords are stored as PBKDF2 hashes', /pbkdf2\$250000\$/.test(raw));

  /* ------------------------------------------------ Apps Script backend */
  console.log('\n[5] Google Apps Script backend (serverless option)');
  // A full https base switches the client into "script mode": one endpoint,
  // the action in the body, and the session token in the body too (an
  // Authorization header would force a CORS preflight Apps Script can't answer).
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ ok: true, service: 'script', players: 1 }) };
  };
  api.setBase('https://script.google.com/macros/s/TEST/exec');
  api.mode = 'online'; // exercise the network path explicitly
  check('an https base switches to script mode', api.useScript === true);
  await api.health();
  api.setToken('tok123');
  await api.save({ campaignProgress: 4 });
  globalThis.fetch = realFetch;

  const first = calls[0];
  check('script mode posts to the single Web App URL', first.url === 'https://script.google.com/macros/s/TEST/exec', first.url);
  check('script mode uses POST with text/plain (no CORS preflight)',
    first.init.method === 'POST' && /text\/plain/.test(first.init.headers['Content-Type']), JSON.stringify(first.init.headers));
  const saveCall = calls.find((c) => JSON.parse(c.init.body).action === 'save');
  check('the action is carried in the body', Boolean(saveCall));
  const saved = JSON.parse(saveCall.init.body);
  check('the session travels in the body, not a header', saved.token === 'tok123');
  check('the patch is forwarded intact', saved.campaignProgress === 4);
  check('no Authorization header is sent (it would trigger a preflight)',
    !('Authorization' in saveCall.init.headers));

  // Back to same-origin REST mode.
  api.setBase('');
  check('clearing the base returns to same-origin REST calls', api.useScript === false);

  /* ---------------------------------------------------------- security */
  console.log('\n[6] Static-host security');
  const clientFiles = files.filter((f) => f.endsWith('.js'));
  const leaking = clientFiles.filter((f) =>
    /GOOGLE_PRIVATE_KEY|private_key|service_account|AIza|api[_-]?key/i.test(fs.readFileSync(path.join(publicDir, f), 'utf8'))
  );
  check('no credentials anywhere in the published files', leaking.length === 0, leaking.join(', '));
  const absolute = clientFiles.filter((f) => /https?:\/\/(localhost|127\.0\.0\.1)/.test(fs.readFileSync(path.join(publicDir, f), 'utf8')));
  check('no hardcoded localhost URLs in the game', absolute.length === 0, absolute.join(', '));
} finally {
  server.kill();
}

console.log('\n===============================================================');
console.log(`  ${checks - failures}/${checks} checks passed`);
console.log('===============================================================');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('The game is deployable as a static site.');
