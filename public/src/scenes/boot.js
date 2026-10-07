/**
 * boot.js — first paint.
 *
 * Doubles as the audio unlock gate: browsers require a user gesture before
 * sound can start, so the first press initialises the audio engine and then
 * hands off to the cinematic loading screen.
 *
 * It is also the player's first impression, so it is staged like a title card:
 * the problems gather in the dark behind Creator Bitos, a shaft of light falls
 * on him, and the logo settles in with a light sweep.
 */
import { drawText } from '../core/canvas.js';
import { getArena } from '../arenas/arenas.js';
import { getCharacter, CAMPAIGN_ROUNDS } from '../characters/roster.js';
import { NEUTRAL_POSE, clonePose, addPose, solvePosePlanted } from '../animation/skeleton.js';
import { CLIPS } from '../animation/clips.js';
import { drawStickman, drawShadow } from '../animation/stickman-renderer.js';
import { input } from '../core/input.js';
import { TRANSITIONS } from '../core/scene-manager.js';
import { clamp, rgba, pulse, rand, chance, easeOutCubic, TAU } from '../core/utils.js';

const GROUND = 560;

export class BootScene {
  constructor({ audio, particles }) {
    this.audio = audio;
    this.particles = particles;
    this.time = 0;
    this.started = false;
    this.motes = [];
    for (let i = 0; i < 70; i += 1) {
      this.motes.push({ x: rand(1280), y: rand(720), vx: rand(12, -12), vy: rand(8, -8), r: rand(0.6, 2.1), phase: rand(TAU) });
    }
  }

  enter() {
    this.time = 0;
    this.started = false;
  }

  update(dt) {
    this.time += dt;
    for (const mo of this.motes) {
      mo.x += mo.vx * dt;
      mo.y += mo.vy * dt;
      if (mo.x < -10) mo.x = 1290;
      if (mo.x > 1290) mo.x = -10;
      if (mo.y < -10) mo.y = 730;
      if (mo.y > 730) mo.y = -10;
    }
    if (this.started) return;
    const pressed = input.pointer.pressed || input.anyKeyPressed;
    if (pressed && this.time > 0.35) {
      this.started = true;
      // First gesture: start the audio engine, then move on.
      this.audio?.init();
      this.audio?.play('click', { volume: 0.5 });
      this.onStart?.();
    }
  }

  draw(ctx) {
    const t = this.time;

    // Slow parallax drift so the room feels alive before anything moves.
    ctx.save();
    ctx.translate(Math.sin(t * 0.18) * 10, Math.cos(t * 0.13) * 6);
    getArena('menu').draw(ctx, t * 0.3, null, {});
    ctx.restore();

    /** Backlight: without it the black silhouettes disappear into the room. */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42;
    const haze = ctx.createRadialGradient(640, GROUND - 120, 40, 640, GROUND - 120, 680);
    haze.addColorStop(0, 'rgba(150,110,190,0.55)');
    haze.addColorStop(0.55, 'rgba(70,40,110,0.26)');
    haze.addColorStop(1, 'rgba(20,10,30,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 100, 1280, 620);
    ctx.restore();

    // Enemy silhouettes gathering in the dark
    CAMPAIGN_ROUNDS.forEach((id, i) => {
      const def = getCharacter(id);
      const x = 120 + i * 116;
      const reveal = clamp((t - 0.4 - i * 0.08) * 1.2, 0, 1);
      const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), CLIPS.idle({ t: t * 0.7 + i, rng: i }), 1);
      const solved = solvePosePlanted(pose, 130);
      // Rim light first, so each black shape keeps an edge.
      drawStickman(ctx, solved, {
        x, y: 620, facing: 1, height: 130, color: '#ffffff', accent: '#ffffff',
        lineWidth: 10, glow: 0, alpha: reveal * 0.32,
        silhouette: true, silhouetteColor: '#c9a6ff', eye: { x: 0, y: 0 }
      });
      drawStickman(ctx, solved, {
        x, y: 620, facing: 1, height: 130, color: def.color, alpha: reveal * 0.95,
        silhouette: true, silhouetteColor: '#07040a', lineWidth: 6,
        eye: { x: 0.8, y: 0 }, eyeStyle: def.eyeStyle, glow: reveal * 0.25
      });
    });

