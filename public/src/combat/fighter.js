/**
 * fighter.js — one combatant: physics, state machine, animation, health.
 *
 * The fighter is driven by an `intent` object every frame, which means the
 * player controller, the AI controller and the training dummy all drive the
 * exact same code path with the exact same rules.
 *
 * Intent shape:
 *   { moveX, jump, crouch, block, lightPunch, heavyPunch, lightKick,
 *     heavyKick, special, ultimate }   // booleans; attacks are edge-triggered
 */

import { getCharacter } from '../characters/roster.js';
import { movesetFor } from '../characters/movesets.js';
import {
  NEUTRAL_POSE,
  groundOffsetFor,
  clonePose,
  addPose,
  blendPose,
  solvePose,
  hurtboxFor,
  solvePosePlanted,
  PROPORTIONS
} from '../animation/skeleton.js';
import { CLIPS } from '../animation/clips.js';
import { clamp, lerp, damp, rand, chance, TAU } from '../core/utils.js';
import { settings } from '../config/settings.js';

export const GROUND_Y = 556;
export const STAGE_MIN_X = 90;
export const STAGE_MAX_X = 1190;
const FT = 1 / 60;

export class Fighter {
  constructor({ characterId, side = 0, isPlayer = false, palette = null, name = null, scaleStats = null }) {
    this.characterId = characterId;
    this.def = getCharacter(characterId);
    if (palette) this.def = { ...this.def, ...palette };
    this.moveset = movesetFor(characterId);
    this.side = side; // 0 = starts left, 1 = starts right
    this.isPlayer = isPlayer;
    this.displayName = name || this.def.name;

    const s = this.def.stats;
    this.maxHp = Math.round((scaleStats?.maxHp ?? s.maxHp) || 100);
    this.hp = this.maxHp;
    this.meter = 0;
    this.maxMeter = 100;
    this.damageScale = scaleStats?.damageScale ?? s.damageScale ?? 1;
    this.defense = s.defense ?? 1;
    this.reach = s.reach ?? 1;
    this.walkSpeed = (s.walkSpeed ?? 200) * (scaleStats?.speed ?? 1);
    this.backSpeed = (s.backSpeed ?? 170) * (scaleStats?.speed ?? 1);
    this.jumpVelocity = s.jumpVelocity ?? 690;
    this.gravity = s.gravity ?? 2100;
    this.weight = s.weight ?? 1;
    this.meterRate = s.meterRate ?? 1;
    this.height = this.def.height;

    this.x = side === 0 ? 430 : 850;
    this.y = 0; // height above the ground
    this.vx = 0;
    this.vy = 0;
    this.facing = side === 0 ? 1 : -1;

    /* state */
    this.state = 'idle';
    this.stateTime = 0;
    this.currentMove = null;
    this.moveFrame = 0;
    this.moveHasHit = false;
    this.hitTargets = new Set();
    this.comboHits = 0;
    this.hitstun = 0;
    this.blockstun = 0;
    this.armourFrames = 0;
    this.invulnFrames = 0;
    this.knockdownTimer = 0;
    this.slowTimer = 0;
    this.slowScale = 1;
    this.blocking = false;
    this.crouching = false;
    this.grounded = true;
    this.airAttacksUsed = 0;
    this.dashTimer = 0;
    this.dashDir = 0;
    this.flash = 0;
    this.trailFrames = [];
    this.armourFlash = 0;
    this.phase = 0;
    this.alive = true;
    this.recentDamage = 0;
    this.lastHitBy = null;
    this.stance = clonePose(NEUTRAL_POSE);
    // Layer the character's signature posture on top of the neutral stance.
    for (const key of Object.keys(this.def.stance || {})) {
      if (key === 'root' || key === 'head') this.stance[key] = { ...this.stance[key], ...this.def.stance[key] };
      else this.stance[key] = this.def.stance[key];
    }
    this.groundOffset = groundOffsetFor(this.stance, this.height);
    this.pose = clonePose(this.stance);
    this.solved = solvePosePlanted(this.pose, this.height);
    this.animTime = 0;
    this.clip = 'idle';
    this.clipTime = 0;
    this.clipDuration = 0;
    this.eye = { x: 0.35, y: 0 };
    this.aura = 0;
    this.effects = [];
    this.summonedTypes = new Set(); // Gadget: minion types already defeated
    this.afterimages = [];
  }

