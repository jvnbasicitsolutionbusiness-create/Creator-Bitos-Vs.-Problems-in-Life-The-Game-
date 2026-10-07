/**
 * campaign.js — the ten-round ladder.
 *
 * Shows every problem, its arena, whether it is cleared, and the player's
 * record against it. Choosing an unlocked round plays a short story panel
 * (VS card, premise, dialogue) before handing off to the battle.
 */
import { drawText, roundRect, slantRect } from '../core/canvas.js';
import { Button, panel } from '../ui/widgets.js';
import { getArena } from '../arenas/arenas.js';
import { getCharacter, CAMPAIGN_ROUNDS, characterName } from '../characters/roster.js';
import { NEUTRAL_POSE, clonePose, addPose, solvePosePlanted } from '../animation/skeleton.js';
import { CLIPS } from '../animation/clips.js';
import { drawStickman } from '../animation/stickman-renderer.js';
import { gameState } from '../core/state.js';
import { input } from '../core/input.js';
import { TRANSITIONS } from '../core/scene-manager.js';
import { clamp, lerp, rgba, rand, damp, pulse, TAU } from '../core/utils.js';
import { settings } from '../config/settings.js';
import { audio } from '../audio/audio.js';

/** Short premise text shown before each round. */
const PREMISES = {
  laziness: 'It started with "five more minutes". It always starts with five more minutes.',
  gadget: 'The screen lit up, and suddenly the whole day was gone.',
  addiction: 'It promised it would be the last time. It always promises.',
  lust: 'It never shows you what it actually is. Only what you want to see.',
  society: 'A thousand voices, all certain, none of them agreeing.',
  suicide: 'The quietest fight of them all. This one is about staying, not winning.',
  suffering: 'It does not hurry. It has all the time in the world.',
  wrath: 'It arrives before you have decided anything.',
  school: 'Four years. Four forms. Each one harder than the last.',
  seizure: 'The one that arrives without permission. The final challenge.'
};

export class CampaignScene {
  constructor({ audio: audioEngine, particles }) {
    this.audio = audioEngine;
    this.particles = particles;
    this.time = 0;
    this.cards = [];
    this.buttons = [];
    this.selected = 0;
    this.confirm = null;
    this.confirmButtons = [];
    this.scroll = 0;
    this.targetScroll = 0;
  }

  enter(params = {}) {
    this.time = 0;
    this.confirm = null;
    this.audio?.playMusic('campaign');
    const focus = params.focus ?? clamp(gameState.campaignProgress, 0, CAMPAIGN_ROUNDS.length - 1);
    this.selected = focus;
    this.#build();
  }

  #build() {
    this.buttons = [
      new Button({
        x: 40, y: 640, w: 190, h: 46, label: 'BACK', accent: '#3a2b30', size: 18,
        onClick: () => this.manager.change('menu', { transition: TRANSITIONS.SLIDE, duration: 0.7 })
      })
    ];

    this.confirmButtons = [
      new Button({
        x: 400, y: 546, w: 200, h: 54, label: 'FIGHT', accent: '#ff2b3c',
        onClick: () => this.#startBattle()
      }),
      new Button({
        x: 680, y: 546, w: 200, h: 54, label: 'BACK', accent: '#3a2b30',
        onClick: () => {
          this.confirm = null;
          audio.ui('back');
        }
      })
    ];

