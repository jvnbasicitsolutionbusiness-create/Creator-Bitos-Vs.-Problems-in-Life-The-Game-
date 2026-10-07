/**
 * results.js — post-fight: VICTORY / DEFEATED, rewards and next steps.
 */
import { drawText, roundRect, slantRect } from '../core/canvas.js';
import { Button, panel } from '../ui/widgets.js';
import { getArena } from '../arenas/arenas.js';
import { getCharacter, CAMPAIGN_ROUNDS } from '../characters/roster.js';
import { NEUTRAL_POSE, clonePose, addPose, solvePosePlanted } from '../animation/skeleton.js';
import { CLIPS } from '../animation/clips.js';
import { drawStickman, drawShadow } from '../animation/stickman-renderer.js';
import { gameState } from '../core/state.js';
import { input } from '../core/input.js';
import { TRANSITIONS } from '../core/scene-manager.js';
import { clamp, lerp, rgba, rand, damp, pulse, TAU, easeOutCubic } from '../core/utils.js';
import { settings } from '../config/settings.js';
import { audio } from '../audio/audio.js';

export class ResultsScene {
  constructor({ audio: audioEngine, particles }) {
    this.audio = audioEngine;
    this.particles = particles;
    this.time = 0;
    this.buttons = [];
    this.data = null;
    this.reveal = 0;
    this.celebrate = 0;
  }

  enter(params = {}) {
    this.time = 0;
    this.reveal = 0;
    this.celebrate = 0;
    this.data = params;
    this.victory = Boolean(params.victory);
    this.enemyId = params.enemyId || CAMPAIGN_ROUNDS[0];
    this.roundNumber = params.roundNumber || 1;
    this.results = params.results || {};
    this.unlocked = params.unlocked || [];
    this.multiplayerUnlocked = Boolean(params.multiplayerUnlocked);
    this.mode = params.mode || 'campaign';
    this.isFinal = this.roundNumber >= CAMPAIGN_ROUNDS.length;
    this.enemyDef = getCharacter(this.enemyId);
    this.arenaId = this.enemyDef.arena || 'rooftop';

    this.audio?.playMusic(this.victory ? 'victory' : 'defeat');
    this.#buildButtons();
  }

  #buildButtons() {
    const isCampaign = this.mode === 'campaign';
    const nextRound = this.roundNumber + 1;
    const hasNext = isCampaign && this.victory && nextRound <= CAMPAIGN_ROUNDS.length;
    const items = [];

    if (hasNext) {
      items.push({
        label: 'NEXT ROUND',
        sub: `ROUND ${nextRound} — ${getCharacter(CAMPAIGN_ROUNDS[nextRound - 1]).name}`,
        accent: '#ff2b3c',
        onClick: () => this.manager.change('battle', {
          transition: TRANSITIONS.BLACK,
          duration: 1.0,
          params: { mode: 'campaign', enemyId: CAMPAIGN_ROUNDS[nextRound - 1], roundNumber: nextRound }
        })
      });
    }
    if (isCampaign) {
      items.push({
        label: this.victory ? 'REPLAY ROUND' : 'RETRY',
        sub: `Round ${this.roundNumber} again`,
        accent: '#3a2b30',
        onClick: () => this.manager.change('battle', {
          transition: TRANSITIONS.BLACK,
          duration: 1.0,
          params: { mode: 'campaign', enemyId: this.enemyId, roundNumber: this.roundNumber }
        })
      });
      items.push({
        label: 'RETURN TO CAMPAIGN',
        accent: '#3a2b30',
        onClick: () => this.manager.change('campaign', { transition: TRANSITIONS.SLIDE, duration: 0.7 })
      });
    }
    items.push({
      label: 'MAIN MENU',
      accent: '#3a2b30',
      onClick: () => this.manager.change('menu', { transition: TRANSITIONS.SLIDE, duration: 0.7 })
    });

