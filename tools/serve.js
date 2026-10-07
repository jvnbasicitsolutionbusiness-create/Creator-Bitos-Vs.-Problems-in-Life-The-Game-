#!/usr/bin/env node
/**
 * serve.js — zero-dependency static server for local play.
 *
 *   node tools/serve.js            # whole repo; game at /public/index.html
 *   node tools/serve.js public     # public/ as the site root, as a static
 *                                  # host (Pages/Vercel/Netlify) serves it
 *   PORT=8080 node tools/serve.js
 *
 * Uses only the Node standard library: there is no Express, no build step and
 * nothing to install. Any static host (python3 -m http.server, `npx serve`,
 * VS Code Live Server, Nginx…) works just as well — this is only here so
 * `npm run dev` is one command.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Optional docroot: `node tools/serve.js public` serves that folder as the
// site root, which is how a static host publishes the game.
const arg = process.argv[2];
const DOCROOT = path.resolve(ROOT, arg || '.');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function contentType(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/** Keep requests inside the served folder. */
function resolveSafe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const candidate = path.resolve(DOCROOT, `.${path.posix.normalize(decoded)}`);
  if (candidate === DOCROOT || candidate.startsWith(DOCROOT + path.sep)) return candidate;
  return null;
}

async function findFile(target) {
  const stat = await fsp.stat(target).catch(() => null);
  if (!stat) return null;
  if (stat.isFile()) return target;
  for (const index of ['index.html', 'index.htm']) {
    const nested = path.join(target, index);
    const nestedStat = await fsp.stat(nested).catch(() => null);
    if (nestedStat?.isFile()) return nested;
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const requested = req.url || '/';

  // API routes only exist when the full backend is running (server/index.js).
  if (requested.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'This is the static-only server. Run `npm run server` to enable accounts.' }));
    console.log(`[static] ${req.method} ${requested} -> 404 (no api) (${Date.now() - started}ms)`);
    return;
  }

  const target = resolveSafe(requested);
  let file = target ? await findFile(target) : null;
  // Single-page fallback: unknown paths still serve the game shell.
  if (!file && target && !path.extname(target)) file = await findFile(path.join(DOCROOT, 'index.html'));

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    console.log(`[static] ${req.method} ${requested} -> 404 (${Date.now() - started}ms)`);
    return;
  }

  const body = await fsp.readFile(file).catch(() => null);
  if (body === null) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error');
    return;
  }

  res.writeHead(200, {
    'Content-Type': contentType(file),
    'Content-Length': body.length,
    // Always revalidate: no stale JS while developing.
    'Cache-Control': 'no-cache, must-revalidate'
  });
  res.end(body);
  const rel = path.relative(ROOT, file);
  console.log(`[static] ${req.method} ${requested} -> 200 ${rel} (${Date.now() - started}ms)`);
});

server.listen(PORT, HOST, () => {
  console.log('===============================================================');
  console.log('  CREATOR BITOS VS PROBLEMS IN LIFE (THE GAME)');
  console.log('===============================================================');
  console.log(`  Playing at : http://localhost:${PORT}`);
  console.log(`  Docroot    : ${DOCROOT}`);
  console.log('  Backend    : none — accounts are stored in your browser');
  console.log('  (run `npm run server` if you want the accounts API)');
  console.log('===============================================================');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: PORT=8080 node tools/serve.js`);
    process.exit(1);
  }
  throw err;
});

void fs;
