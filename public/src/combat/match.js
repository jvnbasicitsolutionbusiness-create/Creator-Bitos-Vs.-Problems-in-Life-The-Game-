/**
 * match.js — a complete battle: rounds, collision, combos, phases, results.
 *
 * Owns:
 *   • fighters, projectiles and Gadget's minions
 *   • the READY → 3 → 2 → 1 → FIGHT! sequence
 *   • hitbox/hurtbox resolution with blocking, chip damage and combos
 *   • multi-phase bosses (School's four years, Seizure's three phases)
 *   • round wins, timer, KO and the results payload
 *
 * It does not draw anything. Scenes render `match` through the arena/HUD
 * painters, which keeps combat testable and presentation swappable.
 */
import { Fighter, GROUND_Y, STAGE_MIN_X, STAGE_MAX_X } from './fighter.js';
import { Projectile, updateProjectiles } from './projectiles.js';
import { Minion, nextSummonType, markSummonSpent, remainingSummonTypes } from './summons.js';
import { rectsOverlap, clamp, damp, chance, rand } from '../core/utils.js';
import { settings } from '../config/settings.js';
import { difficultyFor, scaleDifficultyForRound } from '../config/difficulty.js';
import { getCharacter, CAMPAIGN_ROUNDS } from '../characters/roster.js';

export const MATCH_PHASE = {
  ENTRY: 'entry',
  READY: 'ready',
  COUNTDOWN: 'countdown',
  FIGHT: 'fight',
  ROUND_END: 'roundEnd',
  MATCH_END: 'matchEnd'
};

export class Match {
  constructor({
    mode = 'campaign',
    p1Id = 'creator-bitos',
    p2Id = 'laziness',
    difficultyId = null,
    roundNumber = 1,
    totalRounds = 10,
    camera = null,
    particles = null,
    time = null,
    audio = null,
    training = false,
    aiEnabled = [false, true],
    onEvent = null
  } = {}) {
    this.mode = mode;
    this.roundNumber = roundNumber;
    this.totalRounds = totalRounds;
    this.camera = camera;
    this.particles = particles;
    this.time = time;
    this.audio = audio;
    this.training = training;
    this.onEvent = onEvent || (() => {});

    this.difficulty = scaleDifficultyForRound(
      difficultyFor(difficultyId || settings.get('difficulty')),
      roundNumber,
      totalRounds
    );

    this.projectiles = [];
    this.minions = [];
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.roundIndex = 0;
    this.roundTime = settings.get('roundTime') || 99;
    this.timer = this.roundTime;
    this.timerEnabled = !training && settings.get('timerEnabled');
    this.roundsToWin = training ? 99 : clamp(settings.get('roundsToWin') || 2, 1, 3);
    this.phase = MATCH_PHASE.ENTRY;
    this.phaseTime = 0;
    this.countdownIndex = 0;
    this.countdownLabels = ['READY', '3', '2', '1', 'FIGHT!'];
    this.combos = [0, 0];
    this.comboTimers = [0, 0];
    this.comboDamage = [0, 0];
    this.bestCombo = [0, 0];
    this.koFlash = 0;
    this.superFreeze = 0;
    this.finished = false;
    this.winner = null;
    this.paused = false;
    this.introText = null;
    this.bannerText = null;
    this.bannerTime = 0;
    this.totalDamage = [0, 0];
    this.hits = [0, 0];
    this.blockedHits = [0, 0];
    this.aiState = ['IDLE', 'IDLE'];

    const p1Def = getCharacter(p1Id);
    const p2Def = getCharacter(p2Id);
    this.fighters = [
      new Fighter({ characterId: p1Id, side: 0, isPlayer: true }),
      new Fighter({ characterId: p2Id, side: 1, isPlayer: false })
    ];
    this.controllers = [null, null]; // assigned by the scene (player or AI)
    this.aiEnabled = aiEnabled.slice();
    this.phaseSpecial = null;

    // Boss phase setup.
    this.bossPhases = p2Def.phases || null;
    this.bossPhaseIndex = 0;
    this.seizurePhases = p2Id === 'seizure' ? 3 : 1;
    this.seizurePhaseIndex = 0;

    this.fighters[0].onLand = (impact) => this.#onLand(this.fighters[0], impact);
    this.fighters[1].onLand = (impact) => this.#onLand(this.fighters[1], impact);
    void p1Def;
  }

