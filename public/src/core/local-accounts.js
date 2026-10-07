/**
 * local-accounts.js — the offline account store.
 *
 * The game is deployed as a static site (GitHub Pages, Netlify, Vercel, …) where
 * there is no Node server. This module keeps the account system working there by
 * storing players in the browser's own storage, using the same validation rules
 * and the same record shape as the server adapter.
 *
 * Security notes:
 *  - Passwords are NEVER stored. Only a PBKDF2-SHA256 hash (250 000 iterations,
 *    random 16-byte salt per account) is kept, and comparison is constant time.
 *  - This is client-side storage, so it protects the password if the file is
 *    read, but it is NOT a substitute for a real server. That is why online mode
 *    (server/accounts.js) is preferred whenever a backend is reachable.
 */

import { derivePasswordHash, toBase64 as b64, fromBase64 as unb64 } from './pbkdf2.js';

const ACCOUNTS_KEY = 'bitos.accounts.v1';
const SESSION_KEY = 'bitos.session.v1';
const ITERATIONS = 250000;
const KEY_BITS = 256;

/* ------------------------------------------------------------------ utils */

const encoder = new TextEncoder();

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  try {
    const c = globalThis.crypto || globalThis.msCrypto;
    if (c && typeof c.getRandomValues === 'function') {
      c.getRandomValues(bytes);
      return bytes;
    }
  } catch { /* fall through */ }
  // Last resort: not cryptographic, but keeps the game running rather than
  // throwing. Only reachable in exotic sandboxes.
  for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

function randomId(prefix = 'p') {
  return `${prefix}_${toBase64(randomBytes(9)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`;
}

