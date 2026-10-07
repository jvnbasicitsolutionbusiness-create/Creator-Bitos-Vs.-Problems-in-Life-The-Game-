/**
 * api.js — accounts and progression, online or offline.
 *
 * The game ships as a static site, so it cannot assume a backend exists. On
 * start-up it probes /api/health:
 *   - reachable  -> "online"  : accounts live on the server (or Google Sheets).
 *   - unreachable-> "offline" : accounts live in this browser via
 *                              core/local-accounts.js (PBKDF2 hashes, never
 *                              plaintext). The UI says so out loud.
 *
 * Nothing is faked: a failed save always surfaces a visible error state.
 */
import { storage } from './utils.js';
import { bus, EV } from './events.js';
import { localAccounts } from './local-accounts.js';

const TOKEN_KEY = 'session.token';
const BASE_KEY = 'api.base';

/**
 * Two backends, one client:
 *  - same-origin REST API (the optional Node server):        /api/auth/login
 *  - a Google Apps Script Web App (serverless):  POST <url>  { action: 'login' }
 * The base URL is empty by default, which means "same origin".
 */
const ACTIONS = {
  register: { path: 'auth/register', method: 'POST' },
  login: { path: 'auth/login', method: 'POST' },
  logout: { path: 'auth/logout', method: 'POST' },
  me: { path: 'me', method: 'GET' },
  save: { path: 'me', method: 'PATCH' },
  health: { path: 'health', method: 'GET' }
};

class ApiClient {
  constructor() {
    this.token = storage.get(TOKEN_KEY, null);
    this.online = true;
    this.lastError = null;
    this.pending = 0;
    this.saveQueue = Promise.resolve();
    /** 'unknown' until the health probe answers, then 'online' or 'offline'. */
    this.mode = 'unknown';
    /**
     * Where accounts live. Empty = same origin (the Node server). A full
     * https:// URL = a Google Apps Script Web App. Set it with setBase() or by
     * loading the game with ?api=<url>.
     */
    this.base = storage.get(BASE_KEY, '') || '';
  }

  get useScript() {
    return /^https?:\/\//i.test(this.base);
  }

  /** Point the client at a Google Apps Script Web App (or back to same-origin). */
  setBase(url) {
    this.base = String(url || '').trim();
    if (this.base) storage.set(BASE_KEY, this.base);
    else storage.remove(BASE_KEY);
    return this.base;
  }

  /**
   * One call for both backend styles. Apps Script cannot answer a CORS
   * preflight, so script mode posts JSON as text/plain (a simple request).
   */
  call(action, body = null, options = {}) {
    const spec = ACTIONS[action];
    if (!spec) throw new Error(`Unknown API action: ${action}`);
    if (!this.useScript) {
      return this.request(`/api/${spec.path}`, { ...options, method: options.method || spec.method, body });
    }
    // Apps Script also has to receive the session inside the body: an
    // Authorization header would force a CORS preflight it cannot answer.
    return this.request(this.base, {
      ...options,
      method: 'POST',
      body: { action, ...(this.token ? { token: this.token } : {}), ...(body || {}) },
      asText: true
    });
  }

  /** True when accounts are being kept in this browser instead of a server. */
  get isOffline() {
    return this.mode === 'offline';
  }

  /**
   * Decide which backend to use. Called once during boot. A missing API is not
   * an error — the game is fully playable offline — but the UI is told, so the
   * player knows where their progress is being kept.
   */
  async detectMode({ timeout = 2500 } = {}) {
    try {
      await this.call('health', null, { retries: 0, timeout });
      this.mode = 'online';
    } catch {
      this.mode = 'offline';
      this.online = false;
    }
    bus.emit(EV.MODE_CHANGE, this.mode);
    return this.mode;
  }

  setToken(token) {
    this.token = token;
    if (token) storage.set(TOKEN_KEY, token);
    else storage.remove(TOKEN_KEY);
  }

  get isSignedIn() {
    return Boolean(this.token);
  }

  async request(path, { method = 'GET', body = null, retries = 1, timeout = 12000, asText = false } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    this.pending += 1;
    try {
      const res = await fetch(path, {
        method,
        headers: {
          ...(body ? { 'Content-Type': asText ? 'text/plain;charset=utf-8' : 'application/json' } : {}),
          ...(this.token && !asText ? { Authorization: `Bearer ${this.token}` } : {})
        },
        body: body ? JSON.stringify(body) : null,
        signal: controller.signal,
        credentials: 'same-origin'
      });

      let payload = null;
      try {
        payload = await res.json();
      } catch {
        throw new Error(`Server returned an unreadable response (${res.status}).`);
      }

      if (!res.ok || payload.ok === false) {
        const err = new Error(payload?.error || `Request failed (${res.status})`);
        err.status = res.status;
        err.field = payload?.field || null;
        err.payload = payload;
        throw err;
      }
      this.online = true;
      this.lastError = null;
      return payload;
    } catch (err) {
      if (err.name === 'AbortError') err = new Error('The server took too long to respond.');
      if (retries > 0 && (!err.status || err.status >= 500)) {
        await new Promise((r) => setTimeout(r, 600));
        return this.request(path, { method, body, retries: retries - 1, timeout, asText });
      }
      this.online = false;
      this.lastError = err.message;
      throw err;
    } finally {
      clearTimeout(timer);
      this.pending -= 1;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Auth                                                               */
  /* ------------------------------------------------------------------ */

  async register({ username, email, password, confirmPassword }) {
    if (this.isOffline) {
      const res = await localAccounts.register({ username, email, password, confirmPassword });
      if (res.token) this.setToken(res.token);
      return res;
    }
    const res = await this.call('register', { username, email, password, confirmPassword });
    if (res.token) this.setToken(res.token);
    return res;
  }

  async login({ username, password }) {
    if (this.isOffline) {
      const res = await localAccounts.login({ username, password });
      if (res.token) this.setToken(res.token);
      return res;
    }
    const res = await this.call('login', { username, password });
    if (res.token) this.setToken(res.token);
    return res;
  }

  async logout() {
    if (this.isOffline) {
      await localAccounts.logout();
      this.setToken(null);
      return { ok: true };
    }
    try {
      await this.call('logout');
    } finally {
      this.setToken(null);
    }
  }

  async me() {
    if (this.isOffline) return localAccounts.me();
    return this.call('me');
  }

  /* ------------------------------------------------------------------ */
  /* Progression                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Queue a progression/settings patch. Saves are serialised so two events
   * firing together can never race and clobber each other's fields.
   */
  save(patch) {
    if (this.isOffline) {
      const run = this.saveQueue.then(
        () => localAccounts.save(patch),
        () => localAccounts.save(patch)
      );
      this.saveQueue = run.then(
        (res) => {
          bus.emit(EV.SAVE_OK, res);
          return res;
        },
        (err) => {
          bus.emit(EV.SAVE_FAIL, err);
          throw err;
        }
      );
      return this.saveQueue;
    }
    const run = this.saveQueue.then(
      () => this.call('save', patch),
      () => this.call('save', patch)
    );
    this.saveQueue = run.then(
      (res) => {
        bus.emit(EV.SAVE_OK, res);
        return res;
      },
      (err) => {
        bus.emit(EV.SAVE_FAIL, err);
        throw err;
      }
    );
    return this.saveQueue;
  }

  async health() {
    return this.call('health', null, { retries: 0, timeout: 6000 });
  }
}

export const api = new ApiClient();
