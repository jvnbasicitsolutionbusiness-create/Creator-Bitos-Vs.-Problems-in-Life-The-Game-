/**
 * google-sheets-store.js — external player database (Google Sheets).
 *
 * Uses the Sheets REST API v4 directly over HTTPS with a service-account JWT
 * signed locally by node:crypto (RS256). No npm packages required.
 *
 * Enable it by setting these environment variables (see .env.example):
 *
 *   DB_PROVIDER=google-sheets
 *   GOOGLE_SHEET_ID=<the id in the sheet URL>
 *   GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/<id>/edit
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL=<name>@<project>.iam.gserviceaccount.com
 *   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 *   GOOGLE_SHEET_TAB=Players          (optional, default "Players")
 *
 * The service account email must be shared on the spreadsheet as an Editor.
 * Credentials live ONLY on the server — never in client-side JavaScript.
 *
 * Writes are throttled and retried with exponential backoff to respect the
 * Sheets quota (60 write requests/minute/user by default).
 */
import crypto from 'node:crypto';
import https from 'node:https';
import { PlayerStore, deserializeRecord, serializeRecord, PLAYER_FIELDS } from '../lib/store-interface.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_TTL_MS = 55 * 60 * 1000;

function httpsJson(method, url, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const req = https.request(
      {
        method,
        hostname: parsed.hostname,
        path: `${parsed.pathname}${parsed.search}`,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': payload.length } : {}),
          ...headers
        }
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = { raw: data };
          }
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else {
            const err = new Error(`Sheets API ${method} ${parsed.pathname} failed (${res.statusCode}): ${data.slice(0, 400)}`);
            err.status = res.statusCode;
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Build + sign a service-account JWT and exchange it for an access token. */
async function fetchAccessToken({ email, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now
  };
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(claim));
  const signingInput = `${header}.${body}`;
  let signature;
  try {
    signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
  } catch (err) {
    throw new Error(`Could not sign the service-account JWT: ${err.message}. Check GOOGLE_PRIVATE_KEY.`);
  }
  const assertion = `${signingInput}.${b64url(signature)}`;

  // The token endpoint requires form encoding (not JSON), so it is sent directly.
  const form = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
  const parsed = new URL(TOKEN_URL);
  const token = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname: parsed.hostname,
        path: parsed.pathname,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form.toString()) }
      },
      (r) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => {
          try {
            const j = JSON.parse(d);
            if (r.statusCode >= 200 && r.statusCode < 300) resolve(j);
            else reject(new Error(`Token exchange failed (${r.statusCode}): ${d.slice(0, 300)}`));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(form.toString());
    req.end();
  });

  if (!token.access_token) throw new Error('Token exchange returned no access token.');
  return { accessToken: token.access_token, expiresAt: Date.now() + TOKEN_TTL_MS };
}

export class GoogleSheetsPlayerStore extends PlayerStore {
  constructor() {
    super();
    this.sheetId = '';
    this.tab = 'Players';
    this.credentials = null;
    this.token = null;
    this.records = [];
    this.lastSync = 0;
    this.writeQueue = Promise.resolve();
    this.offlineReason = null;
  }

  async init(config = {}) {
    const sheetId = config.sheetId || process.env.GOOGLE_SHEET_ID || extractSheetId(process.env.GOOGLE_SHEET_URL || '');
    const email = config.serviceAccountEmail || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let privateKey = config.privateKey || process.env.GOOGLE_PRIVATE_KEY;

    if (!sheetId) throw new Error('Google Sheets adapter needs GOOGLE_SHEET_ID (or GOOGLE_SHEET_URL).');
    if (!email || !privateKey) throw new Error('Google Sheets adapter needs GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.');

    privateKey = privateKey.replace(/\\n/g, '\n').trim();

    if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(privateKey)) {
      throw new Error(
        'GOOGLE_PRIVATE_KEY is not a PEM private key. It must start with "-----BEGIN PRIVATE KEY-----" ' +
        '(in an .env file, keep the \\n escapes inside the quoted value).'
      );
    }

    this.sheetId = sheetId;
    this.tab = config.tab || process.env.GOOGLE_SHEET_TAB || 'Players';
    this.credentials = { email, privateKey };

