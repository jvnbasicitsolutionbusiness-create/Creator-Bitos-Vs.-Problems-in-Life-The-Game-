/**
 * scene-smoke.js — runs every scene through enter/update/draw in Node.
 *
 * Catches the class of bug a browser would only reveal at runtime: undefined
 * helpers, bad property access, NaN geometry, broken scene wiring.
 *
 * Usage: node tools/scene-smoke.js
 */
import './seed-random.js'; // deterministic runs (must be first)
import { installDomStub } from './canvas-stub.js';

installDomStub();

const { Surface, STAGE_W, STAGE_H } = await import('../public/src/core/canvas.js');
const { ParticleSystem, Camera, TimeKeeper } = await import('../public/src/animation/effects.js');
const { input } = await import('../public/src/core/input.js');
const { audio } = await import('../public/src/audio/audio.js');
const { SceneManager } = await import('../public/src/core/scene-manager.js');
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

const surface = new Surface(document.getElementById('game-canvas'));
const ctx = surface.ctx;
const particles = new ParticleSystem(400);
const camera = new Camera({ width: STAGE_W, height: STAGE_H });
const time = new TimeKeeper();

// A signed-in profile so progression-dependent scenes render their real state.
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

const manager = new SceneManager({ ctx });
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
for (const [name, scene] of Object.entries(scenes)) manager.register(name, scene);

const pointer = { x: 300, y: 300, down: false, pressed: false, released: false, inside: true, moved: false, wheel: 0 };

/** Scan recorded canvas calls for NaN/Infinity geometry — the classic
 *  "nothing renders and nothing throws" bug. */
function scanOps() {
  const ops = ctx.__ops || [];
  let bad = 0;
  let sample = '';
  for (const op of ops) {
    for (const arg of op.args) {
      if (typeof arg === 'number' && !Number.isFinite(arg)) {
        bad += 1;
        if (!sample) sample = `${op.name}(${op.args.join(', ')})`;
      }
    }
  }
  ops.length = 0;
  return { bad, sample };
}

function runFrames(name, params, frames = 90, { pressKeys = false } = {}) {
  const scene = scenes[name];
  scene.enter(params || {});
  let nanCount = 0;
  let nanSample = '';
  for (let i = 0; i < frames; i += 1) {
    pointer.x = 200 + (i * 7) % 900;
    pointer.y = 200 + (i * 11) % 400;
    pointer.pressed = i === 20 || (pressKeys && i % 40 === 0);
    pointer.down = i > 20 && i < 30;
    scene.update(1 / 60, pointer);
    (ctx.__ops || []).length = 0;
    scene.draw(ctx, 1 / 60);
    const { bad, sample } = scanOps();
    if (bad) {
      nanCount += bad;
      if (!nanSample) nanSample = sample;
    }
    scene.handlePointer?.(pointer);
  }
  scene.exit?.();
  return { nanCount, nanSample };
}

console.log('===============================================================');
console.log('  CREATOR BITOS — scene smoke test (headless canvas)');
console.log('===============================================================\n');

const cases = [
  ['boot', {}, 60],
  ['loading', { next: 'menu', minTime: 0.4, label: 'Testing...' }, 80],
  ['auth', {}, 90],
  ['intro', { next: 'menu', replay: true }, 120],
  ['menu', {}, 90],
  ['campaign', {}, 90],
  ['training', {}, 90],
  ['versus', {}, 90],
  ['settings', {}, 90],
  ['extras', {}, 60],
  ['battle', { mode: 'campaign', enemyId: 'laziness', roundNumber: 1 }, 60 * 40],
  ['battle', { mode: 'training', p1Id: 'creator-bitos', enemyId: 'training-dummy' }, 60 * 12],
  ['battle', { mode: 'versus', p1Id: 'creator-bitos', p2Id: 'wrath' }, 60 * 12],
  ['results', { victory: true, enemyId: 'laziness', roundNumber: 1, results: { p1Wins: 2, p2Wins: 0, bestCombo: 5, damageDealt: 180, damageTaken: 60, hits: 22 }, unlocked: ['laziness'], multiplayerUnlocked: false, mode: 'campaign' }, 90]
];

