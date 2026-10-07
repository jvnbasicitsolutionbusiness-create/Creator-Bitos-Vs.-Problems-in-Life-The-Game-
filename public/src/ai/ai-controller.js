/**
 * ai-controller.js — a real fighting-game opponent.
 *
 * The AI is a small behaviour tree over these states:
 *   IDLE  APPROACH  RETREAT  ATTACK  COMBO  BLOCK  DODGE  JUMP
 *   SPECIAL  RECOVER  PRESSURE  LOW_HEALTH  DEFEATED
 *
 * It perceives the opponent through a deliberate reaction delay, so higher
 * difficulties are genuinely sharper rather than simply dealing more damage.
 */
import { personalityFor, PHASE_MODIFIERS } from './personalities.js';
import { clamp, chance, rand, pick } from '../core/utils.js';

export const AI_STATES = [
  'IDLE', 'APPROACH', 'RETREAT', 'ATTACK', 'COMBO', 'BLOCK', 'DODGE',
  'JUMP', 'SPECIAL', 'RECOVER', 'PRESSURE', 'LOW_HEALTH', 'DEFEATED'
];

export class AIController {
  constructor({ fighter, opponent, difficulty, roundNumber = 1, phaseIndex = 0 }) {
    this.fighter = fighter;
    this.opponent = opponent;
    this.difficulty = difficulty;
    this.personality = { ...personalityFor(fighter.characterId) };
    this.phase = PHASE_MODIFIERS[clamp(phaseIndex, 0, PHASE_MODIFIERS.length - 1)];
    this.state = 'IDLE';
    this.stateTime = 0;
    this.decisionTimer = 0;
    this.reactionQueue = [];
    this.comboQueue = [];
    this.comboTimer = 0;
    this.blockHold = 0;
    this.aggressionBoost = 0;
    this.lastOpponentState = 'idle';
    this.lastPerceivedAttacking = false;
    this.blocksStarted = 0;
    this.attacksStarted = 0;
    this.jumpCooldown = 0;
    this.lastDistance = 999;
    this.notes = [];
    this.enabled = true;
    void roundNumber;
  }

  get dist() {
    return Math.abs(this.opponent.x - this.fighter.x);
  }

  get towards() {
    return Math.sign(this.opponent.x - this.fighter.x) || 1;
  }

  get lowHealth() {
    return this.fighter.hpRatio < 0.3;
  }

  /* ------------------------------------------------------------------ */