  /* ------------------------------------------------------------------ */
  /* Queries                                                              */
  /* ------------------------------------------------------------------ */

  get isAttacking() {
    return this.state === 'attack';
  }

  get isBusy() {
    return ['attack', 'hitstun', 'blockstun', 'knockdown', 'getup', 'stun', 'intro', 'victory', 'defeat'].includes(this.state);
  }

  get canAct() {
    return ['idle', 'walk', 'walkBack', 'jump', 'fall', 'crouch', 'block', 'land', 'dash'].includes(this.state);
  }

  get isAirborne() {
    return !this.grounded;
  }

  get footY() {
    return GROUND_Y - this.y;
  }

  get centerY() {
    return this.footY - this.height * 0.5;
  }

  get hpRatio() {
    return clamp(this.hp / this.maxHp, 0, 1);
  }

  get meterRatio() {
    return clamp(this.meter / this.maxMeter, 0, 1);
  }

  /** World-space hurtbox (y grows downward, ground at GROUND_Y). */
  hurtbox() {
    const hb = hurtboxFor(this.solved, this.height);
    const left = this.facing > 0 ? this.x + hb.x : this.x - hb.x - hb.w;
    const bottom = this.footY - hb.y;
    return { x: left, y: bottom - hb.h, w: hb.w, h: hb.h };
  }

  /** World-space hitbox for the currently active attack, or null. */
  activeHitbox() {
    if (!this.currentMove) return null;
    const m = this.currentMove;
    if (this.moveFrame < m.startup || this.moveFrame > m.startup + m.active - 1) return null;
    if (m.projectile && !m.hitbox?.w) return null;
    const hb = m.hitbox;
    if (!hb || !hb.w) return null;
    const w = hb.w * this.reach;
    const left = this.facing > 0 ? this.x + hb.x : this.x - hb.x - w;
    const bottom = this.footY - hb.y;
    return { x: left, y: bottom - hb.h, w, h: hb.h };
  }

  /* ------------------------------------------------------------------ */
  /* State control                                                        */
  /* ------------------------------------------------------------------ */

  setState(state, { clip = null, duration = 0 } = {}) {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
    this.clipTime = 0;
    this.clipDuration = duration;
    if (clip) this.clip = clip;
  }

  playClip(name, duration) {
    this.clip = name;
    this.clipTime = 0;
    this.clipDuration = duration || 0;
  }

  faceTowards(other) {
    if (this.isBusy) return;
    this.facing = other.x >= this.x ? 1 : -1;
  }

  addMeter(amount) {
    this.meter = clamp(this.meter + amount * this.meterRate, 0, this.maxMeter);
  }

  /* ------------------------------------------------------------------ */
  /* Attacks                                                              */
  /* ------------------------------------------------------------------ */

  canStartMove(moveId) {
    const m = this.moveset[moveId];
    if (!m) return false;
    if (m.meterCost && this.meter < m.meterCost) return false;
    if (m.requiresAir && this.grounded) return false;
    if (m.requiresCrouch && !this.crouching) return false;
    if (!m.airOk && !this.grounded) return false;
    if (m.requiresAir && this.airAttacksUsed >= 1) return false;
    return true;
  }

  startMove(moveId, { fromCancel = false } = {}) {
    const m = this.moveset[moveId];
    if (!m || !this.canStartMove(moveId)) return false;
    if (m.meterCost) this.meter -= m.meterCost;

    this.currentMove = m;
    this.moveId = moveId;
    this.moveFrame = 0;
    this.moveHasHit = false;
    this.hitTargets.clear();
    this.setState('attack');
    this.playClip(m.anim, (m.startup + m.active + m.recovery) * FT);
    this.armourFrames = m.armour || 0;
    this.invulnFrames = m.invuln || 0;
    this.vx *= 0.2;
    if (!fromCancel) this.comboHits = 0;

    if (m.dash) {
      this.dashTimer = m.dash.frames;
      this.dashDir = this.facing;
    }
    return true;
  }

  /** Frame data access for the current attack. */
  get movePhase() {
    if (!this.currentMove) return 'none';
    const m = this.currentMove;
    if (this.moveFrame < m.startup) return 'startup';
    if (this.moveFrame < m.startup + m.active) return 'active';
    return 'recovery';
  }