  get p1() {
    return this.fighters[0];
  }

  get p2() {
    return this.fighters[1];
  }

  get isFighting() {
    return this.phase === MATCH_PHASE.FIGHT;
  }

  get displayRoundLabel() {
    if (this.training) return 'TRAINING';
    const n = this.roundIndex + 1;
    const maxRounds = this.roundsToWin * 2 - 1;
    if (this.p1Wins === this.roundsToWin - 1 && this.p2Wins === this.roundsToWin - 1) return 'FINAL ROUND';
    if (n >= maxRounds) return 'FINAL ROUND';
    return `ROUND ${n}`;
  }

  /* ------------------------------------------------------------------ */
  /* Round flow                                                          */
  /* ------------------------------------------------------------------ */

  startRound() {
    const [a, b] = this.fighters;
    a.resetForRound(430, 1);
    b.resetForRound(850, -1);
    this.projectiles.length = 0;
    this.minions.length = 0;
    this.timer = this.roundTime;
    this.combos = [0, 0];
    this.comboTimers = [0, 0];
    this.phase = MATCH_PHASE.ENTRY;
    this.phaseTime = 0;
    this.koFlash = 0;
    a.playIntro(0.9);
    b.playIntro(0.9);
    this.controllers.forEach((c) => c?.reset?.());
    this.onEvent({ type: 'roundStart', round: this.roundIndex + 1, label: this.displayRoundLabel });
  }

