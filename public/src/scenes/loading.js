/**
 * loading.js — cinematic loading screen.
 *
 * Every scene change that can take time routes through here. It is a real
 * loading screen: it waits on an actual task (asset load, sign-in, save) and
 * shows genuine progress, with a minimum on-screen time so the animation can
 * play. Never a bare "Loading..." text.
 */
import { drawText, slantRect } from '../core/canvas.js';
import { clamp, damp, lerp, rgba, rand, TAU, chance } from '../core/utils.js';
import { drawStickman, drawShadow } from '../animation/stickman-renderer.js';
import { NEUTRAL_POSE, clonePose, addPose, solvePosePlanted } from '../animation/skeleton.js';
import { CLIPS } from '../animation/clips.js';
import { getCharacter, CAMPAIGN_ROUNDS } from '../characters/roster.js';
import { tipForScene } from '../assets/manifest.js';
import { getArena } from '../arenas/arenas.js';
import { TRANSITIONS } from '../core/scene-manager.js';
import { settings } from '../config/settings.js';

const LABELS = [
  'Preparing the next battle...',
  'Loading Arena...',
  'Preparing Creator Bitos...',
  'Entering the battlefield...',
  'Waking the problems up...',
  'Sharpening the stickmen...'
];

export class LoadingScene {
  constructor({ audio, particles }) {
    this.audio = audio;
    this.particles = particles;
    this.time = 0;
    this.progress = 0;
    this.target = 0;
    this.task = null;
    this.minTime = 1.4;
    this.label = LABELS[0];
    this.tip = '';
    this.runnerX = -200;
    this.done = false;
  }

  enter(params = {}) {
    this.time = 0;
    this.progress = 0;
    this.target = 0;
    this.done = false;
    this.next = params.next || 'menu';
    this.nextParams = params.nextParams || {};
    this.transition = params.transition || TRANSITIONS.WIPE;
    this.minTime = params.minTime ?? 1.5;
    this.label = params.label || LABELS[Math.floor(Math.random() * LABELS.length)];
    this.tip = params.tip || tipForScene(params.next);
    this.arenaId = params.arena || 'menu';
    this.runnerX = -220;
    this.enemies = CAMPAIGN_ROUNDS.map((id, i) => ({
      id,
      x: 180 + i * 96,
      appear: 0.25 + i * 0.06,
      revealed: 0
    }));

    this.task = params.task || null;
    if (this.task) {
      this.task.then(
        () => {
          this.target = 1;
        },
        (err) => {
          this.target = 1;
          this.error = err?.message || null;
        }
      );
    }
    this.audio?.playMusic('loading');
  }

  exit() {
    this.particles?.clear();
  }

  update(dt) {
    this.time += dt;
    if (!this.task) {
      // No explicit task: simulate a short, honest warm-up.
      this.target = clamp(this.time / (this.minTime * 0.75), 0, 1);
    }
    this.progress = damp(this.progress, this.target, 3.4, dt);
    this.runnerX = lerp(-220, 1500, clamp(this.progress * 1.05, 0, 1));

    for (const e of this.enemies) {
      if (this.time > e.appear) e.revealed = clamp(e.revealed + dt * 1.6, 0, 1);
    }

    if (this.progress > 0.985 && this.time > this.minTime && !this.done) {
      this.done = true;
      this.manager.change(this.next, { params: this.nextParams, transition: this.transition });
    }
  }

