/**
 * api.js — the only place player data crosses the network.
 *
 * Every endpoint returns JSON with `{ ok: true, ... }` or
 * `{ ok: false, error: "<player-facing message>" }`.
 *
 * Endpoints
 *   GET  /api/health                 -> server + database status
 *   POST /api/auth/register          -> create account
 *   POST /api/auth/login             -> log in
 *   POST /api/auth/logout            -> destroy session
 *   GET  /api/me                     -> current player record
 *   PATCH /api/me                    -> save progression / settings / stats
 *   GET  /api/roster                 -> character + campaign definitions (read-only)
 */
import crypto from 'node:crypto';
import {
  createPlayerRecord,
  serializeRecord
} from '../lib/store-interface.js';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  validateUsername,
  validateEmail,
  validatePassword,
  generatePlayerId,
  SESSION_COOKIE,
  SESSION_MAX_AGE
} from '../lib/auth.js';
import { ROSTER } from '../lib/roster.js';
import { CAMPAIGN_ROUNDS } from '../lib/campaign.js';

/** Strip secrets before a record ever leaves the server. */
function publicRecord(record) {
  if (!record) return null;
  const { passwordHash, ...safe } = record;
  return safe;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Malformed JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return parseCookies(req)[SESSION_COOKIE] || null;
}

