/**
 * menu.js — the main menu.
 *
 * Creator Bitos stands in the background, alive: breathing, shifting his
 * weight, occasionally adjusting his guard. He tracks the cursor with his head,
 * eyes and upper body (never by rotating his whole body), and his attention
 * snaps to whichever menu item is hovered — including a cautious look toward
 * LOG OUT.
 */
import { drawText, roundRect, slantRect } from '../core/canvas.js';
import { Button, panel } from '../ui/widgets.js';
import { getArena } from '../arenas/arenas.js';
import { getCharacter, CAMPAIGN_ROUNDS } from '../characters/roster.js';
import { NEUTRAL_POSE, clonePose, addPose, solvePosePlanted } from '../animation/skeleton.js';
import { CLIPS } from '../animation/clips.js';
import { drawStickman, drawShadow } from '../animation/stickman-renderer.js';
import { gameState, SAVE_STATUS } from '../core/state.js';
import { input } from '../core/input.js';
import { TRANSITIONS } from '../core/scene-manager.js';
import { clamp, lerp, damp, rgba, rand, chance, TAU, pulse } from '../core/utils.js';
import { settings } from '../config/settings.js';
import { audio } from '../audio/audio.js';

const MENU_ITEMS = [
  { id: 'campaign', label: 'CAMPAIGN', sub: 'Face the ten problems', accent: '#ff2b3c' },
  { id: 'multiplayer', label: 'MULTIPLAYER', sub: 'Player 1 vs Player 2', accent: '#22d3ee' },
  { id: 'training', label: 'TRAINING', sub: 'Learn the combat system', accent: '#f5c518' },
  { id: 'extras', label: 'EXTRAS', sub: 'Story, characters, records', accent: '#c084fc' },
  { id: 'settings', label: 'SETTINGS', sub: 'Audio, video, controls', accent: '#9aa0a6' },
  { id: 'logout', label: 'LOG OUT', sub: 'Return to authentication', accent: '#6b5a5f' }
];

export class MenuScene {
  constructor({ audio: audioEngine, particles }) {
    this.audio = audioEngine;
    this.particles = particles;
    this.time = 0;
    this.buttons = [];
    this.hoverIndex = -1;
    this.attention = { x: 900, y: 400 }; // where Bitos is looking
    this.gaze = { x: 0, y: 0 };
    this.head = { x: 0, y: 0 };
    this.lean = 0;
    this.idleTimer = rand(4, 2);
    this.idleFlavour = null;
    this.idleFlavourTime = 0;
    this.confirmLogout = false;
    this.logoutButtons = [];
    this.enterTime = 0;
    this.reveal = 0;
  }

  enter() {
    this.time = 0;
    this.enterTime = 0;
    this.reveal = 0;
    this.confirmLogout = false;
    this.audio?.playMusic('menu');
    this.#buildButtons();
    this.#buildLogoutPanel();
  }

