/**
 * state.js — the single source of truth for the signed-in player.
 *
 * Progression rules (spec sections 29 & 30):
 *   • defeating round N sets campaignProgress = N and unlocks that enemy
 *   • all ten defeated → multiplayerUnlocked = true
 *   • every change is pushed to the server; failures are surfaced, never hidden
 *
 * The game never invents progress locally: if the database is unreachable the
 * UI shows an explicit SAVE FAILED / OFFLINE state.
 */
import { api } from './api.js';
import { settings } from '../config/settings.js';
import { CAMPAIGN_ROUNDS, CHARACTERS } from '../characters/roster.js';
import { bus, EV } from './events.js';
import { storage } from './utils.js';

export const SAVE_STATUS = {
  IDLE: 'idle',
  SAVING: 'saving',
  SAVED: 'saved',
  FAILED: 'failed'
};

class GameState {
  constructor() {
    this.player = null;
    this.saveStatus = SAVE_STATUS.IDLE;
    this.lastSavedAt = null;
    this.lastError = null;
    this.online = true;
    this.pendingPatch = {};
    this.dirty = false;
    this.listeners = new Set();

    bus.on(EV.SAVE_FAIL, (err) => {
      this.saveStatus = SAVE_STATUS.FAILED;
      this.lastError = err?.message || 'Unknown error';
      this.online = false;
      this.#notify();
    });
    bus.on(EV.SAVE_OK, () => {
      this.saveStatus = SAVE_STATUS.SAVED;
      this.lastSavedAt = Date.now();
      this.online = true;
      this.#notify();
    });
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  #notify() {
    for (const fn of this.listeners) fn(this);
  }

  get isSignedIn() {
    return Boolean(this.player);
  }

  get username() {
    return this.player?.username || '';
  }

  /* ------------------------------------------------------------------ */
  /* Session                                                             */
  /* ------------------------------------------------------------------ */

  async register(payload) {
    const res = await api.register(payload);
    this.player = res.player;
    this.#syncIntroSeen();
    settings.replace(res.player.settings || {});
    this.#notify();
    return res;
  }

  async login(payload) {
    const res = await api.login(payload);
    this.player = res.player;
    this.#syncIntroSeen();
    settings.replace(res.player.settings || {});
    this.#notify();
    return res;
  }

  async logout() {
    await api.logout().catch(() => {});
    this.player = null;
    this.saveStatus = SAVE_STATUS.IDLE;
    this.#notify();
  }

