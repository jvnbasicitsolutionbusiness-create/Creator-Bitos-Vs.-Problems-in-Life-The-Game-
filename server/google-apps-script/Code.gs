/**
 * Code.gs — serverless backend for CREATOR BITOS VS PROBLEMS IN LIFE.
 *
 * Paste this into a Google Apps Script bound to your players spreadsheet
 * (Extensions → Apps Script), then Deploy → New deployment → Web app
 * (Execute as: Me, Who has access: Anyone) and copy the /exec URL.
 *
 * Why this exists: the published game is a static site with no Node server, but
 * player accounts still need to live in Google Sheets. Apps Script runs inside
 * Google, so the spreadsheet credentials never touch the game, the browser or
 * any config file — the Web App URL is the only thing the client knows.
 *
 * Setup
 *   1. Create a spreadsheet with a tab named "Players".
 *   2. Extensions → Apps Script → paste this file → Save.
 *   3. Deploy → New deployment → Web app → Execute as: Me / Access: Anyone.
 *   4. Copy the Web App URL and paste it into the game:
 *      Settings → Database  (or set window.BITOS_API_BASE before the game loads)
 *
 * The client contract matches server/routes/api.js exactly, so the same game
 * code works against the Node server OR this script with no changes:
 *
 *   GET  ?action=health                      -> { ok, service, players }
 *   POST { action:'register', ... }          -> { ok, token, player }
 *   POST { action:'login', username, pword } -> { ok, token, player }
 *   POST { action:'me', token }              -> { ok, player }
 *   POST { action:'save', token, patch }     -> { ok, player }
 *   POST { action:'logout', token }          -> { ok }
 */

var SHEET_NAME = 'Players';
var SESSION_HOURS = 24 * 30;

/* ------------------------------------------------------------------ sheet */

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['id', 'username', 'email', 'passwordHash', 'registrationDate', 'lastLogin',
      'hasSeenIntro', 'campaignProgress', 'defeatedEnemies', 'unlockedCharacters',
      'multiplayerUnlocked', 'campaignCompleted', 'settings', 'stats', 'enemyRecords', 'sessionToken', 'sessionExpiry']);
  }
  return sh;
}

function blankPlayer_() {
  return {
    hasSeenIntro: false,
    campaignProgress: 0,
    defeatedEnemies: [],
    unlockedCharacters: ['creator-bitos'],
    multiplayerUnlocked: false,
    campaignCompleted: false,
    settings: {},
    stats: { matchesPlayed: 0, matchesWon: 0, matchesLost: 0, totalDamageDealt: 0, totalDamageTaken: 0, bestCombo: 0, totalTimePlayedSeconds: 0, trainingSessions: 0 },
    enemyRecords: {}
  };
}

function readRow_(row) {
  var p = blankPlayer_();
  p.id = row[0] || '';
  p.username = row[1] || '';
  p.email = row[2] || '';
  p.registrationDate = row[3] || '';
  p.lastLogin = row[4] || '';
  p.hasSeenIntro = row[5] === true || row[5] === 'TRUE';
  p.campaignProgress = Number(row[6]) || 0;
  p.defeatedEnemies = parseList_(row[7]);
  p.unlockedCharacters = parseList_(row[8]).length ? parseList_(row[8]) : ['creator-bitos'];
  p.multiplayerUnlocked = row[9] === true || row[9] === 'TRUE';
  p.campaignCompleted = row[10] === true || row[10] === 'TRUE';
  p.settings = parseJson_(row[11], {});
  p.stats = Object.assign(blankPlayer_().stats, parseJson_(row[12], {}));
  p.enemyRecords = parseJson_(row[13], {});
  return p;
}

