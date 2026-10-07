/**
 * boot.js — first paint (returning players) / post-intro landing screen.
 *
 * Doubles as the audio unlock gate: browsers require a user gesture before
 * sound can start, so the first press initialises the audio engine and then
 * hands off to the cinematic loading screen.
 *
 * This version features a dramatic arena backdrop:
 *   - Split radial-gradient bokeh background (red/orange left, blue/purple right)
 *   - 28 large translucent bokeh orbs drifting softly (composited lighter)
 *   - Lightning arcs from Society + Seizure toward Bitos (center)
 *   - Spark particles burst from lightning endpoints each flash
 *   - Three featured characters: Society (left), Bitos (center), Seizure (right)
 *   - Title text with glowing logo, subtitle, and pulsing prompt
 */
import { drawText } from '../core/canvas.js';
import { getArena } from '../arenas/arenas.js';
import { getCharacter } from '../characters/roster.js';
import { NEUTRAL_POSE, clonePose, addPose, solvePosePlanted } from '../animation/skeleton.js';
import { CLIPS } from '../animation/clips.js';
import { drawStickman, drawShadow } from '../animation/stickman-renderer.js';
import { input } from '../core/input.js';
import { TRANSITIONS } from '../core/scene-manager.js';
import { clamp, rgba, pulse, rand, chance, easeOutCubic, TAU } from '../core/utils.js';

const GROUND = 560;

/** Build one bokeh orb descriptor. */
function makeBokeh(i) {
  const leftSide = i < 14; // first 14 = red-orange, last 14 = blue-purple
  return {
    x: rand(1280),
    y: rand(720),
    vx: rand(10, -10),
    vy: rand(8, -8),
    r: rand(120, 40),
    color: leftSide
      ? `rgba(${200 + Math.floor(rand(55))},${60 + Math.floor(rand(60))},${10 + Math.floor(rand(30))},`
      : `rgba(${60 + Math.floor(rand(60))},${10 + Math.floor(rand(40))},${180 + Math.floor(rand(75))},`,
    alpha: 0.04 + rand(0.08),
    phase: rand(TAU)
  };
}

/** Generate a jagged lightning polyline from start to end with 6-9 midpoints. */
function makeLightningPath(sx, sy, ex, ey) {
  const steps = 6 + Math.floor(rand(4)); // 6–9 midpoints
  const pts = [{ x: sx, y: sy }];
  for (let i = 1; i <= steps; i += 1) {
    const t = i / (steps + 1);
    const bx = sx + (ex - sx) * t;
    const by = sy + (ey - sy) * t;
    pts.push({
      x: bx + rand(80, -80),
      y: by + rand(50, -50)
    });
  }
  pts.push({ x: ex, y: ey });
  return pts;
}

export class BootScene {
  constructor({ audio, particles }) {
    this.audio = audio;
    this.particles = particles;
    this.time = 0;
    this.started = false;

    // 28 large bokeh orbs (14 warm, 14 cool)
    this.bokeh = Array.from({ length: 28 }, (_, i) => makeBokeh(i));

    // Lightning state
    this.lightning = [];
    this.lightningTimer = 0;
    this.sparks = [];
  }

  enter() {
    this.time = 0;
    this.started = false;
    // Refresh bokeh positions on re-entry
    this.bokeh = Array.from({ length: 28 }, (_, i) => makeBokeh(i));
    this.lightning = [];
    this.lightningTimer = 0;
    this.sparks = [];
  }

  update(dt) {
    this.time += dt;

    // Drift bokeh orbs
    for (const b of this.bokeh) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.phase += dt * 0.4;
      if (b.x < -b.r * 2) b.x = 1280 + b.r;
      if (b.x > 1280 + b.r * 2) b.x = -b.r;
      if (b.y < -b.r * 2) b.y = 720 + b.r;
      if (b.y > 720 + b.r * 2) b.y = -b.r;
    }

