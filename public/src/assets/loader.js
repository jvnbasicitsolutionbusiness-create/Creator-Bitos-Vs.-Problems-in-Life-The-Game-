/**
 * loader.js — asset loading with graceful fallback.
 *
 * Procedural animation and synthesised audio are always available, so the game
 * never blocks on a missing file. When a manifest entry is enabled, the loader
 * fetches it and the renderer/audio engine automatically prefer it.
 */
import { SFX_MANIFEST, MUSIC_MANIFEST, spriteSheetFor, CHARACTER_IDS, CHARACTER_CLIPS } from './manifest.js';
import { audio } from '../audio/audio.js';

class AssetLoader {
  constructor() {
    this.sheets = new Map(); // `${characterId}/${clip}` -> Image or null
    this.progress = 0;
    this.loaded = 0;
    this.total = 0;
    this.failed = [];
  }

  /** Load every enabled asset. Safe to call before login. */
  async loadAll({ onProgress = null } = {}) {
    const jobs = [];
    for (const id of CHARACTER_IDS) {
      for (const clip of CHARACTER_CLIPS) {
        const sheet = spriteSheetFor(id, clip);
        if (sheet.enabled) jobs.push(this.#loadSheet(id, clip, sheet));
      }
    }
    for (const [name, entry] of Object.entries(SFX_MANIFEST)) {
      if (entry.enabled) jobs.push(audio.registerSample(name, entry.path));
    }
    for (const [name, entry] of Object.entries(MUSIC_MANIFEST)) {
      if (entry.enabled) jobs.push(audio.registerSample(`music-${name}`, entry.path));
    }

    this.total = jobs.length || 1;
    this.loaded = 0;
    for (const job of jobs) {
      // A failed asset must never break the boot sequence.
      await job.catch((err) => {
        this.failed.push(err?.message || 'unknown asset error');
      });
      this.loaded += 1;
      this.progress = this.loaded / this.total;
      onProgress?.(this.progress);
    }
    this.progress = 1;
    onProgress?.(1);
    return { loaded: this.loaded, failed: this.failed.length };
  }

  async #loadSheet(characterId, clip, sheet) {
    const key = `${characterId}/${clip}`;
    if (this.sheets.has(key)) return this.sheets.get(key);
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Missing sprite sheet: ${sheet.path}`));
      image.src = sheet.path;
    });
    const data = { image: img, frames: sheet.frames, fps: sheet.fps, loop: sheet.loop };
    this.sheets.set(key, data);
    return data;
  }

  /** Returns sheet data when art exists, otherwise null (procedural fallback). */
  sheet(characterId, clip) {
    return this.sheets.get(`${characterId}/${clip}`) || null;
  }

  /** Draw a sheet frame if available; returns false when the caller should
   *  fall back to the procedural rig. */
  drawSheet(ctx, characterId, clip, frame, { x, y, width, height, facing = 1, alpha = 1 }) {
    const sheet = this.sheet(characterId, clip);
    if (!sheet) return false;
    const fw = sheet.image.width / sheet.frames;
    const fh = sheet.image.height;
    const f = sheet.loop ? Math.floor(frame) % sheet.frames : Math.min(sheet.frames - 1, Math.floor(frame));
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.drawImage(sheet.image, f * fw, 0, fw, fh, -width / 2, -height, width, height);
    ctx.restore();
    return true;
  }
}

export const assets = new AssetLoader();