export function createApiHandler({ store, sendJson }) {
  const sessions = new Map(); // token -> { playerId, expires }  (also stateless-verifiable)

  async function currentPlayer(req) {
    const token = extractToken(req);
    if (!token) return null;
    const data = verifySessionToken(token);
    if (!data) return null;
    return store.findById(data.pid);
  }

  async function handle(req, res, url) {
    const method = req.method.toUpperCase();
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    /* ------------------------------------------------------------------ */
    /* health                                                              */
    /* ------------------------------------------------------------------ */
    if (pathname === '/api/health') {
      const status = typeof store.status === 'function' ? store.status() : null;
      return sendJson(res, 200, {
        ok: true,
        service: 'creator-bitos-server',
        version: '1.0.0',
        time: new Date().toISOString(),
        database: {
          provider: store.backendName(),
          writable: store.isWritable(),
          players: (await store.all()).length,
          ...(status || {})
        }
      });
    }

    if (pathname === '/api/roster') {
      return sendJson(res, 200, { ok: true, roster: ROSTER, rounds: CAMPAIGN_ROUNDS });
    }

    /* ------------------------------------------------------------------ */
    /* register                                                            */
    /* ------------------------------------------------------------------ */
    if (pathname === '/api/auth/register' && method === 'POST') {
      let body;
      try {
        body = await readJson(req);
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: e.message });
      }
      const { username, email, password, confirmPassword } = body;

      const usernameError = validateUsername(username);
      if (usernameError) return sendJson(res, 400, { ok: false, field: 'username', error: usernameError });
      const emailError = validateEmail(email);
      if (emailError) return sendJson(res, 400, { ok: false, field: 'email', error: emailError });
      const passwordError = validatePassword(password);
      if (passwordError) return sendJson(res, 400, { ok: false, field: 'password', error: passwordError });
      if (confirmPassword !== undefined && confirmPassword !== password) {
        return sendJson(res, 400, { ok: false, field: 'confirmPassword', error: 'Passwords do not match.' });
      }

      if (await store.findByUsername(username)) {
        return sendJson(res, 409, { ok: false, field: 'username', error: 'That username is already taken.' });
      }
      if (await store.findByEmail(email)) {
        return sendJson(res, 409, { ok: false, field: 'email', error: 'An account with that email already exists.' });
      }

      const id = generatePlayerId();
      const record = createPlayerRecord({
        id,
        username: String(username).trim(),
        email: String(email).trim().toLowerCase(),
        passwordHash: hashPassword(password)
      });

      try {
        await store.insert(record);
      } catch (err) {
        console.error('[api] register failed:', err.message);
        return sendJson(res, 503, {
          ok: false,
          error: 'Could not reach the player database. Your account was NOT created. Please try again.'
        });
      }

      const token = createSessionToken(id);
      sessions.set(token, { playerId: id, expires: Date.now() + SESSION_MAX_AGE * 1000 });
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax`);
      return sendJson(res, 201, { ok: true, token, player: publicRecord(record) });
    }

    /* ------------------------------------------------------------------ */
    /* login                                                               */
    /* ------------------------------------------------------------------ */
    if (pathname === '/api/auth/login' && method === 'POST') {
      let body;
      try {
        body = await readJson(req);
      } catch (e) {
        return sendJson(res, 400, { ok: false, error: e.message });
      }
      const identifier = String(body.username || body.email || '').trim();
      const password = String(body.password || '');
      if (!identifier) return sendJson(res, 400, { ok: false, error: 'Enter your username or email.' });
      if (!password) return sendJson(res, 400, { ok: false, field: 'password', error: 'Enter your password.' });

      const record =
        (await store.findByUsername(identifier)) || (await store.findByEmail(identifier));

      // Constant-ish response for unknown accounts and bad passwords.
      if (!record || !verifyPassword(password, record.passwordHash)) {
        return sendJson(res, 401, { ok: false, error: 'Incorrect username/email or password.' });
      }

      try {
        await store.update(record.id, { lastLogin: new Date().toISOString() });
      } catch (err) {
        // Non-fatal: the login still succeeds, but tell the client saving is degraded.
        console.error('[api] could not update lastLogin:', err.message);
        return sendJson(res, 200, {
          ok: true,
          token: createSessionToken(record.id),
          player: publicRecord(record),
          warning: 'Logged in, but your progress could not be loaded from the database.'
        });
      }

      const token = createSessionToken(record.id);
      sessions.set(token, { playerId: record.id, expires: Date.now() + SESSION_MAX_AGE * 1000 });
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE}; SameSite=Lax`);
      return sendJson(res, 200, { ok: true, token, player: publicRecord(record) });
    }

    /* ------------------------------------------------------------------ */
    /* logout                                                              */
    /* ------------------------------------------------------------------ */
    if (pathname === '/api/auth/logout' && method === 'POST') {
      const token = extractToken(req);
      if (token) sessions.delete(token);
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
      return sendJson(res, 200, { ok: true });
    }

    /* ------------------------------------------------------------------ */
    /* me                                                                  */
    /* ------------------------------------------------------------------ */
    if (pathname === '/api/me') {
      const player = await currentPlayer(req);
      if (!player) return sendJson(res, 401, { ok: false, error: 'Not signed in.' });
      if (method === 'GET') return sendJson(res, 200, { ok: true, player: publicRecord(player) });

      if (method === 'PATCH') {
        let body;
        try {
          body = await readJson(req);
        } catch (e) {
          return sendJson(res, 400, { ok: false, error: e.message });
        }
        const patch = {};
        if (typeof body.hasSeenIntro === 'boolean') patch.hasSeenIntro = body.hasSeenIntro;
        if (Number.isFinite(body.campaignProgress)) {
          patch.campaignProgress = Math.max(0, Math.min(CAMPAIGN_ROUNDS.length, Math.floor(body.campaignProgress)));
        }
        if (Array.isArray(body.defeatedEnemies)) patch.defeatedEnemies = body.defeatedEnemies.slice(0, 64).map(String);
        if (Array.isArray(body.unlockedCharacters)) patch.unlockedCharacters = body.unlockedCharacters.slice(0, 64).map(String);
        if (typeof body.multiplayerUnlocked === 'boolean') patch.multiplayerUnlocked = body.multiplayerUnlocked;
        if (typeof body.campaignCompleted === 'boolean') patch.campaignCompleted = body.campaignCompleted;
        if (body.settings && typeof body.settings === 'object') patch.settings = body.settings;
        if (body.stats && typeof body.stats === 'object') patch.stats = { ...player.stats, ...body.stats };
        if (body.enemyRecords && typeof body.enemyRecords === 'object') patch.enemyRecords = body.enemyRecords;

        if (Object.keys(patch).length === 0) {
          return sendJson(res, 200, { ok: true, player: publicRecord(player) });
        }

        try {
          const updated = await store.update(player.id, patch);
          return sendJson(res, 200, { ok: true, player: publicRecord(updated), savedAt: new Date().toISOString() });
        } catch (err) {
          console.error('[api] save failed:', err.message);
          return sendJson(res, 503, {
            ok: false,
            error: 'SAVE FAILED — the player database could not be reached. Your progress was not stored.'
          });
        }
      }
      return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    }

    /* ------------------------------------------------------------------ */
    /* diagnostics (no secrets exposed)                                    */
    /* ------------------------------------------------------------------ */
    if (pathname === '/api/diagnostics') {
      const players = await store.all();
      return sendJson(res, 200, {
        ok: true,
        provider: store.backendName(),
        columns: serializeRecord(createPlayerRecord({ id: 'sample' })).length,
        players: players.map((p) => ({ id: p.id, username: p.username, progress: p.campaignProgress }))
      });
    }

    return sendJson(res, 404, { ok: false, error: `No API route for ${method} ${pathname}` });
  }

  return handle;
}

export { publicRecord };
void crypto;
