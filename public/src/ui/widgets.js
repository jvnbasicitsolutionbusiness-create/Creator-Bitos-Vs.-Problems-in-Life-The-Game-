/**
 * widgets.js — the canvas UI toolkit.
 *
 * Menus are drawn on the canvas (not the DOM) so they share the game's
 * cinematic transitions, cursor-reactive character and art direction. Every
 * widget has a hover state, an active/pressed state and a disabled state, and
 * fires the shared audio cues.
 */
import { drawText, measureText, roundRect, slantRect } from '../core/canvas.js';
import { clamp, lerp, damp, rgba, shade } from '../core/utils.js';
import { input } from '../core/input.js';
import { audio } from '../audio/audio.js';
import { settings } from '../config/settings.js';

const FONT = '"Rajdhani", "Oswald", "Bahnschrift", "Segoe UI", system-ui, sans-serif';

export function uiFont(size, weight = '700') {
  return `${weight} ${size}px ${FONT}`;
}

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

export class Button {
  constructor({
    x, y, w, h = 54, label, sub = null, onClick = null, disabled = false,
    accent = '#ff2b3c', align = 'center', size = 26, lockedNote = null,
    slant = true, icon = null, shortcut = null
  }) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.label = label;
    this.sub = sub;
    this.onClick = onClick;
    this.disabled = disabled;
    this.accent = accent;
    this.align = align;
    this.size = size;
    this.lockedNote = lockedNote;
    this.slant = slant;
    this.icon = icon;
    this.shortcut = shortcut;
    this.hover = 0;
    this.press = 0;
    this.focused = false;
    this.wasHover = false;
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  setLabel(label) {
    this.label = label;
  }

  update(dt, pointer, { enabled = true } = {}) {
    const active = enabled && !this.disabled;
    const over = active && pointer.inside && inRect(pointer.x, pointer.y, this.rect);
    this.hover = damp(this.hover, over ? 1 : 0, 16, dt);
    if (over && !this.wasHover) audio.ui('hover');
    this.wasHover = over;
    const pressed = over && pointer.down;
    this.press = damp(this.press, pressed ? 1 : 0, 22, dt);
    if (active && over && pointer.pressed && this.onClick) {
      audio.ui('click');
      this.onClick(this);
      return true;
    }
    if (active && this.disabled && over && pointer.pressed) {
      // Still tell the player why it is locked.
      audio.ui('error');
      this.onClick?.(this);
    }
    return false;
  }

  draw(ctx, dt = 0) {
    void dt;
    const { x, y, w, h } = this;
    const hover = this.hover;
    const scale = 1 + hover * 0.03 - this.press * 0.02;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(x + w / 2), -(y + h / 2));

    const accentColor = this.disabled ? '#5a4a4f' : this.accent;

