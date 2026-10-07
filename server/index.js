/**
 * index.js — CREATOR BITOS VS PROBLEMS IN LIFE (THE GAME) · game server
 *
 * A dependency-free Node HTTP server that:
 *   • serves the game client (static files, no build step)
 *   • exposes the account/progression API under /api
 *   • persists players through a swappable database adapter
 *
 * Start:  node server/index.js           (PORT=3000 by default)
 * Dev:    node server/index.js --dev     (verbose logging)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JsonPlayerStore } from './adapters/json-store.js';
import { GoogleSheetsPlayerStore, extractSheetId } from './adapters/google-sheets-store.js';
import { createApiHandler } from './routes/api.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DEV = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.ogg;': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function log(...args) {
  if (DEV) console.log('[server]', ...args);
}

/* -------------------------------------------------------------------------- */
/* Database adapter selection                                                  */
/* -------------------------------------------------------------------------- */

async function createStore() {
  const provider = (process.env.DB_PROVIDER || 'json').toLowerCase();

  if (provider === 'google-sheets' || provider === 'sheets' || process.env.GOOGLE_SHEET_ID) {
    try {
      const store = new GoogleSheetsPlayerStore();
      await store.init({
        sheetId: process.env.GOOGLE_SHEET_ID || extractSheetId(process.env.GOOGLE_SHEET_URL || ''),
        serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        privateKey: process.env.GOOGLE_PRIVATE_KEY,
        tab: process.env.GOOGLE_SHEET_TAB
      });
      console.log(`[db] Google Sheets connected — ${(await store.all()).length} player row(s) in tab "${store.tab}"`);
      return store;
    } catch (err) {
      console.error('[db] Google Sheets unavailable:', err.message);
      console.error('[db] Falling back to the local JSON store. Progress will be saved locally.');
    }
  }

  const store = new JsonPlayerStore();
  await store.init({ filePath: process.env.PLAYER_DB_FILE });
  console.log(`[db] Local JSON store ready — ${(await store.all()).length} player(s) at ${store.filePath}`);
  return store;
}

/* -------------------------------------------------------------------------- */
/* Static file serving                                                         */
/* -------------------------------------------------------------------------- */

function sendFile(res, filePath, { cache = true } = {}) {
  return new Promise((resolve) => {
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return resolve(false);
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': cache && !DEV ? 'public, max-age=300' : 'no-cache',
        // Allows SharedArrayBuffer / high-res timers later if needed.
        'Cross-Origin-Opener-Policy': 'same-origin'
      });
      fs.createReadStream(filePath).pipe(res);
      res.on('finish', () => resolve(true));
    });
  });
}

function safeJoin(rootDir, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const resolved = path.resolve(rootDir, `.${path.posix.normalize(decoded)}`);
  if (!resolved.startsWith(rootDir)) return null; // block path traversal
  return resolved;
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                        */
/* -------------------------------------------------------------------------- */

const store = await createStore();

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

const api = createApiHandler({ store, sendJson });

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Security headers that do not break the game client.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');

  try {
    if (url.pathname.startsWith('/api/')) {
      await api(req, res, url);
    } else {
      let filePath = safeJoin(PUBLIC_DIR, url.pathname);
      if (!filePath || url.pathname === '/') filePath = path.join(PUBLIC_DIR, 'index.html');
      const exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
      if (!exists) filePath = path.join(PUBLIC_DIR, 'index.html'); // SPA fallback
      await sendFile(res, filePath);
    }
  } catch (err) {
    console.error('[server] request error:', err);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Unexpected server error.' });
    else res.end();
  }

  if (DEV) log(`${req.method} ${url.pathname} -> ${res.statusCode} (${Date.now() - started}ms)`);
});

server.listen(PORT, HOST, () => {
  console.log('===============================================================');
  console.log('  CREATOR BITOS VS PROBLEMS IN LIFE (THE GAME)');
  console.log('===============================================================');
  console.log(`  Server    : http://${HOST}:${PORT}`);
  console.log(`  Database  : ${store.backendName()}`);
  console.log(`  Mode      : ${DEV ? 'development' : 'production'}`);
  console.log('===============================================================');
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[server] ${sig} received — shutting down.`);
    server.close(() => process.exit(0));
  });
}

export { server };