  /* ------------------------------------------------------------------ */
  /* Damage                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Apply a hit. Returns a result descriptor the match layer turns into
   * effects, combo counters and audio.
   */
  receiveHit(move, attacker, { blocked = false, chip = false } = {}) {
    if (this.state === 'defeat' || this.state === 'knockdown') return null;
    const isGrab = Boolean(move.grab);
    const isUnblockable = Boolean(move.unblockable);
    const blockedNow = blocked && !isUnblockable && !isGrab;

    let damage = move.damage * attacker.damageScale / this.defense;
    if (blockedNow) damage = chip ? Math.max(1, damage * 0.12) : 0;
    damage = Math.round(damage * 10) / 10;
    this.hp = clamp(this.hp - damage, 0, this.maxHp);
    this.recentDamage += damage;
    this.lastHitBy = attacker;
    this.flash = 1;
    attacker.addMeter(move.meterGain || 6);
    this.addMeter(damage * 0.35);

    const dir = attacker.x <= this.x ? 1 : -1;
    const kb = move.knockback || { x: 120, y: 0 };

    if (blockedNow) {
      this.blockstun = Math.round(move.blockstun * (1 + (move.damage / 40)));
      this.setState('blockstun');
      this.vx = dir * kb.x * 0.42 / this.weight;
      this.playClip('blockHit', this.blockstun * FT);
    } else if (move.knockdown || this.hp <= 0 || (move.launch && this.isAirborne)) {
      this.hitstun = 0;
      this.setState('knockdown');
      this.knockdownTimer = 1.0;
      this.vx = dir * (kb.x * 0.7) / this.weight;
      this.vy = Math.max(this.vy, Math.abs(kb.y) * 0.55 + 180) / this.weight;
      this.playClip('knockdown', 0.7);
      this.grounded = false;
    } else if (this.armourFrames > 0 && !isGrab) {
      // Super armour: the hit lands but the attacker keeps coming.
      this.hp = clamp(this.hp + damage * 0.5, 0, this.maxHp); // half damage while armoured
      this.armourFlash = 0.3;
      this.blockstun = 0;
      this.playClip(this.clip, this.clipDuration);
      return { blocked: false, armoured: true, damage: damage * 0.5, move, attacker };
    } else {
      this.hitstun = Math.round(move.hitstun * (move.damage > 15 ? 1.1 : 1));
      this.setState('hitstun');
      this.vx = (dir * kb.x) / this.weight;
      if (kb.y < 0 && !this.isAirborne) this.vy = Math.abs(kb.y) / this.weight;
      if (kb.y < 0 && !this.isAirborne) this.grounded = false;
      this.playClip('hit', this.hitstun * FT);
      this.comboHits = 0;
    }

    if (move.drainsMeter) this.meter = clamp(this.meter - move.drainsMeter, 0, this.maxMeter);
    if (move.slowOpponent) {
      this.slowTimer = move.slowOpponent.duration;
      this.slowScale = move.slowOpponent.scale;
    }

    if (this.hp <= 0 && this.state !== 'knockdown') {
      this.hp = 0;
      this.setState('knockdown');
      this.knockdownTimer = 1.4;
      this.playClip('knockdown', 0.8);
    }

    return {
      blocked: blockedNow,
      chip,
      damage,
      move,
      attacker,
      defender: this,
      ko: this.hp <= 0,
      direction: dir
    };
  }

  /* ------------------------------------------------------------------ */
  /* Update                                                               */
  /* ------------------------------------------------------------------ */

