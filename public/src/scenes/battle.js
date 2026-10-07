/**
 * battle.js — a full fighting-game encounter.
 *
 * Sequence (spec section 6):
 *   arena load → camera establish → Bitos enters → enemy enters →
 *   introduction animations → dialogue → HUD → "ROUND n" → READY 3 2 1 FIGHT!
 *   → combat → K.O. → victory/defeat animation → results → progression
 *
 * Also drives Training (with its own dummy options) and local Versus matches.
 */
import { Match, MATCH_PHASE, createTrainingMatch } from '../combat/match.js';
import { AIController } from '../ai/ai-controller.js';
import { GROUND_Y, STAGE_MIN_X, STAGE_MAX_X } from '../combat/fighter.js';
import { drawProjectiles } from '../combat/projectiles.js';
import { getCharacter, CAMPAIGN_ROUNDS } from '../characters/roster.js';
import { getArena } from '../arenas/arenas.js';
import { drawStickman, drawShadow, drawTrail } from '../animation/stickman-renderer.js';
import { Hud } from '../ui/hud.js';
import { Button, panel } from '../ui/widgets.js';
import { drawText, roundRect } from '../core/canvas.js';
import { gameState } from '../core/state.js';
import { input } from '../core/input.js';
import { TRANSITIONS } from '../core/scene-manager.js';
import { clamp, lerp, damp, rgba, rand, chance, TAU, easeOutCubic } from '../core/utils.js';
import { settings } from '../config/settings.js';
import { audio } from '../audio/audio.js';

const PHASE = {
  ESTABLISH: 'establish',
  ENTRANCE: 'entrance',
  DIALOGUE: 'dialogue',
  ROUND_CARD: 'roundCard',
  COUNTDOWN: 'countdown',
  FIGHT: 'fight',
  FINISHED: 'finished'
};

export class BattleScene {
  constructor({ audio: audioEngine, particles, camera, time: timeKeeper }) {
    this.audio = audioEngine;
    this.particles = particles;
    this.camera = camera;
    this.time = timeKeeper;
    this.hud = new Hud();
    this.sceneTime = 0;
    this.phase = PHASE.ESTABLISH;
    this.phaseTime = 0;
    this.match = null;
    this.pause = null;
    this.banner = null;
    this.bannerTime = 0;
    this.dialogue = null;
    this.result = null;
    this.trainingOptions = null;
    this.showHitboxes = false;
    this.pauseButtons = [];
    this.trainingButtons = [];
    this.entrance = [null, null];
  }

  /* ------------------------------------------------------------------ */

  enter(params = {}) {
    document.body.classList.add('game-active');
    this.sceneTime = 0;
    this.phaseTime = 0;
    this.phase = PHASE.ESTABLISH;
    this.result = null;
    this.banner = null;
    this.dialogue = null;
    this.mode = params.mode || 'campaign';
    this.roundNumber = params.roundNumber || 1;
    this.enemyId = params.enemyId || CAMPAIGN_ROUNDS[0];
    this.p1Id = params.p1Id || 'creator-bitos';
    this.p2Id = params.p2Id || this.enemyId;
    this.training = this.mode === 'training';
    this.versus = this.mode === 'versus';
    this.showHitboxes = false;

    const enemyDef = getCharacter(this.p2Id);
    this.arenaId = this.training ? 'dojo' : enemyDef.arena || 'rooftop';

    this.match = this.training
      ? createTrainingMatch({
        p1Id: this.p1Id,
        camera: this.camera,
        particles: this.particles,
        time: this.time,
        audio: this.audio,
        onEvent: (e) => this.#onMatchEvent(e)
      })
      : new Match({
        mode: this.mode,
        p1Id: this.p1Id,
        p2Id: this.p2Id,
        roundNumber: this.roundNumber,
        totalRounds: CAMPAIGN_ROUNDS.length,
        camera: this.camera,
        particles: this.particles,
        time: this.time,
        audio: this.audio,
        aiEnabled: [false, !this.versus],
        onEvent: (e) => this.#onMatchEvent(e)
      });

    // Controllers
    this.ai = [null, null];
    if (!this.versus && !this.training) {
      this.ai[1] = new AIController({
        fighter: this.match.p2,
        opponent: this.match.p1,
        difficulty: this.match.difficulty,
        roundNumber: this.roundNumber
      });
    } else if (this.training && params.dummyAi) {
      this.ai[1] = new AIController({
        fighter: this.match.p2,
        opponent: this.match.p1,
        difficulty: this.match.difficulty,
        roundNumber: 1
      });
    }
    this.match.controllers = this.ai;

    this.camera?.reset({ x: 640, y: this.camera.groundFocus(GROUND_Y), zoom: 1 });
    // The intro sweeps freely across the arena; the fight is clamped to the stage.
    this.camera.bounds = null;

    this.match.startRound();
    this.hud.reset(this.match.fighters);

    this.audio?.playMusic(this.mode === 'training' ? 'training' : this.roundNumber >= 9 ? 'boss' : this.versus ? 'versus' : 'campaign');

    // Pause / training widgets
    this.#buildPauseButtons();
    this.#buildTrainingButtons();

    this.entrance = [
      { from: -260, to: 430, t: 0 },
      { from: 1540, to: 850, t: 0 }
    ];
  }

