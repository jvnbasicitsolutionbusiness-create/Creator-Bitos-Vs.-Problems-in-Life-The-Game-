/**
 * settings.js — Audio / Video / Gameplay / Accessibility / Controls.
 *
 * Every option is live: volumes change immediately, screen-shake and flash
 * scaling apply the moment they move, and control rebinding captures a real
 * keypress. Changes persist locally at once and sync to the player database.
 */
import { drawText, roundRect } from '../core/canvas.js';
import { Button, Slider, Toggle, Cycle, TabBar, ScrollArea, panel, s } from '../ui/widgets.js';
import { getArena } from '../arenas/arenas.js';
import { SETTING_SCHEMA, formatSettingValue, QUALITY_ORDER, DIFFICULTY_ORDER, settings } from '../config/settings.js';
import { input, ACTION_LABELS, DEFAULT_BINDINGS_P1, DEFAULT_BINDINGS_P2 } from '../core/input.js';
import { gameState } from '../core/state.js';
import { TRANSITIONS } from '../core/scene-manager.js';
import { clamp, rgba } from '../core/utils.js';
import { audio } from '../audio/audio.js';

const TABS = [
  { id: 'audio', label: 'AUDIO' },
  { id: 'video', label: 'VIDEO' },
  { id: 'gameplay', label: 'GAMEPLAY' },
  { id: 'accessibility', label: 'ACCESSIBILITY' },
  { id: 'controls', label: 'CONTROLS' }
];

export class SettingsScene {
  constructor({ audio: audioEngine }) {
    this.audio = audioEngine;
    this.time = 0;
    this.tab = 'audio';
    this.widgets = [];
    this.tabs = null;
    this.backButton = null;
    this.resetButton = null;
    this.scroll = null;
    this.rebinding = null;
  }

  enter(params = {}) {
    this.time = 0;
    this.tab = params.tab || 'audio';
    this.rebinding = null;
    this.tabs = new TabBar({
      x: 60, y: 180, width: 220, tabs: TABS, value: this.tab,
      onChange: (id) => {
        this.tab = id;
        this.#buildWidgets();
      }
    });
    this.backButton = new Button({
      x: 60, y: 640, w: 190, h: 46, label: 'BACK', accent: '#3a2b30', size: 18,
      onClick: () => this.manager.change('menu', { transition: TRANSITIONS.SLIDE, duration: 0.7 })
    });
    this.resetButton = new Button({
      x: 1030, y: 640, w: 190, h: 46, label: 'RESET DEFAULTS', accent: '#3a2b30', size: 16,
      onClick: () => {
        settings.reset();
        input.resetBindings(0);
        input.resetBindings(1);
        this.#buildWidgets();
        audio.ui('click');
        this.toast = 'SETTINGS RESTORED TO DEFAULTS';
        this.toastTime = 2.2;
      }
    });
    this.#buildWidgets();
  }

  #buildWidgets() {
    this.widgets = [];
    const group = SETTING_SCHEMA.find((g) => g.group.toLowerCase() === this.tab);
    if (!group) return;