    // Dust motes drifting through the light
    ctx.save();
    for (const mo of this.motes) {
      ctx.globalAlpha = 0.2 + 0.22 * Math.sin(t * 1.4 + mo.phase);
      ctx.fillStyle = '#c9a9a0';
      ctx.beginPath();
      ctx.arc(mo.x, mo.y, mo.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    /* ------------------------------------------------------------ title */
    // Letters settle in with a stagger instead of simply appearing.
    const settle = clamp((t - 0.15) * 1.6, 0, 1);
    drawText(ctx, 'CREATOR BITOS', 640 + 4, 250 + 4, {
      size: 86, weight: '800', color: 'rgba(0,0,0,0.5)', align: 'center', spacing: 16
    });
    ctx.save();
    ctx.globalAlpha = settle;
    drawText(ctx, 'CREATOR BITOS', 640, 250 + (1 - easeOutCubic(settle)) * 26, {
      size: 86, weight: '800', color: '#ffffff', align: 'center', spacing: 16,
      shadow: { color: rgba('#ff2b3c', 0.95), blur: 44 }
    });
    drawText(ctx, 'VS PROBLEMS IN LIFE', 640, 306, {
      size: 26, weight: '700', color: '#efe8e6', align: 'center', spacing: 14
    });
    drawText(ctx, 'THE GAME', 640, 344, {
      size: 15, weight: '700', color: '#8d7f84', align: 'center', spacing: 10
    });
    ctx.restore();

    // Light sweep across the rule under the logo.
    if (settle > 0.5) {
      const sweep = ((t * 0.5) % 1.8) / 1.8;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(470, 372);
      ctx.lineTo(810, 372);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ff2b3c', 0.75);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(470 + sweep * 340 - 55, 372);
      ctx.lineTo(470 + sweep * 340 + 55, 372);
      ctx.stroke();
      ctx.restore();
    }

    /* ------------------------------------------------------------ bitos */
    const def = getCharacter('creator-bitos');
    const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), CLIPS.idle({ t, rng: 0.7, guard: 1 }), 1);
    const solved = solvePosePlanted(pose, 220);
    // Shaft of light behind him.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14;
    const beam = ctx.createLinearGradient(640, 120, 640, GROUND);
    beam.addColorStop(0, 'rgba(255,220,180,0.9)');
    beam.addColorStop(1, 'rgba(255,140,90,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(520, 120);
    ctx.lineTo(760, 120);
    ctx.lineTo(900, GROUND);
    ctx.lineTo(380, GROUND);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    drawShadow(ctx, 640, GROUND + 6, 74, 0.75);
    drawStickman(ctx, solved, {
      x: 640, y: GROUND, facing: 1, height: 220, color: def.color, accent: def.accent,
      lineWidth: 10, glow: 1.5, eye: { x: 0.6, y: 0 }, eyeStyle: def.eyeStyle
    });

    /* ----------------------------------------------------------- prompt */
    if (this.time > 0.35) {
      const a = 0.45 + pulse(t, 1.6) * 0.55;
      drawText(ctx, 'CLICK OR PRESS ANY KEY', 640, 620, {
        size: 20, weight: '800', color: rgba('#ffffff', a), align: 'center', spacing: 5
      });
      drawText(ctx, 'sound starts here', 640, 646, {
        size: 12, weight: '600', color: rgba('#8d7f84', a), align: 'center', spacing: 2
      });
    }

    // Slow drifting embers
    if (chance(0.4)) {
      this.particles?.embers?.(rand(1280), 700, { count: 1, color: chance(0.5) ? '#ff5c5c' : '#ffd166' });
    }
    this.particles?.update(1 / 60);
    this.particles?.draw(ctx);

    // Vignette
    ctx.save();
    const g = ctx.createRadialGradient(640, 400, 220, 640, 400, 820);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();
  }
}

export function bootHandoff(sceneManager) {
  void sceneManager;
  return TRANSITIONS.WIPE;
}