  update(dt) {
    const f = this.fighter;
    const o = this.opponent;
    this.stateTime += dt;
    this.decisionTimer -= dt;
    this.comboTimer -= dt;
    this.jumpCooldown -= dt;

    const intent = {
      moveX: 0,
      jump: false,
      crouch: false,
      block: false,
      lightPunch: false,
      heavyPunch: false,
      lightKick: false,
      heavyKick: false,
      special: false,
      ultimate: false
    };

    if (!this.enabled || f.state === 'defeat' || f.state === 'victory') {
      this.state = f.state === 'defeat' ? 'DEFEATED' : 'IDLE';
      return intent;
    }
    if (f.state === 'knockdown' || f.state === 'getup') {
      this.state = 'RECOVER';
      this.comboQueue.length = 0;
      return intent;
    }

    /* ------------------------------- perception (delayed) ------------ */
    const reaction = Math.max(0, (this.difficulty.reactionFrames + this.personality.reactionBonus) / 60);
    this.reactionQueue.push({
      t: 0,
      snapshot: {
        opponentAttacking: o.isAttacking,
        opponentAirborne: o.isAirborne,
        opponentBlocking: o.blocking,
        opponentX: o.x,
        opponentHp: o.hpRatio,
        opponentStunned: o.hitstun > 0 || o.blockstun > 0
      }
    });
    for (const entry of this.reactionQueue) entry.t += dt;
    while (this.reactionQueue.length && this.reactionQueue[0].t >= reaction) {
      this.perceived = this.reactionQueue.shift().snapshot;
    }
    if (!this.perceived) this.perceived = this.reactionQueue[0]?.snapshot || {
      opponentAttacking: false, opponentAirborne: false, opponentBlocking: false,
      opponentX: o.x, opponentHp: 1, opponentStunned: false
    };
    const p = this.perceived;

    /* ------------------------------- reactive decisions -------------- */
    const d = this.difficulty;
    const per = this.personality;
    const dist = this.dist;

    // 1. A NEW incoming attack -> decide once whether to block or reversal.
    //    (Edge-triggered: rolling per frame would make high difficulties block
    //    constantly and therefore attack less, which is the opposite of "smart".)
    const attackStarted = p.opponentAttacking && !this.lastPerceivedAttacking;
    this.lastPerceivedAttacking = p.opponentAttacking;
    if (attackStarted && dist < 300 && f.canAct) {
      const blockOdds = clamp(per.blockTendency * (0.35 + d.blockChance), 0, 0.92);
      if (chance(blockOdds)) {
        this.state = 'BLOCK';
        this.blockHold = rand(0.42, 0.14);
        this.blocksStarted += 1;
      } else if (f.meter >= 100 && chance(0.3)) {
        this.state = 'SPECIAL';
        intent.ultimate = true;
      }
    }

    // 2. Airborne opponent -> anti-air.
    if (p.opponentAirborne && dist < 200 && chance(per.antiAir * d.antiAirChance * dt * 12) && f.canAct) {
      this.state = 'ATTACK';
      this.comboQueue = ['heavyPunch'];
      this.comboTimer = 0.1;
    }

    // 3. Opponent just recovered -> apply pressure.
    if (p.opponentStunned && dist < 220 && f.canAct && chance(per.punishFocus * d.punishWindow * dt * 14)) {
      this.state = 'PRESSURE';
      this.comboQueue = ['lightPunch', 'lightPunch', pick(['heavyKick', 'heavyPunch'])].slice(0, 1 + Math.round(per.comboLength * d.comboChance));
      this.comboTimer = 0.05;
    }

    // 4. Hold block for the decided window.
    if (this.blockHold > 0) {
      this.blockHold -= dt;
      intent.block = true;
      intent.moveX = -this.towards * 0.4;
      this.state = 'BLOCK';
      if (dist > 320) this.blockHold = 0;
      return intent;
    }

    // 5. Blocked -> look for a grab / mixup / back off.
    if (p.opponentBlocking && dist < 130 && f.canAct && this.decisionTimer <= 0) {
      this.decisionTimer = rand(0.7, 0.25);
      const roll = Math.random();
      if (roll < per.mixup * d.mixupRate) {
        this.state = 'SPECIAL';
        intent.special = true;
      } else if (roll < per.mixup * d.mixupRate + per.backdashLove) {
        this.state = 'RETREAT';
      }
    }

    /* ------------------------------- planned decisions --------------- */
    if (this.decisionTimer <= 0) {
      this.decisionTimer = rand(0.5, 0.12) * (1.4 - per.patience);
      this.#chooseState(per, d, dist, p);
    }

    /* ------------------------------- combo execution ----------------- */
    if (this.comboQueue.length && f.canAct && this.comboTimer <= 0) {
      const next = this.comboQueue.shift();
      this.attacksStarted += 1;
      intent[next] = true;
      this.comboTimer = rand(0.22, 0.08);
      this.state = 'COMBO';
      return intent;
    }

    /* ------------------------------- state behaviour ----------------- */
    const aggression = clamp(
      per.aggression * this.phase.aggression * d.aggression + this.aggressionBoost + (this.lowHealth ? 0.18 : 0),
      0,
      1.4
    );

    switch (this.state) {
      case 'APPROACH':
        intent.moveX = this.towards;
        if (dist <= per.preferredRange) {
          if (chance(aggression)) {
            this.state = 'ATTACK';
            this.#queueCombo(per, d, dist);
          } else this.state = 'IDLE';
        } else if (per.projectileLove > 0.3 && dist > 420 && chance(per.projectileLove * dt * 3) && f.meter >= 25) {
          intent.special = true;
          this.state = 'SPECIAL';
        }
        break;

      case 'RETREAT':
        intent.moveX = -this.towards;
        if (dist > 300 || this.stateTime > 0.8) this.state = 'IDLE';
        break;

      case 'PRESSURE':
      case 'ATTACK':
        intent.moveX = dist > per.preferredRange ? this.towards : 0;
        if (!this.comboQueue.length && f.canAct) this.#queueCombo(per, d, dist);
        if (dist > per.preferredRange + 120) this.state = 'APPROACH';
        break;

      case 'JUMP':
        if (f.grounded && this.jumpCooldown <= 0) {
          intent.jump = true;
          intent.moveX = this.towards;
          this.jumpCooldown = rand(2.4, 1.1);
        }
        if (!f.grounded) {
          intent.moveX = this.towards;
          if (dist < 130 && chance(0.4)) {
            intent.heavyKick = true;
            intent.jumpPunch = true;
          }
        } else this.state = 'IDLE';
        break;

      case 'SPECIAL':
        if (f.meter >= 100 && chance(0.55 * d.specialChance + 0.2)) intent.ultimate = true;
        else if (f.meter >= 25) intent.special = true;
        else this.state = 'IDLE';
        if (this.stateTime > 0.4) this.state = 'IDLE';
        break;

      case 'LOW_HEALTH':
        if (per.lowHealthMode === 'turtle') {
          intent.block = dist < 220;
          intent.moveX = dist < 200 ? -this.towards : 0;
          if (dist < 140 && f.meter >= 25 && chance(0.05)) intent.special = true;
        } else {
          intent.moveX = this.towards;
          if (dist < 160 && chance(0.35)) this.#queueCombo(per, d, dist);
          if (f.meter >= 100) intent.ultimate = true;
        }
        break;

      case 'DODGE':
        intent.moveX = -this.towards;
        if (f.grounded && this.stateTime < 0.1) intent.jump = chance(0.4);
        if (this.stateTime > 0.35) this.state = 'IDLE';
        break;

      case 'BLOCK':
        intent.block = true;
        break;

      case 'IDLE':
      default:
        // Slight spacing drift keeps the opponent from looking frozen.
        if (dist > per.preferredRange + 60) intent.moveX = this.towards * 0.7;
        else if (dist < per.preferredRange - 70) intent.moveX = -this.towards * 0.5;
        break;
    }

    // Low health switches the personality mode once.
    if (this.lowHealth && this.state !== 'LOW_HEALTH' && chance(dt * 2)) {
      this.state = 'LOW_HEALTH';
      this.stateTime = 0;
    }

    // Crouch occasionally to avoid highs and to bait.
    if (chance(dt * 0.6 * per.patience) && dist > 200) intent.crouch = true;

    return intent;
  }

