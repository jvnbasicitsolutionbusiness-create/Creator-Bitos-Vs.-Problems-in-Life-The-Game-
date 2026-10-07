/**
 * training.js — character select for Training, then the training battle.
 *
 * Creator Bitos is always available; every defeated problem becomes selectable.
 * The dummy has effectively infinite health, never dies, and the scene keeps a
 * live combo / damage readout (spec section 18).
 */
import { drawText, roundRect } from '../core/canvas.js';
import { Button, panel } from '../ui/widgets.js';
import { getArena } from '../arenas/arenas.js';
import { getCharacter, ROSTER_ORDER } from '../characters/roster.js';
import { NEUTRAL_POSE, clonePose, addPose, solvePosePlanted } from '../animation/skeleton.js';
import { CLIPS } from '../animation/clips.js';
import { drawStickman } from '../animation/stickman-renderer.js';
import { gameState } from '../core/state.js';
import { input } from '../core/input.js';
import { TRANSITIONS } from '../core/scene-manager.js';
import { clamp, damp, rgba, rand, TAU } from '../core/utils.js';
import { settings } from '../config/settings.js';
import { audio } from '../audio/audio.js';

export class TrainingScene {
  constructor({ audio: audioEngine }) {
    this.audio = audioEngine;
    this.time = 0;
    this.selected = 0;
    this.buttons = [];
    this.cards = [];
    this.info = null;
  }

  enter() {
    this.time = 0;
    this.audio?.playMusic('training');
    this.#build();
    this.selected = 0;
  }

  #build() {
    this.buttons = [
      new Button({
        x: 40, y: 640, w: 190, h: 46, label: 'BACK', accent: '#3a2b30', size: 18,
        onClick: () => this.manager.change('menu', { transition: TRANSITIONS.SLIDE, duration: 0.7 })
      }),
      new Button({
        x: 960, y: 640, w: 280, h: 46, label: 'ENTER TRAINING', accent: '#f5c518', size: 20,
        onClick: () => this.#start()
      })
    ];