    const startY = this.victory ? 500 : 520;
    this.buttons = items.map((item, i) => new Button({
      x: 640 - 220,
      y: startY + i * 56,
      w: 440,
      h: 46,
      label: item.label,
      sub: item.sub || null,
      accent: item.accent,
      size: 20,
      onClick: item.onClick
    }));
  }

  update(dt, pointer) {
    this.time += dt;
    this.reveal = clamp(this.reveal + dt * 1.4, 0, 1);
    for (const b of this.buttons) b.update(dt, pointer);

    if (this.victory && this.time < 2.4 && Math.random() < dt * 30) {
      this.particles?.hitSpark(rand(1180, 100), rand(420, 200), rand(1, -1) > 0 ? 1 : -1, {
        power: 0.8, count: 4, color: this.multiplayerUnlocked ? '#ffd166' : this.enemyDef.color
      });
    }
    this.particles?.update(dt);

    const p1 = input.p1();
    if (p1.wasPressed('back')) this.manager.change('campaign', { transition: TRANSITIONS.SLIDE, duration: 0.7 });
  }

  draw(ctx, dt) {
    const t = this.time;
    ctx.save();
    ctx.globalAlpha = 0.9;
    getArena(this.arenaId).draw(ctx, t * 0.25, null, {});
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,7,0.75)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    /* ------------------------------------------------------ headline */
    const headline = this.victory ? 'VICTORY' : 'DEFEATED';
    const color = this.victory ? '#ffd166' : '#ff5c5c';
    const pop = clamp(this.reveal * 1.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = pop;
    ctx.translate(640, 140);
    ctx.scale(lerp(1.6, 1, easeOutCubic(pop)), lerp(1.6, 1, easeOutCubic(pop)));
    drawText(ctx, headline, 0, 0, {
      size: 88, weight: '800', color, align: 'center', baseline: 'middle', spacing: 12,
      outline: { width: 10, color: 'rgba(0,0,0,0.9)' },
      shadow: { color: rgba(color, 0.9), blur: 40 }
    });
    ctx.restore();

    drawText(ctx, this.victory ? `${this.enemyDef.name} HAS BEEN OVERCOME` : `${this.enemyDef.name} STILL STANDS`, 640, 200, {
      size: 20, weight: '700', color: '#cfc2c6', align: 'center', spacing: 4
    });

    /* -------------------------------------------------- characters */
    const bitos = getCharacter('creator-bitos');
    const winPose = this.victory ? CLIPS.victory({ t, style: bitos.victoryStyle }) : CLIPS.defeat({ t, p: clamp(t / 1.6, 0, 1) });
    const losePose = this.victory ? CLIPS.defeat({ t, p: clamp(t / 1.6, 0, 1) }) : CLIPS.victory({ t, style: this.enemyDef.victoryStyle });

    this.#drawPortrait(ctx, bitos, 380, winPose, 1);
    this.#drawPortrait(ctx, this.enemyDef, 900, losePose, -1);

    /* --------------------------------------------------- stat panel */
    const panelY = 262;
    panel(ctx, { x: 470, y: panelY, w: 340, h: 196, alpha: 0.72 });
    const r = this.results;
    const rows = [
      ['ROUNDS', `${r.p1Wins ?? 0} — ${r.p2Wins ?? 0}`],
      ['BEST COMBO', `${r.bestCombo ?? 0} HITS`],
      ['DAMAGE DEALT', `${r.damageDealt ?? 0}`],
      ['DAMAGE TAKEN', `${r.damageTaken ?? 0}`],
      ['TOTAL HITS', `${r.hits ?? 0}`]
    ];
    rows.forEach(([label, value], i) => {
      const y = panelY + 44 + i * 30;
      drawText(ctx, label, 494, y, { size: 13, weight: '700', color: '#8d7f84', baseline: 'middle', spacing: 1.4 });
      drawText(ctx, value, 786, y, { size: 16, weight: '800', color: '#ffffff', align: 'right', baseline: 'middle' });
    });

    /* --------------------------------------------------- unlocks */
    let unlockY = 476;
    if (this.unlocked.length) {
      for (const id of this.unlocked) {
        const def = getCharacter(id);
        ctx.save();
        slantRect(ctx, 420, unlockY - 26, 440, 44, 12);
        ctx.fillStyle = rgba(def.color, 0.22);
        ctx.fill();
        ctx.strokeStyle = rgba(def.color, 0.8);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        drawText(ctx, 'CHARACTER UNLOCKED', 640, unlockY - 8, {
          size: 12, weight: '800', color: '#ffd166', align: 'center', spacing: 3
        });
        drawText(ctx, def.name, 640, unlockY + 10, {
          size: 22, weight: '800', color: def.color, align: 'center', spacing: 3,
          shadow: { color: rgba(def.color, 0.8), blur: 16 }
        });
        unlockY += 54;
      }
    }

    if (this.multiplayerUnlocked) {
      const bob = pulse(t, 1.4);
      drawText(ctx, 'ALL 10 PROBLEMS DEFEATED — MULTIPLAYER UNLOCKED', 640, unlockY + 6, {
        size: 20, weight: '800', color: rgba('#22d3ee', 0.75 + bob * 0.25), align: 'center', spacing: 3,
        shadow: { color: '#22d3ee', blur: 20 }
      });
      unlockY += 34;
    }

    if (this.isFinal && this.victory) {
      drawText(ctx, 'CREATOR BITOS IS STILL STANDING.', 640, unlockY + 4, {
        size: 16, weight: '700', color: '#efe8e6', align: 'center', spacing: 2
      });
      if (this.enemyDef.contentNote) {
        drawText(ctx, this.enemyDef.contentNote, 640, unlockY + 26, {
          size: 11, weight: '600', color: '#a3949a', align: 'center', spacing: 0.5
        });
      }
    }

    this.particles?.draw(ctx);
    for (const b of this.buttons) b.draw(ctx, dt);

    drawText(ctx, `ESC  RETURN TO CAMPAIGN`, 640, 706, {
      size: 12, weight: '700', color: '#6d6469', align: 'center', spacing: 2
    });
    void roundRect;
    void damp;
    void TAU;
    void settings;
    void gameState;
  }

  #drawPortrait(ctx, def, x, clipDelta, facing) {
    const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), clipDelta, 1);
    const h = 210;
    drawShadow(ctx, x, 470, h * 0.3, 0.6);
    drawStickman(ctx, solvePosePlanted(pose, h), {
      x, y: 470, facing, height: h, color: def.color, accent: def.accent,
      lineWidth: 9, glow: 1.1, eye: { x: 0.6, y: 0 }, eyeStyle: def.eyeStyle,
      aura: facing === 1 ? { color: def.color, strength: 0.5 } : null
    });
  }
}
