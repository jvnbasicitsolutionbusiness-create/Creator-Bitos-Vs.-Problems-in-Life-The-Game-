/**
 * auth.js — LOGIN / SIGN UP.
 *
 * Real validation, real server round-trips, real error states. Field errors
 * come from the server (duplicate username/email, wrong password) and are shown
 * on the specific field that caused them.
 */
import { drawText, roundRect } from '../core/canvas.js';
import { Button, TextField, panel } from '../ui/widgets.js';
import { getArena } from '../arenas/arenas.js';
import { gameState } from '../core/state.js';
import { api } from '../core/api.js';
import { input } from '../core/input.js';
import { TRANSITIONS } from '../core/scene-manager.js';
import { clamp, damp, rgba, pulse } from '../core/utils.js';
import { NEUTRAL_POSE, clonePose, addPose, solvePosePlanted } from '../animation/skeleton.js';
import { CLIPS } from '../animation/clips.js';
import { drawStickman } from '../animation/stickman-renderer.js';
import { getCharacter, CAMPAIGN_ROUNDS } from '../characters/roster.js';

export class AuthScene {
  constructor({ audio }) {
    this.audio = audio;
    this.mode = 'login';
    this.time = 0;
    this.busy = false;
    this.error = null;
    this.notice = null;
    this.fields = {};
    this.buttons = [];
    this.tabHover = 0;
    this.glow = 0;
  }

  enter() {
    this.time = 0;
    this.error = null;
    this.notice = null;
    this.busy = false;
    this.audio?.playMusic('auth');
    this.#buildFields();
    this.#buildButtons();
  }

  exit() {
    input.endTextInput();
  }