    this.cards = ROSTER_ORDER.map((id, i) => {
      const def = getCharacter(id);
      return {
        id,
        def,
        index: i,
        unlocked: gameState.isUnlocked(id),
        x: 40 + (i % 6) * 200,
        y: 168 + Math.floor(i / 6) * 210,
        w: 184,
        h: 190,
        hover: 0
      };
    });
  }

  #start() {
    const card = this.cards[this.selected];
    if (!card.unlocked) {
      audio.ui('error');
      return;
    }
    audio.ui('click');
    this.manager.change('battle', {
      transition: TRANSITIONS.BLACK,
      duration: 0.9,
      params: { mode: 'training', p1Id: card.id, enemyId: 'training-dummy' }
    });
  }

  update(dt, pointer) {
    this.time += dt;
    for (const b of this.buttons) b.update(dt, pointer);

    for (const card of this.cards) {
      const over = pointer.inside &&
        pointer.x >= card.x && pointer.x <= card.x + card.w &&
        pointer.y >= card.y && pointer.y <= card.y + card.h;
      card.hover = damp(card.hover, over ? 1 : 0, 14, dt);
      if (over && pointer.pressed) {
        if (card.unlocked) {
          this.selected = card.index;
          audio.ui('click');
        } else {
          audio.ui('error');
          this.info = { text: `LOCKED — ${card.def.unlockRequirement}`, time: 2.4 };
        }
      }
    }

    const p1 = input.p1();
    let moved = 0;
    if (p1.wasPressed('right')) moved = 1;
    if (p1.wasPressed('left')) moved = -1;
    if (p1.wasPressed('down')) moved = 6;
    if (p1.wasPressed('up')) moved = -6;
    if (moved) {
      this.selected = clamp(this.selected + moved, 0, this.cards.length - 1);
      audio.ui('hover');
    }
    if (p1.wasPressed('confirm')) this.#start();
    if (p1.wasPressed('back')) this.manager.change('menu', { transition: TRANSITIONS.SLIDE, duration: 0.7 });

    if (this.info) {
      this.info.time -= dt;
      if (this.info.time <= 0) this.info = null;
    }
  }

  draw(ctx, dt) {
    const t = this.time;
    getArena('dojo').draw(ctx, t * 0.3, null, {});
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,7,0.74)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    drawText(ctx, 'TRAINING', 640, 74, {
      size: 44, weight: '800', color: '#ffffff', align: 'center', spacing: 10,
      shadow: { color: rgba('#f5c518', 0.8), blur: 26 }
    });
    drawText(ctx, 'The dummy has unlimited health. Practise freely.', 640, 104, {
      size: 15, weight: '700', color: '#a3949a', align: 'center', spacing: 2
    });

    for (const card of this.cards) this.#drawCard(ctx, card, t, dt);

    // Selected fighter detail
    const sel = this.cards[this.selected];
    panel(ctx, { x: 830, y: 168, w: 410, h: 400, alpha: 0.8 });
    this.#drawDetails(ctx, sel, t);

    for (const b of this.buttons) b.draw(ctx, dt);

    if (this.info) {
      drawText(ctx, this.info.text, 640, 612, {
        size: 16, weight: '800', color: '#d8b46a', align: 'center', spacing: 1.6
      });
    }

    drawText(ctx, '← → ↑ ↓  SELECT      ENTER  CONFIRM      ESC  BACK', 640, 706, {
      size: 12, weight: '700', color: '#6d6469', align: 'center', spacing: 2
    });
  }

  #drawCard(ctx, card, t, dt) {
    const { def, x, y, w, h } = card;
    const isSelected = card.index === this.selected;
    const accent = card.unlocked ? def.color : '#4a3f45';
    void dt;
    ctx.save();
    roundRect(ctx, x, y, w, h, 8);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, card.unlocked ? rgba(def.color, 0.16) : 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(8,5,9,0.92)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = isSelected ? 3 : 1.5;
    ctx.strokeStyle = isSelected ? 'rgba(255,255,255,0.7)' : rgba(accent, 0.3 + card.hover * 0.4);
    if (isSelected || card.hover > 0.3) {
      ctx.shadowColor = rgba(accent, 0.8);
      ctx.shadowBlur = 16;
    }
    ctx.stroke();
    ctx.restore();

    const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), CLIPS.idle({ t: t * 0.8 + card.index, rng: card.index }), 1);
    drawStickman(ctx, solvePosePlanted(pose, 104), {
      x: x + w / 2, y: y + 138, facing: 1, height: 104, color: def.color, accent: def.accent,
      lineWidth: 5, glow: card.unlocked ? 0.8 : 0, alpha: card.unlocked ? 1 : 0.45,
      silhouette: !card.unlocked, silhouetteColor: '#241b21', eye: { x: 0.6, y: 0 }, eyeStyle: def.eyeStyle
    });

    drawText(ctx, def.short || def.name, x + w / 2, y + h - 26, {
      size: 15, weight: '800', color: card.unlocked ? '#ffffff' : '#7e6f75', align: 'center', spacing: 1.4
    });

    if (!card.unlocked) {
      drawText(ctx, 'LOCKED', x + w / 2, y + 20, {
        size: 11, weight: '800', color: '#d8b46a', align: 'center', spacing: 1.6
      });
    }
  }

  #drawDetails(ctx, card, t) {
    const def = card.def;
    drawText(ctx, def.name, 852, 200, {
      size: 28, weight: '800', color: def.color, spacing: 2,
      shadow: { color: rgba(def.color, 0.7), blur: 16 }
    });
    drawText(ctx, def.theme ? `THEME: ${def.theme}` : '', 852, 224, {
      size: 11, weight: '700', color: '#8d7f84', spacing: 1.6
    });

    // Animated full-size portrait
    const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), CLIPS.idle({ t, rng: 2.2, guard: 1 }), 1);
    drawStickman(ctx, solvePosePlanted(pose, 150), {
      x: 1035, y: 400, facing: -1, height: 150, color: def.color, accent: def.accent,
      lineWidth: 6.5, glow: 1, eye: { x: 0.8, y: 0 }, eyeStyle: def.eyeStyle
    });

    drawText(ctx, def.blurb || '', 852, 444, {
      size: 13, weight: '600', color: '#cfc2c6', spacing: 0.4
    });

    drawText(ctx, 'TIPS', 852, 500, { size: 12, weight: '800', color: '#ffd166', spacing: 2.4 });
    (def.tips || []).slice(0, 3).forEach((tip, i) => {
      drawText(ctx, `• ${tip}`, 852, 522 + i * 20, { size: 12, weight: '600', color: '#a3949a' });
    });

    if (!card.unlocked) {
      drawText(ctx, `LOCKED — ${def.unlockRequirement}`, 852, 560, {
        size: 12, weight: '800', color: '#d8b46a', spacing: 1
      });
    }
    void settings;
    void rand;
    void TAU;
  }
}
