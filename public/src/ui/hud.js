/**
 * hud.js — the battle interface.
 *
 * Original layout built from the game's own visual language: slanted plates,
 * red/black plate metal, and a delayed "damage ghost" bar so heavy hits read
 * instantly. Everything scales with Settings → UI Scale.
 */
import { drawText, slantRect, roundRect } from '../core/canvas.js';
import { clamp, lerp, rgba, shade } from '../core/utils.js';
import { settings } from '../config/settings.js';

const HUD_TOP = 40;

export class Hud {
  constructor() {
    this.ghost = [1, 1]; // delayed damage bar
    this.flash = [0, 0];
    this.lastHp = [1, 1];
    this.shownTimer = 0;
  }

  reset(fighters) {
    this.ghost = fighters.map((f) => f.hpRatio);
    this.lastHp = fighters.map((f) => f.hpRatio);
    this.flash = [0, 0];
  }

  update(dt, fighters) {
    for (let i = 0; i < fighters.length; i += 1) {
      const ratio = fighters[i].hpRatio;
      if (ratio < this.lastHp[i]) {
        this.flash[i] = 1;
      } else {
        this.ghost[i] = lerp(this.ghost[i], ratio, 1 - Math.exp(-2.4 * dt));
      }
      this.lastHp[i] = ratio;
      this.flash[i] = Math.max(0, this.flash[i] - dt * 2.5);
      if (this.ghost[i] < ratio) this.ghost[i] = ratio;
    }
  }

  draw(ctx, match, { showTimer = true, labels = null } = {}) {
    const scale = settings.uiScale;
    const [p1, p2] = match.fighters;
    const names = labels || [p1.displayName, p2.displayName];

    this.#plate(ctx, 0, p1, names[0], scale, false);
    this.#plate(ctx, 1, p2, names[1], scale, true);

    this.#roundIndicator(ctx, match, scale);
    if (showTimer && match.timerEnabled) this.#timer(ctx, match, scale);
    this.#roundPips(ctx, match, scale);
  }

  #plate(ctx, index, fighter, name, scale, mirrored) {
    const top = HUD_TOP;
    const w = 468 * scale;
    const h = 92 * scale;
    const x = mirrored ? 1280 - 40 - w : 40;

    ctx.save();
    // Backing plate
    slantRect(ctx, x - 12, top - 26, w + 24, h + 40, 18);
    ctx.fillStyle = 'rgba(8,4,8,0.55)';
    ctx.fill();
    ctx.restore();

    // Name
    drawText(ctx, name, mirrored ? x + w : x, top - 4, {
      size: 26 * scale,
      weight: '800',
      color: fighter.def.color,
      align: mirrored ? 'right' : 'left',
      spacing: 3,
      shadow: { color: rgba(fighter.def.color, 0.6), blur: 16 }
    });

