/**
 * scene-manager.js — scene stack plus cinematic transitions.
 *
 * Supported transitions (spec section 37): fade, slide, zoom, wipe (diagonal
 * sprite-style wipe) and a hard blackout. Every scene change runs through one
 * of them; no screen is ever swapped instantly.
 */
import { clamp, easeInCubic, easeOutCubic, easeInOutCubic, easeOutQuint, rgba } from './utils.js';
import { audio } from '../audio/audio.js';

export const TRANSITIONS = {
  FADE: 'fade',
  SLIDE: 'slide',
  ZOOM: 'zoom',
  WIPE: 'wipe',
  BLACK: 'black'
};

export class SceneManager {
  constructor({ ctx, onSceneChange = null }) {
    this.ctx = ctx;
    this.scenes = new Map();
    this.current = null;
    this.currentName = null;
    this.outgoing = null;
    this.outgoingName = null;
    this.transition = null;
    this.transitionTime = 0;
    this.transitionDuration = 0.7;
    this.onSceneChange = onSceneChange;
    this.pendingParams = null;
    this.blocking = false;
  }

  register(name, scene) {
    this.scenes.set(name, scene);
    scene.manager = this;
    scene.name = name;
    return scene;
  }

  get(name) {
    return this.scenes.get(name);
  }

  /**
   * Switch scenes. `halfway` fires at the midpoint (when the screen is covered)
   * so assets can be swapped without the player seeing a pop.
   */
  change(name, { params = {}, transition = TRANSITIONS.FADE, duration = 0.7, halfway = null } = {}) {
    const next = this.scenes.get(name);
    if (!next) throw new Error(`Unknown scene "${name}"`);
    if (this.blocking) return;

    if (!this.current) {
      this.current = next;
      this.currentName = name;
      next.enter(params);
      this.onSceneChange?.(name, null);
      return;
    }

    this.outgoing = this.current;
    this.outgoingName = this.currentName;
    this.current = next;
    this.currentName = name;
    this.pendingParams = params;
    this.pendingHalfway = halfway;
    this.transition = transition;
    this.transitionDuration = duration;
    this.transitionTime = 0;
    this.entered = false;
    audio.play('whoosh', { volume: 0.5 });
  }

  update(dt) {
    if (this.transition) {
      this.transitionTime += dt;
      const t = clamp(this.transitionTime / this.transitionDuration, 0, 1);
      if (!this.entered && t >= 0.5) {
        this.entered = true;
        this.outgoing?.exit?.();
        this.current.enter(this.pendingParams || {});
        this.pendingHalfway?.();
        this.onSceneChange?.(this.currentName, this.outgoingName);
      }
      if (t >= 1) {
        this.transition = null;
        this.outgoing = null;
        this.outgoingName = null;
      }
      return;
    }
    this.current?.update?.(dt);
  }

  draw(ctx, dt) {
    if (!this.transition) {
      this.current?.draw?.(ctx, dt);
      return;
    }
    const t = clamp(this.transitionTime / this.transitionDuration, 0, 1);
    const kind = this.transition;

    if (kind === TRANSITIONS.FADE) {
      this.#drawWith(ctx, dt, this.outgoing, 1, { alpha: 1 - t });
      this.#drawWith(ctx, dt, this.current, 1, { alpha: this.entered ? t : 0 });
      ctx.save();
      ctx.globalAlpha = Math.sin(t * Math.PI) * 0.55;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 1280, 720);
      ctx.restore();
      return;
    }

    if (kind === TRANSITIONS.SLIDE) {
      const out = this.entered ? null : this.outgoing;
      if (out) {
        ctx.save();
        ctx.translate(-easeInCubic(t * 2) * 1280, 0);
        out.draw(ctx, dt);
        ctx.restore();
      }
      if (this.entered) {
        ctx.save();
        ctx.translate((1 - easeOutCubic((t - 0.5) * 2)) * 1280, 0);
        this.current.draw(ctx, dt);
        ctx.restore();
      }
      return;
    }

    if (kind === TRANSITIONS.ZOOM) {
      if (!this.entered && this.outgoing) {
        ctx.save();
        const z = 1 + easeInCubic(t * 2) * 0.6;
        ctx.translate(640, 360);
        ctx.scale(z, z);
        ctx.translate(-640, -360);
        ctx.globalAlpha = 1 - t * 2;
        this.outgoing.draw(ctx, dt);
        ctx.restore();
      }
      if (this.entered) {
        ctx.save();
        const k = (t - 0.5) * 2;
        const z = 1.6 - easeOutQuint(k) * 0.6;
        ctx.translate(640, 360);
        ctx.scale(z, z);
        ctx.translate(-640, -360);
        ctx.globalAlpha = clamp(k * 1.6, 0, 1);
        this.current.draw(ctx, dt);
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = Math.sin(t * Math.PI) * 0.7;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 1280, 720);
      ctx.restore();
      return;
    }

    if (kind === TRANSITIONS.WIPE) {
      // Diagonal bars sweeping across, in the spirit of a sprite wipe.
      if (!this.entered && this.outgoing) this.outgoing.draw(ctx, dt);
      if (this.entered) this.current.draw(ctx, dt);
      const bars = 14;
      const progress = easeInOutCubic(t);
      ctx.save();
      for (let i = 0; i < bars; i += 1) {
        const bandH = 720 / bars;
        const y = i * bandH;
        const local = clamp((progress * (bars + 6) - i) / 6, 0, 1);
        const w = local * 1500;
        ctx.fillStyle = '#07040a';
        ctx.fillRect(i % 2 === 0 ? 0 : 1280 - w, y, w, bandH + 1);
      }
      ctx.restore();
      return;
    }

    // BLACK
    if (!this.entered && this.outgoing) this.outgoing.draw(ctx, dt);
    if (this.entered) this.current.draw(ctx, dt);
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = t < 0.5 ? easeOutCubic(t * 2) : 1 - easeInCubic((t - 0.5) * 2);
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();
  }

  #drawWith(ctx, dt, scene, scale = 1, { alpha = 1 } = {}) {
    if (!scene) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (scale !== 1) {
      ctx.translate(640, 360);
      ctx.scale(scale, scale);
      ctx.translate(-640, -360);
    }
    scene.draw(ctx, dt);
    ctx.restore();
  }
}

/** Full-screen flash used for supers and round starts. */
export function drawFlashOverlay(ctx, strength, color = '#ffffff') {
  if (strength <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(color, Math.min(0.85, strength * 0.6));
  ctx.fillRect(0, 0, 1280, 720);
  ctx.restore();
}
