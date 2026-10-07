/**
 * intro.js — the opening cinematic (spec section 11).
 *
 * Beat sheet (roughly 26 seconds, skippable at any time):
 *   1. black            a single light line opens on a dark room
 *   2. awaken           Creator Bitos, a silhouette in the dark; dust and embers
 *   3. rise             he stands; a shaft of light lands behind him
 *   4. silhouettes      the problems fade in around the room, one by one
 *   5. resolve          each silhouette ignites into its true self
 *   6. stance           Bitos drops into a fighting stance; shockwave
 *   7. surround         they rush in and close the circle
 *   8. clash            choreographed fight: strikes, impacts, hit stop
 *   9. survive          one huge uppercut blows everything back; he is standing
 *  10. title            logo card, then the fight begins
 *
 * Safety: every flash here is local (a burst around a character) except one
 * slow, single bloom on 'survive'. Nothing strobes — tools/flash-test.js
 * measures this scene every frame and fails the build if it ever does.
 */
import { drawText } from '../core/canvas.js';
import { getCharacter, CAMPAIGN_ROUNDS } from '../characters/roster.js';
import { getArena } from '../arenas/arenas.js';
import { NEUTRAL_POSE, clonePose, addPose, solvePosePlanted } from '../animation/skeleton.js';
import { CLIPS } from '../animation/clips.js';
import { drawStickman, drawShadow, drawTrail } from '../animation/stickman-renderer.js';
import { gameState } from '../core/state.js';
import { input } from '../core/input.js';
import { TRANSITIONS } from '../core/scene-manager.js';
import { clamp, lerp, rgba, rand, chance, easeOutCubic, easeInCubic, pulse, TAU } from '../core/utils.js';
import { settings } from '../config/settings.js';
import { Button } from '../ui/widgets.js';

/** Seconds before SKIP becomes available, so the opening click cannot end it. */
const SKIP_GRACE = 1.6;

const GROUND = 566;

const BEATS = [
  { id: 'black', dur: 1.3 },
  { id: 'awaken', dur: 2.4 },
  { id: 'rise', dur: 1.9 },
  { id: 'silhouettes', dur: 2.1 },
  { id: 'resolve', dur: 2.0 },
  { id: 'stance', dur: 1.5 },
  { id: 'surround', dur: 2.2 },
  { id: 'clash', dur: 5.2 },
  { id: 'survive', dur: 2.8 },
  { id: 'title', dur: 3.0 }
];

/** Camera plan per beat: where it looks, how close, and how fast it gets there. */
const CAMERA = {
  black: { x: 640, y: 400, zoom: 1.0, rate: 2 },
  awaken: { x: 640, y: 424, zoom: 1.22, rate: 1.1 },
  rise: { x: 640, y: 412, zoom: 1.06, rate: 1.6 },
  silhouettes: { x: 640, y: 404, zoom: 0.9, rate: 1.5 },
  resolve: { x: 640, y: 404, zoom: 0.94, rate: 2.2 },
  stance: { x: 640, y: 418, zoom: 1.12, rate: 4.5 },
  surround: { x: 640, y: 408, zoom: 0.88, rate: 2.0 },
  clash: { x: 640, y: 414, zoom: 1.04, rate: 3.2 },
  survive: { x: 640, y: 406, zoom: 1.16, rate: 2.4 },
  title: { x: 640, y: 400, zoom: 1.0, rate: 1.4 }
};

/** Timed clash choreography: who gets hit, when, and how hard. */
const CLASH_PLAN = [
  { at: 0.35, side: -1, move: 'heavyPunch', power: 1.0 },
  { at: 0.95, side: 1, move: 'heavyKick', power: 1.1 },
  { at: 1.55, side: -1, move: 'lightPunch', power: 0.7 },
  { at: 1.95, side: 1, move: 'uppercut', power: 1.3 },
  { at: 2.65, side: -1, move: 'sweep', power: 0.9 },
  { at: 3.25, side: 1, move: 'heavyPunch', power: 1.2 },
  { at: 3.85, side: -1, move: 'heavyKick', power: 1.25 },
  { at: 4.45, side: 1, move: 'special', power: 1.6 }
];