  exit() {
    document.body.classList.remove('game-active');
    this.particles?.clear();
    this.time?.reset();
  }

  #buildPauseButtons() {
    this.pauseButtons = [
      new Button({ x: 460, y: 300, w: 360, h: 52, label: 'RESUME', accent: '#ff2b3c', onClick: () => { this.pause = null; } }),
      new Button({ x: 460, y: 364, w: 360, h: 52, label: 'RESTART ROUND', accent: '#3a2b30', onClick: () => { this.pause = null; this.match.startRound(); this.hud.reset(this.match.fighters); } }),
      new Button({
        x: 460, y: 428, w: 360, h: 52, label: 'QUIT', accent: '#3a2b30',
        onClick: () => this.manager.change(this.training ? 'training' : 'campaign', { transition: TRANSITIONS.BLACK, duration: 0.7 })
      })
    ];
  }

  #buildTrainingButtons() {
    const y = 668;
    this.trainingButtons = [
      new Button({ x: 20, y, w: 150, h: 34, label: 'RESET', accent: '#3a2b30', size: 15, onClick: () => { this.match.resetTraining(); this.hud.reset(this.match.fighters); } }),
      new Button({ x: 178, y, w: 190, h: 34, label: 'DUMMY: STAND', accent: '#3a2b30', size: 15, onClick: (b) => this.#cycleDummy(b) }),
      new Button({ x: 376, y, w: 210, h: 34, label: 'HITBOXES: OFF', accent: '#3a2b30', size: 15, onClick: (b) => { this.showHitboxes = !this.showHitboxes; b.setLabel(`HITBOXES: ${this.showHitboxes ? 'ON' : 'OFF'}`); audio.ui('click'); } }),
      new Button({ x: 594, y, w: 170, h: 34, label: 'FULL METER', accent: '#3a2b30', size: 15, onClick: () => { this.match.p1.meter = 100; audio.ui('click'); } }),
      new Button({ x: 772, y, w: 190, h: 34, label: 'BACK TO MENU', accent: '#3a2b30', size: 15, onClick: () => this.manager.change('menu', { transition: TRANSITIONS.BLACK, duration: 0.6 }) })
    ];
    this.dummyMode = 0;
  }

  #cycleDummy(button) {
    const modes = ['STAND', 'BLOCK', 'CROUCH', 'WALK'];
    this.dummyMode = (this.dummyMode + 1) % modes.length;
    button.setLabel(`DUMMY: ${modes[this.dummyMode]}`);
    audio.ui('click');
  }

  /* ------------------------------------------------------------------ */

  update(dt, pointer) {
    this.sceneTime += dt;
    this.phaseTime += dt;

    if (this.pause) {
      for (const b of this.pauseButtons) b.update(dt, pointer);
      if (input.p1().wasPressed('pause') || input.p1().wasPressed('back')) this.pause = null;
      return;
    }

    if (input.p1().wasPressed('pause') && this.phase === PHASE.FIGHT) {
      this.pause = 'menu';
      audio.ui('click');
    }

    if (this.training) {
      for (const b of this.trainingButtons) b.update(dt, pointer);
    }

    const sim = this.time ? this.time.step(dt) : 1;
    const sdt = dt * sim;

    switch (this.phase) {
      case PHASE.ESTABLISH:
        // Camera sweeps the arena before the fighters arrive.
        this.camera.bounds = null;
        this.camera.focus(lerp(280, 1000, clamp(this.phaseTime / 1.6, 0, 1)), this.camera.groundFocus(GROUND_Y));
        this.camera.targetZoom = lerp(1.18, 1, clamp(this.phaseTime / 1.6, 0, 1));
        if (this.phaseTime > 1.5) this.#setPhase(PHASE.ENTRANCE);
        break;

      case PHASE.ENTRANCE: {
        const t = clamp(this.phaseTime / 1.15, 0, 1);
        const e = easeOutCubic(t);
        this.match.fighters[0].x = lerp(this.entrance[0].from, this.entrance[0].to, e);
        this.match.fighters[1].x = lerp(this.entrance[1].from, this.entrance[1].to, e);
        this.camera.bounds = null;
        this.camera.focus(640, this.camera.groundFocus(GROUND_Y));
        this.match.update(sdt, [blankIntent(), blankIntent()]);
        if (this.phaseTime > 1.25) this.#setPhase(PHASE.DIALOGUE);
        break;
      }

      case PHASE.DIALOGUE: {
        this.match.update(sdt, [blankIntent(), blankIntent()]);
        if (this.phaseTime > (this.dialogue ? 2.6 : 0.7)) this.#setPhase(PHASE.ROUND_CARD);
        break;
      }

      case PHASE.ROUND_CARD:
        this.match.update(sdt, [blankIntent(), blankIntent()]);
        if (this.phaseTime > 1.3) this.#setPhase(PHASE.COUNTDOWN);
        break;

      case PHASE.COUNTDOWN: {
        // The Match owns the READY/3/2/1/FIGHT sequence once we hand control over.
        this.match.update(sdt, [blankIntent(), blankIntent()]);
        if (this.match.phase === MATCH_PHASE.FIGHT) this.#setPhase(PHASE.FIGHT);
        break;
      }

      case PHASE.FIGHT: {
        this.camera.bounds = { minX: STAGE_MIN_X, maxX: STAGE_MAX_X };
        const intents = this.#gatherIntents();
        this.match.update(sdt, intents);
        this.hud.update(sdt, this.match.fighters);
        if (this.match.phase === MATCH_PHASE.MATCH_END) this.#finish();
        break;
      }

      case PHASE.FINISHED:
        this.match.update(sdt, [blankIntent(), blankIntent()]);
        break;

      default:
        break;
    }

    this.particles?.update(sdt);
    this.camera?.update(sdt);
    if (this.bannerTime > 0) this.bannerTime -= dt;
  }

  #setPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
    if (phase === PHASE.DIALOGUE) {
      const enemy = getCharacter(this.p2Id);
      const lines = enemy.intro || [];
      this.dialogue = lines.length
        ? { speaker: enemy.name, text: lines[Math.floor(rand(lines.length))], color: enemy.color }
        : null;
      if (this.dialogue) this.audio?.voice('attack', { volume: 0.7, pitch: enemy.id === 'suffering' ? 0.7 : 1 });
    }
    if (phase === PHASE.ROUND_CARD) {
      this.audio?.play('special', { volume: 0.5 });
    }
  }

  #gatherIntents() {
    const [p1, p2] = this.match.fighters;
    const a = deviceIntent(0);
    // Fighting-game convention: holding away from the opponent also blocks.
    if (!a.block && !a.crouch && a.moveX !== 0) {
      const away = Math.sign(a.moveX) !== Math.sign(p2.x - p1.x || 1);
      if (away) a.block = true;
    }

    let b;
    if (this.versus) {
      b = deviceIntent(1);
      if (!b.block && !b.crouch && b.moveX !== 0) {
        const away = Math.sign(b.moveX) !== Math.sign(p1.x - p2.x || 1);
        if (away) b.block = true;
      }
    } else if (this.training) {
      b = this.#dummyIntent();
    } else {
      b = this.ai[1] ? this.ai[1].update(1 / 60) : blankIntent();
    }
    return [a, b];
  }

  #dummyIntent() {
    const intent = blankIntent();
    switch (this.dummyMode) {
      case 1: intent.block = true; break;
      case 2: intent.crouch = true; break;
      case 3:
        // Walks back and forth so movement and spacing can be practised.
        intent.moveX = Math.sin(this.sceneTime * 0.8) > 0 ? 1 : -1;
        break;
      default: break;
    }
    return intent;
  }

  /* ------------------------------------------------------------------ */

  #onMatchEvent(event) {
    switch (event.type) {
      case 'countdown':
        this.audio?.play('countdown', { volume: 0.9 });
        this.banner = event.label;
        this.bannerTime = 0.6;
        break;
      case 'fightStart':
        this.audio?.play('fightStart', { volume: 1 });
        this.banner = 'FIGHT!';
        this.bannerTime = 0.8;
        this.camera?.addShake(5);
        break;
      case 'ko':
        this.banner = event.ko ? 'K.O.' : 'ROUND OVER';
        this.bannerTime = 1.8;
        break;
      case 'timeOver':
        this.banner = 'TIME OVER';
        this.bannerTime = 1.8;
        break;
      case 'roundStart':
        this.banner = null;
        this.hud.reset(this.match.fighters);
        break;
      case 'phaseChange':
        this.banner = event.name;
        this.bannerTime = 2.0;
        this.camera?.addShake(12);
        this.audio?.play('ultimate', { volume: 0.6 });
        break;
      case 'summon':
        this.banner = `DISTRACTION ×${event.count}`;
        this.bannerTime = 1.2;
        break;
      default:
        break;
    }
  }

  #finish() {
    if (this.result) return;
    this.phase = PHASE.FINISHED;
    const results = this.match.results();
    this.result = { victory: this.match.winner === 0, results };

    if (this.training) {
      this.banner = 'TRAINING';
      this.bannerTime = 1.2;
      return;
    }

    if (this.result.victory) {
      this.audio?.play('victory');
      this.audio?.voice('victory', { volume: 1 });
    } else {
      this.audio?.play('defeat');
      this.audio?.voice('defeat', { volume: 0.9 });
    }

    // Campaign progression is written through the state layer (and saved).
    let unlocked = [];
    let multiplayerUnlocked = false;
    if (this.mode === 'campaign' && this.result.victory) {
      const outcome = gameState.completeRound(this.enemyId, { results });
      unlocked = outcome.unlocked;
      multiplayerUnlocked = outcome.multiplayerUnlocked;
    } else if (this.mode === 'campaign') {
      gameState.recordDefeat(this.enemyId, results);
    }

    this.outro = 0;
    this.pendingTransition = {
      victory: this.result.victory,
      enemyId: this.enemyId,
      roundNumber: this.roundNumber,
      results,
      unlocked,
      multiplayerUnlocked,
      mode: this.mode
    };
  }

  /* ------------------------------------------------------------------ */

  draw(ctx, dt) {
    const t = this.sceneTime;
    const arena = getArena(this.arenaId);

    // Arena (screen space, with parallax driven by the camera)
    ctx.save();
    arena.draw(ctx, t, this.camera, {
      phase: this.match?.bossPhaseIndex ?? 0
    });
    ctx.restore();

    // Cinematic letterbox during the intro beats
    const cinematic = this.phase !== PHASE.FIGHT && this.phase !== PHASE.FINISHED;
    const barTarget = cinematic ? 64 : 0;
    this.barCurrent = damp(this.barCurrent ?? 0, barTarget, 6, dt);

    this.camera?.apply(ctx, (c) => this.#drawWorld(c, t));

    if (this.barCurrent > 1) {
      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 1280, this.barCurrent);
      ctx.fillRect(0, 720 - this.barCurrent, 1280, this.barCurrent);
      ctx.restore();
    }

    /* ------------------------------------------------------------- HUD */
    const showHud = this.phase === PHASE.COUNTDOWN || this.phase === PHASE.FIGHT || this.phase === PHASE.FINISHED;
    if (showHud) {
      this.hud.draw(ctx, this.match, { showTimer: !this.training });
      if (settings.get('comboDisplay')) {
        if (this.match.combos[0] > 1) this.hud.drawCombo(ctx, 0, this.match.combos[0], this.match.comboDamage[0]);
        if (this.match.combos[1] > 1) this.hud.drawCombo(ctx, 1, this.match.combos[1], this.match.comboDamage[1]);
      }
    }

    /* --------------------------------------------------- round card */
    if (this.phase === PHASE.ROUND_CARD) {
      const k = clamp(this.phaseTime / 0.4, 0, 1);
      ctx.save();
      ctx.globalAlpha = k;
      const slide = (1 - easeOutCubic(k)) * 200;
      drawText(ctx, this.match.displayRoundLabel, 640 - slide, 330, {
        size: 76, weight: '800', color: '#ffffff', align: 'center', baseline: 'middle', spacing: 10,
        shadow: { color: rgba('#ff2b3c', 0.9), blur: 34 }
      });
      drawText(ctx, getCharacter(this.p2Id).name, 640 + slide, 396, {
        size: 26, weight: '800', color: getCharacter(this.p2Id).color, align: 'center', spacing: 6
      });
      ctx.restore();
    }

    /* ------------------------------------------------------- dialogue */
    if (this.phase === PHASE.DIALOGUE && this.dialogue && settings.get('subtitles')) {
      this.#drawDialogue(ctx, dt);
    }

    /* ---------------------------------------------------------- banner */
    if (this.banner && this.bannerTime > 0) {
      const k = clamp(this.bannerTime / 0.5, 0, 1);
      const pop = this.bannerTime > 0.4 ? 1.25 - (this.bannerTime - 0.4) * 0.6 : 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k);
      this.hud.drawCentreMessage(ctx, this.banner, { scaleIn: pop, color: this.banner === 'K.O.' ? '#ffd166' : '#ffffff' });
      ctx.restore();
    }

    /* ------------------------------------------------- super freelance */
    if (this.match?.koFlash > 0.01 && settings.flashScale > 0.2) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.match.koFlash * 0.45 * settings.flashScale;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1280, 720);
      ctx.restore();
    }

    /* ------------------------------------------------ training overlay */
    if (this.training) this.#drawTrainingOverlay(ctx, dt);

    /* ---------------------------------------------------------- pause */
    if (this.pause) this.#drawPause(ctx, dt);

    /* ----------------------------------------------- results handoff */
    if (this.pendingTransition) {
      this.outro += dt;
      if (this.outro > 2.6) {
        const payload = this.pendingTransition;
        this.pendingTransition = null;
        this.manager.change('results', { params: payload, transition: TRANSITIONS.BLACK, duration: 0.9 });
      }
    }
  }

  #drawWorld(ctx, t) {
    const match = this.match;
    if (!match) return;

    // Ground shadow band (grounds the fighters in the arena)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(STAGE_MIN_X - 200, GROUND_Y, (STAGE_MAX_X - STAGE_MIN_X) + 400, 8);
    ctx.restore();

    this.particles?.draw(ctx);

    // Minions behind fighters
    for (const m of match.minions) m.draw(ctx);

    // Fighters: back-to-front by depth (the one further back is drawn first)
    const order = [0, 1].sort((a, b) => Math.abs(match.fighters[a].x - 640) - Math.abs(match.fighters[b].x - 640));
    for (const idx of [1, 0]) {
      const f = match.fighters[idx];
      const state = f.renderState();
      drawShadow(ctx, f.x, GROUND_Y + 6, f.height * 0.32, f.grounded ? 0.7 : 0.35);
      if (f.trailFrames.length > 1 && settings.effectScale > 0.4) {
        drawTrail(ctx, f.trailFrames, {
          height: f.height,
          color: f.def.color,
          lineWidth: f.def.lineWidth,
          facing: f.facing,
          alpha: 1
        });
      }
      // Afterimages (Lust / Seizure teleports)
      for (const ai of f.afterimages) {
        ai.age += 1 / 60;
        drawStickman(ctx, ai.solved, {
          x: ai.x, y: ai.y, facing: ai.facing, height: f.height, color: f.def.color,
          accent: f.def.accent, lineWidth: f.def.lineWidth, glow: 0,
          alpha: clamp(1 - ai.age / ai.life, 0, 1) * 0.4, silhouette: true, silhouetteColor: f.def.color
        });
      }
      f.afterimages = f.afterimages.filter((a) => a.age < a.life);

      drawStickman(ctx, state.solved, {
        x: state.x,
        y: state.y,
        facing: state.facing,
        height: state.height,
        color: state.color,
        accent: state.accent,
        lineWidth: state.lineWidth,
        glow: state.glow,
        eye: state.eye,
        eyeStyle: state.eyeStyle,
        flash: state.flash,
        aura: state.aura,
        squashY: state.squashY,
        tilt: state.tilt
      });

      if (this.showHitboxes) this.#drawDebugBoxes(ctx, f);
    }
    void order;

    drawProjectiles(ctx, match.projectiles);

    // Block spark shield visuals
    for (const f of match.fighters) {
      if (f.blocking && f.grounded) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba('#9fdcff', 0.16 + 0.06 * Math.sin(t * 8));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(f.x + f.facing * 10, GROUND_Y - f.height * 0.45, f.height * 0.26, f.height * 0.44, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  #drawDebugBoxes(ctx, f) {
    const hb = f.hurtbox();
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(80,220,120,0.9)';
    ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
    const hit = f.activeHitbox();
    if (hit) {
      ctx.strokeStyle = 'rgba(255,60,60,0.95)';
      ctx.fillStyle = 'rgba(255,60,60,0.18)';
      ctx.fillRect(hit.x, hit.y, hit.w, hit.h);
      ctx.strokeRect(hit.x, hit.y, hit.w, hit.h);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${f.state}${f.currentMove ? ` · ${f.currentMove.id} ${f.moveFrame}` : ''}`, f.x, GROUND_Y + 22);
    ctx.restore();
  }

  #drawDialogue(ctx, dt) {
    const d = this.dialogue;
    const k = clamp(this.phaseTime * 3, 0, 1);
    const out = clamp((2.6 - this.phaseTime) * 2, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(k, out);
    const h = 84;
    const y = 560;
    ctx.fillStyle = 'rgba(4,3,6,0.82)';
    ctx.fillRect(0, y, 1280, h);
    ctx.fillStyle = d.color;
    ctx.fillRect(0, y, 8, h);
    drawText(ctx, d.speaker, 44, y + 28, {
      size: 18, weight: '800', color: d.color, spacing: 3
    });
    drawText(ctx, `“${d.text}”`, 44, y + 58, {
      size: 21 * settings.uiScale, weight: '600', color: '#efe8e6', spacing: 0.8
    });
    ctx.restore();
    void dt;
  }

  #drawTrainingOverlay(ctx, dt) {
    for (const b of this.trainingButtons) b.draw(ctx, dt);

    panel(ctx, { x: 20, y: 120, w: 300, h: 168, alpha: 0.7 });
    const rows = [
      ['COMBO', `${this.match.combos[0]}`],
      ['BEST COMBO', `${this.match.bestCombo[0]}`],
      ['DAMAGE', `${Math.round(this.match.totalDamage[0])}`],
      ['LAST HIT', this.match.hits[0] ? `${Math.round(this.match.totalDamage[0] / this.match.hits[0])} avg` : '—'],
      ['HITS', `${this.match.hits[0]}`]
    ];
    rows.forEach(([label, value], i) => {
      const y = 152 + i * 26;
      drawText(ctx, label, 38, y, { size: 13, weight: '700', color: '#8d7f84', baseline: 'middle', spacing: 1.4 });
      drawText(ctx, value, 302, y, { size: 16, weight: '800', color: '#ffffff', align: 'right', baseline: 'middle' });
    });

    drawText(ctx, 'TRAINING — the dummy never dies', 640, 700, {
      size: 13, weight: '700', color: '#6d6469', align: 'center', spacing: 1.6
    });
  }

  #drawPause(ctx, dt) {
    ctx.save();
    ctx.fillStyle = 'rgba(3,2,4,0.8)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();
    panel(ctx, { x: 420, y: 230, w: 440, h: 280, alpha: 0.95 });
    drawText(ctx, 'PAUSED', 640, 276, {
      size: 34, weight: '800', color: '#ffffff', align: 'center', spacing: 6
    });
    for (const b of this.pauseButtons) b.draw(ctx, dt);
  }
}

/* -------------------------------------------------------------------------- */

function blankIntent() {
  return {
    moveX: 0, jump: false, crouch: false, block: false,
    lightPunch: false, heavyPunch: false, lightKick: false, heavyKick: false,
    special: false, ultimate: false
  };
}

function deviceIntent(deviceIndex) {
  const d = input.devices[deviceIndex];
  return {
    moveX: d.axisX,
    jump: d.wasPressed('up'),
    crouch: d.isDown('down'),
    block: d.isDown('block'),
    lightPunch: d.wasPressed('lightPunch'),
    heavyPunch: d.wasPressed('heavyPunch'),
    lightKick: d.wasPressed('lightKick'),
    heavyKick: d.wasPressed('heavyKick'),
    special: d.wasPressed('special'),
    ultimate: d.wasPressed('ultimate')
  };
}

void chance;
void roundRect;