  update(dt, intent, { opponent, match } = {}) {
    this.stateTime += dt;
    this.animTime += dt;
    this.clipTime += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.armourFlash = Math.max(0, this.armourFlash - dt * 3);
    if (this.armourFrames > 0) this.armourFrames -= 1;
    if (this.invulnFrames > 0) this.invulnFrames -= 1;
    if (this.slowTimer > 0) this.slowTimer -= dt;

    if (this.state === 'intro') {
      // Entrance flourish finishes, then the fighter becomes controllable.
      if (this.clipDuration > 0 && this.clipTime >= this.clipDuration) this.#returnToNeutral();
      this.#updateAnimation(dt);
      this.#solvePose();
      return;
    }
    if (this.state === 'defeat' || this.state === 'victory') {
      this.#updateAnimation(dt);
      this.#solvePose();
      return;
    }

    const slow = this.slowTimer > 0 ? this.slowScale : 1;
    const sdt = dt * slow;

    /* --------------------------------------------------- facing ------ */
    if (opponent && this.canAct && !this.isAttacking) {
      this.facing = opponent.x >= this.x ? 1 : -1;
    }

    /* --------------------------------------------------- hit stop ---- */
    if (this.hitstun > 0) {
      this.hitstun -= 1;
      this.#applyPhysics(sdt, { friction: 0.86 });
      if (this.hitstun <= 0 && this.grounded) this.#returnToNeutral();
      this.#updateAnimation(dt);
      this.#solvePose();
      return;
    }
    if (this.blockstun > 0) {
      this.blockstun -= 1;
      this.#applyPhysics(sdt, { friction: 0.8 });
      if (this.blockstun <= 0) this.#returnToNeutral();
      this.#updateAnimation(dt);
      this.#solvePose();
      return;
    }

    /* --------------------------------------------------- knockdown -- */
    if (this.state === 'knockdown') {
      this.knockdownTimer -= dt;
      this.#applyPhysics(sdt, { friction: 0.9, allowLanding: true });
      if (this.grounded && this.knockdownTimer <= 0.55 && this.state === 'knockdown') {
        this.setState('getup');
        this.playClip('getup', 0.55);
        this.invulnFrames = 24;
      }
      this.#updateAnimation(dt);
      this.#solvePose();
      return;
    }
    if (this.state === 'getup') {
      this.#applyPhysics(sdt, { friction: 0.7 });
      if (this.clipTime >= this.clipDuration) this.#returnToNeutral();
      this.#updateAnimation(dt);
      this.#solvePose();
      return;
    }

    /* --------------------------------------------------- attacks ---- */
    if (this.state === 'attack' && this.currentMove) {
      this.#updateAttack(sdt, intent, { opponent, match });
      this.#updateAnimation(dt);
      this.#solvePose();
      return;
    }

    /* --------------------------------------------------- motion ----- */
    const blocked = intent.block && this.grounded;
    this.blocking = blocked;
    this.crouching = Boolean(intent.crouch) && this.grounded && !this.isAirborne;

    if (this.grounded) {
      const wantLeft = intent.moveX < -0.2;
      const wantRight = intent.moveX > 0.2;
      const forward = this.facing > 0 ? wantRight : wantLeft;
      const backward = this.facing > 0 ? wantLeft : wantRight;
      let targetVx = 0;
      if (forward && !blocked) targetVx = this.facing * this.walkSpeed;
      else if (backward) targetVx = -this.facing * this.backSpeed;
      else if (wantLeft || wantRight) targetVx = (wantRight ? 1 : -1) * this.walkSpeed * 0.85;

      this.vx = damp(this.vx, targetVx, 18, sdt);

      if (intent.jump && this.canAct) {
        this.vy = this.jumpVelocity;
        this.grounded = false;
        this.airAttacksUsed = 0;
        this.setState('jump');
        this.playClip('jumpUp', 0.3);
      }
    } else {
      this.vx = damp(this.vx, intent.moveX * this.walkSpeed * 0.72, 3.2, sdt);
    }

    /* --------------------------------------------------- attacks ---- */
    if (this.canAct || (this.state === 'jump' || this.state === 'fall')) {
      const tryMove = (id) => {
        if (intent[id] && this.canStartMove(id)) return this.startMove(id);
        return false;
      };
      if (!this.grounded) {
        if (tryMove('jumpKick')) { /* started */ }
        else if (tryMove('jumpPunch')) { /* started */ }
      } else if (this.crouching) {
        if (tryMove('sweep')) { /* started */ }
        else if (tryMove('crouchPunch')) { /* started */ }
      }
      if (this.state !== 'attack') {
        // Grounded / air-normal priority.
        if (tryMove('ultimate')) { /* started */ }
        else if (tryMove('special')) { /* started */ }
        else if (tryMove('heavyKick')) { /* started */ }
        else if (tryMove('heavyPunch')) { /* started */ }
        else if (tryMove('lightKick')) { /* started */ }
        else if (tryMove('lightPunch')) { /* started */ }
      }
    }

    /* --------------------------------------------------- state ------ */
    if (this.state !== 'attack' && !this.isAirborne) {
      if (this.blocking) {
        this.setState('block');
        if (this.clip !== 'block') this.playClip('block', 0);
      } else if (this.crouching) {
        this.setState('crouch');
        if (this.clip !== 'crouch') this.playClip('crouch', 0.18);
      } else if (Math.abs(this.vx) > 26) {
        const forward = Math.sign(this.vx) === this.facing;
        const next = forward ? 'walk' : 'walkBack';
        if (this.state !== next) {
          this.setState(next);
          this.playClip(forward ? 'walk' : 'walk', 0);
        }
      } else if (this.state !== 'land' || this.clipTime > this.clipDuration) {
        this.setState('idle');
        if (this.clip !== 'idle') this.playClip('idle', 0);
      }
    } else if (this.isAirborne && this.state !== 'attack') {
      this.setState(this.vy > 0 ? 'jump' : 'fall');
      if (this.vy > 0 && this.clip !== 'jumpUp') this.playClip('jumpUp', 0.3);
      if (this.vy <= 0 && this.clip !== 'fall') this.playClip('fall', 0.4);
    }

    this.#applyPhysics(sdt, { allowLanding: true });
    this.#updateAnimation(dt);
    this.#solvePose();
  }

