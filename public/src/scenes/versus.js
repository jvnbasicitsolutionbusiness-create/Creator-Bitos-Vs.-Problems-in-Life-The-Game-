/**
 * versus.js — local Player 1 vs Player 2.
 *
 * Locked until all ten campaign problems are defeated. Once unlocked, every
 * defeated character becomes playable, including the problems themselves.
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
import { clamp, damp, rgba } from '../core/utils.js';
import { audio } from '../audio/audio.js';

const ARENA_OPTIONS = ['rooftop', 'city', 'inferno', 'campus', 'neon', 'ruin', 'digital', 'dojo'];

export class VersusScene {
  constructor({ audio: audioEngine }) {
    this.audio = audioEngine;
    this.time = 0;
    this.p1Index = 0;
    this.p2Index = 1;
    this.activeSide = 0; // which selector the keyboard moves
    this.arenaIndex = 0;
    this.locked = false;
    this.cards = [];
  }

  enter() {
    this.time = 0;
    this.audio?.playMusic('versus');
    this.locked = !gameState.multiplayerUnlocked;
    this.#build();
    if (this.locked) {
      // Still show the roster, greyed out, with the requirement.
    }
  }

  #build() {
    this.cards = ROSTER_ORDER.map((id, i) => {
      const def = getCharacter(id);
      return {
        id,
        def,
        index: i,
        unlocked: gameState.isUnlocked(id),
        x: 60 + (i % 6) * 196,
        y: 300 + Math.floor(i / 6) * 176,
        w: 180,
        h: 160,
        hover: 0
      };
    });

    this.buttons = [
      new Button({
        x: 40, y: 650, w: 190, h: 46, label: 'BACK', accent: '#3a2b30', size: 18,
        onClick: () => this.manager.change('menu', { transition: TRANSITIONS.SLIDE, duration: 0.7 })
      }),
      new Button({
        x: 1050, y: 650, w: 190, h: 46, label: 'FIGHT', accent: this.locked ? '#4a3f45' : '#22d3ee', size: 20,
        disabled: this.locked,
        onClick: () => this.#start()
      }),
      new Button({
        x: 860, y: 650, w: 180, h: 46, label: 'ARENA', accent: '#3a2b30', size: 18,
        sub: null,
        onClick: () => {
          this.arenaIndex = (this.arenaIndex + 1) % ARENA_OPTIONS.length;
          this.buttons[2].sub = getArena(ARENA_OPTIONS[this.arenaIndex]).name;
          audio.ui('click');
        }
      })
    ];
    this.buttons[2].sub = getArena(ARENA_OPTIONS[this.arenaIndex]).name;
  }

  #start() {
    if (this.locked) {
      audio.ui('error');
      this.toast = 'MULTIPLAYER UNLOCKS AFTER ALL 10 PROBLEMS';
      this.toastTime = 2.6;
      return;
    }
    const p1 = this.cards[this.p1Index];
    const p2 = this.cards[this.p2Index];
    if (!p1.unlocked || !p2.unlocked) {
      audio.ui('error');
      return;
    }
    audio.ui('click');
    this.manager.change('battle', {
      transition: TRANSITIONS.BLACK,
      duration: 1.0,
      params: {
        mode: 'versus',
        p1Id: p1.id,
        p2Id: p2.id,
        arena: ARENA_OPTIONS[this.arenaIndex]
      }
    });
  }

  update(dt, pointer) {
    this.time += dt;
    if (this.toastTime > 0) this.toastTime -= dt;
    for (const b of this.buttons) b.update(dt, pointer);

    for (const card of this.cards) {
      const over = pointer.inside &&
        pointer.x >= card.x && pointer.x <= card.x + card.w &&
        pointer.y >= card.y && pointer.y <= card.y + card.h;
      card.hover = damp(card.hover, over ? 1 : 0, 14, dt);
      if (over && pointer.pressed && !this.locked) {
        if (!card.unlocked) {
          audio.ui('error');
          continue;
        }
        if (this.activeSide === 0) this.p1Index = card.index;
        else this.p2Index = card.index;
        audio.ui('click');
        this.activeSide = this.activeSide === 0 ? 1 : 0;
      }
    }

    const p1 = input.p1();
    let moved = 0;
    if (p1.wasPressed('right')) moved = 1;
    if (p1.wasPressed('left')) moved = -1;
    if (p1.wasPressed('down')) moved = 6;
    if (p1.wasPressed('up')) moved = -6;
    if (moved) {
      const idx = this.activeSide === 0 ? this.p1Index : this.p2Index;
      const next = clamp(idx + moved, 0, this.cards.length - 1);
      if (this.activeSide === 0) this.p1Index = next;
      else this.p2Index = next;
      audio.ui('hover');
    }
    if (p1.wasPressed('confirm')) this.#start();
    if (p1.wasPressed('back')) this.manager.change('menu', { transition: TRANSITIONS.SLIDE, duration: 0.7 });
  }

  draw(ctx, dt) {
    const t = this.time;
    getArena(ARENA_OPTIONS[this.arenaIndex]).draw(ctx, t * 0.25, null, {});
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,7,0.76)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    drawText(ctx, 'MULTIPLAYER', 640, 68, {
      size: 42, weight: '800', color: '#ffffff', align: 'center', spacing: 10,
      shadow: { color: rgba('#22d3ee', 0.8), blur: 26 }
    });

    if (this.locked) {
      panel(ctx, { x: 340, y: 110, w: 600, h: 130, alpha: 0.85 });
      drawText(ctx, 'MULTIPLAYER — LOCKED', 640, 148, {
        size: 26, weight: '800', color: '#d8b46a', align: 'center', spacing: 4
      });
      drawText(ctx, 'DEFEAT ALL 10 PROBLEMS IN CAMPAIGN TO UNLOCK', 640, 182, {
        size: 16, weight: '700', color: '#efe8e6', align: 'center', spacing: 2
      });
      drawText(ctx, `${gameState.campaignProgress} / 10 DEFEATED`, 640, 212, {
        size: 14, weight: '800', color: '#a3949a', align: 'center', spacing: 2
      });
    } else {
      drawText(ctx, 'PLAYER 1  VS  PLAYER 2  —  LOCAL VERSUS', 640, 104, {
        size: 16, weight: '700', color: '#a3949a', align: 'center', spacing: 3
      });
    }

    // Side panels
    this.#drawSide(ctx, 0, 130, this.p1Index, '#ff2b3c', 'PLAYER 1', t);
    this.#drawSide(ctx, 1, 790, this.p2Index, '#22d3ee', 'PLAYER 2', t);

    for (const card of this.cards) this.#drawCard(ctx, card, t);

    for (const b of this.buttons) b.draw(ctx, dt);

    if (this.toastTime > 0) {
      drawText(ctx, this.toast, 640, 620, {
        size: 16, weight: '800', color: '#d8b46a', align: 'center', spacing: 1.6
      });
    }

    drawText(ctx, this.locked
      ? 'ESC  BACK'
      : 'ARROWS / MOUSE  SELECT      ENTER  FIGHT      P1: A D W S · J K U I O P · SPACE      P2: ARROWS · NUM 1 2 4 5 7 8', 640, 712, {
        size: 11, weight: '700', color: '#6d6469', align: 'center', spacing: 1.6
      });
  }

  #drawSide(ctx, side, x, index, accent, label, t) {
    const card = this.cards[index];
    const def = card.def;
    const active = this.activeSide === side;
    panel(ctx, { x, y: 130, w: 360, h: 150, alpha: 0.8 });
    ctx.save();
    ctx.strokeStyle = active ? rgba(accent, 0.9) : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = active ? 3 : 1.5;
    roundRect(ctx, x, 130, 360, 150, 10);
    ctx.stroke();
    ctx.restore();

    drawText(ctx, label, x + 20, 156, { size: 13, weight: '800', color: accent, spacing: 3 });
    drawText(ctx, def.name, x + 20, 186, {
      size: 24, weight: '800', color: def.color, spacing: 2,
      shadow: { color: rgba(def.color, 0.6), blur: 14 }
    });
    drawText(ctx, def.playstyle || def.blurb?.slice(0, 60) || '', x + 20, 212, {
      size: 12, weight: '600', color: '#a3949a'
    });
    drawText(ctx, `SPECIAL — ${def.specialName}`, x + 20, 240, { size: 12, weight: '700', color: '#cfc2c6', spacing: 1 });
    drawText(ctx, `SUPER — ${def.ultimateName}`, x + 20, 260, { size: 12, weight: '700', color: '#ffd166', spacing: 1 });

    const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), CLIPS.idle({ t: t + side, rng: side * 2 }), 1);
    drawStickman(ctx, solvePosePlanted(pose, 118), {
      x: x + 300, y: 268, facing: side === 0 ? 1 : -1, height: 118, color: def.color,
      accent: def.accent, lineWidth: 6, glow: 1, eye: { x: 0.8, y: 0 }, eyeStyle: def.eyeStyle
    });
  }

  #drawCard(ctx, card, t) {
    const { def, x, y, w, h } = card;
    const isP1 = card.index === this.p1Index;
    const isP2 = card.index === this.p2Index;
    const accent = card.unlocked ? def.color : '#4a3f45';
    ctx.save();
    roundRect(ctx, x, y, w, h, 8);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, card.unlocked ? rgba(def.color, 0.14) : 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(8,5,9,0.9)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = isP1 || isP2 ? 3 : 1.5;
    ctx.strokeStyle = isP1 ? '#ff2b3c' : isP2 ? '#22d3ee' : rgba(accent, 0.25 + card.hover * 0.4);
    ctx.stroke();
    ctx.restore();

    const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), CLIPS.idle({ t: t * 0.8 + card.index, rng: card.index }), 1);
    drawStickman(ctx, solvePosePlanted(pose, 88), {
      x: x + w / 2, y: y + 116, facing: 1, height: 88, color: def.color, accent: def.accent,
      lineWidth: 4.5, glow: card.unlocked ? 0.7 : 0, alpha: card.unlocked ? 1 : 0.4,
      silhouette: !card.unlocked, silhouetteColor: '#241b21', eye: { x: 0.6, y: 0 }, eyeStyle: def.eyeStyle
    });
    drawText(ctx, def.short || def.name, x + w / 2, y + h - 20, {
      size: 13, weight: '800', color: card.unlocked ? '#ffffff' : '#7e6f75', align: 'center', spacing: 1.2
    });
    if (isP1) this.#badge(ctx, x + 12, y + 10, 'P1', '#ff2b3c');
    if (isP2) this.#badge(ctx, x + 12, y + 10, 'P2', '#22d3ee');
  }

  #badge(ctx, x, y, text, color) {
    ctx.save();
    roundRect(ctx, x, y, 30, 20, 4);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    drawText(ctx, text, x + 15, y + 11, {
      size: 12, weight: '800', color: '#ffffff', align: 'center', baseline: 'middle'
    });
  }

}