export class IntroScene {
  constructor({ audio, particles, camera }) {
    this.audio = audio;
    this.particles = particles;
    this.camera = camera;
    this.time = 0;
    this.beat = 0;
    this.beatTime = 0;
    this.skipped = false;
    this.finished = false;
    this.enemies = [];
    this.impacts = [];
    this.rings = [];
    this.trails = [];
    this.skipButton = null;
    this.canSkip = false;
    this.hitStop = 0;
    this.clashIndex = 0;
    this.bloom = 0;
    this.bitoxX = 640;
    this.bitosAlpha = 0;
    this.bitosFacing = 1;
    this.embers = [];
    this.motes = [];
    this.gateWeave = 0;
  }

  /* ------------------------------------------------------------------ */

  enter(params = {}) {
    this.time = 0;
    this.beat = 0;
    this.beatTime = 0;
    this.skipped = false;
    this.finished = false;
    this.impacts = [];
    this.rings = [];
    this.trails = [];
    this.hitStop = 0;
    this.clashIndex = 0;
    this.bloom = 0;
    this.bitoxX = 640;
    this.bitosAlpha = 0;
    this.next = params.next || 'boot';
    this.nextParams = params.nextParams || {};
    this.replay = Boolean(params.replay);
    // Skippable from the very first playthrough — being forced to sit through
    // a cutscene is how you lose a player. The brief grace period stops the
    // same click that started the game from also ending the cinematic.
    this.canSkip = true;

    // The camera is shared with the battle scene — claim it before drawing.
    this.camera?.reset({ x: 640, y: 400, zoom: 1 });
    this.camera?.focus(640, 400, { snap: true });

    // Problems fan out in a semicircle, the final boss furthest back.
    this.enemies = CAMPAIGN_ROUNDS.map((id, i) => {
      const def = getCharacter(id);
      const spread = CAMPAIGN_ROUNDS.length > 1 ? i / (CAMPAIGN_ROUNDS.length - 1) - 0.5 : 0;
      const homeX = 640 + spread * 900;
      const depth = 0.78 + Math.abs(spread) * 0.34; // back row reads further away
      return {
        id,
        def,
        homeX,
        x: homeX + Math.sign(spread || 1) * 520,
        scale: (0.8 + (i % 3) * 0.05) * depth,
        depth,
        alpha: 0,
        silhouette: 1,
        delay: i * 0.16,
        phase: rand(TAU),
        knock: 0,
        bob: rand(TAU)
      };
    });

    this.embers = [];
    for (let i = 0; i < 40; i += 1) {
      this.embers.push({ x: rand(1280), y: rand(720), vy: -rand(26, 8), size: rand(1, 2.6), phase: rand(TAU) });
    }
    this.motes = [];
    for (let i = 0; i < 90; i += 1) {
      this.motes.push({ x: rand(1280), y: rand(720), vx: rand(14, -14), vy: rand(10, -10), r: rand(0.6, 2), phase: rand(TAU) });
    }

    this.skipButton = new Button({
      x: 1052, y: 648, w: 176, h: 38, label: 'SKIP INTRO', accent: '#3a2b30', size: 15,
      onClick: () => this.skip()
    });

    this.audio?.playMusic('intro');
  }

  exit() {
    this.particles?.clear();
  }

  skip() {
    if (this.finished || this.time < SKIP_GRACE) return;
    this.skipped = true;
    this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    if (!this.replay) gameState.markIntroSeen();
    this.manager.change(this.next, {
      transition: TRANSITIONS.FADE,
      duration: 0.8,
      params: this.nextParams
    });
  }

  /* ------------------------------------------------------------------ */