    await this.#sync();
    this.ready = true;
    return this;
  }

  async #ensureToken() {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.accessToken;
    this.token = await fetchAccessToken(this.credentials);
    return this.token.accessToken;
  }

  #range(range) {
    return `${SHEETS_BASE}/${encodeURIComponent(this.sheetId)}/values/${encodeURIComponent(`${this.tab}!${range}`)}`;
  }

  async #sync() {
    const token = await this.#ensureToken();
    const res = await httpsJson('GET', `${this.#range(`A1:${columnLetter(PLAYER_FIELDS.length)}`)}?majorDimension=ROWS`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const rows = res.values || [];
    if (rows.length === 0) {
      // First run: create the header row.
      await httpsJson('PUT', `${this.#range('A1')}?valueInputOption=RAW`, {
        headers: { Authorization: `Bearer ${token}` },
        body: { values: [PLAYER_FIELDS.slice()] }
      });
      this.records = [];
    } else {
      const header = rows[0].map((h) => String(h).trim());
      this.records = rows.slice(1).map((row, i) => {
        const obj = {};
        header.forEach((h, c) => {
          if (PLAYER_FIELDS.includes(h)) obj[h] = row[c] ?? '';
        });
        return deserializeRecord(obj, i);
      });
    }
    this.lastSync = Date.now();
    this.offlineReason = null;
    return this.records;
  }

  #enqueue(task) {
    const run = this.writeQueue.then(task, task);
    this.writeQueue = run.catch(() => {});
    return run;
  }

  async #retry(fn, attempts = 3) {
    let lastErr = null;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const retryable = !err.status || err.status === 429 || err.status >= 500;
        if (!retryable) break;
        await new Promise((r) => setTimeout(r, 400 * 2 ** i));
      }
    }
    this.offlineReason = lastErr ? lastErr.message : 'unknown error';
    throw lastErr;
  }

  #findIndexById(id) {
    return this.records.findIndex((r) => r.id === id);
  }

  async findByUsername(username) {
    await this.#maybeResync();
    const needle = String(username || '').trim().toLowerCase();
    return this.records.find((r) => r.username.toLowerCase() === needle) || null;
  }

  async findByEmail(email) {
    await this.#maybeResync();
    const needle = String(email || '').trim().toLowerCase();
    return this.records.find((r) => r.email.toLowerCase() === needle) || null;
  }

  async findById(id) {
    await this.#maybeResync();
    return this.records.find((r) => r.id === id) || null;
  }

  /** Refresh at most once every 10s so reads stay cheap. */
  async #maybeResync() {
    if (Date.now() - this.lastSync > 10_000) await this.#sync();
  }

  async insert(record) {
    return this.#enqueue(() =>
      this.#retry(async () => {
        const token = await this.#ensureToken();
        const row = deserializeRecord(record, this.records.length);
        await httpsJson('POST', `${this.#range('A1:append')}?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
          headers: { Authorization: `Bearer ${token}` },
          body: { values: [serializeRecord(row)] }
        });
        this.records.push(row);
        return row;
      })
    );
  }

  async update(id, patch = {}) {
    return this.#enqueue(() =>
      this.#retry(async () => {
        const token = await this.#ensureToken();
        const idx = this.#findIndexById(id);
        if (idx === -1) throw new Error(`No player row with id "${id}"`);
        const merged = deserializeRecord({ ...this.records[idx], ...patch }, idx);
        const rowNumber = idx + 2; // +1 for header, +1 for 1-based indexing
        await httpsJson(
          'PUT',
          `${this.#range(`A${rowNumber}:${columnLetter(PLAYER_FIELDS.length)}${rowNumber}`)}?valueInputOption=RAW`,
          { headers: { Authorization: `Bearer ${token}` }, body: { values: [serializeRecord(merged)] } }
        );
        this.records[idx] = merged;
        return merged;
      })
    );
  }

  async all() {
    await this.#maybeResync();
    return this.records.slice();
  }

  backendName() {
    return 'google-sheets';
  }

  isWritable() {
    return this.offlineReason === null;
  }

  /** Human-readable status for /api/health and the Extras screen. */
  status() {
    return {
      provider: 'google-sheets',
      sheetId: this.sheetId,
      tab: this.tab,
      rows: this.records.length,
      lastSync: new Date(this.lastSync).toISOString(),
      offlineReason: this.offlineReason
    };
  }
}

export function extractSheetId(urlOrId) {
  if (!urlOrId) return '';
  const match = String(urlOrId).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : String(urlOrId).trim();
}

function columnLetter(n) {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
}

export default GoogleSheetsPlayerStore;