function parseList_(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  var text = String(value).trim();
  if (!text) return [];
  if (text.charAt(0) === '[') {
    try { return JSON.parse(text); } catch (e) { /* fall through */ }
  }
  return text.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function parseJson_(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch (e) { return fallback; }
}

function writeRow_(sh, index, p, hash, token, expiry) {
  sh.getRange(index + 1, 1, 1, 17).setValues([[
    p.id, p.username, p.email, hash, p.registrationDate, p.lastLogin,
    p.hasSeenIntro ? 'TRUE' : 'FALSE',
    p.campaignProgress,
    JSON.stringify(p.defeatedEnemies || []),
    JSON.stringify(p.unlockedCharacters || ['creator-bitos']),
    p.multiplayerUnlocked ? 'TRUE' : 'FALSE',
    p.campaignCompleted ? 'TRUE' : 'FALSE',
    JSON.stringify(p.settings || {}),
    JSON.stringify(p.stats || {}),
    JSON.stringify(p.enemyRecords || {}),
    token || '',
    expiry || ''
  ]]);
}

/* ------------------------------------------------------------------ crypto */

/**
 * Apps Script has no scrypt, so this uses PBKDF2-SHA256 at 250k iterations
 * (the same primitive the offline browser store uses). The password never
 * reaches the sheet in any recoverable form.
 */
function hashPassword_(password, saltHex) {
  var salt = saltHex
    ? hexToBytes_(saltHex)
    : Utilities.getRandomValues(new Uint8Array(16));
  var derived = Utilities.computeHmacSha256Signature
    ? null
    : null; // PBKDF2 is used below; this guard keeps the linter quiet.
  var bits = Utilities.pbkdf2 ? null : null;
  // Utilities.computePbkdf2 is the documented API in modern Apps Script.
  var key = Utilities.computePbkdf2
    ? null
    : null;
  void derived; void bits; void key;
  var hash = pbkdf2_(password, salt);
  return 'pbkdf2$250000$' + bytesToHex_(salt) + '$' + bytesToHex_(hash);
}

/** PBKDF2-SHA256 implemented with the HMAC primitive Apps Script does expose. */
function pbkdf2_(password, salt) {
  var passwordBytes = Utilities.newBlob(password).getBytes();
  var iterations = 250000;
  var length = 32;
  var blockCount = Math.ceil(length / 32);
  var out = [];
  for (var block = 1; block <= blockCount; block += 1) {
    var u = hmac_(passwordBytes, concatBytes_(salt, intToBytes_(block)));
    var t = u.slice();
    for (var i = 1; i < iterations; i += 1) {
      u = hmac_(passwordBytes, u);
      t = xorBytes_(t, u);
    }
    out = out.concat(Array.prototype.slice.call(t));
  }
  return out.slice(0, length);
}

function hmac_(keyBytes, messageBytes) {
  return Utilities.computeHmacSha256Signature(messageBytes, keyBytes);
}

function xorBytes_(a, b) {
  var out = new Uint8Array(a.length);
  for (var i = 0; i < a.length; i += 1) out[i] = a[i] ^ b[i];
  return out;
}

function concatBytes_(a, b) {
  var out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function intToBytes_(n) {
  return new Uint8Array([(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
}

function bytesToHex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i += 1) {
    var v = (bytes[i] & 255).toString(16);
    s += v.length === 1 ? '0' + v : v;
  }
  return s;
}

function hexToBytes_(hex) {
  var out = new Uint8Array(hex.length / 2);
  for (var i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.substr(i, 2), 16);
  return out;
}

function verifyPassword_(password, stored) {
  if (!stored || typeof stored !== 'string' || stored.indexOf('pbkdf2$') !== 0) return false;
  var parts = stored.split('$');
  if (parts.length !== 4) return false;
  var salt = hexToBytes_(parts[2]);
  var expected = parts[3];
  var actual = bytesToHex_(pbkdf2_(password, salt));
  return constantTimeEqual_(actual, expected);
}

function constantTimeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* -------------------------------------------------------------- validation */

var USERNAME_RE = /^[a-zA-Z0-9._-]+$/;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate_(payload) {
  var username = String(payload.username || '').trim();
  var email = String(payload.email || '').trim();
  var password = String(payload.password || '');
  if (!username || username.length < 3) return { field: 'username', error: 'Username must be at least 3 characters.' };
  if (username.length > 20) return { field: 'username', error: 'Username must be 20 characters or fewer.' };
  if (!USERNAME_RE.test(username)) return { field: 'username', error: 'Username may use letters, numbers, dot, dash and underscore only.' };
  if (!EMAIL_RE.test(email)) return { field: 'email', error: 'Enter a valid email address.' };
  if (password.length < 8) return { field: 'password', error: 'Password must be at least 8 characters.' };
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return { field: 'password', error: 'Password must contain a letter and a number.' };
  return null;
}

/* ----------------------------------------------------------------- routing */

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'health') {
    return json_({ ok: true, service: 'creator-bitos-apps-script', version: '1.0.0', players: sheet_().getLastRow() - 1 });
  }
  return json_({ ok: false, error: 'Use POST for game actions.' });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Malformed request.' });
  }
  var action = body.action;
  try {
    if (action === 'health') {
      return json_({ ok: true, service: 'creator-bitos-apps-script', version: '1.0.0', players: sheet_().getLastRow() - 1, database: { provider: 'google-sheets', writable: true } });
    }
    if (action === 'register') return register_(body);
    if (action === 'login') return login_(body);
    if (action === 'me') return me_(body);
    if (action === 'save') return save_(body);
    if (action === 'logout') return logout_(body);
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function findRowByToken_(token) {
  if (!token) return -1;
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var data = sh.getRange(2, 1, last - 1, 17).getValues();
  for (var i = 0; i < data.length; i += 1) {
    if (data[i][15] === token) {
      // Sessions expire.
      if (data[i][16] && new Date(data[i][16]).getTime() < Date.now()) return -1;
      return i + 2; // 1-based sheet row
    }
  }
  return -1;
}

function findRowByUser_(key) {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var needle = String(key || '').trim().toLowerCase();
  var data = sh.getRange(2, 2, last - 1, 2).getValues();
  for (var i = 0; i < data.length; i += 1) {
    if (String(data[i][0]).toLowerCase() === needle || String(data[i][1]).toLowerCase() === needle) return i + 2;
  }
  return -1;
}

function public_(row, p) {
  return {
    id: p.id, username: p.username, email: p.email,
    registrationDate: p.registrationDate, lastLogin: p.lastLogin,
    hasSeenIntro: p.hasSeenIntro, campaignProgress: p.campaignProgress,
    defeatedEnemies: p.defeatedEnemies, unlockedCharacters: p.unlockedCharacters,
    multiplayerUnlocked: p.multiplayerUnlocked, campaignCompleted: p.campaignCompleted,
    settings: p.settings, stats: p.stats, enemyRecords: p.enemyRecords
  };
  void row;
}

function register_(body) {
  var invalid = validate_(body);
  if (invalid) return json_({ ok: false, error: invalid.error, field: invalid.field });
  if (body.confirmPassword !== undefined && body.password !== body.confirmPassword) {
    return json_({ ok: false, error: 'Passwords do not match.', field: 'confirmPassword' });
  }
  var sh = sheet_();
  if (findRowByUser_(body.username) > 0) return json_({ ok: false, error: 'That username is already taken.', field: 'username' });
  if (findRowByUser_(body.email) > 0) return json_({ ok: false, error: 'That email is already registered.', field: 'email' });

  var now = new Date().toISOString();
  var p = blankPlayer_();
  p.id = 'p_' + bytesToHex_(Utilities.getRandomValues(new Uint8Array(8)));
  p.username = String(body.username).trim();
  p.email = String(body.email).trim().toLowerCase();
  p.registrationDate = now;
  p.lastLogin = now;

  var hash = hashPassword_(String(body.password));
  var token = bytesToHex_(Utilities.getRandomValues(new Uint8Array(24)));
  var expiry = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  writeRow_(sh, sh.getLastRow(), p, hash, token, expiry);
  return json_({ ok: true, token: token, player: public_(null, p) });
}

function login_(body) {
  var sh = sheet_();
  var row = findRowByUser_(body.username);
  if (row < 0) return json_({ ok: false, error: 'No account found with that username or email.', field: 'username' });
  var values = sh.getRange(row, 1, 1, 17).getValues()[0];
  if (!verifyPassword_(String(body.password || ''), values[3])) {
    return json_({ ok: false, error: 'Incorrect password.', field: 'password' });
  }
  var p = readRow_([values[0], values[1], values[2], values[4], values[5], values[6], values[7], values[8], values[9], values[10], values[11], values[12], values[13], values[14]]);
  p.lastLogin = new Date().toISOString();
  var token = bytesToHex_(Utilities.getRandomValues(new Uint8Array(24)));
  var expiry = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  writeRow_(sh, row - 1, p, values[3], token, expiry);
  return json_({ ok: true, token: token, player: public_(null, p) });
}

function me_(body) {
  var row = findRowByToken_(body.token);
  if (row < 0) return json_({ ok: false, error: 'Not signed in.' });
  var values = sheet_().getRange(row, 1, 1, 17).getValues()[0];
  var p = readRow_([values[0], values[1], values[2], values[4], values[5], values[6], values[7], values[8], values[9], values[10], values[11], values[12], values[13], values[14]]);
  return json_({ ok: true, player: public_(null, p) });
}

function save_(body) {
  var row = findRowByToken_(body.token);
  if (row < 0) return json_({ ok: false, error: 'Not signed in.' });
  var sh = sheet_();
  var values = sh.getRange(row, 1, 1, 17).getValues()[0];
  var p = readRow_([values[0], values[1], values[2], values[4], values[5], values[6], values[7], values[8], values[9], values[10], values[11], values[12], values[13], values[14]]);
  var patch = body.patch || {};
  var allowed = ['hasSeenIntro', 'campaignProgress', 'defeatedEnemies', 'unlockedCharacters',
    'multiplayerUnlocked', 'campaignCompleted', 'settings', 'stats', 'enemyRecords'];
  for (var i = 0; i < allowed.length; i += 1) {
    var key = allowed[i];
    if (patch[key] !== undefined) p[key] = patch[key];
  }
  p.lastLogin = new Date().toISOString();
  writeRow_(sh, row - 1, p, values[3], values[15], values[16]);
  return json_({ ok: true, player: public_(null, p) });
}

function logout_(body) {
  var row = findRowByToken_(body.token);
  if (row < 0) return json_({ ok: true });
  var sh = sheet_();
  var values = sh.getRange(row, 1, 1, 17).getValues()[0];
  var p = readRow_([values[0], values[1], values[2], values[4], values[5], values[6], values[7], values[8], values[9], values[10], values[11], values[12], values[13], values[14]]);
  writeRow_(sh, row - 1, p, values[3], '', '');
  return json_({ ok: true });
}

/** Local smoke test: run testAll() from the Apps Script editor. */
function testAll() {
  var username = 'test_' + bytesToHex_(Utilities.getRandomValues(new Uint8Array(4)));
  var email = username + '@example.com';
  var reg = register_({ username: username, email: email, password: 'bitos12345', confirmPassword: 'bitos12345' });
  var regObj = JSON.parse(reg.getContent());
  if (!regObj.ok) throw new Error('register failed: ' + regObj.error);
  var login = JSON.parse(login_({ username: username, password: 'bitos12345' }).getContent());
  if (!login.ok) throw new Error('login failed: ' + login.error);
  var saved = JSON.parse(save_({ token: login.token, patch: { campaignProgress: 3, defeatedEnemies: ['laziness'] } }).getContent());
  if (saved.player.campaignProgress !== 3) throw new Error('save failed');
  var me = JSON.parse(me_({ token: login.token }).getContent());
  if (me.player.defeatedEnemies.length !== 1) throw new Error('reload failed');
  var bad = JSON.parse(login_({ username: username, password: 'wrongpassword1' }).getContent());
  if (bad.ok) throw new Error('wrong password was accepted');
  logout_({ token: login.token });
  Logger.log('All Apps Script checks passed for ' + username);
}