  #buildButtons() {
    const startY = 214;
    const gap = 66;
    this.buttons = MENU_ITEMS.map((item, i) => {
      const locked = item.id === 'multiplayer' && !gameState.multiplayerUnlocked;
      return new Button({
        x: 92,
        y: startY + i * gap,
        w: 380,
        h: 54,
        label: item.label,
        sub: locked ? null : item.sub,
        accent: item.accent,
        align: 'left',
        size: 27,
        disabled: locked,
        lockedNote: locked ? 'LOCKED — DEFEAT ALL 10 PROBLEMS' : null,
        onClick: () => this.#select(item.id)
      });
    });
  }

  #buildLogoutPanel() {
    this.logoutButtons = [
      new Button({
        x: 470, y: 430, w: 160, h: 50, label: 'YES', accent: '#ff2b3c',
        onClick: () => this.#doLogout()
      }),
      new Button({
        x: 650, y: 430, w: 160, h: 50, label: 'NO', accent: '#3a2b30',
        onClick: () => {
          this.confirmLogout = false;
          audio.ui('back');
        }
      })
    ];
  }

  #select(id) {
    if (id === 'multiplayer' && !gameState.multiplayerUnlocked) {
      audio.ui('error');
      this.toast = 'MULTIPLAYER UNLOCKS AFTER ALL 10 PROBLEMS';
      this.toastTime = 2.4;
      return;
    }
    switch (id) {
      case 'campaign':
        this.manager.change('campaign', { transition: TRANSITIONS.SLIDE, duration: 0.8 });
        break;
      case 'multiplayer':
        this.manager.change('versus', { transition: TRANSITIONS.SLIDE, duration: 0.8 });
        break;
      case 'training':
        this.manager.change('training', { transition: TRANSITIONS.SLIDE, duration: 0.8 });
        break;
      case 'extras':
        this.manager.change('extras', { transition: TRANSITIONS.SLIDE, duration: 0.8 });
        break;
      case 'settings':
        this.manager.change('settings', { transition: TRANSITIONS.SLIDE, duration: 0.8 });
        break;
      case 'logout':
        this.confirmLogout = true;
        audio.ui('click');
        break;
      default:
        break;
    }
  }

  async #doLogout() {
    this.confirmLogout = false;
    audio.ui('click');
    try {
      await gameState.flush();
    } catch {
      /* already surfaced by the save indicator */
    }
    await gameState.logout();
    this.manager.change('auth', { transition: TRANSITIONS.BLACK, duration: 1.0 });
  }

  /* ------------------------------------------------------------------ */

  update(dt, pointer) {
    this.time += dt;
    this.enterTime += dt;
    this.reveal = clamp(this.reveal + dt * 1.6, 0, 1);
    if (this.toastTime > 0) this.toastTime -= dt;

    if (this.confirmLogout) {
      for (const b of this.logoutButtons) b.update(dt, pointer);
      const p1 = input.p1();
      if (p1.wasPressed('back')) this.confirmLogout = false;
      // Bitos watches the confirmation panel.
      this.#lookAt({ x: 640, y: 400 }, dt, { cautious: true });
      return;
    }

    let hovered = null;
    for (let i = 0; i < this.buttons.length; i += 1) {
      const b = this.buttons[i];
      if (b.update(dt, pointer)) return;
      if (b.hover > 0.5) hovered = { index: i, button: b, item: MENU_ITEMS[i] };
    }
    this.hoverIndex = hovered ? hovered.index : -1;

    // Keyboard navigation
    const p1 = input.p1();
    if (p1.wasPressed('down') || p1.wasPressed('up')) {
      if (this.hoverIndex === -1) this.hoverIndex = 0;
      this.hoverIndex = (this.hoverIndex + (p1.wasPressed('down') ? 1 : MENU_ITEMS.length - 1)) % MENU_ITEMS.length;
      audio.ui('hover');
    }
    if (this.hoverIndex >= 0 && p1.wasPressed('confirm')) {
      this.#select(MENU_ITEMS[this.hoverIndex].id);
      return;
    }

    // Where should Bitos look?
    if (hovered) {
      const b = hovered.button;
      this.#lookAt({ x: b.x + b.w * 0.72, y: b.y + b.h / 2 }, dt, { cautious: hovered.item.id === 'logout' });
    } else if (pointer.inside) {
      this.#lookAt({ x: pointer.x, y: pointer.y }, dt, {});
    } else {
      this.#lookAt({ x: 900, y: 420 }, dt, {});
    }

    // Occasional random idle flourish
    this.idleTimer -= dt;
    if (this.idleTimer <= 0 && !hovered) {
      this.idleFlavour = chance(0.34) ? 'taunt' : chance(0.5) ? 'stun' : 'block';
      this.idleFlavourTime = rand(1.6, 0.8);
      this.idleTimer = rand(9, 5);
    }
    if (this.idleFlavourTime > 0) {
      this.idleFlavourTime -= dt;
      if (this.idleFlavourTime <= 0) this.idleFlavour = null;
    }
  }

  #lookAt(target, dt, { cautious = false } = {}) {
    this.attention.x = damp(this.attention.x, target.x, 6, dt);
    this.attention.y = damp(this.attention.y, target.y, 6, dt);

    const headX = 830;
    const headY = 340;
    const dx = this.attention.x - headX;
    const dy = this.attention.y - headY;
    const len = Math.max(1, Math.hypot(dx, dy));

    // Eyes track finely; the head follows more slowly and with less range.
    const targetGaze = { x: clamp(dx / 420, -1, 1), y: clamp(dy / 300, -1, 1) };
    this.gaze.x = damp(this.gaze.x, targetGaze.x, 9, dt);
    this.gaze.y = damp(this.gaze.y, targetGaze.y, 7, dt);
    this.head.x = damp(this.head.x, clamp(dx / len, -1, 1) * Math.min(1, len / 300) * 0.055, 5, dt);
    this.head.y = damp(this.head.y, clamp(dy / len, -1, 1) * Math.min(1, len / 300) * 0.035, 5, dt);
    this.lean = damp(this.lean, clamp(dx / 700, -1, 1) * 4 + (cautious ? -2 : 0), 4, dt);
    this.cautious = damp(this.cautious || 0, cautious ? 1 : 0, 6, dt);
  }

  /* ------------------------------------------------------------------ */

  draw(ctx, dt) {
    const t = this.time;
    getArena('menu').draw(ctx, t * 0.4, null, {});

    this.#drawBitos(ctx, t, dt);

    /* --------------------------------------------------------- title */
    const reveal = this.reveal;
    ctx.save();
    ctx.globalAlpha = reveal;
    drawText(ctx, 'CREATOR BITOS', 640, 96, {
      size: 62, weight: '800', color: '#ffffff', align: 'center', spacing: 14,
      shadow: { color: rgba('#ff2b3c', 0.9), blur: 32 }
    });
    drawText(ctx, 'VS PROBLEMS IN LIFE', 640, 134, {
      size: 19, weight: '700', color: '#b9a9ac', align: 'center', spacing: 10
    });
    ctx.restore();

    /* ------------------------------------------------------- buttons */
    for (let i = 0; i < this.buttons.length; i += 1) {
      const b = this.buttons[i];
      const stagger = clamp(reveal * 1.6 - i * 0.16, 0, 1);
      ctx.save();
      ctx.globalAlpha = stagger;
      ctx.translate((1 - stagger) * 40, 0);
      b.draw(ctx, dt);
      ctx.restore();
    }

    this.#drawSidebar(ctx, dt);
    this.#drawSaveIndicator(ctx);

    if (this.toastTime > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(this.toastTime, 0, 1);
      drawText(ctx, this.toast, 92, 640, { size: 15, weight: '800', color: '#d8b46a', spacing: 1.4 });
      ctx.restore();
    }

    if (this.confirmLogout) this.#drawLogoutConfirm(ctx, dt);
  }

  #drawBitos(ctx, t, dt) {
    const def = getCharacter('creator-bitos');
    const height = 300;
    const x = 830;
    const y = 640;

    // Breathing / idle base
    let delta = CLIPS.idle({ t, rng: 0.4, guard: 0.7 });

    // Hover reaction: raise the guard slightly and shift weight.
    if (this.hoverIndex >= 0) {
      delta = addPose(delta, { spine: -2, armF: [-8, 6], armB: [-6, 4], root: { x: 3 } }, 1);
    }

    // Random flourishes
    if (this.idleFlavour === 'taunt') delta = addPose(delta, CLIPS.taunt({ p: (t * 0.6) % 1 }), 0.5);
    if (this.idleFlavour === 'block') delta = addPose(delta, CLIPS.block({ p: 1, hit: 0 }), 0.35);

    // Cursor tracking: head tilt, lean and a subtle upper-body offset.
    const gazeDelta = {
      head: { x: this.head.x, y: this.head.y },
      neck: -this.gaze.x * 7 - this.cautious * 3,
      lean: this.lean * 0.5,
      spine: this.lean * 0.35,
      armF: [this.gaze.x * 5, -this.gaze.x * 3],
      armB: [this.gaze.x * 3, -this.gaze.x * 2],
      root: { x: this.gaze.x * 4, y: this.gaze.y * -2 }
    };
    delta = addPose(delta, gazeDelta, 1);

    if (!this.smooth) this.smooth = clonePose(def.stance || NEUTRAL_POSE);
    const target = addPose(clonePose(def.stance || NEUTRAL_POSE), delta, 1);
    for (const key of Object.keys(target)) {
      if (typeof target[key] === 'number') this.smooth[key] = damp(this.smooth[key] ?? 0, target[key], 10, dt);
      else if (Array.isArray(target[key])) {
        this.smooth[key][0] = damp(this.smooth[key][0], target[key][0], 10, dt);
        this.smooth[key][1] = damp(this.smooth[key][1], target[key][1], 10, dt);
      } else if (target[key] && typeof target[key] === 'object') {
        this.smooth[key].x = damp(this.smooth[key].x ?? 0, target[key].x ?? 0, 10, dt);
        this.smooth[key].y = damp(this.smooth[key].y ?? 0, target[key].y ?? 0, 10, dt);
      }
    }

    const solved = solvePosePlanted(this.smooth, height);
    drawShadow(ctx, x, y + 6, height * 0.3, 0.55);

    // Backlight so he separates from the arena
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y - height * 0.5, 10, x, y - height * 0.5, height * 0.8);
    g.addColorStop(0, rgba('#ff2b3c', 0.18));
    g.addColorStop(1, rgba('#ff2b3c', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - height, y - height * 1.3, height * 2, height * 1.6);
    ctx.restore();

    drawStickman(ctx, solved, {
      x,
      y,
      facing: -1, // facing into the menu
      height,
      color: def.color,
      accent: def.accent,
      lineWidth: 12,
      glow: 1.3,
      eye: { x: clamp(this.gaze.x * -1, -1, 1), y: clamp(-this.gaze.y, -1, 1) },
      eyeStyle: this.cautious > 0.5 ? 'wide' : 'angry',
      charId: 'creator-bitos'
    });
  }

  #drawSidebar(ctx, dt) {
    const x = 800;
    const y = 214;
    const w = 388;
    const h = 250;
    panel(ctx, { x, y, w, h, alpha: 0.7 });

    const scale = settings.uiScale;
    drawText(ctx, gameState.username || 'CREATOR', x + 22, y + 52, {
      size: 26 * scale, weight: '800', color: '#ffffff', baseline: 'middle', spacing: 2
    });
    drawText(ctx, 'CAMPAIGN PROGRESS', x + 22, y + 88, {
      size: 13, weight: '700', color: '#8d7f84', spacing: 2
    });

    // Progress pips
    const total = CAMPAIGN_ROUNDS.length;
    for (let i = 0; i < total; i += 1) {
      const px = x + 22 + i * 34;
      const cleared = gameState.campaignProgress > i;
      const next = gameState.campaignProgress === i;
      ctx.save();
      roundRect(ctx, px, y + 100, 28, 12, 3);
      ctx.fillStyle = cleared ? '#ff2b3c' : next ? 'rgba(255,43,60,0.35)' : 'rgba(255,255,255,0.08)';
      ctx.fill();
      if (next) {
        ctx.strokeStyle = rgba('#ff2b3c', 0.5 + 0.5 * pulse(this.time, 1.2));
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }

    drawText(ctx, `${gameState.campaignProgress} / ${total} PROBLEMS DEFEATED`, x + 22, y + 138, {
      size: 16, weight: '800', color: '#efe8e6', spacing: 1.6
    });

    const stats = gameState.player?.stats || {};
    const rows = [
      ['MATCHES', String(stats.matchesPlayed || 0)],
      ['BEST COMBO', `${stats.bestCombo || 0}`],
      ['CHARACTERS', `${gameState.unlockedCharacters.length} / 11`],
      ['MULTIPLAYER', gameState.multiplayerUnlocked ? 'UNLOCKED' : 'LOCKED']
    ];
    rows.forEach(([label, value], i) => {
      const ry = y + 170 + i * 22;
      drawText(ctx, label, x + 22, ry, { size: 13, weight: '700', color: '#8d7f84', baseline: 'middle', spacing: 1.4 });
      drawText(ctx, value, x + w - 22, ry, {
        size: 14,
        weight: '800',
        color: label === 'MULTIPLAYER' && !gameState.multiplayerUnlocked ? '#d8b46a' : '#ffffff',
        align: 'right',
        baseline: 'middle'
      });
    });
    void dt;
  }

  #drawSaveIndicator(ctx) {
    const status = gameState.saveStatus;
    const text =
      status === SAVE_STATUS.SAVING ? 'SAVING…'
        : status === SAVE_STATUS.SAVED ? 'PROGRESS SAVED'
          : status === SAVE_STATUS.FAILED ? 'SAVE FAILED — RETRYING' : '';
    const color =
      status === SAVE_STATUS.FAILED ? '#ff7b7b' : status === SAVE_STATUS.SAVING ? '#ffd166' : '#7fbf8a';
    if (!text) return;
    drawText(ctx, text, 92, 176, { size: 13, weight: '800', color, spacing: 2 });
  }

  #drawLogoutConfirm(ctx, dt) {
    ctx.save();
    ctx.fillStyle = 'rgba(3,2,4,0.78)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    panel(ctx, { x: 390, y: 250, w: 500, h: 260, alpha: 0.96 });
    drawText(ctx, 'DO YOU WISH TO LOG OUT?', 640, 320, {
      size: 28, weight: '800', color: '#ffffff', align: 'center', spacing: 3
    });
    drawText(ctx, 'Your progress is saved before you leave.', 640, 356, {
      size: 15, weight: '600', color: '#a3949a', align: 'center', spacing: 1.2
    });
    for (const b of this.logoutButtons) b.draw(ctx, dt);

    // Bitos watches cautiously from the background
    const def = getCharacter('creator-bitos');
    const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), CLIPS.idle({ t: this.time, rng: 2 }), 1);
    drawStickman(ctx, solvePosePlanted(pose, 150), {
      x: 640, y: 640, facing: 1, height: 150, color: def.color, accent: def.accent,
      lineWidth: 7, glow: 0.8, alpha: 0.35, eye: { x: 0.1, y: -0.2 }, eyeStyle: 'wide',
      charId: 'creator-bitos'
    });
    void slantRect;
    void lerp;
    void TAU;
  }
}