    // Plate
    ctx.save();
    if (this.slant) {
      slantRect(ctx, x, y, w, h, 16);
    } else {
      roundRect(ctx, x, y, w, h, 8);
    }
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, rgba(shade(accentColor, -0.55), 0.95));
    g.addColorStop(1, rgba(shade(accentColor, -0.72), 0.95));
    ctx.fillStyle = g;
    ctx.fill();

    // Hover glow + outline
    ctx.lineWidth = 2 + hover * 2;
    ctx.strokeStyle = rgba(this.disabled ? '#6b5a5f' : shade(accentColor, 0.35), 0.5 + hover * 0.5);
    if (hover > 0.02 && !this.disabled) {
      ctx.shadowColor = rgba(accentColor, 0.85);
      ctx.shadowBlur = 22 * hover;
    }
    ctx.stroke();
    ctx.restore();

    // Interior highlight sweep on hover
    if (hover > 0.02 && !this.disabled) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = hover * 0.28;
      const hg = ctx.createLinearGradient(x, y, x + w, y);
      hg.addColorStop(0, rgba(accentColor, 0));
      hg.addColorStop(0.5, rgba(accentColor, 0.8));
      hg.addColorStop(1, rgba(accentColor, 0));
      ctx.fillStyle = hg;
      if (this.slant) slantRect(ctx, x, y, w, h, 16);
      else roundRect(ctx, x, y, w, h, 8);
      ctx.fill();
      ctx.restore();
    }

    // Text
    const textX = this.align === 'center' ? x + w / 2 : x + 26;
    const textAlign = this.align === 'center' ? 'center' : 'left';
    const color = this.disabled ? '#8e7d82' : '#ffffff';
    drawText(ctx, this.label, textX, this.sub ? y + h / 2 - 4 : y + h / 2 + 1, {
      size: this.size,
      weight: '700',
      color,
      align: textAlign,
      baseline: 'middle',
      spacing: 2.4,
      shadow: { color: rgba(accentColor, 0.8 * (0.4 + hover)), blur: 14 }
    });

    if (this.sub) {
      drawText(ctx, this.sub, textX, y + h / 2 + 17, {
        size: Math.max(11, this.size * 0.46),
        weight: '600',
        color: this.disabled ? '#7d6a70' : rgba('#ffffff', 0.62),
        align: textAlign,
        baseline: 'middle',
        spacing: 1.4
      });
    }

    if (this.disabled && this.lockedNote) {
      drawText(ctx, 'LOCKED', x + w - 22, y + h / 2, {
        size: 13, weight: '800', color: '#d8b46a', align: 'right', baseline: 'middle', spacing: 2
      });
      ctx.restore();
      drawText(ctx, this.lockedNote, x + w / 2, y + h + 18, {
        size: 14, weight: '600', color: '#a08e94', align: 'center', baseline: 'middle', spacing: 1
      });
      return;
    }

    if (this.shortcut) {
      drawText(ctx, this.shortcut, x + w - 20, y + h / 2, {
        size: 13, weight: '700', color: rgba('#ffffff', 0.5), align: 'right', baseline: 'middle', spacing: 1
      });
    }

    ctx.restore();
  }
}

/* -------------------------------------------------------------------------- */
/* Slider / toggle / cycle                                                     */
/* -------------------------------------------------------------------------- */

export class Slider {
  constructor({ x, y, w = 260, label, min = 0, max = 1, step = 0.05, value = 0, onChange = null, format = null, accent = '#ff2b3c' }) {
    Object.assign(this, { x, y, w, label, min, max, step, value, onChange, format, accent });
    this.h = 46;
    this.hover = 0;
    this.dragging = false;
  }

  get rect() {
    return { x: this.x, y: this.y - 14, w: this.w, h: 30 };
  }

  update(dt, pointer) {
    const over = pointer.inside && inRect(pointer.x, pointer.y, { x: this.x - 10, y: this.y - 20, w: this.w + 20, h: 40 });
    this.hover = damp(this.hover, over ? 1 : 0, 14, dt);
    const trackX = this.x;
    const trackW = this.w;
    if (over && pointer.pressed) {
      this.dragging = true;
      audio.ui('click');
    }
    if (this.dragging) {
      if (pointer.down) {
        const t = clamp((pointer.x - trackX) / trackW, 0, 1);
        const raw = this.min + t * (this.max - this.min);
        this.value = Math.round(raw / this.step) * this.step;
        this.onChange?.(this.value);
      } else {
        this.dragging = false;
      }
    }
    // Keyboard fine-tuning when hovered.
    if (over && input.p1().wasPressed('left')) {
      this.value = clamp(this.value - this.step, this.min, this.max);
      this.onChange?.(this.value);
      audio.ui('hover');
    }
    if (over && input.p1().wasPressed('right')) {
      this.value = clamp(this.value + this.step, this.min, this.max);
      this.onChange?.(this.value);
      audio.ui('hover');
    }
  }

