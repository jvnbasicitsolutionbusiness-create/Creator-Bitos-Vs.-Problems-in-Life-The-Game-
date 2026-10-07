/**
 * json-store.js — default local player database.
 *
 * A single, atomically-written JSON document on disk. Used when no external
 * database is configured. Implements the exact same interface as
 * google-sheets-store.js, so switching providers is a one-line config change.
 *
 * Writes are atomic (write temp file -> rename) so an interrupted save can
 * never corrupt the progression data (spec section 30).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlayerStore, deserializeRecord, serializeRecord, PLAYER_FIELDS } from '../lib/store-interface.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(HERE, '..', 'data', 'players.json');

export class JsonPlayerStore extends PlayerStore {
  constructor() {
    super();
    this.filePath = DEFAULT_FILE;
    this.records = [];
    this.queue = Promise.resolve();
  }

  async init({ filePath } = {}) {
    if (filePath) this.filePath = path.resolve(filePath);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await this.#load();
    this.ready = true;
    return this;
  }

  async #load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed) ? parsed : parsed.players || [];
      this.records = rows.map((row, i) => deserializeRecord(row, i));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Corrupt file: keep a backup instead of silently wiping progress.
        try {
          await fs.copyFile(this.filePath, `${this.filePath}.corrupt-${Date.now()}.bak`);
        } catch { /* nothing else we can do */ }
        console.error('[json-store] could not read player file, starting empty:', err.message);
      }
      this.records = [];
      await this.#persist();
    }
  }

  async #persist() {
    const tmp = `${this.filePath}.tmp`;
    const payload = JSON.stringify(this.records, null, 2);
    await fs.writeFile(tmp, payload, 'utf8');
    await fs.rename(tmp, this.filePath);
  }

  /** Serialise writes so concurrent saves can't clobber each other. */
  #enqueue(task) {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }

  #index(id) {
    return this.records.findIndex((r) => r.id === id);
  }

  async findByUsername(username) {
    const needle = String(username || '').trim().toLowerCase();
    return this.records.find((r) => r.username.toLowerCase() === needle) || null;
  }

  async findByEmail(email) {
    const needle = String(email || '').trim().toLowerCase();
    return this.records.find((r) => r.email.toLowerCase() === needle) || null;
  }

  async findById(id) {
    return this.records.find((r) => r.id === id) || null;
  }

  async insert(record) {
    return this.#enqueue(async () => {
      const row = deserializeRecord(record, this.records.length);
      this.records.push(row);
      await this.#persist();
      return row;
    });
  }

  async update(id, patch = {}) {
    return this.#enqueue(async () => {
      const idx = this.#index(id);
      if (idx === -1) throw new Error(`No player record with id "${id}"`);
      const merged = deserializeRecord({ ...this.records[idx], ...patch }, idx);
      this.records[idx] = merged;
      await this.#persist();
      return merged;
    });
  }

  async all() {
    return this.records.slice();
  }

  backendName() {
    return 'local-json';
  }

  /** Exposed for the Google Sheets migration tool. */
  headerRow() {
    return PLAYER_FIELDS.slice();
  }

  rows() {
    return this.records.map(serializeRecord);
  }
}

export default JsonPlayerStore;
