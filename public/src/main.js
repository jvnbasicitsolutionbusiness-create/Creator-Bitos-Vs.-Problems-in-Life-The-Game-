/**
 * main.js — engine bootstrap.
 *
 * Creates the surface, input, audio, particles, camera and scene manager;
 * registers every scene; restores any existing session; and runs the fixed
 * 60 Hz simulation loop at up to the display's refresh rate.
 */
import { Surface, STAGE_W, STAGE_H } from './core/canvas.js';
import { GameLoop, FIXED_DT } from './core/loop.js';
import { input } from './core/input.js';
import { api } from './core/api.js';
import { gameState } from './core/state.js';
import { SceneManager, TRANSITIONS } from './core/scene-manager.js';
import { ParticleSystem, Camera, TimeKeeper } from './animation/effects.js';
import { audio } from './audio/audio.js';
import { assets } from './assets/loader.js';
import { settings } from './config/settings.js';
import { drawText } from './core/canvas.js';
import { clamp } from './core/utils.js';

/* Scenes */
import { BootScene } from './scenes/boot.js';
import { LoadingScene } from './scenes/loading.js';
import { AuthScene } from './scenes/auth.js';
import { IntroScene } from './scenes/intro.js';
import { MenuScene } from './scenes/menu.js';
import { CampaignScene } from './scenes/campaign.js';
import { BattleScene } from './scenes/battle.js';
import { ResultsScene } from './scenes/results.js';
import { TrainingScene } from './scenes/training.js';
import { VersusScene } from './scenes/versus.js';
import { ExtrasScene } from './scenes/extras.js';
import { SettingsScene } from './scenes/settings.js';

// ?api=https://script.google.com/.../exec points the game at a Google Apps
// Script Web App instead of the same-origin server.
if (typeof location !== 'undefined' && location.search) {
  const override = new URLSearchParams(location.search).get('api');
  if (override) api.setBase(override);
} else if (globalThis.BITOS_API_BASE) {
  api.setBase(globalThis.BITOS_API_BASE);
}


const canvas = document.getElementById('game-canvas');
const bridge = document.getElementById('text-bridge');
const bootNote = document.getElementById('boot-note');

const surface = new Surface(canvas);
const particles = new ParticleSystem(700);
const camera = new Camera({ width: STAGE_W, height: STAGE_H });
const timeKeeper = new TimeKeeper();

input.attach(canvas, bridge);

const ctx = surface.ctx;

/* -------------------------------------------------------------------------- */
/* Scenes                                                                      */
/* -------------------------------------------------------------------------- */

const manager = new SceneManager({ ctx });
const scenes = {
  boot: new BootScene({ audio, particles }),
  loading: new LoadingScene({ audio, particles }),
  auth: new AuthScene({ audio }),
  intro: new IntroScene({ audio, particles, camera }),
  menu: new MenuScene({ audio, particles }),
  campaign: new CampaignScene({ audio, particles }),
  battle: new BattleScene({ audio, particles, camera, time: timeKeeper }),
  results: new ResultsScene({ audio, particles }),
  training: new TrainingScene({ audio }),
  versus: new VersusScene({ audio }),
  extras: new ExtrasScene({ audio }),
  settings: new SettingsScene({ audio })
};
for (const [name, scene] of Object.entries(scenes)) manager.register(name, scene);

/**
 * Boot scene hands over once the player presses anything.
 *
 * Order: opening cinematic -> loading -> auth (or the menu).
 *
 * The cinematic comes first because it is the reason someone keeps watching;
 * sign-up is a chore you should only be asked to do once you are already
 * interested. The account restore runs *behind* the cinematic rather than
 * before it, so the 20-odd seconds are spent loading instead of idling.
 */
scenes.boot.onStart = async () => {
  const restoreTask = (async () => {
    // Decide where accounts live before anything tries to read one. A static
    // deploy (GitHub Pages, Netlify, …) has no API, so this falls back to the
    // browser's own store and the game stays fully playable.
    await api.detectMode().catch(() => { api.mode = 'offline'; });
    if (api.isSignedIn) await gameState.restore();
    await assets.loadAll();
  })();

  const loadingParams = {
    task: restoreTask,
    minTime: 2.2,
    label: 'Preparing Creator Bitos...',
    next: 'decide',
    arena: 'menu'
  };

  // First run: play the opening cinematic, then fall into the loading screen
  // (which by then only has to wait out its minimum time). Returning players
  // skip it, and everyone can skip with any key. Extras can replay it.
  if (!gameState.hasSeenIntro) {
    manager.change('intro', {
      transition: TRANSITIONS.WIPE,
      duration: 0.9,
      params: { next: 'loading', nextParams: loadingParams }
    });
  } else {
    manager.change('loading', {
      transition: TRANSITIONS.WIPE,
      duration: 0.9,
      params: loadingParams
    });
  }

  // Wait for the restore, then route to auth or the menu.
  await restoreTask.catch(() => {});
  pendingDecision = gameState.isSignedIn ? 'signedIn' : 'signedOut';
};

let pendingDecision = null;

/* -------------------------------------------------------------------------- */
/* Loop                                                                        */
/* -------------------------------------------------------------------------- */

