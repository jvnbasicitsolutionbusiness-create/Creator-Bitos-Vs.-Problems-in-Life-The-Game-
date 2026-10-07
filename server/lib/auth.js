/**
 * auth.js — password hashing, session tokens and input validation.
 *
 * Passwords are hashed with scrypt (salted, 64-byte key) and compared in
 * constant time. Plaintext passwords are never stored or logged anywhere.
 * Sessions are HMAC-signed, expiring tokens returned to the client as a
 * cookie (HttpOnly when served over a real host) and an Authorization header.
 */
import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function secret() {
  return process.env.SESSION_SECRET || 'creator-bitos-dev-secret-change-me';
}

/* -------------------------------------------------------------------------- */
/* Passwords                                                                   */
/* -------------------------------------------------------------------------- */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN, { N: SCRYPT_COST }).toString('hex');
  return `scrypt$${SCRYPT_COST}$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const [, cost, salt, hash] = stored.split('$');
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(password), salt, expected.length, { N: Number(cost) || SCRYPT_COST });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                    */
/* -------------------------------------------------------------------------- */

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function createSessionToken(playerId) {
  const payload = Buffer.from(
    JSON.stringify({ pid: playerId, iat: Date.now(), exp: Date.now() + SESSION_TTL_MS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.exp !== 'number' || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'bitos_session';
export const SESSION_MAX_AGE = SESSION_TTL_MS / 1000;

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  return null;
}

export function validatePassword(password) {
  const value = String(password || '');
  if (!value) return 'Password is required.';
  if (value.length < 8) return 'Password must be at least 8 characters.';
  if (value.length > 128) return 'Password is too long.';
  if (!/[a-zA-Z]/.test(value)) return 'Password must include at least one letter.';
  if (!/[0-9]/.test(value)) return 'Password must include at least one number.';
  return null;
}

export function generatePlayerId() {
  return `p_${crypto.randomBytes(9).toString('hex')}`;
}