  draw(ctx) {
    const { x, y, w } = this;
    const t = (this.value - this.min) / (this.max - this.min || 1);
    drawText(ctx, this.label, x, y - 12, { size: 16, weight: '700', color: '#cfc2c6', spacing: 1.4 });
    const valueText = this.format ? this.format(this.value) : String(this.value);
    drawText(ctx, valueText, x + w, y - 12, { size: 16, weight: '800', color: this.accent, align: 'right', spacing: 1 });

    ctx.save();
    roundRect(ctx, x, y - 4, w, 8, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    roundRect(ctx, x, y - 4, Math.max(4, w * t), 8, 4);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(this.accent, -0.25));
    g.addColorStop(1, shade(this.accent, 0.3));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowColor = rgba(this.accent, 0.8);
    ctx.shadowBlur = 12 + this.hover * 12;
    ctx.beginPath();
    ctx.arc(x + w * t, y, 10 + this.hover * 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }
}

export class Toggle {
  constructor({ x, y, label, value = false, onChange = null, accent = '#ff2b3c', note = null }) {
    Object.assign(this, { x, y, label, value, onChange, accent, note });
    this.w = 220;
    this.h = 34;
    this.hover = 0;
  }

  get rect() {
    return { x: this.x, y: this.y - 16, w: this.w, h: this.h };
  }

  update(dt, pointer) {
    const over = pointer.inside && inRect(pointer.x, pointer.y, this.rect);
    this.hover = damp(this.hover, over ? 1 : 0, 14, dt);
    if (over && pointer.pressed) {
      this.value = !this.value;
      audio.ui('click');
      this.onChange?.(this.value);
    }
    if (over && (input.p1().wasPressed('confirm') || input.p1().wasPressed('lightPunch'))) {
      this.value = !this.value;
      audio.ui('click');
      this.onChange?.(this.value);
    }
  }

  draw(ctx) {
    const { x, y, w, h } = this;
    drawText(ctx, this.label, x, y, { size: 17, weight: '700', color: '#d3c6ca', baseline: 'middle', spacing: 1.2 });
    const bx = x + w - 62;
    const by = y - 13;
    ctx.save();
    roundRect(ctx, bx, by, 56, 26, 13);
    ctx.fillStyle = this.value ? rgba(this.accent, 0.85) : 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = rgba(this.accent, 0.4 + this.hover * 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx + (this.value ? 43 : 13), by + 13, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    drawText(ctx, this.value ? 'ON' : 'OFF', bx + (this.value ? 20 : 44), y, {
      size: 12, weight: '800', color: this.value ? '#ffffff' : '#8b7c81', baseline: 'middle', align: 'center'
    });
    if (this.note) {
      drawText(ctx, this.note, x, y + 20, { size: 12, weight: '600', color: '#7d6f74', baseline: 'middle' });
    }
    void h;
  }
}

export class Cycle {
  constructor({ x, y, w = 320, label, options = [], value = null, onChange = null, format = null, accent = '#ff2b3c' }) {
    Object.assign(this, { x, y, w, label, options, value, onChange, format, accent });
    this.h = 40;
    this.hover = 0;
  }

  get rect() {
    return { x: this.x, y: this.y - this.h / 2, w: this.w, h: this.h };
  }

  update(dt, pointer) {
    const over = pointer.inside && inRect(pointer.x, pointer.y, this.rect);
    this.hover = damp(this.hover, over ? 1 : 0, 14, dt);
    const advance = (dir) => {
      const idx = this.options.indexOf(this.value);
      const next = this.options[(idx + dir + this.options.length) % this.options.length];
      this.value = next;
      audio.ui('click');
      this.onChange?.(next);
    };
    if (over && pointer.pressed) advance(1);
    if (over && input.p1().wasPressed('left')) advance(-1);
    if (over && input.p1().wasPressed('right')) advance(1);
  }