    // Generate new lightning arcs every 0.18s
    this.lightningTimer -= dt;
    if (this.lightningTimer <= 0) {
      this.lightningTimer = 0.18;
      this.lightning = [];
      const bitosX = 640;
      const bitosY = GROUND - 180 * 0.55;
      // Society arc (left side ~860 → center)
      this.lightning.push(makeLightningPath(860, GROUND - 180 * 0.55, bitosX, bitosY));
      // Seizure arc (right side ~1060 → center)
      this.lightning.push(makeLightningPath(1060, GROUND - 180 * 0.55, bitosX, bitosY));
      // A third dramatic arc from above
      this.lightning.push(makeLightningPath(bitosX + rand(200, -200), 80, bitosX, bitosY));

      // Burst sparks at the endpoint (near Bitos)
      if (this.particles) {
        this.particles.hitSpark?.(bitosX, bitosY, 1, { power: 0.5, color: '#ff2b3c', count: 6 });
        this.particles.hitSpark?.(bitosX, bitosY, -1, { power: 0.4, color: '#9b4dff', count: 4 });
      }
    }

    // Update spark particles
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const s = this.sparks[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 400 * dt; // gravity
      s.life -= dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }

    // Spawn new sparks occasionally near lightning endpoints
    if (chance(dt * 8)) {
      const ex = 640 + rand(40, -40);
      const ey = GROUND - 100 + rand(30, -30);
      for (let k = 0; k < 3; k += 1) {
        this.sparks.push({
          x: ex,
          y: ey,
          vx: rand(160, -160),
          vy: rand(-220, -80),
          life: rand(0.35, 0.1),
          color: chance(0.5) ? '#ff2b3c' : '#c9a6ff'
        });
      }
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

    this.particles?.update(dt);
  }

  draw(ctx) {
    const t = this.time;

    // Slow parallax drift so the room feels alive before anything moves.
    ctx.save();
    ctx.translate(Math.sin(t * 0.18) * 10, Math.cos(t * 0.13) * 6);
    getArena('menu').draw(ctx, t * 0.3, null, {});
    ctx.restore();

    /* --------------------------------- split radial-gradient bokeh backdrop */
    // Left half: warm red/orange glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    const leftGrad = ctx.createRadialGradient(320, GROUND - 120, 40, 320, GROUND - 120, 560);
    leftGrad.addColorStop(0, 'rgba(200,60,20,0.38)');
    leftGrad.addColorStop(0.5, 'rgba(160,40,10,0.18)');
    leftGrad.addColorStop(1, 'rgba(80,10,0,0)');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, 640, 720);
    // Right half: cool blue/purple glow
    const rightGrad = ctx.createRadialGradient(960, GROUND - 120, 40, 960, GROUND - 120, 560);
    rightGrad.addColorStop(0, 'rgba(80,20,200,0.38)');
    rightGrad.addColorStop(0.5, 'rgba(50,10,140,0.18)');
    rightGrad.addColorStop(1, 'rgba(20,0,80,0)');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(640, 0, 640, 720);
    ctx.restore();