  /* ------------------------------------------------------------------ */

  #chooseState(per, d, dist, perceived) {
    if (this.lowHealth && chance(0.4)) {
      this.state = 'LOW_HEALTH';
      this.stateTime = 0;
      return;
    }
    const aggression = clamp(per.aggression * this.phase.aggression * d.aggression, 0, 1.3);
    const roll = Math.random();

    if (dist > per.preferredRange + 140) {
      this.state = 'APPROACH';
    } else if (dist < 70 && roll < 0.2 + per.backdashLove) {
      this.state = roll < 0.1 + per.backdashLove * 0.5 ? 'DODGE' : 'RETREAT';
    } else if (roll < aggression * 0.5) {
      this.state = 'ATTACK';
      this.#queueCombo(per, d, dist);
    } else if (roll < aggression * 0.5 + per.specialLove * d.specialChance * 0.4 && this.fighter.meter >= 25) {
      this.state = 'SPECIAL';
      this.stateTime = 0;
    } else if (roll < aggression * 0.5 + 0.25 + per.jumpiness * this.phase.jumpiness) {
      this.state = 'JUMP';
      this.stateTime = 0;
    } else if (perceived.opponentAttacking && roll < per.blockTendency + 0.2) {
      this.state = 'BLOCK';
      this.blockHold = rand(0.4, 0.15);
    } else {
      this.state = chance(0.5) ? 'IDLE' : 'APPROACH';
    }
  }

  #queueCombo(per, d, dist) {
    const f = this.fighter;
    const strings = [];
    if (dist < 110) {
      strings.push(['lightPunch', 'lightPunch', 'heavyPunch']);
      strings.push(['lightKick', 'heavyKick']);
      strings.push(['lightPunch', 'lightKick', 'heavyKick']);
      strings.push(['crouchPunch', 'sweep']);
    } else if (dist < 190) {
      strings.push(['lightKick', 'heavyPunch']);
      strings.push(['heavyPunch']);
      strings.push(['heavyKick']);
    } else {
      strings.push(['heavyKick']);
    }
    const chosen = pick(strings);
    const length = clamp(1 + Math.round(per.comboLength * d.comboChance), 1, chosen.length);
    this.comboQueue = chosen.slice(0, length).filter((id) => f.moveset[id]);
    this.comboTimer = 0;
  }

  /** Called when the AI lands a hit: reward it by continuing to press. */
  onLandedHit() {
    this.aggressionBoost = Math.min(0.5, this.aggressionBoost + 0.06);
    if (this.comboQueue.length === 0 && chance(0.6)) {
      this.comboQueue = ['lightPunch', 'heavyPunch'];
      this.comboTimer = 0.04;
    }
  }

  onTookHit() {
    this.aggressionBoost = Math.max(0, this.aggressionBoost - 0.1);
    this.comboQueue.length = 0;
    if (chance(0.5)) {
      this.state = 'BLOCK';
      this.blockHold = rand(0.5, 0.2);
    }
  }

  reset() {
    this.lastPerceivedAttacking = false;
    this.state = 'IDLE';
    this.stateTime = 0;
    this.decisionTimer = 0;
    this.comboQueue.length = 0;
    this.reactionQueue.length = 0;
    this.perceived = null;
    this.aggressionBoost = 0;
    this.blockHold = 0;
  }
}

export function createNeutralIntent() {
  return {
    moveX: 0, jump: false, crouch: false, block: false,
    lightPunch: false, heavyPunch: false, lightKick: false, heavyKick: false,
    special: false, ultimate: false
  };
}