    // Health bar
    const barY = top + 8;
    const barH = 30 * scale;
    const barW = w;
    ctx.save();
    slantRect(ctx, x, barY, barW, barH, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Ghost (delayed) damage
    const ghost = this.ghost[index];
    if (ghost > fighter.hpRatio) {
      ctx.save();
      slantRect(ctx, x, barY, barW, barH, 12);
      ctx.clip();
      const gw = barW * ghost;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(mirrored ? x + barW - gw : x, barY, gw, barH);
      ctx.restore();
    }

    // Current health
    const hp = clamp(fighter.hpRatio, 0, 1);
    const hw = barW * hp;
    if (hw > 2) {
      ctx.save();
      slantRect(ctx, x, barY, barW, barH, 12);
      ctx.clip();
      const g = ctx.createLinearGradient(0, barY, 0, barY + barH);
      const low = hp < 0.25;
      const c1 = low ? '#ff2b3c' : shade(fighter.def.color, -0.3);
      const c2 = low ? '#7a0f19' : shade(fighter.def.color, 0.2);
      g.addColorStop(0, c2);
      g.addColorStop(0.5, c1);
      g.addColorStop(1, shade(c1, -0.4));
      ctx.fillStyle = g;
      ctx.fillRect(mirrored ? x + barW - hw : x, barY, hw, barH);
      // Glass highlight
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(mirrored ? x + barW - hw : x, barY, hw, barH * 0.38);
      ctx.restore();
    }

    // Low-health pulse
    if (hp < 0.25 && hp > 0) {
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.25 * Math.sin(performance.now() / 120);
      slantRect(ctx, x, barY, barW, barH, 12);
      ctx.fillStyle = '#ff2b3c';
      ctx.fill();
      ctx.restore();
    }

    // Hit flash
    if (this.flash[index] > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flash[index] * 0.5;
      slantRect(ctx, x, barY, barW, barH, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // HP number
    drawText(ctx, `${Math.ceil(fighter.hp)}`, mirrored ? x + 6 : x + w - 6, barY + barH + 20 * scale, {
      size: 17 * scale,
      weight: '800',
      color: 'rgba(255,255,255,0.75)',
      align: mirrored ? 'left' : 'right',
      spacing: 1
    });

    // Special meter
    const meterY = barY + barH + 10 * scale;
    const meterH = 13 * scale;
    ctx.save();
    slantRect(ctx, x + (mirrored ? 60 : 0), meterY, barW - 60, meterH, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const meter = fighter.meterRatio;
    const mw = (barW - 60) * meter;
    if (mw > 2) {
      ctx.save();
      slantRect(ctx, x + (mirrored ? 60 : 0), meterY, barW - 60, meterH, 7);
      ctx.clip();
      const mg = ctx.createLinearGradient(0, meterY, 0, meterY + meterH);
      if (meter >= 0.999) {
        mg.addColorStop(0, '#fff6a8');
        mg.addColorStop(0.5, '#ffd166');
        mg.addColorStop(1, '#ff8c1a');
      } else {
        mg.addColorStop(0, shade(fighter.def.accent, 0.2));
        mg.addColorStop(1, shade(fighter.def.accent, -0.35));
      }
      ctx.fillStyle = mg;
      ctx.fillRect(mirrored ? x + barW - mw : x, meterY, mw, meterH);
      ctx.restore();
    }
    ctx.restore();

    // MAX label when the super is ready
    if (fighter.meter >= 100) {
      const bob = Math.sin(performance.now() / 200) * 2;
      drawText(ctx, 'SUPER READY', mirrored ? x + 66 : x + barW - 6, meterY + meterH + 16 * scale + bob, {
        size: 13 * scale,
        weight: '800',
        color: '#ffd166',
        align: mirrored ? 'left' : 'right',
        spacing: 2,
        shadow: { color: '#ff8c1a', blur: 12 }
      });
    }
  }

  #roundIndicator(ctx, match, scale) {
    const label = match.displayRoundLabel;
    drawText(ctx, label, 640, 52 * scale, {
      size: 26 * scale,
      weight: '800',
      color: '#efe8e6',
      align: 'center',
      spacing: 6,
      shadow: { color: 'rgba(0,0,0,0.9)', blur: 10 }
    });
    // Decorative wings
    ctx.save();
    ctx.strokeStyle = 'rgba(255,43,60,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(430, 46 * scale); ctx.lineTo(560, 46 * scale);
    ctx.moveTo(720, 46 * scale); ctx.lineTo(850, 46 * scale);
    ctx.stroke();
    ctx.restore();
  }

  #timer(ctx, match, scale) {
    const t = Math.ceil(match.timer);
    const urgent = t <= 10;
    ctx.save();
    roundRect(ctx, 600, 62 * scale, 80, 54 * scale, 6);
    ctx.fillStyle = 'rgba(8,4,8,0.7)';
    ctx.fill();
    ctx.strokeStyle = urgent ? rgba('#ff2b3c', 0.9) : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    drawText(ctx, String(t).padStart(2, '0'), 640, 90 * scale, {
      size: 36 * scale,
      weight: '800',
      color: urgent ? '#ff5c5c' : '#ffffff',
      align: 'center',
      baseline: 'middle',
      shadow: urgent ? { color: '#ff2b3c', blur: 18 } : null
    });
  }

  #roundPips(ctx, match, scale) {
    const needed = match.roundsToWin;
    if (match.training) return;
    const size = 14 * scale;
    const gap = 8 * scale;
    for (let side = 0; side < 2; side += 1) {
      const wins = side === 0 ? match.p1Wins : match.p2Wins;
      const baseX = side === 0 ? 60 : 1280 - 60 - size;
      for (let i = 0; i < needed; i += 1) {
        const x = side === 0 ? baseX + i * (size + gap) : baseX - i * (size + gap);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, 132 * scale, size / 2, 0, Math.PI * 2);
        if (i < wins) {
          ctx.fillStyle = '#ffd166';
          ctx.shadowColor = '#ff8c1a';
          ctx.shadowBlur = 12;
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.10)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  /** Big centre text: READY / 3 / 2 / 1 / FIGHT! / K.O. */
  drawCentreMessage(ctx, text, { scaleIn = 1, color = '#ffffff', sub = null } = {}) {
    const scale = settings.uiScale;
    ctx.save();
    ctx.translate(640, 300);
    ctx.scale(scaleIn, scaleIn);
    drawText(ctx, text, 0, 0, {
      size: 92 * scale,
      weight: '800',
      color,
      align: 'center',
      baseline: 'middle',
      spacing: 8,
      outline: { width: 10, color: 'rgba(0,0,0,0.85)' },
      shadow: { color: rgba(color, 0.9), blur: 34 }
    });
    if (sub) {
      drawText(ctx, sub, 0, 62 * scale, {
        size: 22 * scale, weight: '700', color: 'rgba(255,255,255,0.8)', align: 'center', spacing: 4
      });
    }
    ctx.restore();
  }

  /** Combo counter on the side of the screen. */
  drawCombo(ctx, side, count, damage) {
    if (count < 2 || !settings.get('comboDisplay')) return;
    const scale = settings.uiScale;
    const x = side === 0 ? 210 : 1070;
    const y = 250;
    ctx.save();
    drawText(ctx, `${count}`, x, y, {
      size: 64 * scale, weight: '800', color: '#ffffff', align: 'center', baseline: 'middle',
      outline: { width: 8, color: 'rgba(0,0,0,0.8)' }, shadow: { color: '#ff2b3c', blur: 22 }
    });
    drawText(ctx, 'HIT COMBO', x, y + 44 * scale, {
      size: 20 * scale, weight: '800', color: '#ffd166', align: 'center', spacing: 4,
      outline: { width: 5, color: 'rgba(0,0,0,0.8)' }
    });
    drawText(ctx, `${Math.round(damage)} DMG`, x, y + 70 * scale, {
      size: 16 * scale, weight: '700', color: 'rgba(255,255,255,0.85)', align: 'center', spacing: 2
    });
    ctx.restore();
  }
}