  #updateAttack(dt, intent, { match }) {
    const m = this.currentMove;
    this.moveFrame += 1;
    if (this.armourFrames > 0) this.armourFrames -= 1;

    // Dash movement for rush-down specials.
    if (this.dashTimer > 0) {
      this.dashTimer -= 1;
      this.vx = this.dashDir * (m.dash?.distance || 0) / ((m.dash?.frames || 12) * FT);
    } else if (this.grounded) {
      this.vx = damp(this.vx, 0, 12, dt);
    }

    const total = m.startup + m.active + m.recovery;
    const phase = this.movePhase;

    // Cancels: allow chaining into special / super during recovery on hit.
    if (phase === 'recovery' && this.moveHasHit && m.cancelInto?.length) {
      for (const id of m.cancelInto) {
        if (intent[id] && this.canStartMove(id)) {
          this.startMove(id, { fromCancel: true });
          return;
        }
      }
    }

    // Projectile / summon / teleport fire exactly once, on the first active frame.
    if (phase === 'active' && this.moveFrame === m.startup && match) {
      if (m.projectile) match.spawnProjectile(this, m);
      if (m.summon) match.spawnSummons(this, m.summon.count || 1);
      if (m.summonAll) match.spawnSummons(this, 6);
      if (m.teleport) match.teleportFighter(this, m.teleport);
    }

    this.#applyPhysics(dt, { allowLanding: true, friction: this.grounded ? 0.82 : 0.98 });

