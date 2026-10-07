/**
 * flash-test.js — photosensitivity guard.
 *
 * The brief forbids rapid flashing (the Seizure boss in particular). This runs
 * the real scenes headlessly, estimates the whole-screen luminance every frame
 * and fails if the image changes brightness fast enough to be a strobe.
 *
 * WCAG / Harding guidance: no more than three flashes per second, and a flash
 * is a big luminance swing over a large area.
 */
import './seed-random.js'; // deterministic runs (must be first)
import { installDomStub } from './canvas-stub.js';
import { createRecorder } from './recorder.js';

const recorder = createRecorder(1280, 720);
installDomStub({ contextFactory: () => recorder });

const { Surface, STAGE_W, STAGE_H } = await import('../public/src/core/canvas.js');
const { ParticleSystem, Camera, TimeKeeper } = await import('../public/src/animation/effects.js');
const { audio } = await import('../public/src/audio/audio.js');
const { gameState } = await import('../public/src/core/state.js');
const { BattleScene } = await import('../public/src/scenes/battle.js');
const { IntroScene } = await import('../public/src/scenes/intro.js');

const surface = new Surface(document.getElementById('game-canvas'));
const ctx = surface.ctx;
const camera = new Camera({ width: STAGE_W, height: STAGE_H });
const particles = new ParticleSystem(400);
const pointer = { x: 640, y: 360, down: false, pressed: false, released: false, inside: true, moved: false, wheel: 0 };

let checks = 0;
let failures = 0;
function check(label, condition, detail = '') {
  checks += 1;
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.error(`  ✗ ${label} ${detail}`);
  }
}

/** Rough whole-screen luminance: every fill weighted by area and alpha. */
function frameLuminance(ops) {
  let energy = 0;
  for (const op of ops) {
    if (op.type !== 'fill' || !op.points || op.points.length < 3) continue;
    const c = op.color;
    if (!c) continue;
    const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    const alpha = (c.a ?? 1) * (op.alpha ?? 1);
    const xs = op.points.map((p) => p[0]);
    const ys = op.points.map((p) => p[1]);
    const area = op.circle
      ? Math.PI * op.circle.r * op.circle.r
      : (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    // A gradient fill is recorded as the flat rect it covers, but on screen it
    // fades to transparent — weight it down so glows are not counted as strobes.
    const spread = op.color.__gradient ? 0.15 : 1;
    energy += lum * alpha * spread * Math.min(area, STAGE_W * STAGE_H);
  }
  return energy / (STAGE_W * STAGE_H);
}

/** Sample luminance every frame the scene draws. */
function measure(scene, params, frames, { label }) {
  scene.enter(params);
  const series = [];
  for (let i = 0; i < frames; i += 1) {
    scene.update(1 / 60, pointer);
    recorder.__reset();
    scene.draw(ctx, 1 / 60);
    series.push(frameLuminance(recorder.__ops));
  }
  scene.exit?.();

  // The first frames are the scene fading up from black, not flash content.
  const SETTLE = 10;
  let maxDelta = 0;
  let flashes = 0;
  let lastFlashFrame = -99;
  for (let i = 1 + SETTLE; i < series.length; i += 1) {
    const d = Math.abs(series[i] - series[i - 1]);
    maxDelta = Math.max(maxDelta, d);
    // A "flash" = a swing of more than 10% of screen brightness in one frame,
    // counted with a 200 ms refractory gap so one event is not counted twice.
    if (d > 0.1 && i - lastFlashFrame > 12) {
      flashes += 1;
      lastFlashFrame = i;
    }
  }
  // Repeated strobing is the actual hazard: two big swings close together.
  let closestPair = Infinity;
  let prevBig = -999;
  for (let i = 1 + SETTLE; i < series.length; i += 1) {
    if (Math.abs(series[i] - series[i - 1]) > 0.2) {
      closestPair = Math.min(closestPair, i - prevBig);
      prevBig = i;
    }
  }
  const seconds = frames / 60;
  const perSecond = flashes / Math.max(1, seconds);
  const mean = series.reduce((a, b) => a + b, 0) / series.length;

  console.log(`\n  ${label}: ${frames} frames (${seconds.toFixed(0)}s)`);
  console.log(`    mean luminance ${mean.toFixed(3)} · biggest single-frame swing ${maxDelta.toFixed(3)}`);
  console.log(`    flashes ${flashes} (${perSecond.toFixed(2)}/s)`);
  // A one-off white flash (KO, boss phase change) is fine; a strobe is not.
  check(`${label}: no hard strobe frame`, maxDelta < 0.6, `maxDelta=${maxDelta.toFixed(3)}`);
  check(`${label}: under 3 flashes per second`, perSecond < 3, `${perSecond.toFixed(2)}/s`);
  check(`${label}: big flashes are not repeated back to back`, closestPair > 18,
    `closest big swings ${closestPair === Infinity ? 'n/a' : `${closestPair} frames`}`);
  check(`${label}: screen is not dark one frame and blown out the next`,
    Math.max(...series) - Math.min(...series) < 0.8,
    `range=${(Math.max(...series) - Math.min(...series)).toFixed(2)}`);
  return series;
}

console.log('===============================================================');
console.log('  CREATOR BITOS — photosensitivity guard');
console.log('===============================================================');

gameState.player = { id: 'p1', username: 'TESTER', hasSeenIntro: true, campaignProgress: 9, defeatedEnemies: [], unlockedCharacters: ['creator-bitos'], settings: {}, stats: {} };

console.log('\n[1] Seizure (final boss) — the highest-risk scene');
measure(new BattleScene({ audio, particles, camera, time: new TimeKeeper() }),
  { mode: 'campaign', roundNumber: 10, enemyId: 'seizure' }, 60 * 45, { label: 'seizure boss' });

console.log('\n[2] Suffering — heavy-hitting mid/late round');
measure(new BattleScene({ audio, particles, camera, time: new TimeKeeper() }),
  { mode: 'campaign', roundNumber: 7, enemyId: 'suffering' }, 60 * 30, { label: 'suffering' });

console.log('\n[3] Intro cinematic');
const intro = new IntroScene({ audio, particles, camera });
intro.manager = { change() {}, current: 'intro' }; // the SceneManager normally injects this
measure(intro, {}, 60 * 40, { label: 'intro' });

console.log('\n===============================================================');
console.log(`  ${checks - failures}/${checks} checks passed`);
console.log('===============================================================');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('No strobe content detected.');