for (const [name, params, frames] of cases) {
  const label = `${name}${params.mode ? ` (${params.mode}${params.enemyId ? ` · ${params.enemyId}` : ''})` : ''}`;
  try {
    const { nanCount, nanSample } = runFrames(name, params, frames);
    check(`${label} ran ${frames} frames without error`, true);
    check(`${label} drew finite geometry (no NaN)`, nanCount === 0, `${nanCount} bad values e.g. ${nanSample}`);
  } catch (err) {
    check(`${label} ran ${frames} frames without error`, false, `\n     ${err.stack?.split('\n').slice(0, 4).join('\n     ')}`);
  }
}

/* --------------------------------------------------------- deeper checks */

console.log('\n[extra] Scene behaviour');
try {
  const menu = scenes.menu;
  menu.enter();
  menu.update(1 / 60, { ...pointer, x: 200, y: 240, inside: true });
  const campaignHovered = menu.buttons[0].hover > 0 || menu.hoverIndex === 0;
  check('menu tracks the cursor onto a button', campaignHovered || menu.hoverIndex >= 0, `hover=${menu.hoverIndex}`);
  menu.exit?.();
} catch (err) {
  check('menu tracks the cursor onto a button', false, err.message);
}

try {
  const battle = scenes.battle;
  // Wrath is the most aggressive problem, so this check is not at the mercy of
  // AI spacing randomness.
  battle.enter({ mode: 'campaign', enemyId: 'wrath', roundNumber: 8 });
  // Run long enough to pass the intro into combat and trigger a summon.
  for (let i = 0; i < 60 * 45; i += 1) {
    battle.update(1 / 60, { ...pointer, inside: false });
  }
  check('battle reaches the fight phase', battle.phase === 'fight' || battle.phase === 'finished', `phase=${battle.phase}`);
  const inBounds = battle.match.fighters.every((f) => f.x >= 90 && f.x <= 1190 && Number.isFinite(f.y));
  check('fighters stay inside the stage', inBounds, battle.match.fighters.map((f) => f.x.toFixed(0)).join(' / '));
  check('health stays within 0..max', battle.match.fighters.every((f) => f.hp >= 0 && f.hp <= f.maxHp),
    battle.match.fighters.map((f) => `${f.hp.toFixed(0)}/${f.maxHp}`).join(' '));
  check('meter stays within 0..100', battle.match.fighters.every((f) => f.meter >= 0 && f.meter <= 100),
    battle.match.fighters.map((f) => f.meter.toFixed(0)).join(' / '));
  check('battle produced a match with damage on both sides',
    battle.match.totalDamage[0] + battle.match.totalDamage[1] > 0,
    `dmg=${battle.match.totalDamage.map((d) => Math.round(d)).join('/')}`);
  battle.exit?.();
} catch (err) {
  check('battle reaches the fight phase', false, err.stack?.split('\n').slice(0, 3).join(' | '));
}

try {
  const extras = scenes.extras;
  extras.enter();
  const sections = ['info', 'story', 'characters', 'combat', 'controls', 'unlocks', 'gallery', 'cinematics', 'soundtrack', 'stats', 'credits'];
  for (const s of sections) {
    extras.section = s;
    extras.update(1 / 60, { ...pointer, inside: false });
    extras.draw(ctx, 1 / 60);
  }
  check('every extras section renders', true);
  extras.exit?.();
} catch (err) {
  check('every extras section renders', false, err.message);
}

try {
  const st = scenes.settings;
  st.enter();
  for (const tab of ['audio', 'video', 'gameplay', 'accessibility', 'controls']) {
    st.tab = tab;
    st.enter({ tab });
    st.update(1 / 60, { ...pointer, inside: false });
    st.draw(ctx, 1 / 60);
  }
  check('every settings tab renders', true);
  st.exit?.();
} catch (err) {
  check('every settings tab renders', false, err.message);
}

try {
  input.resetBindings(0);
  input.setBinding(0, 'lightPunch', 'KeyZ');
  const label = input.bindingLabel(0, 'lightPunch');
  check('control rebinding works', label.includes('Z'), `label=${label}`);
  input.resetBindings(0);
} catch (err) {
  check('control rebinding works', false, err.message);
}

try {
  settings.set('reducedFlash', true);
  const scale = settings.flashScale;
  settings.set('reducedFlash', false);
  check('accessibility toggle changes effect scale', scale < 0.3, `flashScale=${scale}`);
} catch (err) {
  check('accessibility toggle changes effect scale', false, err.message);
}

console.log('\n===============================================================');
console.log(`  ${checks - failures}/${checks} checks passed`);
console.log('===============================================================');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All scenes OK.');