    let y = 190;
    for (const item of group.items) {
      const value = settings.get(item.key);
      if (item.type === 'slider') {
        this.widgets.push(new Slider({
          x: 340, y, w: 420, label: item.label, min: item.min, max: item.max, step: item.step,
          value,
          format: (v) => formatSettingValue(item, v),
          onChange: (v) => this.#apply(item.key, v)
        }));
        y += 62;
      } else if (item.type === 'toggle') {
        this.widgets.push(new Toggle({
          x: 340, y, label: item.label, value, accent: '#ff2b3c',
          onChange: (v) => this.#apply(item.key, v)
        }));
        y += 52;
      } else if (item.type === 'cycle') {
        this.widgets.push(new Cycle({
          x: 340, y: y + 14, w: 420, label: item.label, options: item.options, value,
          format: (v) => formatSettingValue(item, v),
          onChange: (v) => this.#apply(item.key, v)
        }));
        y += 66;
      }
    }
    this.contentHeight = y - 190;
    this.scroll = new ScrollArea({ x: 320, y: 170, w: 700, h: 440, contentHeight: this.contentHeight + 40 });
  }

  #apply(key, value) {
    settings.set(key, value);
    if (key === 'fullscreen') this.#applyFullscreen(value);
    if (['masterVolume', 'musicVolume', 'sfxVolume', 'voiceVolume'].includes(key)) audio.applySettings(key);
  }

  #applyFullscreen(enabled) {
    try {
      if (enabled && document.fullscreenEnabled && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else if (!enabled && document.fullscreenElement) {
        document.exitFullscreen?.();
      }
    } catch {
      /* Fullscreen can be blocked by the browser; the setting still persists. */
    }
  }

  update(dt, pointer) {
    this.time += dt;
    if (this.toastTime > 0) this.toastTime -= dt;
    this.tabs.update(dt, pointer);
    this.backButton.update(dt, pointer);
    this.resetButton.update(dt, pointer);

    if (this.rebinding) {
      // Waiting for a key: input.js routes the next keypress here.
      if (!input.onKeyCaptured) {
        this.rebinding = null;
        this.#buildWidgets();
      }
      return;
    }

    if (this.tab === 'controls') {
      this.controlsScroll?.update(dt, pointer);
      const rows = this.#controlRows();
      for (const row of rows) {
        if (pointer.inside && pointer.x >= row.x && pointer.x <= row.x + row.w && pointer.y >= row.y && pointer.y <= row.y + row.h) {
          if (pointer.pressed) this.#beginRebind(row.device, row.action);
        }
      }
      return;
    }

    this.scroll?.update(dt, pointer);
    for (const w of this.widgets) w.update(dt, pointer);
  }

  #beginRebind(device, action) {
    this.rebinding = { device, action };
    this.toast = `PRESS A KEY FOR ${ACTION_LABELS[action]} (PLAYER ${device + 1})`;
    this.toastTime = 4;
    input.onKeyCaptured = (code) => {
      if (code !== 'Escape') {
        input.setBinding(device, action, code);
        audio.ui('click');
        this.toast = `${ACTION_LABELS[action]} BOUND TO ${code}`;
      } else {
        this.toast = 'REBIND CANCELLED';
      }
      this.toastTime = 1.8;
      this.rebinding = null;
      input.onKeyCaptured = null;
      this.#buildWidgets();
    };
  }

  #controlRows() {
    const rows = [];
    const devices = [0, 1];
    let y = 190;
    for (const device of devices) {
      const actions = Object.keys(device === 0 ? DEFAULT_BINDINGS_P1 : DEFAULT_BINDINGS_P2);
      for (const action of actions) {
        const x = device === 0 ? 340 : 720;
        rows.push({ device, action, x, y, w: 340, h: 34 });
        y += 36;
      }
      y = 190;
    }
    this.controlsScroll = new ScrollArea({ x: 320, y: 170, w: 760, h: 440, contentHeight: Math.max(460, Object.keys(DEFAULT_BINDINGS_P1).length * 36 + 40) });
    return rows;
  }

  draw(ctx, dt) {
    const t = this.time;
    getArena('menu').draw(ctx, t * 0.25, null, {});
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,7,0.8)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    drawText(ctx, 'SETTINGS', 640, 78, {
      size: 40, weight: '800', color: '#ffffff', align: 'center', spacing: 10,
      shadow: { color: rgba('#ff2b3c', 0.7), blur: 22 }
    });

    this.tabs.draw(ctx);

    // Content plate
    panel(ctx, { x: 320, y: 160, w: 700, h: 460, alpha: 0.72 });

    if (this.tab === 'controls') {
      this.#drawControls(ctx, dt);
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(320, 170, 700, 440);
      ctx.clip();
      ctx.translate(0, -this.scroll.offset);
      for (const w of this.widgets) w.draw(ctx);
      ctx.restore();
      if (this.scroll.maxOffset > 4) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(1030, 170, 6, 440);
        const thumbH = Math.max(40, (440 / this.scroll.contentHeight) * 440);
        const thumbY = 170 + (this.scroll.offset / this.scroll.maxOffset) * (440 - thumbH);
        ctx.fillStyle = 'rgba(255,43,60,0.7)';
        ctx.fillRect(1030, thumbY, 6, thumbH);
      }
    }

    this.backButton.draw(ctx, dt);
    this.resetButton.draw(ctx, dt);

    if (this.toastTime > 0) {
      drawText(ctx, this.toast, 640, 600, {
        size: 16, weight: '800', color: '#ffd166', align: 'center', spacing: 1.6
      });
    }

    // Footer: save status
    const status = gameState.saveStatus;
    drawText(ctx,
      status === 'failed' ? 'SAVE FAILED — CHECK CONNECTION' : status === 'saving' ? 'SAVING…' : 'SETTINGS SAVED',
      640, 700, {
        size: 12, weight: '700',
        color: status === 'failed' ? '#ff7b7b' : '#6d6469',
        align: 'center', spacing: 2
      });
    void clamp;
    void s;
  }

  #drawControls(ctx, dt) {
    void dt;
    const rows = this.#controlRows();
    const offset = this.controlsScroll?.offset || 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(320, 170, 760, 440);
    ctx.clip();
    ctx.translate(0, -offset);

    drawText(ctx, 'PLAYER 1', 340, 186, { size: 16, weight: '800', color: '#ff2b3c', spacing: 3 });
    drawText(ctx, 'PLAYER 2', 720, 186, { size: 16, weight: '800', color: '#22d3ee', spacing: 3 });

    for (const row of rows) {
      const active = this.rebinding && this.rebinding.device === row.device && this.rebinding.action === row.action;
      ctx.save();
      roundRect(ctx, row.x, row.y, row.w, row.h - 6, 5);
      ctx.fillStyle = active ? rgba('#ff2b3c', 0.35) : 'rgba(255,255,255,0.04)';
      ctx.fill();
      if (active) {
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
      drawText(ctx, ACTION_LABELS[row.action] || row.action, row.x + 14, row.y + 14, {
        size: 14, weight: '700', color: '#cfc2c6', baseline: 'middle'
      });
      drawText(ctx, input.bindingLabel(row.device, row.action), row.x + row.w - 14, row.y + 14, {
        size: 14, weight: '800', color: active ? '#ffd166' : '#ffffff', align: 'right', baseline: 'middle', spacing: 1
      });
    }
    ctx.restore();

    drawText(ctx, 'CLICK ANY BINDING TO REASSIGN IT', 640, 630, {
      size: 13, weight: '700', color: '#8d7f84', align: 'center', spacing: 2
    });
  }
}

void QUALITY_ORDER;
void DIFFICULTY_ORDER;