  draw(ctx) {
    const { x, y, w, h } = this;
    drawText(ctx, this.label, x, y - h / 2 - 10, { size: 16, weight: '700', color: '#cfc2c6', spacing: 1.4 });
    ctx.save();
    roundRect(ctx, x, y - h / 2, w, h, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.strokeStyle = rgba(this.accent, 0.25 + this.hover * 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    const text = this.format ? this.format(this.value) : String(this.value).toUpperCase();
    drawText(ctx, text, x + w / 2, y, { size: 18, weight: '800', color: '#ffffff', align: 'center', baseline: 'middle', spacing: 1.6 });
    drawText(ctx, '‹', x + 18, y, { size: 24, weight: '800', color: rgba('#ffffff', 0.4 + this.hover * 0.5), baseline: 'middle' });
    drawText(ctx, '›', x + w - 18, y, { size: 24, weight: '800', color: rgba('#ffffff', 0.4 + this.hover * 0.5), baseline: 'middle', align: 'right' });
  }
}

/* -------------------------------------------------------------------------- */
/* Text field (uses the hidden DOM bridge for real keyboard input)             */
/* -------------------------------------------------------------------------- */

export class TextField {
  constructor({ x, y, w = 340, h = 52, placeholder = '', password = false, value = '', onChange = null, onSubmit = null, accent = '#ff2b3c' }) {
    Object.assign(this, { x, y, w, h, placeholder, password, value, onChange, onSubmit, accent });
    this.focused = false;
    this.hover = 0;
    this.error = null;
    this.caret = 0;
  }

  get rect() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt, pointer) {
    const over = pointer.inside && inRect(pointer.x, pointer.y, this.rect);
    this.hover = damp(this.hover, over ? 1 : 0, 14, dt);
    if (over && pointer.pressed) {
      this.focus();
      audio.ui('click');
    }
    this.caret += dt;
    // Tab / Enter handling is done by the bridge + scene.
  }

  focus() {
    if (this.focused) return;
    this.focused = true;
    this.onBlur = () => {
      this.focused = false;
    };
    input.beginTextInput(this);
  }

  blur() {
    input.endTextInput();
    this.focused = false;
  }

  draw(ctx) {
    const { x, y, w, h } = this;
    ctx.save();
    roundRect(ctx, x, y, w, h, 6);
    ctx.fillStyle = this.focused ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.error
      ? '#ff5c5c'
      : rgba(this.focused ? this.accent : '#ffffff', this.focused ? 0.9 : 0.14 + this.hover * 0.2);
    if (this.focused) {
      ctx.shadowColor = rgba(this.accent, 0.7);
      ctx.shadowBlur = 16;
    }
    ctx.stroke();
    ctx.restore();

    const shown = this.password ? '•'.repeat(this.value.length) : this.value;
    if (shown) {
      drawText(ctx, shown, x + 16, y + h / 2 + 1, { size: 20, weight: '600', color: '#ffffff', baseline: 'middle' });
    } else {
      drawText(ctx, this.placeholder, x + 16, y + h / 2 + 1, { size: 20, weight: '500', color: 'rgba(255,255,255,0.32)', baseline: 'middle' });
    }
    if (this.focused && Math.floor(this.caret * 2) % 2 === 0) {
      const offset = measureText(ctx, shown, { size: 20, weight: '600' });
      ctx.fillStyle = rgba(this.accent, 0.9);
      ctx.fillRect(x + 18 + offset, y + 14, 2, h - 28);
    }
    if (this.error) {
      drawText(ctx, this.error, x, y + h + 16, { size: 13, weight: '700', color: '#ff7b7b', spacing: 0.6 });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Tabs + scroll area                                                          */
/* -------------------------------------------------------------------------- */

export class TabBar {
  constructor({ x, y, tabs = [], value = null, onChange = null, width = 200, accent = '#ff2b3c' }) {
    Object.assign(this, { x, y, tabs, value, onChange, width, accent });
    this.h = 40;
    this.hover = 0;
  }

  update(dt, pointer) {
    for (let i = 0; i < this.tabs.length; i += 1) {
      const rect = { x: this.x, y: this.y + i * (this.h + 8), w: this.width, h: this.h };
      const over = pointer.inside && inRect(pointer.x, pointer.y, rect);
      if (over && pointer.pressed) {
        const tab = this.tabs[i];
        if (tab.id !== this.value) {
          this.value = tab.id;
          audio.ui('click');
          this.onChange?.(tab.id);
        }
        return;
      }
    }
    void dt;
  }

  draw(ctx) {
    for (let i = 0; i < this.tabs.length; i += 1) {
      const tab = this.tabs[i];
      const y = this.y + i * (this.h + 8);
      const active = tab.id === this.value;
      ctx.save();
      slantRect(ctx, this.x, y, this.width, this.h, 12);
      ctx.fillStyle = active ? rgba(this.accent, 0.8) : 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.strokeStyle = active ? rgba('#ffffff', 0.5) : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, tab.label, this.x + 20, y + this.h / 2, {
        size: 16,
        weight: '700',
        color: active ? '#ffffff' : '#b3a6ab',
        baseline: 'middle',
        spacing: 1.5
      });
    }
  }
}

export class ScrollArea {
  constructor({ x, y, w, h, contentHeight = 0 }) {
    Object.assign(this, { x, y, w, h, contentHeight });
    this.offset = 0;
    this.maxOffset = 0;
  }

  update(dt, pointer) {
    this.maxOffset = Math.max(0, this.contentHeight - this.h);
    const over = pointer.inside && inRect(pointer.x, pointer.y, { x: this.x, y: this.y, w: this.w, h: this.h });
    if (over && pointer.wheel) {
      this.offset = clamp(this.offset + pointer.wheel * 46, 0, this.maxOffset);
    }
    if (over && pointer.down) {
      // Drag scrolling
      if (this.lastDragY !== undefined) {
        this.offset = clamp(this.offset - (pointer.y - this.lastDragY), 0, this.maxOffset);
      }
      this.lastDragY = pointer.y;
    } else {
      this.lastDragY = undefined;
    }
    void dt;
  }

  begin(ctx, fn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.x, this.y, this.w, this.h);
    ctx.clip();
    ctx.translate(0, -this.offset);
    fn(ctx);
    ctx.restore();
    if (this.maxOffset > 4) {
      const trackH = this.h;
      const thumbH = Math.max(40, (this.h / this.contentHeight) * this.h);
      const thumbY = this.y + (this.offset / this.maxOffset) * (trackH - thumbH);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(this.x + this.w + 8, this.y, 6, trackH);
      ctx.fillStyle = 'rgba(255,43,60,0.7)';
      ctx.fillRect(this.x + this.w + 8, thumbY, 6, thumbH);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

export function inRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function panel(ctx, { x, y, w, h, title = null, accent = '#ff2b3c', alpha = 0.92 }) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = `rgba(10,6,10,${alpha})`;
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.3);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Corner accents
  ctx.strokeStyle = rgba(accent, 0.9);
  ctx.lineWidth = 3;
  const c = 22;
  ctx.beginPath();
  ctx.moveTo(x + 1, y + c); ctx.lineTo(x + 1, y + 1); ctx.lineTo(x + c, y + 1);
  ctx.moveTo(x + w - c, y + 1); ctx.lineTo(x + w - 1, y + 1); ctx.lineTo(x + w - 1, y + c);
  ctx.moveTo(x + 1, y + h - c); ctx.lineTo(x + 1, y + h - 1); ctx.lineTo(x + c, y + h - 1);
  ctx.moveTo(x + w - c, y + h - 1); ctx.lineTo(x + w - 1, y + h - 1); ctx.lineTo(x + w - 1, y + h - c);
  ctx.stroke();
  ctx.restore();
  if (title) {
    drawText(ctx, title, x + 22, y + 26, { size: 18, weight: '800', color: '#ffffff', baseline: 'middle', spacing: 3 });
  }
}

/** Keyboard navigation shared by every menu scene. */
export function navigate(list, index, dir) {
  if (list.length === 0) return 0;
  let next = index + dir;
  if (next < 0) next = list.length - 1;
  if (next >= list.length) next = 0;
  return next;
}

export function drawScanlines(ctx, w, h, alpha = 0.05) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000000';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  ctx.restore();
}

/** UI scale aware font size. */
export function s(size) {
  return Math.round(size * settings.uiScale);
}

export { lerp };