    /* ------------------------------------------------------- bokeh orbs */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bokeh) {
      const pulse = b.alpha * (0.7 + 0.3 * Math.sin(t * 0.8 + b.phase));
      const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      grad.addColorStop(0, b.color + pulse + ')');
      grad.addColorStop(1, b.color + '0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    /* ----------------------------------------------- backlight haze */
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

    /* --------------------------------------- three featured characters */
    // Society (left, x=860, height=180)
    this.#drawCharacter(ctx, 'society', 860, 180, t, -1);
    // Seizure (far right, x=1060, height=180)
    this.#drawCharacter(ctx, 'seizure', 1060, 180, t, -1);

    /* ---------------------------------------- lightning arcs (lighter) */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const path of this.lightning) {
      if (path.length < 2) continue;
      const flashAlpha = 0.15 + rand(0.4); // flicker each frame
      // Outer glow stroke
      ctx.save();
      ctx.globalAlpha = flashAlpha * 0.4;
      ctx.strokeStyle = '#c9a6ff';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
      ctx.restore();
      // Core bright stroke
      ctx.save();
      ctx.globalAlpha = flashAlpha;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i += 1) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    /* ------------------------------------------- sparks from lightning */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.sparks) {
      const a = clamp(s.life / 0.3, 0, 1);
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.5, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    /* ---------------------------------------------- Creator Bitos (center) */
    this.#drawBitos(ctx, t);

    /* ---------------------------------------------------------------- title */
    // 'CREATOR BITOS' at y=130 with red glow
    const settle = clamp((t - 0.15) * 1.6, 0, 1);
    drawText(ctx, 'CREATOR BITOS', 640 + 4, 130 + 4, {
      size: 86, weight: '800', color: 'rgba(0,0,0,0.5)', align: 'center', spacing: 16
    });
    ctx.save();
    ctx.globalAlpha = settle;
    drawText(ctx, 'CREATOR BITOS', 640, 130 + (1 - easeOutCubic(settle)) * 26, {
      size: 86, weight: '800', color: '#ff2b3c', align: 'center', spacing: 16,
      shadow: { color: rgba('#ff2b3c', 0.95), blur: 44 }
    });
    // 'VS PROBLEMS IN LIFE' at y=182
    drawText(ctx, 'VS PROBLEMS IN LIFE', 640, 182, {
      size: 26, weight: '700', color: '#efe8e6', align: 'center', spacing: 14
    });
    drawText(ctx, 'THE GAME', 640, 220, {
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
      ctx.moveTo(470, 248);
      ctx.lineTo(810, 248);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ff2b3c', 0.75);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(470 + sweep * 340 - 55, 248);
      ctx.lineTo(470 + sweep * 340 + 55, 248);
      ctx.stroke();
      ctx.restore();
    }

    /* ----------------------------------------------------------- prompt */
    // 'CLICK OR PRESS ANY KEY' at y=640
    if (this.time > 0.35) {
      const a = 0.45 + pulse(t, 1.6) * 0.55;
      drawText(ctx, 'CLICK OR PRESS ANY KEY', 640, 640, {
        size: 20, weight: '800', color: rgba('#ffffff', a), align: 'center', spacing: 5
      });
      drawText(ctx, 'sound starts here', 640, 664, {
        size: 12, weight: '600', color: rgba('#8d7f84', a), align: 'center', spacing: 2
      });
    }

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

  /** Draw a non-Bitos character in their idle CLIPS.idle pose. */
  #drawCharacter(ctx, id, x, height, t, facing) {
    const def = getCharacter(id);
    if (!def) return;
    const phase = (id === 'society') ? 0.3 : 1.1;
    const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), CLIPS.idle({ t: t * 0.7 + phase, rng: phase }), 1);
    const solved = solvePosePlanted(pose, height);
    const reveal = clamp((t - 0.4) * 1.2, 0, 1);
    drawShadow(ctx, x, GROUND + 6, height * 0.3, 0.45 * reveal);
    // Rim glow
    drawStickman(ctx, solved, {
      x, y: GROUND, facing, height, color: '#ffffff', accent: '#ffffff',
      lineWidth: (height / 130) * 10, glow: 0, alpha: reveal * 0.28,
      silhouette: true, silhouetteColor: id === 'society' ? '#ff8c55' : '#c9a6ff',
      eye: { x: 0, y: 0 }
    });
    // Full color render
    drawStickman(ctx, solved, {
      x, y: GROUND, facing, height, color: def.color, accent: def.accent,
      lineWidth: (height / 130) * 6, glow: reveal * 1.1,
      alpha: reveal * 0.92,
      eye: { x: 0.8, y: 0 }, eyeStyle: def.eyeStyle,
      charId: id
    });
  }

  /** Draw Creator Bitos at center with idle pose (height 240). */
  #drawBitos(ctx, t) {
    const def = getCharacter('creator-bitos');
    const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), CLIPS.idle({ t, rng: 0.7, guard: 1 }), 1);
    const solved = solvePosePlanted(pose, 240);
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

    drawShadow(ctx, 640, GROUND + 6, 80, 0.75);
    drawStickman(ctx, solved, {
      x: 640, y: GROUND, facing: 1, height: 240, color: def.color, accent: def.accent,
      lineWidth: 11, glow: 1.8, eye: { x: 0.6, y: 0 }, eyeStyle: def.eyeStyle,
      charId: 'creator-bitos'
    });
  }
}

export function bootHandoff(sceneManager) {
  void sceneManager;
  return TRANSITIONS.WIPE;
}