  #buildFields() {
    const x = 640 - 200;
    this.fields = {};
    if (this.mode === 'login') {
      this.fields.identifier = new TextField({
        x, y: 300, w: 400, placeholder: 'Username or Email', value: this.fields.identifier?.value || '',
        onChange: () => this.#clearError(), accent: '#ff2b3c'
      });
      this.fields.password = new TextField({
        x, y: 366, w: 400, placeholder: 'Password', password: true, value: '',
        onChange: () => this.#clearError(),
        onSubmit: () => this.submit(), accent: '#ff2b3c'
      });
    } else {
      this.fields.username = new TextField({
        x, y: 236, w: 400, placeholder: 'Username', value: this.fields.username?.value || '',
        onChange: () => this.#clearError(), accent: '#ff2b3c'
      });
      this.fields.email = new TextField({
        x, y: 302, w: 400, placeholder: 'Email', value: this.fields.email?.value || '',
        onChange: () => this.#clearError(), accent: '#ff2b3c'
      });
      this.fields.password = new TextField({
        x, y: 368, w: 400, placeholder: 'Password (8+ chars, letters & numbers)', password: true, value: '',
        onChange: () => this.#clearError(), accent: '#ff2b3c'
      });
      this.fields.confirmPassword = new TextField({
        x, y: 434, w: 400, placeholder: 'Confirm Password', password: true, value: '',
        onChange: () => this.#clearError(), onSubmit: () => this.submit(), accent: '#ff2b3c'
      });
    }
  }

  #buildButtons() {
    const x = 640 - 200;
    const y = this.mode === 'login' ? 448 : 514;
    this.buttons = [
      new Button({
        x, y, w: 400, h: 56,
        label: this.mode === 'login' ? 'ENTER THE FIGHT' : 'CREATE ACCOUNT',
        accent: '#ff2b3c',
        onClick: () => this.submit()
      }),
      new Button({
        x, y: y + 68, w: 400, h: 44,
        label: this.mode === 'login' ? 'NO ACCOUNT? SIGN UP' : 'ALREADY REGISTERED? LOG IN',
        accent: '#3a2b30',
        size: 18,
        onClick: () => this.toggleMode()
      })
    ];
  }

  toggleMode() {
    this.mode = this.mode === 'login' ? 'register' : 'login';
    this.error = null;
    this.notice = null;
    input.endTextInput();
    this.#buildFields();
    this.#buildButtons();
    this.audio?.ui('click');
  }

  #clearError() {
    this.error = null;
    for (const f of Object.values(this.fields)) f.error = null;
  }

  #fieldError(field, message) {
    this.error = message;
    this.fields[field].error = message;
    this.audio?.ui('error');
  }

  /* ------------------------------------------------------------------ */

  async submit() {
    if (this.busy) return;
    this.#clearError();

    if (this.mode === 'login') {
      const identifier = this.fields.identifier.value.trim();
      const password = this.fields.password.value;
      if (!identifier) return this.#fieldError('identifier', 'Enter your username or email.');
      if (!password) return this.#fieldError('password', 'Enter your password.');

      await this.#run(async () => {
        await gameState.login({ username: identifier, password });
        this.#goNext();
      });
    } else {
      const username = this.fields.username.value.trim();
      const email = this.fields.email.value.trim();
      const password = this.fields.password.value;
      const confirmPassword = this.fields.confirmPassword.value;

      if (username.length < 3) return this.#fieldError('username', 'Username must be at least 3 characters.');
      if (!/^[a-zA-Z0-9_.-]+$/.test(username)) return this.#fieldError('username', 'Letters, numbers, dot, dash and underscore only.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return this.#fieldError('email', 'Enter a valid email address.');
      if (password.length < 8) return this.#fieldError('password', 'Password must be at least 8 characters.');
      if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return this.#fieldError('password', 'Include at least one letter and one number.');
      if (password !== confirmPassword) return this.#fieldError('confirmPassword', 'Passwords do not match.');

      await this.#run(async () => {
        await gameState.register({ username, email, password, confirmPassword });
        this.notice = 'Account created. Welcome, Creator.';
        this.#goNext();
      });
    }
    return undefined;
  }

  async #run(fn) {
    this.busy = true;
    try {
      await fn();
    } catch (err) {
      this.error = err.message || 'Something went wrong.';
      if (err.field && this.fields[err.field]) this.fields[err.field].error = this.error;
      this.audio?.ui('error');
    } finally {
      this.busy = false;
    }
  }

  #goNext() {
    input.endTextInput();
    const next = gameState.hasSeenIntro ? 'menu' : 'intro';
    this.manager.change(next, {
      transition: TRANSITIONS.WIPE,
      duration: 0.9,
      params:
        next === 'intro'
          ? { next: 'menu' }
          : {}
    });
    if (next === 'menu') {
      // Menu handles its own arrival; the intro routes onward by itself.
      void 0;
    }
  }

  /* ------------------------------------------------------------------ */

  update(dt, pointer) {
    this.time += dt;
    this.glow = damp(this.glow, this.busy ? 1 : 0, 6, dt);

    for (const f of Object.values(this.fields)) f.update(dt, pointer);
    for (const b of this.buttons) {
      b.disabled = this.busy;
      b.update(dt, pointer);
    }

    // Enter / Escape handling.
    const p1 = input.p1();
    if (!input.isTyping) {
      if (p1.wasPressed('confirm')) this.submit();
      if (p1.wasPressed('back')) {
        input.endTextInput();
      }
    } else if (p1.wasPressed('confirm')) {
      // The bridge already forwards Enter; focus the next field for flow.
      const keys = Object.keys(this.fields);
      const focused = keys.find((k) => this.fields[k].focused);
      const idx = keys.indexOf(focused);
      if (idx >= 0 && idx < keys.length - 1) this.fields[keys[idx + 1]].focus();
    }
  }

  draw(ctx, dt) {
    const t = this.time;
    getArena('menu').draw(ctx, t * 0.35, null, {});
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,7,0.55)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    /* ------------------------------------------------------ background */
    const def = getCharacter('creator-bitos');
    const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), CLIPS.idle({ t, rng: 1.2 }), 1);
    drawStickman(ctx, solvePosePlanted(pose, 300), {
      x: 640, y: 760, facing: 1, height: 300, color: def.color, accent: def.accent,
      lineWidth: 13, glow: 0.5, alpha: 0.16, eye: { x: 0.2, y: 0.4 }
    });
    // Enemy silhouettes behind the panel
    CAMPAIGN_ROUNDS.forEach((id, i) => {
      const c = getCharacter(id);
      const px = 150 + i * 108;
      const p = addPose(clonePose(c.stance || NEUTRAL_POSE), CLIPS.idle({ t: t * 0.6 + i, rng: i }), 1);
      drawStickman(ctx, solvePosePlanted(p, 120), {
        x: px, y: 700, facing: 1, height: 120, color: c.color,
        alpha: 0.1, silhouette: true, silhouetteColor: '#000000'
      });
    });

    /* ----------------------------------------------------------- title */
    drawText(ctx, 'CREATOR BITOS', 640, 120, {
      size: 54, weight: '800', color: '#ffffff', align: 'center', spacing: 12,
      shadow: { color: rgba('#ff2b3c', 0.9), blur: 28 }
    });
    drawText(ctx, 'VS PROBLEMS IN LIFE', 640, 156, {
      size: 18, weight: '700', color: '#b9a9ac', align: 'center', spacing: 9
    });

    /* ----------------------------------------------------------- panel */
    const panelH = this.mode === 'login' ? 330 : 400;
    panel(ctx, { x: 640 - 260, y: 196, w: 520, h: panelH, alpha: 0.85 });

    // Tabs
    const tabs = [
      { id: 'login', label: 'LOGIN', x: 640 - 260 + 22 },
      { id: 'register', label: 'SIGN UP', x: 640 - 260 + 130 }
    ];
    for (const tab of tabs) {
      const active = this.mode === tab.id;
      drawText(ctx, tab.label, tab.x, 236, {
        size: 20, weight: '800',
        color: active ? '#ffffff' : '#7c6d73',
        baseline: 'middle', spacing: 2
      });
      if (active) {
        ctx.save();
        ctx.fillStyle = '#ff2b3c';
        ctx.fillRect(tab.x - 4, 254, 92, 3);
        ctx.shadowColor = '#ff2b3c';
        ctx.shadowBlur = 12;
        ctx.fillRect(tab.x - 4, 254, 92, 3);
        ctx.restore();
      }
    }
    // Tab click targets
    for (const tab of tabs) {
      const w = 104;
      const rect = { x: tab.x - 6, y: 218, w, h: 36 };
      if (this.pointerInside?.(rect)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 4);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const f of Object.values(this.fields)) f.draw(ctx);
    for (const b of this.buttons) b.draw(ctx, dt);

    /* --------------------------------------------------------- status */
    if (this.busy) {
      const bob = pulse(t, 0.8);
      drawText(ctx, 'AUTHENTICATING...', 640, this.mode === 'login' ? 430 : 496, {
        size: 18, weight: '800', color: rgba('#ffd166', 0.6 + bob * 0.4), align: 'center', spacing: 4
      });
    }
    if (this.error) {
      drawText(ctx, this.error, 640, this.mode === 'login' ? 556 : 622, {
        size: 17, weight: '700', color: '#ff7b7b', align: 'center', spacing: 1
      });
    }
    if (this.notice) {
      drawText(ctx, this.notice, 640, 580, {
        size: 17, weight: '700', color: '#8ce99a', align: 'center', spacing: 1
      });
    }

    /* -------------------------------------------------------- footer */
    // Two very different offline states, and the player must be able to tell
    // them apart: "no backend, saving on this device" is fine, "backend broken"
    // means progress is genuinely at risk.
    let status = 'DATABASE: CONNECTED';
    let statusColor = '#5f8f6a';
    if (api.isOffline) {
      status = 'OFFLINE MODE — ACCOUNT AND PROGRESS SAVED ON THIS DEVICE';
      statusColor = '#7bb0d0';
    } else if (!api.online) {
      status = 'DATABASE: UNREACHABLE — PROGRESS WILL NOT SAVE';
      statusColor = '#d07a7a';
    }
    drawText(ctx, status, 640, 690, {
      size: 13, weight: '700', color: statusColor, align: 'center', spacing: 2
    });
    drawText(ctx, 'Press ENTER to continue · TAB between fields', 640, 708, {
      size: 12, weight: '600', color: '#6d6469', align: 'center', spacing: 1.4
    });

    void clamp;
  }

  /** Called by the game loop so tabs can be clicked. */
  handlePointer(pointer) {
    this.pointerInside = (rect) =>
      pointer.inside && pointer.x >= rect.x && pointer.x <= rect.x + rect.w && pointer.y >= rect.y && pointer.y <= rect.y + rect.h;

    const tabs = [
      { id: 'login', x: 640 - 260 + 22 },
      { id: 'register', x: 640 - 260 + 130 }
    ];
    for (const tab of tabs) {
      const rect = { x: tab.x - 6, y: 218, w: 104, h: 36 };
      if (this.pointerInside(rect) && pointer.pressed && this.mode !== tab.id) {
        this.toggleMode();
      }
    }
  }
}