/** Constant-time string compare (no early exit on the first difference). */
function safeEqual(a, b) {
  const left = String(a);
  const right = String(b);
  if (left.length !== right.length) {
    // Still walk the string so the timing does not leak the length mismatch
    // position, then report failure.
    let sink = 0;
    for (let i = 0; i < left.length; i += 1) sink |= left.charCodeAt(i);
    void sink;
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

/* ----------------------------------------------------------------- hashing */

async function hashPassword(password) {
  const salt = randomBytes(16);
  // Falls back to the pure-JS engine when crypto.subtle is unavailable
  // (sandboxed iframe, plain-HTTP origin, or a browser without Web Crypto).
  const { hash } = await derivePasswordHash(password, { salt, iterations: ITERATIONS, bytes: KEY_BITS / 8 });
  return hash;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('pbkdf2$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  try {
    const salt = fromBase64(parts[2]);
    // Same dual engine, and it reads the iteration count from the stored hash
    // so old records keep verifying after a change to ITERATIONS.
    const { hash } = await derivePasswordHash(password, { salt, iterations, bytes: KEY_BITS / 8 });
    return safeEqual(hash, stored);
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- validation */

const USERNAME_RE = /^[a-zA-Z0-9._-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors server/lib/auth.js so both backends reject exactly the same input. */
export function validateUsername(username) {
  const value = String(username || '').trim();
  if (!value) return 'Username is required.';
  if (value.length < 3) return 'Username must be at least 3 characters.';
  if (value.length > 20) return 'Username must be 20 characters or fewer.';
  if (!USERNAME_RE.test(value)) return 'Username may use letters, numbers, dot, dash and underscore only.';
  return null;
}

export function validateEmail(email) {
  const value = String(email || '').trim();
  if (!value) return 'Email is required.';
  if (!EMAIL_RE.test(value)) return 'Enter a valid email address.';
  if (value.length > 120) return 'Email is too long.';
  return null;
}

export function validatePassword(password) {
  const value = String(password || '');
  if (!value) return 'Password is required.';
  if (value.length < 8) return 'Password must be at least 8 characters.';
  if (value.length > 128) return 'Password must be 128 characters or fewer.';
  if (!/[a-zA-Z]/.test(value)) return 'Password must contain a letter.';
  if (!/[0-9]/.test(value)) return 'Password must contain a number.';
  return null;
}

/* ------------------------------------------------------------------ record */

function createLocalPlayer({ id, username, email, passwordHash }) {
  return {
    id: id || '',
    username: username || '',
    email: email || '',
    passwordHash: passwordHash || '', // NEVER a plaintext password
    registrationDate: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    hasSeenIntro: false,
    campaignProgress: 0,
    defeatedEnemies: [],
    unlockedCharacters: ['creator-bitos'],
    multiplayerUnlocked: false,
    campaignCompleted: false,
    settings: {},
    stats: {
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
      bestCombo: 0,
      totalTimePlayedSeconds: 0,
      trainingSessions: 0
    },
    enemyRecords: {}
  };
}

/* ------------------------------------------------------------------- store */

class LocalAccountStore {
  constructor() {
    this.available = this.#checkAvailable();
  }

  #checkAvailable() {
    try {
      const probe = '__bitos_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true; // hashing no longer needs crypto.subtle — it has a JS fallback
    } catch {
      return false; // private mode / storage disabled
    }
  }

  #read() {
    if (!this.available) return [];
    try {
      const raw = localStorage.getItem(ACCOUNTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  #write(accounts) {
    if (!this.available) throw new Error('This browser is blocking local storage, so progress cannot be saved.');
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  #find(accounts, { username, email }) {
    const user = String(username || '').trim().toLowerCase();
    const mail = String(email || '').trim().toLowerCase();
    for (const account of accounts) {
      if (user && String(account.username).toLowerCase() === user) return { account, field: 'username' };
      if (mail && String(account.email).toLowerCase() === mail) return { account, field: 'email' };
    }
    return null;
  }

  /** Strip secrets before a record leaves the store. */
  #public(record) {
    if (!record) return null;
    const { passwordHash, ...safe } = record;
    void passwordHash;
    return JSON.parse(JSON.stringify(safe));
  }

  sessionId() {
    if (!this.available) return null;
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed?.id || null;
    } catch {
      return null;
    }
  }

  #setSession(id) {
    if (!this.available) return;
    if (id) localStorage.setItem(SESSION_KEY, JSON.stringify({ id, at: Date.now() }));
    else localStorage.removeItem(SESSION_KEY);
  }

  /* --------------------------------------------------------------- auth */

  async register({ username, email, password, confirmPassword }) {
    if (!this.available) throw new Error('Local storage is unavailable, so accounts cannot be created here.');

    const usernameError = validateUsername(username);
    if (usernameError) return this.#fail(usernameError, 'username');
    const emailError = validateEmail(email);
    if (emailError) return this.#fail(emailError, 'email');
    const passwordError = validatePassword(password);
    if (passwordError) return this.#fail(passwordError, 'password');
    if (confirmPassword !== undefined && password !== confirmPassword) {
      return this.#fail('Passwords do not match.', 'confirmPassword');
    }

    const accounts = this.#read();
    const existing = this.#find(accounts, { username, email });
    if (existing) {
      return this.#fail(
        existing.field === 'username' ? 'That username is already taken on this device.' : 'That email is already registered on this device.',
        existing.field
      );
    }

    const record = createLocalPlayer({
      id: randomId(),
      username: String(username).trim(),
      email: String(email).trim().toLowerCase(),
      passwordHash: await hashPassword(password)
    });
    accounts.push(record);
    this.#write(accounts);
    this.#setSession(record.id);
    return { ok: true, player: this.#public(record), token: `local.${record.id}` };
  }

  async login({ username, password }) {
    if (!this.available) throw new Error('Local storage is unavailable, so sign in is disabled.');
    const accounts = this.#read();
    const key = String(username || '').trim().toLowerCase();
    const record = accounts.find(
      (a) => String(a.username).toLowerCase() === key || String(a.email).toLowerCase() === key
    );
    if (!record) return this.#fail('No account found with that username or email.', 'username');
    const ok = await verifyPassword(password || '', record.passwordHash);
    if (!ok) return this.#fail('Incorrect password.', 'password');
    record.lastLogin = new Date().toISOString();
    this.#write(accounts);
    this.#setSession(record.id);
    return { ok: true, player: this.#public(record), token: `local.${record.id}` };
  }

  async logout() {
    this.#setSession(null);
    return { ok: true };
  }

  async me(id = this.sessionId()) {
    if (!id) return this.#fail('Not signed in.');
    const record = this.#read().find((a) => a.id === id);
    if (!record) return this.#fail('That saved session no longer exists.');
    return { ok: true, player: this.#public(record) };
  }

  /** Merge a progression/settings patch into the stored record. */
  async save(patch, id = this.sessionId()) {
    if (!id) return this.#fail('Not signed in.');
    const accounts = this.#read();
    const index = accounts.findIndex((a) => a.id === id);
    if (index < 0) return this.#fail('That saved session no longer exists.');
    const merged = { ...accounts[index], ...(patch || {}) };
    // Identity fields are owned by the store, never by a client patch.
    merged.id = accounts[index].id;
    merged.passwordHash = accounts[index].passwordHash;
    merged.registrationDate = accounts[index].registrationDate;
    merged.username = accounts[index].username;
    merged.email = accounts[index].email;
    if (!Array.isArray(merged.defeatedEnemies)) merged.defeatedEnemies = accounts[index].defeatedEnemies;
    if (!Array.isArray(merged.unlockedCharacters)) merged.unlockedCharacters = accounts[index].unlockedCharacters;
    accounts[index] = merged;
    this.#write(accounts);
    return { ok: true, player: this.#public(merged) };
  }

  #fail(message, field = null) {
    const err = new Error(message);
    err.status = 400;
    err.field = field;
    throw err;
  }
}

export const localAccounts = new LocalAccountStore();
