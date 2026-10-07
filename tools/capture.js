/**
 * capture.js — run real scenes headlessly and dump their draw calls so
 * tools/render_png.py can turn them into images (offline visual QA).
 *
 *   node tools/capture.js                 # every shot below
 *   node tools/capture.js menu battle-laziness
 */
import './seed-random.js'; // deterministic runs (must be first)
import { installDomStub } from './canvas-stub.js';
import { createRecorder } from './recorder.js';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('tools/out');
fs.mkdirSync(OUT, { recursive: true });

const recorder = createRecorder(1280, 720);
installDomStub({ contextFactory: () => recorder });

const { Surface, STAGE_W, STAGE_H } = await import('../public/src/core/canvas.js');
const { ParticleSystem, Camera, TimeKeeper } = await import('../public/src/animation/effects.js');
const { input } = await import('../public/src/core/input.js');
const { audio } = await import('../public/src/audio/audio.js');
const { gameState } = await import('../public/src/core/state.js');
const { settings } = await import('../public/src/config/settings.js');

const { BootScene } = await import('../public/src/scenes/boot.js');
const { LoadingScene } = await import('../public/src/scenes/loading.js');
const { AuthScene } = await import('../public/src/scenes/auth.js');
const { IntroScene } = await import('../public/src/scenes/intro.js');
const { MenuScene } = await import('../public/src/scenes/menu.js');
const { CampaignScene } = await import('../public/src/scenes/campaign.js');
const { BattleScene } = await import('../public/src/scenes/battle.js');
const { ResultsScene } = await import('../public/src/scenes/results.js');
const { TrainingScene } = await import('../public/src/scenes/training.js');
const { VersusScene } = await import('../public/src/scenes/versus.js');
const { ExtrasScene } = await import('../public/src/scenes/extras.js');
const { SettingsScene } = await import('../public/src/scenes/settings.js');

const surface = new Surface(document.getElementById('game-canvas'));
const ctx = surface.ctx;
const particles = new ParticleSystem(400);
const camera = new Camera({ width: STAGE_W, height: STAGE_H });
const time = new TimeKeeper();

gameState.player = {
  id: 'p_test',
  username: 'TESTER',
  email: 'test@example.com',
  hasSeenIntro: true,
  campaignProgress: 5,
  defeatedEnemies: ['laziness', 'gadget', 'addiction', 'lust', 'society'],
  unlockedCharacters: ['creator-bitos', 'laziness', 'gadget', 'addiction', 'lust', 'society'],
  multiplayerUnlocked: true,
  campaignCompleted: false,
  settings: {},
  stats: { matchesPlayed: 12, matchesWon: 9, matchesLost: 3, bestCombo: 7, totalTimePlayedSeconds: 4210, totalDamageDealt: 2400, totalDamageTaken: 1800 },
  enemyRecords: { laziness: { attempts: 3, wins: 1, losses: 2, bestCombo: 4 } }
};

const scenes = {
  boot: new BootScene({ audio, particles }),
  loading: new LoadingScene({ audio, particles }),
  auth: new AuthScene({ audio }),
  intro: new IntroScene({ audio, particles, camera }),
  menu: new MenuScene({ audio, particles }),
  campaign: new CampaignScene({ audio, particles }),
  battle: new BattleScene({ audio, particles, camera, time }),
  results: new ResultsScene({ audio, particles }),
  training: new TrainingScene({ audio }),
  versus: new VersusScene({ audio }),
  extras: new ExtrasScene({ audio }),
  settings: new SettingsScene({ audio })
};

const pointer = { x: 640, y: 360, down: false, pressed: false, released: false, inside: true, moved: true, wheel: 0 };

function dump(name, extra = {}) {
  const ops = recorder.__ops.map((op) => ({ ...op }));
  fs.writeFileSync(path.join(OUT, `${name}.json`),
    JSON.stringify({ width: STAGE_W, height: STAGE_H, meta: { name, ...extra, ops: ops.length }, ops }));
  console.log(`${name}: ${ops.length} ops${extra.phase ? ` (phase=${extra.phase})` : ''}`);
  recorder.__reset();
}

