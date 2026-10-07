/**
 * summons.js — Gadget's distraction minions.
 *
 * Rules implemented exactly as specified: each summon TYPE may only be called
 * once per battle. When a summoned minion is removed (defeated or expired), the
 * type is marked spent on its owner and Gadget can never summon it again.
 */
import { SUMMONS, SUMMON_ORDER } from '../characters/roster.js';
import { GROUND_Y, STAGE_MIN_X, STAGE_MAX_X } from './fighter.js';
import { clamp, rand, damp } from '../core/utils.js';
import { NEUTRAL_POSE, clonePose, addPose, solvePosePlanted } from '../animation/skeleton.js';
import { CLIPS } from '../animation/clips.js';
import { drawStickman, drawShadow } from '../animation/stickman-renderer.js';

export class Minion {
  constructor({ type, owner, target, x }) {
    const def = SUMMONS[type];
    this.type = type;
    this.def = def;
    this.owner = owner;
    this.target = target;
    this.x = x ?? clamp(owner.x - owner.facing * 120, STAGE_MIN_X + 20, STAGE_MAX_X - 20);
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.height = def.height;
    this.facing = owner.facing * -1;
    this.speed = def.speed;
    this.damage = def.damage;
    this.state = 'spawn';
    this.stateTime = 0;
    this.attackCooldown = rand(1.2, 0.4);
    this.hitstun = 0;
    this.flash = 0;
    this.dead = false;
    this.expired = false;
    this.lifetime = 14; // minions give up eventually
    this.animTime = rand(3);
    this.stance = clonePose(NEUTRAL_POSE);
    this.stance.spine = 6;
    this.stance.armF = [50, 80];
    this.stance.armB = [30, 92];
    this.pose = clonePose(this.stance);
    this.solved = solvePosePlanted(this.pose, this.height);
    this.eye = { x: 0.4, y: 0 };
  }

  get footY() {
    return GROUND_Y - this.y;
  }

  hurtbox() {
    const w = this.height * 0.34;
    const h = this.height * 0.92;
    return { x: this.x - w / 2, y: this.footY - h, w, h };
  }

  update(dt, { match }) {
    this.stateTime += dt;
    this.animTime += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.lifetime -= dt;
    if (this.lifetime <= 0) this.expired = true;

    if (this.hitstun > 0) {
      this.hitstun -= 1;
      this.vx = damp(this.vx, 0, 8, dt);
      this.x += this.vx * dt;
    } else if (this.state === 'spawn') {
      if (this.stateTime > 0.4) this.state = 'chase';
    } else {
      const dir = Math.sign(this.target.x - this.x) || 1;
      this.facing = dir;
      const dist = Math.abs(this.target.x - this.x);
      this.attackCooldown -= dt;
      if (dist > 58) {
        this.vx = damp(this.vx, dir * this.speed, 8, dt);
        this.state = 'chase';
      } else {
        this.vx = damp(this.vx, 0, 12, dt);
        if (this.attackCooldown <= 0) {
          this.attackCooldown = rand(2.1, 1.1);
          match.minionAttack(this);
        }
      }
      // Little hop so they feel alive and are easier to track.
      if (this.y <= 0 && this.state === 'chase' && Math.random() < dt * 1.6) this.vy = 240;
    }

    this.vy -= 1800 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
    }
    this.x = clamp(this.x, STAGE_MIN_X, STAGE_MAX_X);

    const moving = Math.abs(this.vx) > 20;
    const clip = this.hitstun > 0 ? 'hit' : moving ? 'walk' : 'idle';
    const delta = (CLIPS[clip] || CLIPS.idle)({ t: this.animTime, p: 0, speed: 1.2, rng: this.x * 0.01 });
    const target = addPose(this.stance, delta, 1);
    for (const key of Object.keys(target)) {
      if (typeof target[key] === 'number') this.pose[key] = damp(this.pose[key] ?? 0, target[key], 18, dt);
      else if (Array.isArray(target[key])) {
        this.pose[key][0] = damp(this.pose[key][0], target[key][0], 18, dt);
        this.pose[key][1] = damp(this.pose[key][1], target[key][1], 18, dt);
      } else if (target[key] && typeof target[key] === 'object') {
        this.pose[key].x = damp(this.pose[key].x ?? 0, target[key].x ?? 0, 18, dt);
        this.pose[key].y = damp(this.pose[key].y ?? 0, target[key].y ?? 0, 18, dt);
      }
    }
    this.solved = solvePosePlanted(this.pose, this.height);
  }

  takeHit(damage, fromDir, match) {
    this.hp -= damage;
    this.flash = 1;
    this.hitstun = 12;
    this.vx = fromDir * 260;
    match?.onMinionHit?.(this, damage);
    if (this.hp <= 0) {
      this.dead = true;
    }
  }

  draw(ctx) {
    drawShadow(ctx, this.x, GROUND_Y + 4, this.height * 0.34, 0.7);
    const alpha = this.state === 'spawn' ? clamp(this.stateTime / 0.4, 0, 1) : 1;
    drawStickman(ctx, this.solved, {
      x: this.x,
      y: this.footY,
      facing: this.facing,
      height: this.height,
      color: this.def.color,
      accent: '#ffffff',
      lineWidth: 5,
      glow: 0.9,
      alpha,
      eye: this.eye,
      eyeStyle: 'wide',
      flash: this.flash
    });
  }
}

/**
 * Pick the next summon type Gadget may still call.
 * Returns null when every type has already been spent this battle.
 */
export function nextSummonType(owner) {
  const available = SUMMON_ORDER.filter((type) => !owner.summonedTypes.has(type));
  if (available.length === 0) return null;
  // Prefer types the player has not yet dealt with, but keep it unpredictable.
  return available[Math.floor(Math.random() * available.length)];
}

export function markSummonSpent(owner, type) {
  owner.summonedTypes.add(type);
}

export function remainingSummonTypes(owner) {
  return SUMMON_ORDER.filter((type) => !owner.summonedTypes.has(type));
}
