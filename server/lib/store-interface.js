/**
 * store-interface.js
 * -----------------------------------------------------------------------------
 * The contract every player-database adapter must satisfy.
 *
 * The game never talks to a concrete database directly. It talks to this
 * interface, so the backing store (JSON file today, Google Sheets tomorrow,
 * Postgres/Firebase later) can be swapped by changing one environment variable
 * and without touching a single line of game code.
 *
 * Required methods:
 *   init(config)                     -> Promise<void>
 *   findByUsername(username)         -> Promise<PlayerRecord|null>
 *   findByEmail(email)               -> Promise<PlayerRecord|null>
 *   findById(id)                     -> Promise<PlayerRecord|null>
 *   insert(record)                   -> Promise<PlayerRecord>
 *   update(id, patch)                -> Promise<PlayerRecord>
 *   all()                            -> Promise<PlayerRecord[]>
 *   backendName()                    -> string
 *   isWritable()                     -> boolean   (false = read-only / offline)
 *
 * PlayerRecord shape is defined by `createPlayerRecord()` below so every
 * adapter stores identical fields.
 * -----------------------------------------------------------------------------
 */

/** Canonical, empty player record. All adapters must persist these fields. */
export function createPlayerRecord({ id, username, email, passwordHash } = {}) {
  return {
    /* ---- identity ------------------------------------------------------ */
    id: id || '',
    username: username || '',
    email: email || '',
    passwordHash: passwordHash || '', // NEVER a plaintext password
    registrationDate: new Date().toISOString(),
    lastLogin: new Date().toISOString(),

    /* ---- flags / progression ------------------------------------------- */
    hasSeenIntro: false,
    campaignProgress: 0, // highest cleared round index (0 = none)
    defeatedEnemies: [], // ['laziness','gadget', ...]
    unlockedCharacters: ['creator-bitos'],
    multiplayerUnlocked: false,
    campaignCompleted: false,

    /* ---- settings (mirrored from the client) --------------------------- */
    settings: {},

    /* ---- statistics ----------------------------------------------------- */
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

    /* ---- per-enemy records (wins/losses/attempts) ----------------------- */
    enemyRecords: {}
  };
}

/** Column order used by the Google Sheets adapter (also the JSON key order). */
export const PLAYER_FIELDS = [
  'id',
  'username',
  'email',
  'passwordHash',
  'registrationDate',
  'lastLogin',
  'hasSeenIntro',
  'campaignProgress',
  'defeatedEnemies',
  'unlockedCharacters',
  'multiplayerUnlocked',
  'campaignCompleted',
  'settings',
  'stats',
  'enemyRecords'
];

/** Serialise a record to the flat, string-only form a spreadsheet can hold. */
export function serializeRecord(record) {
  return PLAYER_FIELDS.map((field) => {
    const value = record[field];
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  });
}

/** Rebuild a typed record from flat spreadsheet/JSON storage. */
export function deserializeRecord(row = {}, index = 0) {
  const base = createPlayerRecord();
  const out = { ...base };
  for (const field of PLAYER_FIELDS) {
    const raw = row[field] ?? row[PLAYER_FIELDS.indexOf(field)] ?? null;
    if (raw === null || raw === undefined || raw === '') continue;
    // Arrays (defeatedEnemies / unlockedCharacters) must stay arrays here —
    // merging them into the default array would turn them into objects.
    if (Array.isArray(raw)) {
      out[field] = raw.slice();
      continue;
    }
    if (typeof raw !== 'string') {
      if (typeof raw === 'object' && raw !== null) out[field] = { ...base[field], ...raw };
      else out[field] = raw;
      continue;
    }
    if (field === 'hasSeenIntro' || field === 'multiplayerUnlocked' || field === 'campaignCompleted') {
      out[field] = raw === 'TRUE' || raw === 'true' || raw === '1';
    } else if (field === 'campaignProgress') {
      const n = Number.parseInt(raw, 10);
      out[field] = Number.isFinite(n) ? n : 0;
    } else if (field === 'defeatedEnemies' || field === 'unlockedCharacters') {
      try {
        const parsed = JSON.parse(raw);
        out[field] = Array.isArray(parsed) ? parsed : [];
      } catch {
        out[field] = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
      }
    } else if (field === 'settings' || field === 'stats' || field === 'enemyRecords') {
      try {
        const parsed = JSON.parse(raw);
        out[field] = { ...base[field], ...parsed };
      } catch {
        /* keep defaults */
      }
    } else {
      out[field] = raw;
    }
  }
  if (!out.id) out.id = `player-${index}`;
  if (!Array.isArray(out.unlockedCharacters) || out.unlockedCharacters.length === 0) {
    out.unlockedCharacters = ['creator-bitos'];
  }
  return out;
}

/**
 * Base class. Adapters extend it; unimplemented methods throw loudly rather
 * than silently pretending data was saved (see spec section 30).
 */
export class PlayerStore {
  constructor() {
    if (new.target === PlayerStore) {
      throw new Error('PlayerStore is abstract - instantiate a concrete adapter.');
    }
    this.ready = false;
  }

  async init() {
    throw new Error('init() not implemented by adapter');
  }

  async findByUsername() {
    throw new Error('findByUsername() not implemented by adapter');
  }

  async findByEmail() {
    throw new Error('findByEmail() not implemented by adapter');
  }

  async findById() {
    throw new Error('findById() not implemented by adapter');
  }

  async insert() {
    throw new Error('insert() not implemented by adapter');
  }

  async update() {
    throw new Error('update() not implemented by adapter');
  }

  async all() {
    throw new Error('all() not implemented by adapter');
  }

  backendName() {
    return 'unknown';
  }

  isWritable() {
    return true;
  }
}