  #advance(dt) {
    this.beatTime += dt;
    const beat = BEATS[this.beat];
    if (this.beatTime >= beat.dur) {
      this.beatTime = 0;
      this.beat += 1;
      if (this.beat >= BEATS.length) {
        this.finish();
        return;
      }
      this.#onBeatStart(BEATS[this.beat].id);
    }
  }

  #onBeatStart(id) {
    switch (id) {
      case 'rise':
        this.audio?.play('whoosh', { volume: 0.8 });
        break;
      case 'silhouettes':
        this.audio?.play('impact', { volume: 0.5 });
        break;
      case 'resolve':
        this.audio?.play('special', { volume: 0.55 });
        break;
      case 'stance':
        this.audio?.play('land', { volume: 0.8 });
        this.camera?.addShake(7);
        this.rings.push({ x: 640, y: GROUND, r: 20, max: 300, life: 0.7, age: 0, color: '#ff2b3c', width: 6 });
        this.particles?.dust(640, GROUND, { count: 26, dir: 0, color: '#6b5f57' });
        break;
      case 'surround':
        this.audio?.play('dash', { volume: 0.6 });
        break;
      case 'clash':
        this.audio?.play('fightStart', { volume: 0.95 });
        this.clashIndex = 0;
        break;
      case 'survive':
        this.audio?.play('ultimate', { volume: 0.9 });
        this.audio?.voice('victory', { volume: 0.95 });
        this.camera?.addShake(22);
        this.camera?.punchZoom(0.18, 0.5);
        this.bloom = 1;
        this.rings.push({ x: 640, y: GROUND - 60, r: 10, max: 760, life: 1.0, age: 0, color: '#ffffff', width: 12 });
        for (const e of this.enemies) e.knock = 1;
        break;
      case 'title':
        this.audio?.play('ko', { volume: 0.5 });
        break;
      default:
        break;
    }
  }

  /* ------------------------------------------------------------------ */

  update(dt, pointer) {
    if (this.finished) return;
    this.time += dt;
    this.gateWeave += dt;

    // Hit stop: freeze the action for a few frames after a big impact so the
    // hit lands instead of blurring past.
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= 0.12;
    }

    this.#advance(dt);
    const beatId = BEATS[this.beat]?.id;
    const beatT = clamp(this.beatTime / (BEATS[this.beat]?.dur || 1), 0, 1);

    /* ------------------------------------------------------------ bitos */
    if (beatId === 'black') this.bitosAlpha = clamp((beatT - 0.55) * 2.4, 0, 1);
    else this.bitosAlpha = clamp(this.bitosAlpha + dt * 3, 0, 1);

    /* ---------------------------------------------------------- enemies */
    for (const e of this.enemies) {
      e.bob += dt;
      if (beatId === 'silhouettes' && this.time > e.delay + 12) e.alpha = clamp(e.alpha + dt * 0.9, 0, 1);
      if (beatId === 'silhouettes') e.alpha = clamp((this.beatTime - e.delay) * 1.1, 0, 1);
      if (beatId === 'resolve') {
        const k = clamp((this.beatTime - e.delay * 0.9) * 1.2, 0, 1);
        e.silhouette = 1 - k;
        e.alpha = 1;
        // One ignition burst per character, and it is local — never full screen.
        if (k > 0.02 && k < 0.06 && !e.ignited) {
          e.ignited = true;
          this.#burst(e.x, GROUND - e.def.height * e.scale * 0.55, e.def.color, 0.85);
          this.camera?.addShake(3);
          this.audio?.play('special', { volume: 0.35 });
        }
      }
      if (beatId === 'stance' || beatId === 'surround' || beatId === 'clash' || beatId === 'survive' || beatId === 'title') {
        e.silhouette = 0;
        e.alpha = 1;
      }

      // Converge into a tightening ring.
      const closing = beatId === 'surround' ? 0.46 : beatId === 'clash' ? 0.34 : beatId === 'survive' ? 0.72 : 1;
      const target = 640 + (e.homeX - 640) * closing;
      const rate = beatId === 'surround' ? 3.4 : beatId === 'survive' ? 5.5 : 2.2;
      e.x = lerp(e.x, target + Math.sin(e.bob * 1.6 + e.phase) * (beatId === 'clash' ? 10 : 5), 1 - Math.exp(-rate * dt));
      if (e.knock > 0) e.knock = Math.max(0, e.knock - dt * 1.6);
    }

    /* ------------------------------------------------------------ clash */
    if (beatId === 'clash') {
      const plan = CLASH_PLAN[this.clashIndex];
      if (plan && this.beatTime >= plan.at) {
        this.clashIndex += 1;
        this.#strike(plan);
      }
    }

    /* ------------------------------------------------- transient effects */
    for (let i = this.impacts.length - 1; i >= 0; i -= 1) {
      this.impacts[i].age += dt;
      if (this.impacts[i].age >= this.impacts[i].life) this.impacts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const r = this.rings[i];
      r.age += dt;
      r.r = lerp(r.r, r.max, 1 - Math.exp(-7 * dt));
      if (r.age >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.trails.length - 1; i >= 0; i -= 1) {
      this.trails[i].age += dt;
      if (this.trails[i].age >= this.trails[i].life) this.trails.splice(i, 1);
    }
    if (this.bloom > 0) this.bloom = Math.max(0, this.bloom - dt * 1.15);

    for (const em of this.embers) {
      em.y += em.vy * dt;
      em.x += Math.sin(this.time * 0.7 + em.phase) * 8 * dt;
      if (em.y < -10) {
        em.y = 730;
        em.x = rand(1280);
      }
    }
    for (const mo of this.motes) {
      mo.x += mo.vx * dt;
      mo.y += mo.vy * dt;
      if (mo.x < -10) mo.x = 1290;
      if (mo.x > 1290) mo.x = -10;
      if (mo.y < -10) mo.y = 730;
      if (mo.y > 730) mo.y = -10;
    }

    this.particles?.update(dt);

    /* -------------------------------------------------- camera + audio */
    const plan = CAMERA[beatId] || CAMERA.black;
    if (beatId === 'clash' && this.lastStrike) {
      // Lean the camera toward whoever is being hit.
      this.camera?.focus(lerp(640, this.lastStrike.x, 0.35), plan.y);
    } else {
      this.camera?.focus(plan.x, plan.y);
    }
    this.camera.targetZoom = plan.zoom;
    this.camera?.update(dt, { lerpRate: plan.rate });

    // Ambient embers drifting through the room.
    if (beatId !== 'black' && chance(dt * 6)) {
      this.particles?.embers(rand(1280), GROUND - rand(0, 200), { count: 1, color: '#ff7a2b', spread: 20 });
    }

    /* ------------------------------------------------------------- skip */
    if (this.canSkip) {
      // Fade the button in as the grace period expires, so it does not pop.
      if (this.time >= SKIP_GRACE) this.skipButton.update(dt, pointer);
      const p1 = input.p1();
      if ((p1.wasPressed('confirm') || p1.wasPressed('back') || input.anyKeyPressed) && this.time > 0.6) {
        this.audio?.init(); // unlock audio on first interaction (browser autoplay policy)
        this.skip();
      }
    }
    void easeInCubic;
  }

  /** One choreographed strike during the clash. */
  #strike(plan) {
    const side = plan.side;
    const candidates = this.enemies.filter((e) => Math.sign(e.x - 640) === side);
    const target = candidates[Math.floor(rand(candidates.length))] || this.enemies[0];
    const hitX = lerp(640, target.x, 0.62);
    const hitY = GROUND - target.def.height * target.scale * 0.55;
    this.lastStrike = { x: hitX, y: hitY, side };
    this.bitosFacing = side;

    this.#burst(hitX, hitY, target.def.color, plan.power);
    this.rings.push({ x: hitX, y: hitY, r: 8, max: 120 * plan.power, life: 0.42, age: 0, color: '#ffffff', width: 4 });
    this.particles?.hitSpark(hitX, hitY, side, { power: plan.power, color: target.def.color, count: Math.round(14 + plan.power * 12) });
    this.particles?.speedLines(hitX, hitY, { count: Math.round(6 + plan.power * 6), color: '#ffffff', length: 80 * plan.power, spread: 40 });
    this.camera?.addShake(6 + plan.power * 5);
    this.camera?.punchZoom(0.05 * plan.power, 0.14);
    this.audio?.play(plan.power > 1.1 ? 'heavy' : 'hit', { volume: 0.5 + plan.power * 0.2 });
    if (chance(0.45)) this.audio?.voice('attack', { volume: 0.5 });
    this.hitStop = plan.power > 1.2 ? 0.075 : 0.04;
    target.knock = Math.max(target.knock, 0.6 * plan.power);

    // A short afterimage trail behind the strike.
    const bitos = getCharacter('creator-bitos');
    const pose = addPose(clonePose(bitos.stance || NEUTRAL_POSE), CLIPS[plan.move] ? CLIPS[plan.move]({ p: 0.6 }) : CLIPS.idle({ t: this.time }), 1);
    this.trails.push({ x: lerp(640, hitX, 0.35), y: GROUND, solved: solvePosePlanted(pose, 168), facing: side, age: 0, life: 0.3 });
  }

  #burst(x, y, color, power = 1) {
    this.impacts.push({ x, y, life: 0.4, age: 0, color, power });
  }

  /* ------------------------------------------------------------------ */

  draw(ctx, dt) {
    const t = this.time;
    const beatId = BEATS[this.beat]?.id;
    const beatT = clamp(this.beatTime / (BEATS[this.beat]?.dur || 1), 0, 1);

    /* --------------------------------------------------------- world */
    getArena('menu').draw(ctx, t * 0.35, null, {});

    this.camera?.apply(ctx, (c) => {
      this.#drawAtmosphere(c, t, beatId, beatT);

      /* ---- depth-sorted cast: further problems draw first ---- */
      const cast = [...this.enemies].sort((a, b) => b.depth - a.depth);
      for (const e of cast) {
        if (e.alpha <= 0.01) continue;
        const h = e.def.height * e.scale;
        const knock = e.knock > 0 ? Math.sin(e.knock * 22) * e.knock * 26 : 0;
        const wobble = beatId === 'clash' ? Math.sin(t * 16 + e.phase) * 6 : Math.sin(t * 1.5 + e.phase) * 3;
        const delta = beatId === 'surround' || beatId === 'clash'
          ? CLIPS.walk({ t: t * 1.5 + e.phase, speed: 1 })
          : beatId === 'survive'
            ? CLIPS.stun({ t: t * 1.2 + e.phase, severity: 1 })
            : CLIPS.idle({ t: t * 0.8 + e.phase, rng: e.phase });
        const pose = addPose(clonePose(e.def.stance || NEUTRAL_POSE), delta, 1);
        const solved = solvePosePlanted(pose, h);
        drawShadow(c, e.x, GROUND + 6, h * 0.3, 0.45 * e.alpha);
        // Rim light: a bright copy offset behind the silhouette, so a black
        // figure still has an edge against the dark room.
        if (e.silhouette > 0.15) {
          drawStickman(c, solved, {
            x: e.x + wobble * 0.3 + knock,
            y: GROUND,
            facing: e.x > 640 ? -1 : 1,
            height: h,
            color: '#ffffff',
            accent: '#ffffff',
            lineWidth: (6.5 * e.depth) + 4,
            glow: 0,
            alpha: 0.4 * e.alpha * e.silhouette,
            silhouette: true,
            silhouetteColor: '#c9a6ff',
            eye: { x: 0, y: 0 }
          });
        }
        drawStickman(c, solved, {
          x: e.x + wobble * 0.3 + knock,
          y: GROUND,
          facing: e.x > 640 ? -1 : 1,
          height: h,
          color: e.def.color,
          accent: e.def.accent,
          lineWidth: 6.5 * e.depth,
          glow: 0.9 * (1 - e.silhouette) * e.depth,
          alpha: e.alpha,
          silhouette: e.silhouette > 0.5,
          silhouetteColor: '#050305',
          eye: { x: 0.8, y: 0 },
          eyeStyle: e.def.eyeStyle,
          flash: e.knock * 0.5,
          charId: e.silhouette > 0.5 ? null : e.id
        });
      }

      /* ---------------------------------------------------- bitos ---- */
      this.#drawBitos(c, t, beatId, beatT);

      /* -------------------------------------------------- impacts ---- */
      for (const im of this.impacts) {
        const k = 1 - im.age / im.life;
        const r = (60 + 60 * im.power) * k + 24;
        c.save();
        c.globalCompositeOperation = 'lighter';
        const g = c.createRadialGradient(im.x, im.y, 0, im.x, im.y, r);
        g.addColorStop(0, rgba('#ffffff', 0.55 * k));
        g.addColorStop(0.35, rgba(im.color, 0.6 * k));
        g.addColorStop(1, rgba(im.color, 0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(im.x, im.y, r, 0, TAU);
        c.fill();
        c.restore();
      }

      for (const r of this.rings) {
        const k = 1 - r.age / r.life;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = k * 0.85;
        c.strokeStyle = r.color;
        c.lineWidth = r.width * k;
        c.beginPath();
        c.ellipse(r.x, r.y, r.r, r.r * 0.42, 0, 0, TAU);
        c.stroke();
        c.restore();
      }

      for (const tr of this.trails) {
        const k = 1 - tr.age / tr.life;
        drawStickman(c, tr.solved, {
          x: tr.x, y: tr.y, facing: tr.facing, height: 168,
          color: '#ff2b3c', accent: '#ffd9dd', lineWidth: 8,
          alpha: k * 0.3, silhouette: true, silhouetteColor: '#ff2b3c', glow: 0
        });
      }

      this.particles?.draw(c);
    });

    /* --------------------------------------------------------- grade */
    this.#vignette(ctx);
    if (beatId === 'black') {
      ctx.save();
      ctx.fillStyle = rgba('#000000', 1 - easeOutCubic(beatT));
      ctx.fillRect(0, 0, 1280, 720);
      ctx.restore();
    }
    if (this.bloom > 0 && settings.flashScale > 0.2) {
      // One slow, single bloom — never repeated, never a strobe.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.bloom * 0.2 * settings.flashScale;
      const bg = ctx.createRadialGradient(640, 400, 60, 640, 400, 780);
      bg.addColorStop(0, 'rgba(255,236,232,1)');
      bg.addColorStop(0.6, 'rgba(255,170,160,0.55)');
      bg.addColorStop(1, 'rgba(255,120,110,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1280, 720);
      ctx.restore();
    }

    /* ------------------------------------------------------ letterbox */
    this.#letterbox(ctx, beatId, beatT);

    /* --------------------------------------------------------- captions */
    this.#captions(ctx, beatId, beatT);

    /* ---------------------------------------------------------- title */
    this.#title(ctx, beatId, beatT, t);

    /* ----------------------------------------------------------- skip */
    if (this.canSkip) {
      if (this.time >= SKIP_GRACE) {
        const fade = Math.min(1, (this.time - SKIP_GRACE) / 0.5);
        ctx.save();
        ctx.globalAlpha = fade;
        this.skipButton.draw(ctx, dt);
        ctx.restore();
      }
      drawText(ctx, 'PRESS ANY KEY TO SKIP', 1140, 632, {
        size: 11, weight: '700', color: '#6d6469', align: 'center', spacing: 1.6
      });
    }

    this.#grain(ctx);
    void pulse;
  }

  /* ------------------------------------------------------------------ */

  #drawAtmosphere(c, t, beatId, beatT) {
    // Dust motes in the light.
    c.save();
    for (const mo of this.motes) {
      const twinkle = 0.35 + 0.3 * Math.sin(t * 1.6 + mo.phase);
      c.globalAlpha = twinkle * (beatId === 'black' ? 0 : 0.5);
      c.fillStyle = '#c9a9a0';
      c.beginPath();
      c.arc(mo.x, mo.y, mo.r, 0, TAU);
      c.fill();
    }
    c.restore();

    // Embers rising.
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const em of this.embers) {
      const k = clamp(1 - (GROUND - em.y) / 900, 0.15, 1);
      c.globalAlpha = 0.4 * k * (beatId === 'black' ? 0 : 1);
      c.fillStyle = '#ff7a2b';
      c.beginPath();
      c.arc(em.x, em.y, em.size, 0, TAU);
      c.fill();
    }
    c.restore();

    // Backlight haze: a bright band behind the cast. Without it the black
    // silhouettes vanish into the dark room instead of reading as shapes.
    const haze = beatId === 'silhouettes' ? 0.55 : beatId === 'resolve' ? 0.42 : 0.28;
    if (beatId !== 'black') {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = haze * 0.5;
      const hg = c.createRadialGradient(640, GROUND - 120, 60, 640, GROUND - 120, 720);
      hg.addColorStop(0, 'rgba(150,110,190,0.55)');
      hg.addColorStop(0.55, 'rgba(70,40,110,0.28)');
      hg.addColorStop(1, 'rgba(20,10,30,0)');
      c.fillStyle = hg;
      c.fillRect(0, 120, 1280, 620);
      c.restore();
    }

    // A shaft of light behind Bitos once he stands.
    if (beatId === 'rise' || beatId === 'silhouettes' || beatId === 'stance') {
      const k = beatId === 'rise' ? Math.sin(clamp(beatT, 0, 1) * Math.PI) : 0.55;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.16 * k;
      const g = c.createLinearGradient(640, 0, 640, GROUND);
      g.addColorStop(0, 'rgba(255,220,180,0.9)');
      g.addColorStop(1, 'rgba(255,140,90,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(560, 0);
      c.lineTo(720, 0);
      c.lineTo(880, GROUND);
      c.lineTo(400, GROUND);
      c.closePath();
      c.fill();
      c.restore();
    }
  }

  #drawBitos(c, t, beatId, beatT) {
    const bitos = getCharacter('creator-bitos');
    if (this.bitosAlpha <= 0.01) return;

    let delta;
    if (beatId === 'awaken') {
      delta = CLIPS.crouch({ p: 1 });
    } else if (beatId === 'rise') {
      delta = CLIPS.getup({ p: clamp(beatT * 1.15, 0, 1) });
    } else if (beatId === 'clash') {
      const plan = CLASH_PLAN[Math.max(0, this.clashIndex - 1)];
      const local = clamp((this.beatTime - (plan?.at ?? 0)) / 0.62, 0, 1);
      delta = plan && CLIPS[plan.move] ? CLIPS[plan.move]({ p: local }) : CLIPS.idle({ t, rng: 0.5 });
    } else if (beatId === 'survive') {
      delta = CLIPS.uppercut({ p: clamp(beatT * 1.3, 0, 1) });
    } else if (beatId === 'stance' || beatId === 'surround' || beatId === 'title') {
      delta = CLIPS.block({ p: 1, hit: 0 });
    } else {
      delta = CLIPS.idle({ t, rng: 0.5, guard: 1 });
    }

    const pose = addPose(clonePose(bitos.stance || NEUTRAL_POSE), delta, 1);
    const solved = solvePosePlanted(pose, 168);
    const slumped = beatId === 'awaken' ? 0.86 : 1;
    drawShadow(c, this.bitoxX, GROUND + 6, 58, 0.7 * this.bitosAlpha);
    if (beatId === 'black' || beatId === 'awaken') {
      drawStickman(c, solved, {
        x: this.bitoxX, y: GROUND, facing: this.bitosFacing, height: 168 * slumped,
        color: '#ffffff', accent: '#ffffff', lineWidth: 12, glow: 0,
        alpha: 0.35 * this.bitosAlpha, silhouette: true, silhouetteColor: '#ffb0b0',
        eye: { x: 0, y: 0 }
      });
    }
    drawStickman(c, solved, {
      x: this.bitoxX,
      y: GROUND,
      facing: this.bitosFacing,
      height: 168 * slumped,
      color: bitos.color,
      accent: bitos.accent,
      lineWidth: 8,
      glow: beatId === 'black' ? 0.4 : 1.5,
      alpha: this.bitosAlpha,
      eye: { x: beatId === 'awaken' ? 0.1 : 1, y: 0 },
      eyeStyle: bitos.eyeStyle,
      aura: beatId === 'survive' || beatId === 'title' ? { color: '#ff6b6b', strength: 0.85 } : null,
      charId: 'creator-bitos'
    });
  }

  #letterbox(ctx, beatId, beatT) {
    // Bars open up as the cinematic starts and close on the title card.
    let barH = 74;
    if (beatId === 'black') barH = lerp(360, 74, easeOutCubic(beatT));
    if (beatId === 'title') barH = lerp(74, 190, easeOutCubic(clamp(beatT * 1.4 - 0.3, 0, 1)));
    const weave = Math.sin(this.gateWeave * 0.8) * 1.5;
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, -2, 1280, barH + weave);
    ctx.fillRect(0, 720 - barH + weave, 1280, barH + 4);
    ctx.restore();
  }

  #vignette(ctx) {
    ctx.save();
    const g = ctx.createRadialGradient(640, 380, 220, 640, 380, 760);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();
  }

  #grain(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.045;
    for (let i = 0; i < 44; i += 1) {
      ctx.fillStyle = chance(0.5) ? '#ffffff' : '#000000';
      ctx.fillRect(rand(1280), rand(720), 2, 2);
    }
    ctx.restore();
  }

  #captions(ctx, beatId, beatT) {
    const lines = {
      awaken: 'Every morning starts the same way. A blank page. A head full of noise.',
      rise: 'He keeps showing up anyway.',
      silhouettes: 'But so do they.',
      resolve: 'Laziness. Gadget. Addiction. Lust. Society. Suffering. Wrath. School.',
      stance: 'Ten problems. One creator. No referee.',
      surround: 'They do not wait their turn.',
      clash: 'So neither does he.',
      survive: 'Not perfect. Still standing. Still creating.',
      title: 'THE FIGHT BEGINS NOW.'
    };
    const text = lines[beatId];
    if (!text || !settings.get('subtitles')) return;
    const fadeIn = clamp(beatT * 5, 0, 1);
    const fadeOut = clamp((1 - beatT) * 6, 0, 1);
    const alpha = Math.min(fadeIn, fadeOut);
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    if (settings.get('highContrastText')) {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(180, 616, 920, 44);
    }
    drawText(ctx, text, 640, 646, {
      size: 21 * settings.uiScale,
      weight: '700',
      color: settings.get('highContrastText') ? '#ffffff' : '#f3ecec',
      align: 'center',
      spacing: 1.5,
      shadow: { color: '#000000', blur: 14 }
    });
    ctx.restore();
  }

  #title(ctx, beatId, beatT, t) {
    if (beatId !== 'survive' && beatId !== 'title') return;
    const k = beatId === 'survive' ? clamp((beatT - 0.35) * 2.2, 0, 1) : 1;
    if (k <= 0.01) return;

    const drop = (1 - easeOutCubic(clamp(k * 1.4, 0, 1))) * 40;
    ctx.save();
    ctx.globalAlpha = k;

    // Layered logo: a dark echo, the red word, and a bright core.
    drawText(ctx, 'CREATOR BITOS', 640 + 4, 288 + drop + 4, {
      size: 88, weight: '800', color: 'rgba(0,0,0,0.55)', align: 'center', spacing: 14
    });
    drawText(ctx, 'CREATOR BITOS', 640, 288 + drop, {
      size: 88, weight: '800', color: '#ff2b3c', align: 'center', spacing: 14,
      shadow: { color: rgba('#ff2b3c', 0.9), blur: 46 }
    });
    drawText(ctx, 'CREATOR BITOS', 640, 288 + drop, {
      size: 88, weight: '800', color: rgba('#ffffff', 0.16), align: 'center', spacing: 14
    });

    drawText(ctx, 'VS PROBLEMS IN LIFE', 640, 344 + drop, {
      size: 27, weight: '700', color: '#efe8e6', align: 'center', spacing: 12
    });

    // A light sweep across the rule under the logo.
    const sweep = ((t * 0.55) % 1.6) / 1.6;
    ctx.save();
    ctx.globalAlpha = k * 0.9;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(440, 374);
    ctx.lineTo(840, 374);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ff2b3c', 0.8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(440 + sweep * 400 - 60, 374);
    ctx.lineTo(440 + sweep * 400 + 60, 374);
    ctx.stroke();
    ctx.restore();

    if (beatId === 'title') {
      const bob = 0.6 + 0.4 * Math.sin(t * 3.4);
      drawText(ctx, 'PRESS ENTER', 640, 470, {
        size: 20, weight: '800', color: rgba('#ffffff', bob * 0.85), align: 'center', spacing: 6
      });
    }
    ctx.restore();
  }

  /** Called by the game loop so the skip button can be clicked. */
  handlePointer(pointer) {
    if (this.finished || this.time < SKIP_GRACE) return;
    this.skipButton.handlePointer?.(pointer);
  }
}

void drawTrail;
