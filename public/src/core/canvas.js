/**
 * canvas.js — the render surface.
 *
 * The game always draws into a fixed 1280x720 virtual stage and is scaled to
 * the window with letterboxing, so layout, HUD and character positions are
 * identical on desktop, laptop and tablet.
 */
import { clamp } from './utils.js';

export const STAGE_W = 1280;
export const STAGE_H = 720;

export class Surface {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.width = STAGE_W;
    this.height = STAGE_H;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dpr = 1;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.textBaseline = 'alphabetic';
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
  }

  resize() {
    const maxDpr = window.devicePixelRatio > 2 ? 2 : window.devicePixelRatio || 1;
    this.dpr = maxDpr;
    const availW = window.innerWidth;
    const availH = window.innerHeight;
    const scale = Math.min(availW / STAGE_W, availH / STAGE_H);
    this.scale = scale;
    const cssW = Math.floor(STAGE_W * scale);
    const cssH = Math.floor(STAGE_H * scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.floor(cssW * maxDpr);
    this.canvas.height = Math.floor(cssH * maxDpr);
    const rect = this.canvas.getBoundingClientRect();
    this.offsetX = rect.left;
    this.offsetY = rect.top;
    // Uniform scale from the virtual stage to device pixels.
    this.ctx.setTransform(this.canvas.width / STAGE_W, 0, 0, this.canvas.height / STAGE_H, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    void maxDpr;
  }

  /** Convert a client point (from a DOM event) to stage coordinates. */
  toStage(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / (rect.width || 1)) * STAGE_W,
      y: ((clientY - rect.top) / (rect.height || 1)) * STAGE_H
    };
  }

  clear(color = '#07040a') {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  /** Letterbox mask: everything outside the stage frame is pure black. */
  frame(stroke = null) {
    void stroke;
  }
}

/* -------------------------------------------------------------------------- */
/* Drawing helpers (all operate in stage space)                                */
/* -------------------------------------------------------------------------- */

export function roundRect(ctx, x, y, w, h, r = 6) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** A fighting-game style slanted parallelogram (used for bars and plates). */
export function slantRect(ctx, x, y, w, h, skew = 14) {
  ctx.beginPath();
  ctx.moveTo(x + skew, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - skew, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

export function drawText(ctx, text, x, y, {
  size = 20,
  font = '"Rajdhani", "Oswald", "Bahnschrift", "Segoe UI", system-ui, sans-serif',
  weight = '600',
  color = '#efe8e6',
  align = 'left',
  baseline = 'alphabetic',
  spacing = 0,
  shadow = null,
  alpha = 1,
  outline = null,
  maxWidth = null
} = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = spacing ? 'left' : align;
  ctx.textBaseline = baseline;
  if (maxWidth) ctx.font = `${weight} ${size}px ${font}`;

  let drawX = x;
  const str = String(text);
  if (spacing) {
    const total = str.split('').reduce((sum, ch) => sum + ctx.measureText(ch).width + spacing, 0) - spacing;
    if (align === 'center') drawX = x - total / 2;
    else if (align === 'right') drawX = x - total;
    let cursor = drawX;
    for (const ch of str) {
      if (outline) {
        ctx.lineWidth = outline.width ?? 4;
        ctx.strokeStyle = outline.color ?? '#000';
        ctx.lineJoin = 'round';
        ctx.strokeText(ch, cursor, y);
      }
      if (shadow) {
        ctx.fillStyle = shadow.color ?? '#000';
        ctx.filter = `blur(${shadow.blur ?? 8}px)`;
        ctx.fillText(ch, cursor, y);
        ctx.filter = 'none';
      }
      ctx.fillStyle = color;
      ctx.fillText(ch, cursor, y);
      cursor += ctx.measureText(ch).width + spacing;
    }
  } else {
    if (outline) {
      ctx.lineWidth = outline.width ?? 4;
      ctx.strokeStyle = outline.color ?? '#000';
      ctx.lineJoin = 'round';
      ctx.strokeText(str, drawX, y);
    }
    if (shadow) {
      ctx.save();
      ctx.shadowColor = shadow.color ?? 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = shadow.blur ?? 10;
      ctx.fillStyle = color;
      ctx.fillText(str, drawX, y);
      ctx.restore();
    } else {
      ctx.fillStyle = color;
      ctx.fillText(str, drawX, y);
    }
  }
  ctx.restore();
}

export function measureText(ctx, text, { size = 20, weight = '600', spacing = 0, font } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font || '"Rajdhani", "Oswald", "Bahnschrift", "Segoe UI", system-ui, sans-serif'}`;
  const str = String(text);
  const base = ctx.measureText(str).width;
  ctx.restore();
  return base + spacing * Math.max(0, str.length - 1);
}

/** Vertical, additive gradient used for neon/glow fills. */
export function verticalGradient(ctx, x, y0, y1, stops) {
  const g = ctx.createLinearGradient(x, y0, x, y1);
  for (const [pos, color] of stops) g.addColorStop(clamp(pos, 0, 1), color);
  return g;
}

export function withAlpha(ctx, alpha, fn) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  fn(ctx);
  ctx.restore();
}

/** Scissor-rectangle helper (clip) with automatic restore. */
export function clipRect(ctx, x, y, w, h, fn) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  fn(ctx);
  ctx.restore();
}