    if (this.moveFrame >= total) {
      this.currentMove = null;
      this.moveId = null;
      this.#returnToNeutral();
    }
  }

  #applyPhysics(dt, { friction = 0.85, allowLanding = true } = {}) {
    this.vy -= this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.y <= 0) {
      if (allowLanding && !this.grounded) {
        const impact = Math.min(1, Math.abs(this.vy) / 900);
        this.grounded = true;
        this.y = 0;
        this.vy = 0;
        this.airAttacksUsed = 0;
        if (this.state !== 'knockdown' && this.state !== 'getup' && this.state !== 'attack') {
          this.setState('land');
          this.playClip('land', 0.22);
        }
        if (impact > 0.25) this.onLand?.(impact);
      } else if (this.y < 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
    } else {
      this.grounded = false;
    }

    if (this.grounded && this.state !== 'attack') this.vx *= friction ** (dt * 60);

    // Stage walls + fighter push-apart is handled by the match, but clamp here too.
    this.x = clamp(this.x, STAGE_MIN_X, STAGE_MAX_X);
  }

  #returnToNeutral() {
    this.currentMove = null;
    this.comboHits = 0;
    this.setState('idle');
    this.playClip('idle', 0);
  }

  /* ------------------------------------------------------------------ */
  /* Animation                                                            */
  /* ------------------------------------------------------------------ */

  #updateAnimation(dt) {
    void dt;
    const d = (this.clipDuration || 0) > 0 ? Math.min(1, this.clipTime / this.clipDuration) : 0;
    const looping = ['idle', 'walk', 'run', 'stun', 'victory', 'defeat', 'exhausted', 'block', 'crouch'].includes(this.clip);
    const p = looping ? (this.clipDuration > 0 ? (this.clipTime / this.clipDuration) % 1 : 0) : d;
    this.posePhase = Number.isFinite(p) ? p : 0;

    const fn = CLIPS[this.clip] || CLIPS.idle;
    const ctx = {
      t: this.animTime,
      p: this.posePhase,
      dur: this.clipDuration,
      rng: this.side * 1.7,
      style: this.clip === 'special' || this.clip === 'ultimate' ? this.def.specialStyle : this.def.victoryStyle,
      guard: this.blocking ? 1 : 0.55,
      speed: Math.abs(this.vx) / Math.max(1, this.walkSpeed),
      severity: clamp(this.recentDamage / 18, 0.4, 1.6),
      high: true
    };
    const delta = fn(ctx) || {};
    let pose = addPose(this.stance, delta, 1);

    // Idle breathing still applies under non-conflicting clips (adds life).
    if (this.clip !== 'idle' && ['block', 'crouch', 'hit', 'blockHit'].includes(this.clip)) {
      pose = addPose(pose, CLIPS.idle({ t: this.animTime, rng: this.side * 2.3 }), 0.35);
    }
    if (this.clip === 'idle') {
      pose = addPose(pose, CLIPS.idle({ t: this.animTime * 0.7, rng: this.side * 3.1 }), 0.4);
    }
    if (this.isAirborne && this.clip === 'jumpUp') {
      pose.root.y += 0;
    }

    // Blend toward the target pose so transitions never snap.
    this.pose = blendPose(this.pose, pose, 0.45);

    // Gaze: track the opponent while idle, snap forward while attacking.
    const targetEye = this.isAttacking ? 0.9 : 0.35;
    this.eye.x = damp(this.eye.x, targetEye, 8, dt);
    this.eye.y = damp(this.eye.y, this.clip === 'hit' ? 0.5 : 0, 8, dt);

    // Motion trail while dashing / specials.
    const wantsTrail =
      (this.clip === 'special' && this.def.specialStyle === 'dash') ||
      this.clip === 'ultimate' ||
      Math.abs(this.vx) > 520;
    if (wantsTrail && settings.effectScale > 0.4) {
      this.trailFrames.push({ solved: this.solved, x: this.x, y: this.footY, facing: this.facing });
      if (this.trailFrames.length > 6) this.trailFrames.shift();
    } else if (this.trailFrames.length) {
      this.trailFrames.shift();
    }
  }

  #solvePose() {
    // Solved poses are planted on the ground plane, so hurtboxes, hitboxes and
    // rendering all share one coordinate space (feet at y = 0, +y is up).
    this.solved = solvePosePlanted(this.pose, this.height);
    this.poseLift = 0;
  }

  /** Final render pose including squash/lift. */
  renderState() {
    return {
      solved: this.solved,
      x: this.x,
      y: this.footY,
      facing: this.facing,
      height: this.height,
      color: this.def.color,
      accent: this.def.accent,
      eyeStyle: this.def.eyeStyle,
      lineWidth: this.def.lineWidth,
      glow: this.def.glow,
      eye: this.eye,
      flash: this.flash * 0.85 + this.armourFlash * 0.5,
      aura: this.meterRatio > 0.999 ? { color: this.def.accent, strength: 0.6 } : null,
      squashY: this.pose.squash || 1,
      tilt: ((this.pose.lean || 0) * Math.PI) / 180 / 6
    };
  }

  /* ------------------------------------------------------------------ */
  /* Cinematic states                                                     */
  /* ------------------------------------------------------------------ */

  playIntro(duration = 1.2) {
    this.setState('intro');
    this.playClip('intro', duration);
    this.invulnFrames = Math.round(duration * 60);
  }

  playVictory() {
    this.currentMove = null;
    this.setState('victory');
    this.playClip('victory', 2.4);
    this.vx = 0;
    this.vy = 0;
  }

  playDefeat() {
    this.currentMove = null;
    this.setState('defeat');
    this.playClip('defeat', 1.6);
    this.hp = Math.min(this.hp, 1);
    this.vx = 0;
  }

  resetForRound(x, facing) {
    this.hp = this.maxHp;
    this.meter = 0;
    this.x = x;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.grounded = true;
    this.state = 'idle';
    this.stateTime = 0;
    this.currentMove = null;
    this.hitstun = 0;
    this.blockstun = 0;
    this.knockdownTimer = 0;
    this.comboHits = 0;
    this.blocking = false;
    this.crouching = false;
    this.flash = 0;
    this.trailFrames.length = 0;
    this.summonedTypes.clear();
    this.playClip('idle', 0);
  }
}

void rand;
void chance;
void TAU;
void lerp;
void PROPORTIONS;