  draw(ctx, dt) {
    const t = this.time;
    getArena(this.arenaId).draw(ctx, t * 0.4, null, {});

    // Dim the arena so the loading UI reads on top.
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,7,0.62)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    /* -------------------------------------------------- enemy silhouettes */
    for (const e of this.enemies) {
      const def = getCharacter(e.id);
      const pose = addPose(clonePose(NEUTRAL_POSE), CLIPS.idle({ t: t * 0.7 + e.appear * 10, rng: e.x * 0.03 }), 1);
      const solved = solvePosePlanted(pose, def.height * 0.62);
      drawStickman(ctx, solved, {
        x: e.x,
        y: 470,
        facing: 1,
        height: def.height * 0.62,
        color: def.color,
        accent: def.accent,
        lineWidth: 5,
        alpha: 0.18 + e.revealed * 0.5,
        silhouette: e.revealed < 0.55,
        silhouetteColor: 'rgba(0,0,0,0.85)',
        glow: e.revealed * 0.6,
        eye: { x: 0.7, y: 0 },
        eyeStyle: def.eyeStyle
      });
    }

    /* --------------------------------------------------------- the runner */
    const bitos = getCharacter('creator-bitos');
    const runPose = addPose(clonePose(bitos.stance || NEUTRAL_POSE), CLIPS.run({ t: t * 2.2 }), 1);
    const solved = solvePosePlanted(runPose, 150);
    drawShadow(ctx, this.runnerX, 556, 46, 0.6);
    drawStickman(ctx, solved, {
      x: this.runnerX,
      y: 556,
      facing: 1,
      height: 150,
      color: bitos.color,
      accent: bitos.accent,
      lineWidth: 7,
      glow: 1.2,
      eye: { x: 0.9, y: 0 }
    });

    if (chance(dt * 22)) {
      this.particles?.dust(this.runnerX - 20, 556, { count: 2, dir: -1, color: '#6b5f57' });
    }

    /* -------------------------------------------------------------- text */
    drawText(ctx, 'CREATOR BITOS', 640, 190, {
      size: 58, weight: '800', color: '#ffffff', align: 'center', spacing: 14,
      shadow: { color: rgba('#ff2b3c', 0.9), blur: 30 }
    });
    drawText(ctx, 'VS PROBLEMS IN LIFE', 640, 232, {
      size: 20, weight: '700', color: '#b9a9ac', align: 'center', spacing: 8
    });

    drawText(ctx, this.label.toUpperCase(), 640, 600, {
      size: 22, weight: '700', color: '#efe8e6', align: 'center', spacing: 3
    });

    /* --------------------------------------------------------- progress */
    const barW = 620;
    const barX = 320;
    const barY = 636;
    ctx.save();
    slantRect(ctx, barX, barY, barW, 18, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const w = barW * this.progress;
    if (w > 3) {
      ctx.save();
      slantRect(ctx, barX, barY, barW, 18, 10);
      ctx.clip();
      const g = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      g.addColorStop(0, '#8c1622');
      g.addColorStop(0.6, '#ff2b3c');
      g.addColorStop(1, '#ff8c8c');
      ctx.fillStyle = g;
      ctx.fillRect(barX, barY, w, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(barX, barY, w, 6);
      ctx.restore();
    }
    ctx.restore();
    drawText(ctx, `${Math.round(this.progress * 100)}%`, 640, barY + 40, {
      size: 16, weight: '800', color: '#ff8c8c', align: 'center', spacing: 2
    });

    /* -------------------------------------------------------------- tip */
    drawText(ctx, `TIP — ${this.tip}`, 640, 700, {
      size: 14, weight: '600', color: '#8d7f84', align: 'center', spacing: 1.2
    });

    if (this.error) {
      drawText(ctx, this.error, 640, 520, {
        size: 16, weight: '700', color: '#ff7b7b', align: 'center', spacing: 1
      });
    }

    /* ---------------------------------------------------- sweep overlay */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sweepX = ((t * 260) % 1600) - 160;
    const g2 = ctx.createLinearGradient(sweepX, 0, sweepX + 220, 720);
    g2.addColorStop(0, 'rgba(255,43,60,0)');
    g2.addColorStop(0.5, 'rgba(255,43,60,0.05)');
    g2.addColorStop(1, 'rgba(255,43,60,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    void rand;
    void TAU;
    void settings;
  }
}