  /** Re-read the record from the server (used on boot with a stored token). */
  async restore() {
    if (!api.isSignedIn) return null;
    try {
      const res = await api.me();
      this.player = res.player;
      this.#syncIntroSeen();
      settings.replace(res.player.settings || {});
      this.#notify();
      return res.player;
    } catch (err) {
      this.lastError = err.message;
      api.setToken(null);
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Progression                                                         */
  /* ------------------------------------------------------------------ */

  get campaignProgress() {
    return this.player?.campaignProgress ?? 0;
  }

  get defeatedEnemies() {
    return this.player?.defeatedEnemies ?? [];
  }

  get unlockedCharacters() {
    return this.player?.unlockedCharacters ?? ['creator-bitos'];
  }

  get multiplayerUnlocked() {
    return Boolean(this.player?.multiplayerUnlocked);
  }

  get campaignCompleted() {
    return Boolean(this.player?.campaignCompleted);
  }

  /**
   * The cinematic now plays *before* sign-up, so watching it cannot be stored
   * on a player record that does not exist yet. It is remembered on the device
   * as well, which also stops a player who signs up straight afterwards from
   * being shown it a second time.
   */
  get hasSeenIntro() {
    return Boolean(this.player?.hasSeenIntro) || storage.get('introSeen', false) === true;
  }

  isUnlocked(characterId) {
    if (characterId === 'creator-bitos') return true;
    return this.unlockedCharacters.includes(characterId);
  }

  /** Round indices are 1-based; round N is playable once N-1 has been cleared. */
  isRoundUnlocked(roundNumber) {
    if (roundNumber <= 1) return true;
    return this.campaignProgress >= roundNumber - 1;
  }

  isDefeated(enemyId) {
    return this.defeatedEnemies.includes(enemyId);
  }

  markIntroSeen() {
    // Works whether or not anyone is signed in yet.
    storage.set('introSeen', true);
    if (!this.player) return;
    this.player.hasSeenIntro = true;
    this.queue({ hasSeenIntro: true });
  }

  /** Carry a device-level "already watched" onto a freshly signed-in player. */
  #syncIntroSeen() {
    if (this.player && !this.player.hasSeenIntro && storage.get('introSeen', false) === true) {
      this.player.hasSeenIntro = true;
      this.queue({ hasSeenIntro: true });
    }
  }

  /**
   * Record a campaign victory: unlock the enemy, advance progress, and unlock
   * multiplayer when the ladder is complete.
   */
  completeRound(enemyId, { results = null, unlock = true } = {}) {
    if (!this.player) return { unlocked: [], multiplayerUnlocked: false };

    const roundNumber = CAMPAIGN_ROUNDS.indexOf(enemyId) + 1;
    const patch = {};
    const newlyUnlocked = [];

    if (!this.player.defeatedEnemies.includes(enemyId)) {
      this.player.defeatedEnemies = [...this.player.defeatedEnemies, enemyId];
      patch.defeatedEnemies = this.player.defeatedEnemies;
      if (unlock) newlyUnlocked.push(enemyId);
    }

    this.player.campaignProgress = Math.max(this.player.campaignProgress, roundNumber);
    patch.campaignProgress = this.player.campaignProgress;

    if (unlock) {
      for (const id of newlyUnlocked) {
        if (!this.player.unlockedCharacters.includes(id)) {
          this.player.unlockedCharacters = [...this.player.unlockedCharacters, id];
        }
      }
      patch.unlockedCharacters = this.player.unlockedCharacters;
    }

    // Stats
    const stats = { ...this.player.stats };
    stats.matchesPlayed += 1;
    if (results) {
      stats.totalDamageDealt += Math.round(results.damageDealt || 0);
      stats.totalDamageTaken += Math.round(results.damageTaken || 0);
      stats.bestCombo = Math.max(stats.bestCombo, results.bestCombo || 0);
    }
    this.player.stats = stats;
    patch.stats = stats;

    // Per-enemy record
    const records = { ...(this.player.enemyRecords || {}) };
    const rec = records[enemyId] || { attempts: 0, wins: 0, losses: 0, bestCombo: 0 };
    rec.wins += 1;
    rec.attempts += 1;
    rec.bestCombo = Math.max(rec.bestCombo, results?.bestCombo || 0);
    records[enemyId] = rec;
    this.player.enemyRecords = records;
    patch.enemyRecords = records;

    // Multiplayer unlock
    let multiplayerJustUnlocked = false;
    if (this.player.defeatedEnemies.length >= CAMPAIGN_ROUNDS.length && !this.player.multiplayerUnlocked) {
      this.player.multiplayerUnlocked = true;
      this.player.campaignCompleted = true;
      patch.multiplayerUnlocked = true;
      patch.campaignCompleted = true;
      multiplayerJustUnlocked = true;
    }

    this.queue(patch);
    this.#notify();
    for (const id of newlyUnlocked) bus.emit(EV.UNLOCK, { characterId: id });
    return { unlocked: newlyUnlocked, multiplayerUnlocked: multiplayerJustUnlocked };
  }

  recordDefeat(enemyId, results = {}) {
    if (!this.player) return;
    const stats = { ...this.player.stats };
    stats.matchesPlayed += 1;
    stats.matchesLost += 1;
    stats.totalDamageDealt += Math.round(results.damageDealt || 0);
    stats.totalDamageTaken += Math.round(results.damageTaken || 0);
    this.player.stats = stats;

    const records = { ...(this.player.enemyRecords || {}) };
    const rec = records[enemyId] || { attempts: 0, wins: 0, losses: 0, bestCombo: 0 };
    rec.losses += 1;
    rec.attempts += 1;
    records[enemyId] = rec;

    this.queue({ stats, enemyRecords: records, ...(results.statsPatch || {}) });
    this.#notify();
  }

  addPlayTime(seconds) {
    if (!this.player) return;
    const stats = { ...this.player.stats };
    stats.totalTimePlayedSeconds = Math.round((stats.totalTimePlayedSeconds || 0) + seconds);
    this.player.stats = stats;
    this.dirty = true;
    this.pendingPatch.stats = stats;
  }

  /* ------------------------------------------------------------------ */
  /* Persistence                                                         */
  /* ------------------------------------------------------------------ */

  /** Queue a patch; flushed immediately (or by the autosave ticker). */
  queue(patch) {
    if (!this.player) return;
    this.pendingPatch = { ...this.pendingPatch, ...patch };
    this.dirty = true;
    // Failures are surfaced through the save-status indicator, never thrown
    // into unrelated UI code.
    if (settings.get('autosave')) this.flush().catch(() => {});
  }

  async flush() {
    if (!this.player || !this.dirty) return null;
    const patch = { ...this.pendingPatch };
    this.pendingPatch = {};
    this.dirty = false;
    this.saveStatus = SAVE_STATUS.SAVING;
    this.#notify();
    try {
      const res = await api.save(patch);
      this.player = res.player;
      this.#syncIntroSeen();
      this.saveStatus = SAVE_STATUS.SAVED;
      this.lastSavedAt = Date.now();
      this.lastError = null;
      this.#notify();
      return res;
    } catch (err) {
      // Put the patch back so it can be retried instead of lost.
      this.pendingPatch = { ...patch, ...this.pendingPatch };
      this.dirty = true;
      this.saveStatus = SAVE_STATUS.FAILED;
      this.lastError = err.message;
      this.#notify();
      throw err;
    }
  }

  saveSettings() {
    if (!this.player) return;
    this.player.settings = settings.serialise();
    this.queue({ settings: settings.serialise() });
  }

  /** Local cache so an offline boot still shows the last known profile. */
  cacheProfile() {
    if (this.player) storage.set('lastProfile', {
      username: this.player.username,
      campaignProgress: this.player.campaignProgress
    });
  }
}

export const gameState = new GameState();

/* Keep settings in sync with the server record. */
settings.onChange(() => {
  if (gameState.isSignedIn) gameState.saveSettings();
});

export function characterUnlockHint(id) {
  const def = CHARACTERS[id];
  return def?.unlockRequirement || 'Defeat this problem in Campaign';
}