let playtimeAccumulator = 0;
let autosaveAccumulator = 0;
let fatalError = null;
let errorStrikes = 0;

/**
 * A single bad frame should not end the session. Three consecutive ones are a
 * real fault, so only then does the loop stop and the error screen appear.
 * The screen also prints the stack, because "ENGINE ERROR" on its own tells
 * you nothing about where it came from.
 */
function noteError(where, err) {
  console.error(`[${where}]`, err);
  const trace = err && err.stack ? String(err.stack) : String(err && err.message || err);
  fatalError = { message: err && err.message ? err.message : String(err), trace, where };
  errorStrikes += 1;
  if (errorStrikes < 3) {
    // Give it a moment; a transient failure (a dropped audio node, a resize
    // race) should not cost the player their run.
    setTimeout(() => { if (errorStrikes > 0) errorStrikes -= 1; }, 2500);
  }
}

/** Called every successful frame, so isolated blips expire on their own. */
function clearErrors() {
  if (fatalError && errorStrikes === 0) fatalError = null;
}

const loop = new GameLoop({
  update(dt) {
    try {
      timeKeeper.step(dt * 0); // keep the keeper ticking without changing time scale

      // Intercept the loading scene's "decide" hand-off.
      if (pendingDecision && manager.currentName === 'loading') {
        const target = pendingDecision;
        pendingDecision = null;
        // The cinematic has already played by this point (or was not wanted),
        // so signed-in players always land on the menu.
        manager.change(target === 'signedIn' ? 'menu' : 'auth', {
          transition: TRANSITIONS.WIPE,
          duration: 0.9
        });
      }

      const pointer = input.pointer;
      manager.update(dt, pointer);
      scenes[manager.currentName]?.handlePointer?.(pointer);

      // Periodic bookkeeping
      playtimeAccumulator += dt;
      autosaveAccumulator += dt;
      if (playtimeAccumulator >= 30) {
        gameState.addPlayTime(playtimeAccumulator);
        playtimeAccumulator = 0;
      }
      if (autosaveAccumulator >= 8) {
        autosaveAccumulator = 0;
        if (gameState.dirty && settings.get('autosave')) {
          gameState.flush().catch(() => {});
        }
      }

      input.endFrame();
      clearErrors();
    } catch (err) {
      noteError('update', err);
    }
  },

  render(dt) {
    surface.clear('#05030a');
    try {
      manager.draw(ctx, dt);
    } catch (err) {
      noteError('render', err);
    }

    if (settings.get('showFps')) {
      drawText(ctx, `${Math.round(loop.fps)} FPS · ${particles.count} particles`, 12, 710, {
        size: 13, weight: '700', color: 'rgba(255,255,255,0.55)', spacing: 1
      });
    }

    if (fatalError) {
      surface.clear('#0a0408');
      drawText(ctx, 'ENGINE ERROR', 640, 250, {
        size: 34, weight: '800', color: '#ff5c5c', align: 'center', spacing: 4
      });
      drawText(ctx, String(fatalError.message || '').slice(0, 110), 640, 300, {
        size: 16, weight: '700', color: '#ffffff', align: 'center'
      });
      // The stack is what actually identifies the bug, so put it on screen
      // as well as in the console (most players screenshot the screen).
      const trace = String(fatalError.trace || '').split('\n').slice(1, 5)
        .map((line) => line.trim().replace(/^at\s+/, '').slice(0, 96));
      trace.forEach((line, i) => {
        drawText(ctx, line, 640, 336 + i * 20, {
          size: 12, weight: '600', color: '#b9a9ac', align: 'center'
        });
      });
      drawText(ctx, fatalError.where ? `failed in: ${fatalError.where}` : '', 640, 430, {
        size: 12, weight: '700', color: '#7bb0d0', align: 'center'
      });
      drawText(ctx, 'Press F5 to restart · this text is also in the browser console', 640, 470, {
        size: 13, weight: '600', color: '#8d7f84', align: 'center', spacing: 2
      });
      if (errorStrikes >= 3) loop.stop();
    }
  }
});

window.addEventListener('keydown', (e) => {
  // Global audio unlock if the player skips the boot screen with a key.
  if (!audio.ready && ['Space', 'Enter', 'KeyJ', 'KeyK'].includes(e.code)) audio.init();
}, { capture: true });

window.addEventListener('beforeunload', () => {
  if (gameState.dirty) gameState.flush().catch(() => {});
});

window.addEventListener('error', (e) => {
  noteError('window', e.error || new Error(e.message));
});
window.addEventListener('unhandledrejection', (e) => {
  fatalError = e.reason || new Error('Unhandled promise rejection');
});

/* -------------------------------------------------------------------------- */
/* Start                                                                       */
/* -------------------------------------------------------------------------- */

manager.change('boot', { params: {} });
loop.start();

if (bootNote) {
  bootNote.classList.add('hidden');
  setTimeout(() => bootNote.remove(), 600);
}

// Expose a small debug handle (harmless, useful for testing in the console).
window.BITOS = { manager, scenes, gameState, settings, input, audio, loop, api, assets, camera, particles, FIXED_DT, clamp };

void FIXED_DT;
