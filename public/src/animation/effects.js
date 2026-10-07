/**
 * effects.js — particles, camera, screen feedback.
 *
 * All effects respect the accessibility scale (settings.effectScale / flashScale
 * / shakeScale) so "reduced flash" and "reduced shake" genuinely change what is
 * drawn rather than only dimming it.
 */
import { rand, randInt, clamp, lerp, rgba, TAU, chance } from '../core/utils.js';
import { settings } from '../config/settings.js';

/* -------------------------------------------------------------------------- */
/* Particles                                                                   */
/* -------------------------------------------------------------------------- */

export class ParticleSystem {
  constructor(max = 700) {
    this.max = max;
    this.items = [];
    this.rings = [];
    this.texts = [];
    this.lines = [];
  }

  get count() {
    return this.items.length + this.rings.length + this.texts.length + this.lines.length;
  }

  clear() {
    this.items.length = 0;
    this.rings.length = 0;
    this.texts.length = 0;
    this.lines.length = 0;
  }

  #room() {
    return this.items.length < this.max;
  }

  spawn(type, x, y, opts = {}) {
    if (!this.#room()) return null;
    const p = {
      type,
      x,
      y,
      vx: opts.vx ?? 0,
      vy: opts.vy ?? 0,
      gravity: opts.gravity ?? 900,
      drag: opts.drag ?? 0.9,
      life: opts.life ?? 0.5,
      age: 0,
      size: opts.size ?? 3,
      color: opts.color ?? '#ff2b3c',
      glow: opts.glow ?? 1,
      spin: opts.spin ?? 0,
      rot: opts.rot ?? 0,
      stretch: opts.stretch ?? 1
    };
    this.items.push(p);
    return p;
  }

  /** Directional hit sparks. */
  hitSpark(x, y, dirX, { power = 1, color = '#ffd66b', count = 14 } = {}) {
    const scale = settings.effectScale;
    const n = Math.round(count * scale * clamp(power, 0.4, 2));
    for (let i = 0; i < n; i += 1) {
      const angle = rand(TAU);
      const speed = rand(520, 120) * clamp(power, 0.5, 1.8);
      this.spawn('spark', x, y, {
        vx: dirX * speed * rand(1.3, 0.2) + Math.cos(angle) * 40,
        vy: Math.sin(angle) * speed * 0.75,
        life: rand(0.42, 0.16),
        size: rand(4.5, 1.6),
        color: chance(0.35) ? '#ffffff' : color,
        drag: 0.86
      });
    }
    this.ring(x, y, { radius: 12 + 26 * power, color, width: 4 * scale, life: 0.24 });
    this.flash(x, y, 26 + 30 * power, color, 0.16);
  }

  blockSpark(x, y, dirX) {
    const scale = settings.effectScale;
    for (let i = 0; i < Math.round(9 * scale); i += 1) {
      this.spawn('spark', x, y, {
        vx: dirX * rand(260, 60),
        vy: rand(-260, 260),
        life: rand(0.3, 0.12),
        size: rand(3, 1.2),
        color: '#9fdcff',
        drag: 0.85
      });
    }
    this.ring(x, y, { radius: 22, color: '#9fdcff', width: 3, life: 0.2, kind: 'shield' });
  }

  dust(x, y, { count = 8, dir = 0, color = '#6b5f57' } = {}) {
    const n = Math.round(count * settings.effectScale);
    for (let i = 0; i < n; i += 1) {
      this.spawn('dust', x + rand(16, -16), y, {
        vx: dir * rand(180, 30) + rand(90, -90),
        vy: rand(-70, -220),
        gravity: 240,
        drag: 0.9,
        life: rand(0.7, 0.35),
        size: rand(9, 3),
        color,
        glow: 0
      });
    }
  }

  embers(x, y, { count = 6, color = '#ff7a2b', spread = 60 } = {}) {
    const n = Math.round(count * settings.effectScale);
    for (let i = 0; i < n; i += 1) {
      this.spawn('ember', x + rand(spread, -spread), y + rand(20, -60), {
        vx: rand(50, -50),
        vy: rand(-40, -160),
        gravity: -40,
        drag: 0.96,
        life: rand(1.4, 0.6),
        size: rand(4, 1.5),
        color
      });
    }
  }

  /** Expanding energy ring (impacts, specials, ground shockwaves). */
  ring(x, y, { radius = 40, color = '#ff2b3c', width = 4, life = 0.35, kind = 'ring', squash = 1 } = {}) {
    this.rings.push({ x, y, radius, color, width, life, age: 0, kind, squash });
  }

  /** Short-lived additive glow blob. */
  flash(x, y, radius, color = '#ffffff', life = 0.15) {
    this.rings.push({ x, y, radius, color, width: 0, life, age: 0, kind: 'flash', squash: 1 });
  }

  /** Crescent slash arc used for bladed/heavy attacks. */
  slash(x, y, { angle = 0, radius = 70, color = '#ffffff', life = 0.22, width = 12, flip = 1 } = {}) {
    this.rings.push({ x, y, radius, color, width, life, age: 0, kind: 'slash', angle, flip, squash: 1 });
  }

  /** Radial speed lines for dashes and supers. */
  speedLines(x, y, { count = 10, color = '#ffffff', length = 90, spread = 60, life = 0.22 } = {}) {
    const n = Math.round(count * settings.effectScale);
    for (let i = 0; i < n; i += 1) {
      this.lines.push({
        x: x + rand(spread, -spread),
        y: y + rand(120, -120),
        length: rand(length, length * 0.4),
        color,
        life,
        age: 0,
        vertical: chance(0.5)
      });
    }
  }

  /** Floating damage / combo numbers. */
  text(str, x, y, { color = '#ffffff', size = 26, life = 0.9, vy = -70, weight = '800' } = {}) {
    this.texts.push({ str, x, y, color, size, life, age: 0, vy, vx: rand(20, -20), weight });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const p = this.items[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.items.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      const dragF = p.drag ** (dt * 60);
      p.vx *= dragF;
      p.vy *= dragF;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.type === 'dust' && p.y > 0 && p.vy > 0) p.vy = 0;
    }
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const r = this.rings[i];
      r.age += dt;
      if (r.age >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.lines.length - 1; i >= 0; i -= 1) {
      const l = this.lines[i];
      l.age += dt;
      if (l.age >= l.life) this.lines.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i -= 1) {
      const t = this.texts[i];
      t.age += dt;
      if (t.age >= t.life) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.x += t.vx * dt;
      t.vy *= 0.94;
    }
  }

  draw(ctx, layer = 'world') {
    void layer;
    const flashScale = settings.flashScale;
    ctx.save();
    for (const r of this.rings) {
      const t = r.age / r.life;
      if (r.kind === 'flash') {
        const a = (1 - t) ** 2 * 0.9 * flashScale;
        if (a <= 0.01) continue;
        const g = ctx.createRadialGradient(r.x, r.y, 0, r.x, r.y, r.radius * (0.6 + t * 0.9));
        g.addColorStop(0, rgba(r.color, a));
        g.addColorStop(1, rgba(r.color, 0));
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius * (0.6 + t * 0.9), 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (r.kind === 'slash') {
        const a = (1 - t) * 0.95;
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.angle || 0);
        ctx.scale(1, r.flip ?? 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(r.color, a);
        ctx.lineWidth = r.width * (1 - t * 0.7);
        ctx.beginPath();
        ctx.arc(0, 0, r.radius * (0.55 + t * 0.7), -1.1 + t * 0.6, 0.9 + t * 0.6);
        ctx.stroke();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
      } else if (r.kind === 'shield') {
        const a = (1 - t) * 0.8;
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.strokeStyle = rgba(r.color, a);
        ctx.lineWidth = r.width;
        ctx.beginPath();
        ctx.ellipse(0, 0, r.radius * (0.5 + t * 0.8), r.radius * (0.9 + t * 0.6), 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      } else {
        const a = (1 - t) ** 1.6 * 0.85;
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.scale(1, r.squash ?? 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(r.color, a);
        ctx.lineWidth = r.width * (1 - t * 0.6);
        ctx.beginPath();
        ctx.arc(0, 0, r.radius * (0.2 + t * 1.1), 0, TAU);
        ctx.stroke();
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    for (const l of this.lines) {
      const t = l.age / l.life;
      const a = (1 - t) * 0.5;
      ctx.strokeStyle = rgba(l.color, a);
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (l.vertical) {
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x, l.y + l.length * (0.4 + t));
      } else {
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x + l.length * (0.4 + t), l.y);
      }
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.items) {
      const t = p.age / p.life;
      const a = (1 - t) ** 1.4;
      if (p.type === 'dust') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = rgba(p.color, a * 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + t * 1.6), 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        continue;
      }
      ctx.fillStyle = rgba(p.color, a);
      if (p.type === 'spark') {
        const len = clamp(Math.hypot(p.vx, p.vy) * 0.02, 2, 26) * p.stretch;
        const ang = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.fillRect(-len, -p.size * 0.35 * a, len, Math.max(1, p.size * 0.7 * a));
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    for (const t of this.texts) {
      const k = t.age / t.life;
      const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      const pop = k < 0.2 ? 1 + (0.2 - k) * 2 : 1;
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.font = `${t.weight} ${t.size * pop}px "Rajdhani", "Oswald", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
      ctx.restore();
    }
    ctx.restore();
  }
}

/* -------------------------------------------------------------------------- */
/* Camera                                                                      */
/* -------------------------------------------------------------------------- */

export class Camera {
  constructor({ width = 1280, height = 720 } = {}) {
    this.x = width / 2;
    this.y = height / 2;
    this.zoom = 1;
    this.targetX = this.x;
    this.targetY = this.y;
    this.targetZoom = 1;
    this.shake = 0;
    this.shakeDecay = 6;
    this.offsetX = 0;
    this.offsetY = 0;
    this.width = width;
    this.height = height;
    this.rotation = 0;
    this.bounds = null;
    this.time = 0;
  }

  reset({ x = this.width / 2, y = this.height / 2, zoom = 1 } = {}) {
    this.x = this.targetX = x;
    this.y = this.targetY = y;
    this.zoom = this.targetZoom = zoom;
    this.shake = 0;
    this.rotation = 0;
  }

  focus(x, y, { snap = false } = {}) {
    this.targetX = x;
    this.targetY = y;
    if (snap) this.x = x;
  }

  /** Focus Y that keeps world-space `groundY` pinned to that same screen row,
   *  so fighters never float above or sink into the arena floor. */
  groundFocus(groundY) {
    return groundY - (groundY - this.height / 2) / Math.max(0.2, this.zoom);
  }

  addShake(amount) {
    this.shake = Math.min(46, this.shake + amount * settings.shakeScale);
  }

  punchZoom(amount, duration = 0.12) {
    this.targetZoom = 1 + amount;
    this.zoomHold = duration;
  }

  update(dt, { follow = true, lerpRate = 6 } = {}) {
    this.time += dt;
    if (follow) {
      this.x = lerp(this.x, this.targetX, 1 - Math.exp(-lerpRate * dt));
      this.y = lerp(this.y, this.targetY, 1 - Math.exp(-lerpRate * dt));
    }
    if (this.zoomHold > 0) {
      this.zoomHold -= dt;
      if (this.zoomHold <= 0) this.targetZoom = 1;
    }
    this.zoom = lerp(this.zoom, this.targetZoom, 1 - Math.exp(-9 * dt));
    this.shake = Math.max(0, this.shake - this.shake * this.shakeDecay * dt - 8 * dt);

    const s = this.shake;
    if (s > 0.05) {
      this.offsetX = rand(s, -s);
      this.offsetY = rand(s * 0.7, -s * 0.7);
      this.rotation = rand(s * 0.00035, -s * 0.00035);
    } else {
      this.offsetX = 0;
      this.offsetY = 0;
      this.rotation = 0;
    }

    if (this.bounds) {
      const halfW = this.width / (2 * this.zoom);
      const halfH = this.height / (2 * this.zoom);
      // When the view is wider than the bounded area there is no valid pan
      // range, so settle on the middle of the bounds instead of producing an
      // inverted (min > max) clamp.
      const loX = this.bounds.minX + halfW;
      const hiX = this.bounds.maxX - halfW;
      this.x = loX > hiX ? (this.bounds.minX + this.bounds.maxX) / 2 : clamp(this.x, loX, hiX);
      if (Number.isFinite(this.bounds.minY) && Number.isFinite(this.bounds.maxY)) {
        const loY = this.bounds.minY + halfH;
        const hiY = this.bounds.maxY - halfH;
        this.y = loY > hiY ? (this.bounds.minY + this.bounds.maxY) / 2 : clamp(this.y, loY, hiY);
      }
    }
  }

  /** Apply camera transform; `fn` draws in world space. */
  apply(ctx, fn) {
    ctx.save();
    ctx.translate(this.width / 2 + this.offsetX, this.height / 2 + this.offsetY);
    ctx.rotate(this.rotation);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
    fn(ctx);
    ctx.restore();
  }
}

/* -------------------------------------------------------------------------- */
/* Hit-stop / slow motion                                                      */
/* -------------------------------------------------------------------------- */

export class TimeKeeper {
  constructor() {
    this.hitStop = 0;
    this.slowMo = 0;
    this.slowScale = 1;
  }

  freeze(seconds) {
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  slow(seconds, scale = 0.35) {
    this.slowMo = Math.max(this.slowMo, seconds);
    this.slowScale = scale;
  }

  /** Returns the simulation multiplier for this frame. */
  step(dt) {
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return 0;
    }
    if (this.slowMo > 0) {
      this.slowMo -= dt;
      return this.slowScale;
    }
    return 1;
  }

  reset() {
    this.hitStop = 0;
    this.slowMo = 0;
  }
}

void randInt;