    this.cards = CAMPAIGN_ROUNDS.map((id, i) => {
      const def = getCharacter(id);
      const cleared = gameState.isDefeated(id);
      const unlocked = gameState.isRoundUnlocked(i + 1);
      return {
        id,
        def,
        index: i,
        round: i + 1,
        cleared,
        unlocked,
        record: gameState.player?.enemyRecords?.[id] || null,
        x: 40 + (i % 5) * 244,
        y: 150 + Math.floor(i / 5) * 228,
        w: 228,
        h: 208,
        hover: 0
      };
    });
  }

  #startBattle() {
    const card = this.cards[this.selected];
    audio.ui('click');
    this.manager.change('battle', {
      transition: TRANSITIONS.BLACK,
      duration: 1.0,
      params: {
        mode: 'campaign',
        enemyId: card.id,
        roundNumber: card.round
      }
    });
  }

  update(dt, pointer) {
    this.time += dt;

    if (this.confirm) {
      for (const b of this.confirmButtons) b.update(dt, pointer);
      if (input.p1().wasPressed('back')) this.confirm = null;
      if (input.p1().wasPressed('confirm')) this.#startBattle();
      return;
    }

    for (const b of this.buttons) b.update(dt, pointer);

    // Card hover + click
    for (const card of this.cards) {
      const over = pointer.inside && inCard(pointer.x, pointer.y, card);
      card.hover = damp(card.hover, over ? 1 : 0, 14, dt);
      if (over && pointer.pressed) {
        if (!card.unlocked) {
          audio.ui('error');
          continue;
        }
        this.selected = card.index;
        audio.ui('click');
        this.confirm = card;
      }
    }

    // Keyboard navigation: 5 across, 2 down
    const p1 = input.p1();
    let moved = 0;
    if (p1.wasPressed('right')) moved = 1;
    if (p1.wasPressed('left')) moved = -1;
    if (p1.wasPressed('down')) moved = 5;
    if (p1.wasPressed('up')) moved = -5;
    if (moved) {
      this.selected = clamp(this.selected + moved, 0, this.cards.length - 1);
      audio.ui('hover');
    }
    if (p1.wasPressed('confirm')) {
      const card = this.cards[this.selected];
      if (card.unlocked) this.confirm = card;
      else audio.ui('error');
    }
    if (p1.wasPressed('back')) {
      this.manager.change('menu', { transition: TRANSITIONS.SLIDE, duration: 0.7 });
    }
  }

  draw(ctx, dt) {
    const t = this.time;
    getArena('menu').draw(ctx, t * 0.3, null, {});
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,7,0.72)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    drawText(ctx, 'CAMPAIGN', 640, 74, {
      size: 44, weight: '800', color: '#ffffff', align: 'center', spacing: 10,
      shadow: { color: rgba('#ff2b3c', 0.8), blur: 26 }
    });
    drawText(ctx, `${gameState.campaignProgress} / ${CAMPAIGN_ROUNDS.length} PROBLEMS DEFEATED`, 640, 106, {
      size: 16, weight: '700', color: '#a3949a', align: 'center', spacing: 3
    });

    for (const card of this.cards) {
      this.#drawCard(ctx, card, t, dt);
    }

    for (const b of this.buttons) b.draw(ctx, dt);

    drawText(ctx, '← → ↑ ↓  SELECT      ENTER  CONFIRM      ESC  BACK', 640, 700, {
      size: 12, weight: '700', color: '#6d6469', align: 'center', spacing: 2
    });

    if (this.confirm) this.#drawConfirm(ctx, dt);
  }

  #drawCard(ctx, card, t, dt) {
    const { def, x, y, w, h } = card;
    const isSelected = card.index === this.selected;
    const hover = card.hover;
    const scale = 1 + hover * 0.03 + (isSelected && !this.confirm ? 0.015 : 0);
    const accent = card.unlocked ? def.color : '#4a3f45';

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(x + w / 2), -(y + h / 2));

    // Plate
    ctx.save();
    roundRect(ctx, x, y, w, h, 8);
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, card.unlocked ? rgba(def.color, 0.16) : 'rgba(255,255,255,0.03)');
    g.addColorStop(1, 'rgba(8,5,9,0.92)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = isSelected ? 3 : 1.5;
    ctx.strokeStyle = isSelected ? rgba('#ffffff', 0.65) : rgba(accent, 0.3 + hover * 0.4);
    if (isSelected || hover > 0.3) {
      ctx.shadowColor = rgba(accent, 0.8);
      ctx.shadowBlur = 18 * Math.max(hover, isSelected ? 0.6 : 0);
    }
    ctx.stroke();
    ctx.restore();

    // Round number
    drawText(ctx, `ROUND ${card.round}`, x + 14, y + 24, {
      size: 13, weight: '800', color: card.unlocked ? '#ffd166' : '#6d5f65', spacing: 2
    });

    // Character portrait
    const portraitH = 116;
    const pose = addPose(
      clonePose(def.stance || NEUTRAL_POSE),
      card.unlocked ? CLIPS.idle({ t: t * 0.8 + card.index, rng: card.index }) : { spine: 6 },
      1
    );
    const solved = solvePosePlanted(pose, portraitH);
    drawStickman(ctx, solved, {
      x: x + w / 2,
      y: y + 150,
      facing: 1,
      height: portraitH,
      color: def.color,
      accent: def.accent,
      lineWidth: 5.5,
      glow: card.unlocked ? 0.9 : 0,
      alpha: card.unlocked ? 1 : 0.5,
      silhouette: !card.unlocked,
      silhouetteColor: '#241b21',
      eye: { x: 0.6, y: 0 },
      eyeStyle: def.eyeStyle,
      charId: card.unlocked ? def.id : null
    });

    // Name + arena
    drawText(ctx, def.name, x + w / 2, y + h - 42, {
      size: 20, weight: '800', color: card.unlocked ? '#ffffff' : '#7e6f75', align: 'center', spacing: 2
    });
    drawText(ctx, getArena(def.arena).name, x + w / 2, y + h - 20, {
      size: 11, weight: '600', color: '#8d7f84', align: 'center', spacing: 1
    });

    // Status badge
    if (card.cleared) {
      ctx.save();
      slantRect(ctx, x + w - 74, y + 8, 66, 22, 8);
      ctx.fillStyle = rgba('#2f9e44', 0.85);
      ctx.fill();
      ctx.restore();
      drawText(ctx, 'CLEARED', x + w - 41, y + 20, {
        size: 11, weight: '800', color: '#ffffff', align: 'center', baseline: 'middle', spacing: 1.4
      });
    } else if (!card.unlocked) {
      ctx.save();
      slantRect(ctx, x + w - 70, y + 8, 62, 22, 8);
      ctx.fillStyle = rgba('#000000', 0.6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      drawText(ctx, 'LOCKED', x + w - 39, y + 20, {
        size: 11, weight: '800', color: '#d8b46a', align: 'center', baseline: 'middle', spacing: 1.4
      });
    }

    // Record
    if (card.record) {
      drawText(ctx, `W ${card.record.wins}  L ${card.record.losses}`, x + 14, y + h - 62, {
        size: 11, weight: '700', color: '#8d7f84', spacing: 1
      });
    }

    // Arena preview strip
    ctx.save();
    roundRect(ctx, x + 10, y + 34, w - 20, 46, 4);
    ctx.clip();
    ctx.globalAlpha = 0.85;
    ctx.save();
    ctx.translate(x + 10, y + 34);
    ctx.scale((w - 20) / 1280, 46 / 720);
    getArena(def.arena).draw(ctx, t * 0.3 + card.index, null, {});
    ctx.restore();
    ctx.restore();

    ctx.restore();
    void dt;
    void rand;
    void lerp;
  }

  #drawConfirm(ctx, dt) {
    const card = this.confirm;
    const def = card.def;
    const scale = settings.uiScale;

    ctx.save();
    ctx.fillStyle = 'rgba(3,2,4,0.8)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    // Arena preview behind the VS card
    ctx.save();
    ctx.globalAlpha = 0.5;
    getArena(def.arena).draw(ctx, this.time * 0.3, null, {});
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,7,0.55)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    panel(ctx, { x: 300, y: 130, w: 680, h: 480, alpha: 0.6 });

    drawText(ctx, `ROUND ${card.round}`, 640, 176, {
      size: 20, weight: '800', color: '#ffd166', align: 'center', spacing: 6
    });

    // VS layout
    const bitos = getCharacter('creator-bitos');
    const left = { def: bitos, x: 430 };
    const right = { def, x: 850 };
    for (const side of [left, right]) {
      const pose = addPose(
        clonePose(side.def.stance || NEUTRAL_POSE),
        CLIPS.idle({ t: this.time + side.x * 0.01, rng: side.x * 0.01, guard: 1 }),
        1
      );
      drawStickman(ctx, solvePosePlanted(pose, 190), {
        x: side.x,
        y: 430,
        facing: side === left ? 1 : -1,
        height: 190,
        color: side.def.color,
        accent: side.def.accent,
        lineWidth: 8,
        glow: 1.1,
        eye: { x: 0.9, y: 0 },
        eyeStyle: side.def.eyeStyle,
        charId: side.def.id
      });
      drawText(ctx, side.def.name, side.x, 470, {
        size: 22, weight: '800', color: side.def.color, align: 'center', spacing: 2,
        shadow: { color: rgba(side.def.color, 0.7), blur: 14 }
      });
    }

    drawText(ctx, 'VS', 640, 320, {
      size: 58, weight: '800', color: '#ffffff', align: 'center', baseline: 'middle', spacing: 4,
      shadow: { color: rgba('#ff2b3c', 0.9), blur: 30 }
    });

    // Premise
    drawText(ctx, PREMISES[card.id] || '', 640, 510, {
      size: 17 * scale, weight: '600', color: '#cfc2c6', align: 'center', spacing: 1, alpha: 0.9
    });
    if (settings.get('subtitles')) {
      drawText(ctx, `“${def.intro[0]}”`, 640, 534, {
        size: 15, weight: '700', color: def.color, align: 'center', spacing: 1
      });
    }

    if (def.contentNote) {
      drawText(ctx, def.contentNote, 640, 596, {
        size: 12, weight: '600', color: '#a3949a', align: 'center', spacing: 0.6
      });
    }

    for (const b of this.confirmButtons) b.draw(ctx, dt);
    void pulse;
    void TAU;
  }
}

function inCard(px, py, card) {
  return px >= card.x && px <= card.x + card.w && py >= card.y && py <= card.y + card.h;
}
