/**
 * projectiles.js — energy waves, papers, beams and other travelling hitboxes.
 *
 * Each projectile carries real hitbox data and is destroyed on contact (or when
 * it leaves the arena), so it can be dodged, blocked and out-ranged.
 */
import { GROUND_Y, STAGE_MIN_X, STAGE_MAX_X } from './fighter.js';
import { clamp, rgba, TAU } from '../core/utils.js';

export class Projectile {
  constructor({ owner, def, direction }) {
    this.owner = owner;
    this.def = def;
    this.x = owner.x + direction * (def.spawnOffset ?? 42);
    this.y = def.y ?? 80; // height above ground
    this.vx = (def.speed ?? 600) * direction;
    this.w = def.w ?? 44;
    this.h = def.h ?? 40;
    this.damage = def.damage ?? 10;
    this.hitstun = def.hitstun ?? 24;
    this.knockback = def.knockback || { x: 300, y: -50 };
    this.color = def.color || owner.def.color;
    this.kind = def.kind || 'wave';
    this.life = def.life ?? 1.5;
    this.age = 0;
    this.dead = false;
    this.hasHit = false;
    this.direction = direction;
    this.spin = 0;
  }

  /** World-space rect (y grows downward). */
  rect() {
    return { x: this.x - this.w / 2, y: GROUND_Y - this.y - this.h, w: this.w, h: this.h };
  }

  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.spin += dt * 9 * this.direction;
    if (this.kind === 'paper') this.y += Math.sin(this.age * 12) * 40 * dt;
    if (this.age >= this.life) this.dead = true;
    if (this.x < STAGE_MIN_X - 120 || this.x > STAGE_MAX_X + 120) this.dead = true;
  }

  draw(ctx) {
    const { x, y } = { x: this.x, y: GROUND_Y - this.y };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    if (this.kind === 'beam') {
      const g = ctx.createLinearGradient(x - 90 * this.direction, y, x + 90 * this.direction, y);
      g.addColorStop(0, rgba(this.color, 0));
      g.addColorStop(0.5, rgba(this.color, 0.95));
      g.addColorStop(1, rgba(this.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - 110 * this.direction, y - this.h / 2, 220 * this.direction, this.h);
      ctx.fillStyle = rgba('#ffffff', 0.9);
      ctx.fillRect(x - 80 * this.direction, y - this.h * 0.12, 160 * this.direction, this.h * 0.24);
    } else if (this.kind === 'paper') {
      ctx.translate(x, y - this.h / 2);
      ctx.rotate(Math.sin(this.spin) * 0.25);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgba('#f7f2e0', 0.96);
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
      ctx.strokeStyle = rgba(this.color, 0.9);
      ctx.lineWidth = 2;
      ctx.strokeRect(-this.w / 2, -this.h / 2, this.w, this.h);
      ctx.fillStyle = rgba('#2b2b33', 0.5);
      for (let i = 0; i < 4; i += 1) {
        ctx.fillRect(-this.w / 2 + 6, -this.h / 2 + 10 + i * 9, this.w - 12 - (i % 2) * 10, 2);
      }
    } else {
      // 'wave' — crescent energy slash
      const pulseR = this.h * (0.55 + 0.1 * Math.sin(this.age * 22));
      const g = ctx.createRadialGradient(x, y - this.h / 2, 2, x, y - this.h / 2, pulseR);
      g.addColorStop(0, rgba('#ffffff', 0.95));
      g.addColorStop(0.4, rgba(this.color, 0.85));
      g.addColorStop(1, rgba(this.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y - this.h / 2, this.w * 0.55, pulseR, 0, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = rgba('#ffffff', 0.55);
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) {
        const off = i * 9 * this.direction;
        ctx.moveTo(x - off - 26 * this.direction, y - this.h / 2 - 12);
        ctx.lineTo(x - off + 6 * this.direction, y - this.h / 2);
        ctx.lineTo(x - off - 26 * this.direction, y - this.h / 2 + 12);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function updateProjectiles(list, dt) {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    list[i].update(dt);
    if (list[i].dead) list.splice(i, 1);
  }
}

export function drawProjectiles(ctx, list) {
  for (const p of list) p.draw(ctx);
}

export function clampToStage(p) {
  p.x = clamp(p.x, STAGE_MIN_X - 100, STAGE_MAX_X + 100);
}