function shot(name, scene, params, frames, pointerFn) {
  scene.enter(params);
  for (let i = 0; i < frames; i += 1) {
    if (pointerFn) pointerFn(i);
    else {
      pointer.x = 640 + Math.sin(i / 18) * 240;
      pointer.y = 360 + Math.cos(i / 26) * 130;
      pointer.pressed = i === 4;
      pointer.down = i > 4 && i < 10;
    }
    scene.update(1 / 60, pointer);
    scene.handlePointer?.(pointer);
  }
  scene.draw(ctx, 1 / 60);
  dump(name);
  scene.exit?.();
}

const want = process.argv.slice(2);
const doShot = (name, ...args) => { if (!want.length || want.includes(name)) shot(name, ...args); };

doShot('menu', scenes.menu, {}, 90);
doShot('loading', scenes.loading, { task: Promise.resolve(), minTime: 0.5, next: 'menu' }, 45);
doShot('auth', scenes.auth, {}, 45);
// The cinematic is long: capture it at several beats.
{
  const s2 = scenes.intro;
  s2.manager = { change() {} };
  s2.enter({});
  const marks = [['intro-01-black', 40], ['intro-02-awaken', 130], ['intro-03-rise', 260],
                 ['intro-04-silhouettes', 420], ['intro-05-resolve', 560], ['intro-06-stance', 700],
                 ['intro-07-surround', 830], ['intro-08-clash', 1050], ['intro-09-survive', 1200],
                 ['intro-10-title', 1360]];
  let at = 0;
  for (const [name, frame] of marks) {
    while (at < frame) { s2.update(1 / 60, pointer); at += 1; }
    s2.draw(surface.ctx, 1 / 60);
    dump(name);
  }
  s2.exit?.();
}
doShot('campaign', scenes.campaign, {}, 45);
doShot('training', scenes.training, {}, 45);
doShot('versus', scenes.versus, {}, 45);
doShot('extras', scenes.extras, { section: 'characters' }, 90);
doShot('extras-gallery', scenes.extras, { section: 'gallery' }, 90);
doShot('extras-story', scenes.extras, { section: 'story' }, 60);
doShot('settings', scenes.settings, {}, 60);
doShot('settings-video', scenes.settings, { tab: 'video' }, 60);
doShot('results', scenes.results, { mode: 'campaign', roundNumber: 1, enemyId: 'laziness', victory: true }, 90);

/* Battles: an entrance frame plus a mid-fight frame. */
for (const [name, params] of [
  ['battle-laziness', { mode: 'campaign', roundNumber: 1, enemyId: 'laziness' }],
  ['battle-addiction', { mode: 'campaign', roundNumber: 3, enemyId: 'addiction' }],
  ['battle-suffering', { mode: 'campaign', roundNumber: 7, enemyId: 'suffering' }],
  ['battle-school', { mode: 'campaign', roundNumber: 9, enemyId: 'school' }],
  ['battle-seizure', { mode: 'campaign', roundNumber: 10, enemyId: 'seizure' }],
  ['battle-training', { mode: 'training', enemyId: 'training-dummy' }]
]) {
  if (want.length && !want.includes(name)) continue;
  const s = scenes.battle;
  s.enter(params);
  for (let i = 0; i < 30; i += 1) s.update(1 / 60, pointer);
  s.draw(ctx, 1 / 60);
  dump(`${name}-intro`);

  // Drive player 1 with real key input so the capture shows actual action.
  const keys = ['KeyD', 'KeyA', 'KeyJ', 'KeyK', 'KeyL', 'Space'];
  const board = input.keyboard || (input.keyboard = {});
  for (let i = 0; i < 60 * 20; i += 1) {
    if (i % 12 === 0) {
      const step = Math.floor(i / 12) % 6;
      board.KeyD = step < 3;
      board.KeyA = step >= 3;
      board.KeyJ = i % 36 < 6;
      board.KeyK = i % 60 < 4;
      board.Space = i % 96 < 8;
    }
    s.update(1 / 60, pointer);
  }
  for (const k of keys) board[k] = false;
  s.draw(ctx, 1 / 60);
  dump(`${name}-fight`, { phase: s.phase });
  s.exit?.();
}

console.log('\nWrote captures to tools/out/ — render with:');
console.log('  python3 tools/render_png.py tools/out/menu.json tools/out/menu.png');
void settings;