  #beginCountdown() {
    this.phase = MATCH_PHASE.COUNTDOWN;
    this.phaseTime = 0;
    this.countdownIndex = 0;
  }

  showBanner(text, sub = null, duration = 1.6) {
    this.bannerText = { text, sub };
    this.bannerTime = duration;
  }

  /* ------------------------------------------------------------------ */
  /* Update                                                              */
  /* ------------------------------------------------------------------ */

  update(dt, intents) {
    this.phaseTime += dt;
    this.koFlash = Math.max(0, this.koFlash - dt * 2.4);
    if (this.bannerTime > 0) this.bannerTime -= dt;

    for (let i = 0; i < 2; i += 1) {
      if (this.comboTimers[i] > 0) {
        this.comboTimers[i] -= dt;
        if (this.comboTimers[i] <= 0) {
          this.combos[i] = 0;
          this.comboDamage[i] = 0;
        }
      }
    }

    switch (this.phase) {
      case MATCH_PHASE.ENTRY:
        this.#updateFighters(dt, intents, { frozen: true });
        if (this.phaseTime > 1.1) this.#beginCountdown();
        break;

      case MATCH_PHASE.COUNTDOWN: {
        this.#updateFighters(dt, intents, { frozen: true });
        const step = 0.62;
        const idx = Math.floor(this.phaseTime / step);
        if (idx !== this.countdownIndex && idx < this.countdownLabels.length) {
          this.countdownIndex = idx;
          this.onEvent({ type: 'countdown', label: this.countdownLabels[idx] });
        }
        if (this.phaseTime >= step * this.countdownLabels.length) {
          this.phase = MATCH_PHASE.FIGHT;
          this.phaseTime = 0;
          this.onEvent({ type: 'fightStart' });
        }
        break;
      }

      case MATCH_PHASE.FIGHT:
        if (this.timerEnabled) {
          this.timer -= dt;
          if (this.timer <= 0) {
            this.timer = 0;
            this.#timeOver();
          }
        }
        this.#updateFighters(dt, intents, { frozen: false });
        this.#resolveCombat();
        updateProjectiles(this.projectiles, dt);
        this.#updateMinions(dt);
        this.#updateBossPhases();
        this.#checkRoundEnd();
        break;

      case MATCH_PHASE.ROUND_END:
        this.#updateFighters(dt, intents, { frozen: false, noInput: true });
        updateProjectiles(this.projectiles, dt);
        this.#updateMinions(dt);
        if (this.phaseTime > 2.6) {
          if (this.p1Wins >= this.roundsToWin || this.p2Wins >= this.roundsToWin || this.training) {
            this.#endMatch();
          } else {
            this.roundIndex += 1;
            this.startRound();
          }
        }
        break;

      case MATCH_PHASE.MATCH_END:
        this.#updateFighters(dt, intents, { frozen: false, noInput: true });
        break;

      default:
        break;
    }

    this.#updateCamera(dt);
  }

  #updateFighters(dt, intents, { frozen = false, noInput = false } = {}) {
    const [a, b] = this.fighters;
    const neutral = { moveX: 0, jump: false, crouch: false, block: false, lightPunch: false, heavyPunch: false, lightKick: false, heavyKick: false, special: false, ultimate: false, jumpPunch: false };
    const intentA = noInput || frozen ? neutral : intents[0] || neutral;
    const intentB = noInput || frozen ? neutral : intents[1] || neutral;

    a.update(dt, intentA, { opponent: b, match: this });
    b.update(dt, intentB, { opponent: a, match: this });

    // Fighters cannot occupy the same space.
    const minGap = 62;
    const d = b.x - a.x;
    if (Math.abs(d) < minGap) {
      const push = (minGap - Math.abs(d)) / 2;
      const dir = Math.sign(d) || 1;
      a.x -= dir * push;
      b.x += dir * push;
      a.x = clamp(a.x, STAGE_MIN_X, STAGE_MAX_X);
      b.x = clamp(b.x, STAGE_MIN_X, STAGE_MAX_X);
    }
  }

  #updateCamera(dt) {
    if (!this.camera) return;
    const [a, b] = this.fighters;
    const mid = (a.x + b.x) / 2;
    const dist = Math.abs(a.x - b.x);
    const zoom = clamp(1280 / (dist + 620), 0.82, 1.22);
    // Keep the ground line glued to the arena floor: tracking jumps vertically
    // would slide the fighters off the floor the arena draws at GROUND_Y.
    const focusY = this.camera.groundFocus(GROUND_Y);
    this.camera.focus(mid, focusY);
    this.camera.targetZoom = this.zoomOverride || zoom;
    void dt;
  }

  #onLand(fighter, impact) {
    if (!this.particles) return;
    this.particles.dust(fighter.x, GROUND_Y, { count: Math.round(4 + impact * 8), dir: 0 });
    if (impact > 0.6) this.camera?.addShake(2 + impact * 3);
    this.audio?.play('land', { volume: 0.4 + impact * 0.4 });
  }

  /* ------------------------------------------------------------------ */
  /* Combat resolution                                                   */
  /* ------------------------------------------------------------------ */

  #resolveCombat() {
    const pairs = [
      [this.fighters[0], this.fighters[1], 0],
      [this.fighters[1], this.fighters[0], 1]
    ];

    for (const [attacker, defender, index] of pairs) {
      const move = attacker.currentMove;
      if (!move || attacker.movePhase !== 'active') continue;
      if (attacker.hitTargets.has(defender)) continue;

      // Multi-hit moves re-open the hitbox on an interval.
      if (move.multihit) {
        const local = attacker.moveFrame - move.startup;
        if (local % move.multihit.interval !== 0) continue;
      }

      const hitbox = attacker.activeHitbox();
      if (!hitbox) continue;
      const hurtbox = defender.hurtbox();
      if (!rectsOverlap(hitbox, hurtbox)) continue;

      if (defender.invulnFrames > 0) continue;

      const blocked = this.#isBlocking(defender, attacker, move);
      const damageForHit = move.multihit ? move.multihit.damage : move.damage;
      const single = { ...move, damage: damageForHit };
      const result = defender.receiveHit(single, attacker, { blocked, chip: true });
      if (!result) continue;

      if (result.armoured) {
        this.#onArmouredHit(defender, attacker, result);
        continue;
      }

      if (!move.multihit) attacker.hitTargets.add(defender);
      attacker.moveHasHit = true;
      this.#applyHit(attacker, defender, index, single, result, hitbox, blocked);
    }

    this.#resolveProjectiles();
  }

  #isBlocking(defender, attacker, move) {
    if (!defender.grounded) return false;
    if (move.unblockable || move.grab) return false;
    if (!defender.blocking) return false;
    // Lows must be blocked crouching.
    if (move.level === 'low' && !defender.crouching) return false;
    // Must be facing the attacker.
    const towardsAttacker = Math.sign(attacker.x - defender.x) || 1;
    return defender.facing === towardsAttacker;
  }

  #applyHit(attacker, defender, index, move, result, hitbox, blocked) {
    const hitX = clamp((hitbox.x + hitbox.w / 2 + defender.x) / 2, 0, 1280);
    const hitY = hitbox.y + hitbox.h / 2;
    const dir = attacker.x <= defender.x ? 1 : -1;

    this.hits[index] += 1;
    this.totalDamage[index] += result.damage;

    if (!blocked) {
      this.combos[index] += 1;
      this.comboTimers[index] = 1.35;
      this.comboDamage[index] += result.damage;
      this.bestCombo[index] = Math.max(this.bestCombo[index], this.combos[index]);
    } else {
      this.blockedHits[index] += 1;
    }

    // Feedback: particles, hit-stop, shake, audio, damage numbers.
    const power = clamp(move.damage / 12, 0.4, 2.2);
    if (this.particles) {
      if (blocked) this.particles.blockSpark(hitX, hitY, dir);
      else this.particles.hitSpark(hitX, hitY, dir, { power, color: move.effect === 'flame' ? '#ffb057' : move.effect === 'dark' ? '#b98fd8' : '#ffd66b' });
      if (move.effect === 'shockwave') this.particles.dust(attacker.x, GROUND_Y, { count: 12, dir: dir });
      if (move.effect === 'flame') this.particles.embers(hitX, hitY, { count: 10, color: '#ff7a2b' });
      if (settings.get('damageNumbers') && result.damage > 0) {
        this.particles.text(
          `${Math.round(result.damage)}`,
          hitX,
          hitY - 20,
          { color: blocked ? '#9fdcff' : result.damage >= 20 ? '#ffd166' : '#ffffff', size: 22 + power * 8 }
        );
      }
      if (this.combos[index] >= 2 && settings.get('comboDisplay')) {
        this.particles.text(`${this.combos[index]} HIT`, 640 + (index === 0 ? -260 : 260), 240, {
          color: index === 0 ? '#ff6b6b' : '#7cc4ff',
          size: 34,
          life: 0.9
        });
      }
    }

    this.time?.freeze(blocked ? move.hitstop * 0.4 : move.hitstop * (move.type === 'ultimate' ? 1.6 : 1));
    this.camera?.addShake((move.shake || 4) * (blocked ? 0.4 : 1));
    if (move.type === 'ultimate') {
      this.camera?.punchZoom(0.16, 0.35);
      this.koFlash = 1;
      this.superFreeze = 0.35;
    }

    this.audio?.play(blocked ? 'block' : move.type === 'ultimate' ? 'ultimate' : move.type === 'heavy' ? 'heavy' : 'hit', {
      variant: index
    });

    this.controllers[index]?.onLandedHit?.();
    this.controllers[1 - index]?.onTookHit?.();

    this.onEvent({
      type: 'hit',
      attacker: index,
      defender: 1 - index,
      damage: result.damage,
      blocked,
      combo: this.combos[index],
      move: move.name || move.id
    });

    if (result.ko) this.#ko(index);
  }

  #onArmouredHit(defender, attacker, result) {
    const hitX = (attacker.x + defender.x) / 2;
    if (this.particles) {
      this.particles.ring(hitX, GROUND_Y - defender.height * 0.5, { radius: 40, color: '#ffffff', width: 3, life: 0.25 });
      this.particles.text('ARMOUR', hitX, GROUND_Y - defender.height, { color: '#c9d1d9', size: 18, life: 0.6 });
    }
    this.audio?.play('block', { volume: 0.6 });
    attacker.moveHasHit = true;
    void result;
  }

  #resolveProjectiles() {
    for (const proj of this.projectiles) {
      if (proj.dead || proj.hasHit) continue;
      for (let i = 0; i < this.fighters.length; i += 1) {
        const target = this.fighters[i];
        if (target === proj.owner) continue;
        if (target.invulnFrames > 0) continue;
        if (!rectsOverlap(proj.rect(), target.hurtbox())) continue;

        const blocked = this.#isBlocking(target, proj.owner, { level: 'mid' });
        const result = target.receiveHit(
          {
            damage: proj.damage,
            hitstun: proj.hitstun,
            blockstun: 18,
            knockback: proj.knockback,
            meterGain: 8,
            hitstop: 0.06,
            shake: 6,
            level: 'mid'
          },
          proj.owner,
          { blocked, chip: true }
        );
        // Projectiles pop minions out of existence instantly.
        proj.hasHit = true;
        proj.dead = true;
        if (result && !result.armoured) {
          this.#applyHit(
            proj.owner,
            target,
            this.fighters.indexOf(proj.owner),
            { damage: proj.damage, type: 'special', effect: 'energy', hitstop: 0.06, shake: 6, name: 'PROJECTILE' },
            result,
            proj.rect(),
            blocked
          );
        }
        break;
      }

      if (proj.dead) continue;
      for (const minion of this.minions) {
        if (minion.dead) continue;
        if (!rectsOverlap(proj.rect(), minion.hurtbox())) continue;
        minion.takeHit(999, proj.direction, this);
        proj.dead = true;
        if (this.particles) this.particles.hitSpark(minion.x, GROUND_Y - minion.height * 0.6, proj.direction, { power: 1, color: '#9fdcff' });
        this.#removeMinion(minion);
        break;
      }
    }
  }

  #updateMinions(dt) {
    for (let i = this.minions.length - 1; i >= 0; i -= 1) {
      const m = this.minions[i];
      m.update(dt, { match: this });
      if (m.dead || m.expired) {
        this.#removeMinion(m);
        this.minions.splice(i, 1);
      }
    }
  }

  #removeMinion(minion) {
    markSummonSpent(minion.owner, minion.type);
    if (this.particles) this.particles.embers(minion.x, GROUND_Y - minion.height * 0.5, { count: 8, color: minion.def.color });
    this.onEvent({ type: 'summonSpent', summon: minion.type, remaining: remainingSummonTypes(minion.owner).length });
  }

  /** A minion touches the player: chip damage and a knock back. */
  minionAttack(minion) {
    const target = this.fighters[minion.owner === this.fighters[0] ? 1 : 0];
    const dir = Math.sign(target.x - minion.x) || 1;
    const blocked = this.#isBlocking(target, minion.owner, { level: 'mid' });
    const result = target.receiveHit(
      { damage: minion.damage, hitstun: 14, blockstun: 10, knockback: { x: 180, y: 0 }, meterGain: 4, hitstop: 0.04, shake: 3, level: 'mid' },
      minion.owner,
      { blocked, chip: true }
    );
    if (result && !result.armoured) {
      this.#applyHit(
        minion.owner,
        target,
        this.fighters.indexOf(minion.owner),
        { damage: minion.damage, type: 'light', effect: 'spark', hitstop: 0.04, shake: 3, name: minion.def.name },
        result,
        { x: target.x - 30, y: GROUND_Y - 100, w: 60, h: 100 },
        blocked
      );
    }
    void dir;
  }

  onMinionHit(minion, damage) {
    if (this.particles) {
      this.particles.text(`${Math.round(damage)}`, minion.x, GROUND_Y - minion.height, { color: '#ffffff', size: 18, life: 0.6 });
    }
    this.audio?.play('hit', { volume: 0.5 });
  }

  /* ------------------------------------------------------------------ */
  /* Specials that need match-level authority                             */
  /* ------------------------------------------------------------------ */

  spawnProjectile(fighter, move) {
    const def = move.projectile;
    const proj = new Projectile({ owner: fighter, def, direction: fighter.facing });
    this.projectiles.push(proj);
    if (this.particles) {
      this.particles.flash(fighter.x + fighter.facing * 40, GROUND_Y - (def.y || 80), 48, def.color, 0.18);
      this.particles.speedLines(fighter.x, GROUND_Y - 90, { count: 8, color: def.color, length: 70 });
    }
    this.camera?.addShake(3);
    this.audio?.play('special', {});
  }

  /** Gadget calls distractions. A type can only be summoned once per battle. */
  spawnSummons(fighter, count) {
    let spawned = 0;
    for (let i = 0; i < count; i += 1) {
      const type = nextSummonType(fighter);
      if (!type) break;
      // Reserve the type immediately: it cannot be called again even if the
      // minion is destroyed a frame later.
      fighter.summonedTypes.add(type);
      const minion = new Minion({
        type,
        owner: fighter,
        target: this.fighters[fighter === this.fighters[0] ? 1 : 0],
        x: clamp(fighter.x - fighter.facing * rand(150, 90), STAGE_MIN_X + 30, STAGE_MAX_X - 30)
      });
      this.minions.push(minion);
      spawned += 1;
      if (this.particles) {
        this.particles.flash(minion.x, GROUND_Y - 40, 40, minion.def.color, 0.2);
        this.particles.ring(minion.x, GROUND_Y, { radius: 44, color: minion.def.color, width: 3, life: 0.35 });
      }
    }
    if (spawned === 0) {
      // Everything has already been dealt with — Gadget has nothing left.
      this.showBanner('NO DISTRACTIONS LEFT', 'Gadget has run out of things to throw at you', 1.4);
    } else {
      this.onEvent({ type: 'summon', count: spawned, remaining: remainingSummonTypes(fighter).length });
    }
    this.audio?.play('summon', {});
  }

  teleportFighter(fighter, opts = {}) {
    const other = this.fighters[fighter === this.fighters[0] ? 1 : 0];
    const targetX = clamp(other.x + (opts.behind ? -other.facing * (opts.offset || 74) : (opts.offset || 74)), STAGE_MIN_X + 30, STAGE_MAX_X - 30);
    if (this.particles) {
      this.particles.flash(fighter.x, GROUND_Y - fighter.height / 2, 60, fighter.def.color, 0.22);
      this.particles.speedLines(fighter.x, GROUND_Y - 90, { count: 10, color: fighter.def.color, length: 90 });
    }
    if (opts.afterimage) {
      fighter.afterimages.push({ x: fighter.x, y: GROUND_Y, life: 0.4, age: 0, facing: fighter.facing, solved: fighter.solved });
    }
    fighter.x = targetX;
    fighter.facing = other.x >= fighter.x ? 1 : -1;
    if (this.particles) {
      this.particles.flash(fighter.x, GROUND_Y - fighter.height / 2, 60, fighter.def.accent, 0.22);
      this.particles.ring(fighter.x, GROUND_Y, { radius: 50, color: fighter.def.accent, width: 3, life: 0.3 });
    }
    this.audio?.play('teleport', {});
  }

  /* ------------------------------------------------------------------ */
  /* Boss phases                                                         */
  /* ------------------------------------------------------------------ */

  #updateBossPhases() {
    const boss = this.fighters[1];

    // SCHOOL: four years, each harder than the last.
    if (this.bossPhases && this.bossPhaseIndex < this.bossPhases.length - 1) {
      const threshold = 1 - (this.bossPhaseIndex + 1) / this.bossPhases.length;
      if (boss.hpRatio <= threshold) {
        this.bossPhaseIndex += 1;
        const phase = this.bossPhases[this.bossPhaseIndex];
        boss.damageScale = (boss.def.stats.damageScale || 1) * phase.damageScale;
        boss.walkSpeed = boss.def.stats.walkSpeed * phase.speed;
        boss.backSpeed = boss.def.stats.backSpeed * phase.speed;
        boss.meter = Math.min(100, boss.meter + 30);
        boss.flash = 1;
        this.showBanner(phase.name, 'SCHOOL advances a year', 2.2);
        this.camera?.addShake(10);
        this.onEvent({ type: 'phaseChange', phase: this.bossPhaseIndex, name: phase.name });
      }
    }

    // SEIZURE: three phases of instability (no rapid flashing — motion + colour).
    if (this.seizurePhases > 1 && this.seizurePhaseIndex < this.seizurePhases - 1) {
      const threshold = 1 - (this.seizurePhaseIndex + 1) / this.seizurePhases;
      if (boss.hpRatio <= threshold) {
        this.seizurePhaseIndex += 1;
        boss.damageScale = (boss.def.stats.damageScale || 1) * (1 + this.seizurePhaseIndex * 0.12);
        boss.walkSpeed = boss.def.stats.walkSpeed * (1 + this.seizurePhaseIndex * 0.1);
        boss.meter = Math.min(100, boss.meter + 40);
        boss.flash = 1;
        this.showBanner(`PHASE ${this.seizurePhaseIndex + 1}`, 'The signal destabilises further', 2.0);
        this.camera?.addShake(8);
        this.onEvent({ type: 'phaseChange', phase: this.seizurePhaseIndex, name: `PHASE ${this.seizurePhaseIndex + 1}` });
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Round / match end                                                   */
  /* ------------------------------------------------------------------ */

  #checkRoundEnd() {
    if (this.p1.hp <= 0 || this.p2.hp <= 0) {
      const loser = this.p1.hp <= 0 ? this.p1 : this.p2;
      const winnerIdx = this.p1.hp <= 0 ? 1 : 0;
      loser.playDefeat();
      this.fighters[winnerIdx].playVictory();
      this.#ko(winnerIdx);
    }
  }

  #ko(winnerIndex) {
    if (this.phase !== MATCH_PHASE.FIGHT) return;
    this.phase = MATCH_PHASE.ROUND_END;
    this.phaseTime = 0;
    this.koFlash = 1;
    this.roundWinner = winnerIndex;
    if (winnerIndex === 0) this.p1Wins += 1;
    else this.p2Wins += 1;
    this.time?.slow(1.1, 0.25);
    this.camera?.addShake(16);
    this.camera?.punchZoom(0.22, 0.6);
    this.audio?.play('knockdown', {});
    const ko = this.p1.hp <= 0 || this.p2.hp <= 0;
    this.showBanner(ko ? 'K.O.' : 'ROUND OVER', ko ? '' : 'Timeout', 2.0);
    this.onEvent({ type: 'ko', winner: winnerIndex, ko });
    if (this.particles) {
      const loser = this.fighters[1 - winnerIndex];
      this.particles.hitSpark(loser.x, GROUND_Y - loser.height * 0.5, winnerIndex === 0 ? 1 : -1, { power: 2, color: '#ffffff', count: 26 });
    }
  }

  #timeOver() {
    const p1Ratio = this.p1.hpRatio;
    const p2Ratio = this.p2.hpRatio;
    if (Math.abs(p1Ratio - p2Ratio) < 0.001) {
      // Double KO: both fighters keep the round.
      this.p1Wins += 1;
      this.p2Wins += 1;
      this.roundWinner = null;
    } else {
      this.roundWinner = p1Ratio > p2Ratio ? 0 : 1;
      if (this.roundWinner === 0) this.p1Wins += 1;
      else this.p2Wins += 1;
    }
    this.phase = MATCH_PHASE.ROUND_END;
    this.phaseTime = 0;
    this.showBanner('TIME OVER', null, 2.0);
    this.onEvent({ type: 'timeOver', winner: this.roundWinner });
  }

  #endMatch() {
    this.phase = MATCH_PHASE.MATCH_END;
    this.phaseTime = 0;
    this.finished = true;
    this.winner = this.p1Wins > this.p2Wins ? 0 : this.p2Wins > this.p1Wins ? 1 : null;
    this.onEvent({ type: 'matchEnd', winner: this.winner, p1Wins: this.p1Wins, p2Wins: this.p2Wins });
  }

  /** Snapshot used by the results screen and the save system. */
  results() {
    return {
      winner: this.winner,
      p1Wins: this.p1Wins,
      p2Wins: this.p2Wins,
      rounds: this.roundIndex + 1,
      bestCombo: this.bestCombo[0],
      damageDealt: Math.round(this.totalDamage[0]),
      damageTaken: Math.round(this.totalDamage[1]),
      hits: this.hits[0],
      blocked: this.blockedHits[0],
      timeRemaining: Math.round(this.timer)
    };
  }

  /** Reset the training dummy without ending the session. */
  resetTraining() {
    const [a, b] = this.fighters;
    b.hp = b.maxHp;
    b.x = 850;
    b.y = 0;
    b.vx = 0;
    b.vy = 0;
    b.state = 'idle';
    b.hitstun = 0;
    b.blockstun = 0;
    b.knockdownTimer = 0;
    b.comboHits = 0;
    b.playClip('idle', 0);
    a.hp = a.maxHp;
    a.meter = 0;
    a.x = 430;
    a.y = 0;
    a.vx = 0;
    a.vy = 0;
    a.state = 'idle';
    a.hitstun = 0;
    a.playClip('idle', 0);
    this.projectiles.length = 0;
    this.minions.length = 0;
    this.combos = [0, 0];
    this.comboTimers = [0, 0];
    this.bestCombo = [0, 0];
    this.totalDamage = [0, 0];
    this.hits = [0, 0];
  }
}

export function createTrainingMatch(opts = {}) {
  const match = new Match({
    mode: 'training',
    p2Id: 'training-dummy',
    training: true,
    aiEnabled: [false, false],
    difficultyId: 'normal',
    ...opts
  });
  match.fighters[1].maxHp = 100000;
  match.fighters[1].hp = 100000;
  match.fighters[1].def = { ...match.fighters[1].def, name: 'TRAINING DUMMY' };
  match.fighters[1].displayName = 'TRAINING DUMMY';
  return match;
}

void CAMPAIGN_ROUNDS;
void damp;
void chance;
