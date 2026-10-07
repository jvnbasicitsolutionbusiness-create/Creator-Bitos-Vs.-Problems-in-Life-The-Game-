/**
 * pbkdf2.js — PBKDF2-HMAC-SHA256 with no dependency on Web Crypto.
 *
 * Why this exists: `crypto.subtle` is only available in a *secure context*
 * (HTTPS, localhost, or file://). The moment the game is embedded in a
 * sandboxed iframe (itch.io, a portfolio page, a school portal), opened from a
 * plain-HTTP LAN address, or run by a browser with hardware crypto disabled,
 * `crypto.subtle` is `undefined` and every account operation throws — which
 * used to take the whole game down with it.
 *
 * So hashing picks the best engine available at runtime:
 *   1. `crypto.subtle`   — native, fast, preferred.
 *   2. this module       — pure JavaScript, always available.
 *
 * Both produce byte-identical output, so a hash written by one engine verifies
 * with the other. (Verified in store-test.js against published test vectors.)
 */

/* ------------------------------------------------------------- SHA-256 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const W = new Uint32Array(64); // shared scratch — hashing is not reentrant

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

function sha256Compress(state, block, offset) {
  for (let i = 0; i < 16; i += 1) {
    W[i] = (block[offset + i * 4] << 24) | (block[offset + i * 4 + 1] << 16) |
           (block[offset + i * 4 + 2] << 8) | block[offset + i * 4 + 3];
  }
  for (let i = 16; i < 64; i += 1) {
    const a = W[i - 15];
    const b = W[i - 2];
    const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
    const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }

  let [a, b, c, d, e, f, g, h] = state;

  for (let i = 0; i < 64; i += 1) {
    const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
    const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) | 0;

    h = g; g = f; f = e;
    e = (d + t1) | 0;
    d = c; c = b; b = a;
    a = (t1 + t2) | 0;
  }

  state[0] = (state[0] + a) | 0;
  state[1] = (state[1] + b) | 0;
  state[2] = (state[2] + c) | 0;
  state[3] = (state[3] + d) | 0;
  state[4] = (state[4] + e) | 0;
  state[5] = (state[5] + f) | 0;
  state[6] = (state[6] + g) | 0;
  state[7] = (state[7] + h) | 0;
}

export function sha256(message) {
  const len = message.length;
  // message + 0x80 + zero padding + 8-byte big-endian bit length, rounded to 64
  const total = (((len + 8) >> 6) + 1) * 64;
  const buf = new Uint8Array(total);
  buf.set(message);
  buf[len] = 0x80;

  const bitLen = len * 8;
  // Write the 64-bit length big-endian. JS bitwise ops are 32-bit, so split it.
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  buf[total - 8] = (hi >>> 24) & 0xff;
  buf[total - 7] = (hi >>> 16) & 0xff;
  buf[total - 6] = (hi >>> 8) & 0xff;
  buf[total - 5] = hi & 0xff;
  buf[total - 4] = (lo >>> 24) & 0xff;
  buf[total - 3] = (lo >>> 16) & 0xff;
  buf[total - 2] = (lo >>> 8) & 0xff;
  buf[total - 1] = lo & 0xff;

  const state = new Int32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);

  for (let off = 0; off < total; off += 64) sha256Compress(state, buf, off);

  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i += 1) {
    out[i * 4] = (state[i] >>> 24) & 0xff;
    out[i * 4 + 1] = (state[i] >>> 16) & 0xff;
    out[i * 4 + 2] = (state[i] >>> 8) & 0xff;
    out[i * 4 + 3] = state[i] & 0xff;
  }
  return out;
}

/* ---------------------------------------------------------------- HMAC */

const BLOCK = 64;

function hmacSha256(keyBytes, message) {
  let key = keyBytes;
  if (key.length > BLOCK) key = sha256(key);

  const padded = new Uint8Array(BLOCK);
  padded.set(key);

  const inner = new Uint8Array(BLOCK + message.length);
  const outer = new Uint8Array(BLOCK + 32);
  for (let i = 0; i < BLOCK; i += 1) {
    inner[i] = padded[i] ^ 0x36;
    outer[i] = padded[i] ^ 0x5c;
  }
  inner.set(message, BLOCK);

  const digest = sha256(inner);
  outer.set(digest, BLOCK);
  return sha256(outer);
}

/**
 * PBKDF2-HMAC-SHA256.
 * @param {Uint8Array} password
 * @param {Uint8Array} salt
 * @param {number} iterations
 * @param {number} bytes  derived key length in bytes
 * @returns {Uint8Array}
 */
export function pbkdf2Sha256(password, salt, iterations, bytes) {
  const hLen = 32;
  const blocks = Math.ceil(bytes / hLen);
  const out = new Uint8Array(blocks * hLen);

  // salt || INT_32_BE(counter)
  const saltWithCounter = new Uint8Array(salt.length + 4);
  saltWithCounter.set(salt);

  for (let block = 1; block <= blocks; block += 1) {
    saltWithCounter[salt.length] = (block >>> 24) & 0xff;
    saltWithCounter[salt.length + 1] = (block >>> 16) & 0xff;
    saltWithCounter[salt.length + 2] = (block >>> 8) & 0xff;
    saltWithCounter[salt.length + 3] = block & 0xff;

    let u = hmacSha256(password, saltWithCounter);
    const t = Uint8Array.from(u);

    for (let i = 1; i < iterations; i += 1) {
      u = hmacSha256(password, u);
      for (let j = 0; j < hLen; j += 1) t[j] ^= u[j];
    }

    out.set(t, (block - 1) * hLen);
  }

  return out.subarray(0, bytes);
}

/**
 * Derive a password hash, preferring native Web Crypto and silently falling
 * back to the pure-JS engine when it is unavailable.
 *
 * @returns {Promise<{hash: string, engine: 'webcrypto'|'javascript'}>}
 *   `hash` is `pbkdf2$<iterations>$<saltB64>$<keyB64>`.
 */
export async function derivePasswordHash(password, { salt, iterations = 250000, bytes = 32 } = {}) {
  const encoder = new TextEncoder();
  const passwordBytes = typeof password === 'string' ? encoder.encode(password) : password;
  const saltBytes = salt || randomSalt();
  const subtle = typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle;

  let derived;
  let engine = 'javascript';

  if (subtle) {
    try {
      const key = await subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveBits']);
      const bits = await subtle.deriveBits(
        { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
        key,
        bytes * 8
      );
      derived = new Uint8Array(bits);
      engine = 'webcrypto';
    } catch {
      derived = null; // fall through to the JS engine
    }
  }

  if (!derived) derived = pbkdf2Sha256(passwordBytes, saltBytes, iterations, bytes);

  return {
    hash: `pbkdf2$${iterations}$${toBase64(saltBytes)}$${toBase64(derived)}`,
    engine
  };
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export function toBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
}

export function fromBase64(text) {
  const binary = typeof atob === 'function' ? atob(text) : Buffer.from(text, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
