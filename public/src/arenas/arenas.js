/**
 * arenas.js — procedurally painted battlefields.
 *
 * Each arena is a small painter with three passes (sky, midground, floor) plus
 * optional ambience. Everything is drawn with canvas primitives so the game
 * ships with zero binary art, and each arena can later be swapped for a
 * layered image set without touching the battle code.
 *
 * IMPORTANT (accessibility): no arena uses rapid flashing. The unstable final
 * arena conveys instability through slow colour drift, parallax and geometry
 * warping, and it is further toned down by Settings → Reduced Flash.
 */
import { GROUND_Y } from '../combat/fighter.js';
import { clamp, lerp, rgba, mulberry32, TAU, pulse } from '../core/utils.js';
import { settings } from '../config/settings.js';

const W = 1280;
const H = 720;

/* ---------------------------------------------------------------- helpers */

function skyGradient(ctx, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function floor(ctx, { top, bottom, horizonGlow = null }) {
  const g = ctx.createLinearGradient(0, GROUND_Y - 20, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, GROUND_Y - 18, W, H - GROUND_Y + 18);
  if (horizonGlow) {
    const gg = ctx.createLinearGradient(0, GROUND_Y - 90, 0, GROUND_Y + 10);
    gg.addColorStop(0, rgba(horizonGlow, 0));
    gg.addColorStop(1, rgba(horizonGlow, 0.35));
    ctx.fillStyle = gg;
    ctx.fillRect(0, GROUND_Y - 90, W, 100);
  }
  // Ground line
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(W, GROUND_Y);
  ctx.stroke();
}

function silhouetteRow(ctx, { y, count, width, height, color, seed = 7, jitter = 0.4, parallax = 0 }) {
  const rng = mulberry32(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const w = width * (0.6 + rng() * 0.8);
    const h = height * (0.5 + rng() * 1.2 * jitter + 0.5);
    const x = ((i / count) * (W + 240) + parallax) % (W + 240) - 120;
    ctx.fillRect(x, y - h, w, h);
    // a few windows / notches so the silhouettes read as architecture
    if (rng() > 0.55) {
      ctx.save();
      ctx.globalAlpha = 0.25 + rng() * 0.4;
      ctx.fillStyle = '#ffd9a0';
      for (let wy = y - h + 10; wy < y - 12; wy += 16) {
        for (let wx = x + 6; wx < x + w - 8; wx += 14) {
          if (rng() > 0.62) ctx.fillRect(wx, wy, 5, 7);
        }
      }
      ctx.restore();
      ctx.fillStyle = color;
    }
  }
}

function vignette(ctx, strength = 0.7, color = '#000000') {
  const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.5, H * 0.95);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(1, rgba(color, strength));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function floating(ctx, items, t) {
  for (const it of items) {
    const y = it.y + Math.sin(t * it.speed + it.phase) * it.amp;
    ctx.save();
    ctx.globalAlpha = it.alpha;
    ctx.translate(it.x, y);
    ctx.rotate(Math.sin(t * 0.4 + it.phase) * 0.12);
    ctx.fillStyle = it.color;
    if (it.kind === 'screen') {
      ctx.fillRect(-it.w / 2, -it.h / 2, it.w, it.h);
      ctx.strokeStyle = rgba('#ffffff', 0.25);
      ctx.lineWidth = 2;
      ctx.strokeRect(-it.w / 2, -it.h / 2, it.w, it.h);
      ctx.globalAlpha = it.alpha * 0.6;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i += 1) {
        ctx.fillRect(-it.w / 2 + 6, -it.h / 2 + 8 + i * 9, it.w - 12 - (i % 2) * 14, 3);
      }
    } else if (it.kind === 'ring') {
      ctx.strokeStyle = it.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, it.w, 0, TAU);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, it.w, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- arenas */

const ARENAS = {
  /* ------------------------------------------------------------ rooftop */
  rooftop: {
    name: 'ROOFTOP AT DUSK',
    palette: { primary: '#ff2b3c', fog: '#2b1420' },
    draw(ctx, t, cam) {
      skyGradient(ctx, [
        [0, '#160a12'],
        [0.45, '#3a1520'],
        [0.78, '#7a2a22'],
        [1, '#20101a']
      ]);
      // Distant sun
      const sunX = 880;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sg = ctx.createRadialGradient(sunX, GROUND_Y - 190, 10, sunX, GROUND_Y - 190, 260);
      sg.addColorStop(0, 'rgba(255,120,70,0.55)');
      sg.addColorStop(1, 'rgba(255,120,70,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sunX - 280, GROUND_Y - 470, 560, 560);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,150,90,0.75)';
      ctx.beginPath();
      ctx.arc(sunX, GROUND_Y - 190, 54, 0, TAU);
      ctx.fill();

      const px = -(cam?.x ?? W / 2) * 0.06;
      silhouetteRow(ctx, { y: GROUND_Y - 60, count: 14, width: 90, height: 200, color: '#1b0d14', seed: 3, parallax: px * 0.6 });
      silhouetteRow(ctx, { y: GROUND_Y - 8, count: 9, width: 150, height: 130, color: '#0f070c', seed: 11, parallax: px });
      floor(ctx, { top: '#241018', bottom: '#0b0508', horizonGlow: '#ff6b3d' });
      // Rooftop details
      ctx.fillStyle = '#160a11';
      ctx.fillRect(60, GROUND_Y - 46, 150, 46);
      ctx.fillRect(1070, GROUND_Y - 62, 170, 62);
      for (let i = 0; i < 5; i += 1) {
        ctx.fillStyle = 'rgba(255,180,120,0.10)';
        ctx.fillRect(0, GROUND_Y - 150 + i * 28, W, 2);
      }
      vignette(ctx, 0.62);
    }
  },

  /* ------------------------------------------------------------ bedroom */
  bedroom: {
    name: 'THE ROOM THAT NEVER GETS CLEANED',
    palette: { primary: '#7b4bd6', fog: '#1a1226' },
    draw(ctx, t, cam) {
      skyGradient(ctx, [
        [0, '#120c1c'],
        [0.5, '#1d1430'],
        [1, '#0b0714']
      ]);
      const px = -(cam?.x ?? W / 2) * 0.05;
      // Window light shaft
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(150,120,255,0.05)';
      ctx.beginPath();
      ctx.moveTo(180 + px, 0);
      ctx.lineTo(330 + px, 0);
      ctx.lineTo(430 + px, GROUND_Y);
      ctx.lineTo(120 + px, GROUND_Y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Furniture silhouettes
      ctx.fillStyle = '#171029';
      ctx.fillRect(80 + px * 0.5, GROUND_Y - 210, 300, 210); // wardrobe
      ctx.fillRect(880 + px * 0.5, GROUND_Y - 130, 320, 130); // bed
      ctx.fillStyle = '#241a3d';
      ctx.fillRect(880 + px * 0.5, GROUND_Y - 150, 320, 28); // mattress
      ctx.fillStyle = '#2e2148';
      ctx.fillRect(900 + px * 0.5, GROUND_Y - 168, 120, 26); // pillow
      // Clutter piles
      ctx.fillStyle = '#140e22';
      for (let i = 0; i < 7; i += 1) {
        const cx = 420 + i * 62 + px * 0.8;
        ctx.beginPath();
        ctx.ellipse(cx, GROUND_Y - 8, 34 + (i % 3) * 10, 12 + (i % 2) * 8, 0, 0, TAU);
        ctx.fill();
      }
      // Slow floating dust
      const dust = [];
      for (let i = 0; i < 26; i += 1) {
        dust.push({
          x: (i * 97) % W,
          y: 120 + ((i * 53) % 380),
          w: 1.6 + (i % 3) * 0.7,
          alpha: 0.16 + (i % 4) * 0.04,
          speed: 0.12 + (i % 5) * 0.03,
          phase: i,
          amp: 26 + (i % 6) * 8,
          color: '#b9a5ff'
        });
      }
      floating(ctx, dust, t);
      floor(ctx, { top: '#1a1226', bottom: '#08050e', horizonGlow: '#7b4bd6' });
      vignette(ctx, 0.7);
    }
  },

  /* ------------------------------------------------------------ digital */
  digital: {
    name: 'THE FEED',
    palette: { primary: '#22d3ee', fog: '#04222b' },
    draw(ctx, t, cam) {
      skyGradient(ctx, [
        [0, '#03141c'],
        [0.55, '#062a36'],
        [1, '#020c12']
      ]);
      const px = -(cam?.x ?? W / 2) * 0.04;
      // Grid floor perspective
      ctx.save();
      ctx.strokeStyle = 'rgba(34,211,238,0.16)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 22; i += 1) {
        const y = GROUND_Y - 4 + i * i * 0.42;
        if (y > H) break;
        ctx.globalAlpha = 1 - i / 22;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      for (let i = -12; i <= 12; i += 1) {
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(W / 2 + i * 40 + px, GROUND_Y - 4);
        ctx.lineTo(W / 2 + i * 320 + px, H);
        ctx.stroke();
      }
      ctx.restore();

      // Floating notification screens
      const screens = [];
      for (let i = 0; i < 12; i += 1) {
        const seed = i * 37;
        screens.push({
          x: 90 + ((seed * 13) % (W - 180)),
          y: 90 + ((seed * 29) % 300),
          w: 74 + (i % 4) * 22,
          h: 52 + (i % 3) * 16,
          alpha: 0.18 + (i % 5) * 0.05,
          speed: 0.5 + (i % 4) * 0.22,
          phase: i * 1.7,
          amp: 16 + (i % 5) * 6,
          kind: 'screen',
          color: i % 3 === 0 ? 'rgba(244,114,182,0.5)' : 'rgba(34,211,238,0.5)'
        });
      }
      floating(ctx, screens, t);

      // Data streams
      ctx.save();
      ctx.strokeStyle = 'rgba(34,211,238,0.12)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 18; i += 1) {
        const x = (i * 71 + t * (30 + (i % 5) * 20)) % W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, GROUND_Y - 10);
        ctx.stroke();
      }
      ctx.restore();
      floor(ctx, { top: '#06222c', bottom: '#01080c', horizonGlow: '#22d3ee' });
      vignette(ctx, 0.55, '#001014');
    }
  },

  /* -------------------------------------------------------------- psych */
  psych: {
    name: 'THE DARK ROOM INSIDE',
    palette: { primary: '#1d4ed8', fog: '#050a1c' },
    draw(ctx, t, cam) {
      skyGradient(ctx, [
        [0, '#04060f'],
        [0.5, '#0a1130'],
        [1, '#03050c']
      ]);
      const px = -(cam?.x ?? W / 2) * 0.03;
      // Breathing walls
      const breath = 1 + Math.sin(t * 0.6) * 0.04;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(breath, breath);
      ctx.translate(-W / 2, -H / 2);
      for (let i = 0; i < 6; i += 1) {
        const inset = i * 46;
        ctx.strokeStyle = rgba('#1d4ed8', 0.16 - i * 0.02);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.rect(inset + px, inset, W - inset * 2, GROUND_Y - inset);
        ctx.stroke();
      }
      ctx.restore();

      // Slow drifting eyes in the dark
      ctx.save();
      for (let i = 0; i < 7; i += 1) {
        const ex = 160 + ((i * 173) % (W - 320));
        const ey = 140 + ((i * 97) % 220) + Math.sin(t * 0.5 + i) * 10;
        const open = 0.5 + 0.5 * Math.sin(t * 0.8 + i * 2);
        ctx.globalAlpha = 0.18 + open * 0.22;
        ctx.fillStyle = '#8fb0ff';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 20, 9 * open + 1.5, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#0b1024';
        ctx.beginPath();
        ctx.arc(ex + Math.sin(t * 0.4 + i) * 5, ey, 4.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      floor(ctx, { top: '#0a1024', bottom: '#02040a', horizonGlow: '#1d4ed8' });
      vignette(ctx, 0.82, '#01030a');
    }
  },

  /* --------------------------------------------------------------- neon */
  neon: {
    name: 'NEON HALLUCINATION',
    palette: { primary: '#ff3dbe', fog: '#240a24' },
    draw(ctx, t, cam) {
      skyGradient(ctx, [
        [0, '#17061a'],
        [0.5, '#3a0f38'],
        [1, '#100410']
      ]);
      const px = -(cam?.x ?? W / 2) * 0.05;
      // Neon tubes
      const tubes = [
        { x: 180, y: 120, w: 6, h: 300, color: '#ff3dbe' },
        { x: 1080, y: 90, w: 6, h: 340, color: '#22d3ee' },
        { x: 420, y: 60, w: 380, h: 5, color: '#c084fc' },
        { x: 700, y: 300, w: 5, h: 220, color: '#22d3ee' }
      ];
      for (const tube of tubes) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowColor = tube.color;
        ctx.shadowBlur = 34;
        ctx.fillStyle = rgba(tube.color, 0.75 + 0.2 * Math.sin(t * 2 + tube.x));
        ctx.fillRect(tube.x + px * 0.6, tube.y, tube.w, tube.h);
        ctx.restore();
      }
      // Distant signboards
      silhouetteRow(ctx, { y: GROUND_Y - 40, count: 8, width: 120, height: 150, color: '#160616', seed: 21, parallax: px * 0.8 });
      // Floating rings
      const rings = [];
      for (let i = 0; i < 8; i += 1) {
        rings.push({
          x: 120 + i * 150,
          y: 150 + (i % 3) * 90,
          w: 22 + (i % 4) * 12,
          alpha: 0.16 + (i % 3) * 0.06,
          speed: 0.4 + i * 0.05,
          phase: i,
          amp: 30,
          kind: 'ring',
          color: i % 2 ? '#ff3dbe' : '#22d3ee'
        });
      }
      floating(ctx, rings, t);
      floor(ctx, { top: '#280c28', bottom: '#0b030c', horizonGlow: '#ff3dbe' });
      // Reflective wet floor
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.globalCompositeOperation = 'lighter';
      for (const tube of tubes) {
        const g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
        g.addColorStop(0, rgba(tube.color, 0.5));
        g.addColorStop(1, rgba(tube.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(tube.x + px * 0.6 - 30, GROUND_Y, 60, H - GROUND_Y);
      }
      ctx.restore();
      vignette(ctx, 0.6, '#12041a');
    }
  },

  /* --------------------------------------------------------------- city */
  city: {
    name: 'THE CROWD',
    palette: { primary: '#9aa0a6', fog: '#14181c' },
    draw(ctx, t, cam) {
      skyGradient(ctx, [
        [0, '#0d1116'],
        [0.45, '#1c222a'],
        [0.85, '#39424c'],
        [1, '#11151a']
      ]);
      const px = -(cam?.x ?? W / 2) * 0.08;
      silhouetteRow(ctx, { y: GROUND_Y - 40, count: 18, width: 80, height: 250, color: '#0e1218', seed: 5, parallax: px * 0.5 });
      silhouetteRow(ctx, { y: GROUND_Y - 10, count: 12, width: 120, height: 150, color: '#080b0f', seed: 9, parallax: px });

      // Crowd silhouettes bobbing
      ctx.save();
      ctx.fillStyle = '#05070a';
      for (let i = 0; i < 46; i += 1) {
        const cx = (i * 29 + px * 1.6) % (W + 60) - 30;
        const bob = Math.sin(t * (1.2 + (i % 5) * 0.2) + i) * 3;
        const h = 86 + (i % 4) * 12;
        ctx.beginPath();
        ctx.arc(cx, GROUND_Y - 96 + bob, 11, 0, TAU);
        ctx.fill();
        ctx.fillRect(cx - 9, GROUND_Y - 88 + bob, 18, h - 30);
      }
      ctx.restore();
      floor(ctx, { top: '#1a1f26', bottom: '#070a0d', horizonGlow: '#9aa0a6' });
      vignette(ctx, 0.66, '#04060a');
    }
  },

  /* ------------------------------------------------------------- crisis */
  crisis: {
    name: '3 A.M.',
    palette: { primary: '#b98fd8', fog: '#0b0714' },
    serious: true,
    draw(ctx, t, cam) {
      skyGradient(ctx, [
        [0, '#080610'],
        [0.6, '#141026'],
        [1, '#05040a']
      ]);
      const px = -(cam?.x ?? W / 2) * 0.03;
      // A single window with dawn light — the visual anchor of this arena.
      const dawn = clamp(0.35 + Math.sin(t * 0.25) * 0.12, 0, 1);
      ctx.save();
      ctx.fillStyle = '#0d0a18';
      ctx.fillRect(300 + px, 90, 260, 300);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(300 + px, 390, 300 + px, 90);
      g.addColorStop(0, `rgba(185,143,216,${0.5 * dawn})`);
      g.addColorStop(1, `rgba(255,214,170,${0.16 * dawn})`);
      ctx.fillStyle = g;
      ctx.fillRect(300 + px, 90, 260, 300);
      ctx.strokeStyle = '#241c3a';
      ctx.lineWidth = 8;
      ctx.strokeRect(300 + px, 90, 260, 300);
      ctx.beginPath();
      ctx.moveTo(430 + px, 90);
      ctx.lineTo(430 + px, 390);
      ctx.moveTo(300 + px, 240);
      ctx.lineTo(560 + px, 240);
      ctx.stroke();
      ctx.restore();

      // Room furniture, minimal
      ctx.fillStyle = '#0e0b1a';
      ctx.fillRect(820 + px * 0.6, GROUND_Y - 110, 300, 110);
      ctx.fillRect(120 + px * 0.6, GROUND_Y - 70, 150, 70);
      floor(ctx, { top: '#120e20', bottom: '#05040a', horizonGlow: '#6b5a8a' });
      vignette(ctx, 0.85, '#020208');
    }
  },

  /* --------------------------------------------------------------- ruin */
  ruin: {
    name: 'WHAT IS LEFT',
    palette: { primary: '#8b1a1a', fog: '#160a0a' },
    draw(ctx, t, cam) {
      skyGradient(ctx, [
        [0, '#120708'],
        [0.5, '#2b1010'],
        [1, '#0b0405']
      ]);
      const px = -(cam?.x ?? W / 2) * 0.06;
      // Broken columns
      ctx.fillStyle = '#180b0c';
      const cols = [140, 320, 900, 1080];
      cols.forEach((x, i) => {
        const h = 240 - (i % 2) * 80;
        ctx.fillRect(x + px * 0.7, GROUND_Y - h, 70, h);
        ctx.fillStyle = '#221011';
        ctx.fillRect(x - 12 + px * 0.7, GROUND_Y - h - 18, 94, 20);
        ctx.fillStyle = '#180b0c';
      });
      // Rubble
      for (let i = 0; i < 22; i += 1) {
        const rx = ((i * 137) % W + px) % W;
        ctx.fillStyle = i % 3 ? '#1c0d0e' : '#260f10';
        ctx.beginPath();
        ctx.ellipse(rx, GROUND_Y - 4, 20 + (i % 4) * 12, 7 + (i % 3) * 4, 0, 0, TAU);
        ctx.fill();
      }
      // Drifting ash
      const ash = [];
      for (let i = 0; i < 30; i += 1) {
        ash.push({
          x: (i * 83) % W,
          y: ((i * 61) % 400),
          w: 1.7 + (i % 3) * 0.8,
          alpha: 0.2 + (i % 4) * 0.06,
          speed: 0.3 + (i % 6) * 0.08,
          phase: i * 0.7,
          amp: 40 + (i % 7) * 10,
          color: '#c98b7a'
        });
      }
      floating(ctx, ash, t);
      floor(ctx, { top: '#1c0d0e', bottom: '#080304', horizonGlow: '#8b1a1a' });
      vignette(ctx, 0.78, '#0a0304');
    }
  },

  /* ------------------------------------------------------------ inferno */
  inferno: {
    name: 'BURNING FIELD',
    palette: { primary: '#ff7a18', fog: '#2a0d05' },
    draw(ctx, t, cam) {
      skyGradient(ctx, [
        [0, '#1a0703'],
        [0.45, '#52180a'],
        [0.85, '#a33a08'],
        [1, '#26090a']
      ]);
      const px = -(cam?.x ?? W / 2) * 0.07;
      silhouetteRow(ctx, { y: GROUND_Y - 20, count: 10, width: 130, height: 180, color: '#160603', seed: 33, parallax: px * 0.6 });
      // Fire plumes
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i += 1) {
        const bx = ((i * 149) % (W + 200)) - 100 + px;
        const flicker = 0.7 + 0.3 * Math.sin(t * (3 + i * 0.4) + i);
        const h = (70 + (i % 4) * 46) * flicker;
        const g = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y - h);
        g.addColorStop(0, 'rgba(255,120,30,0.55)');
        g.addColorStop(0.5, 'rgba(255,70,20,0.25)');
        g.addColorStop(1, 'rgba(255,200,80,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx - 34, GROUND_Y);
        ctx.quadraticCurveTo(bx - 12 + Math.sin(t * 2 + i) * 10, GROUND_Y - h * 0.6, bx, GROUND_Y - h);
        ctx.quadraticCurveTo(bx + 12 + Math.sin(t * 2.4 + i) * 10, GROUND_Y - h * 0.6, bx + 34, GROUND_Y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // Embers
      const embers = [];
      for (let i = 0; i < 34; i += 1) {
        embers.push({
          x: (i * 79 + Math.sin(t * 0.6 + i) * 40) % W,
          y: GROUND_Y - ((i * 97) % 420),
          w: 1.8 + (i % 3) * 0.9,
          alpha: 0.3 + (i % 5) * 0.08,
          speed: 0.6 + (i % 7) * 0.12,
          phase: i,
          amp: 60 + (i % 5) * 14,
          color: i % 3 ? '#ff9d3c' : '#ffd166'
        });
      }
      floating(ctx, embers, t);
      floor(ctx, { top: '#40120a', bottom: '#0d0303', horizonGlow: '#ff7a18' });
      vignette(ctx, 0.6, '#1a0402');
    }
  },

  /* ------------------------------------------------------------- campus */
  campus: {
    name: 'CAMPUS — FOUR YEARS',
    palette: { primary: '#f5c518', fog: '#1c1a10' },
    draw(ctx, t, cam, { phase = 0 } = {}) {
      // The arena visibly ages as School advances through the years.
      const warmth = clamp(phase / 3, 0, 1);
      skyGradient(ctx, [
        [0, mix('#12161f', '#20140c', warmth)],
        [0.5, mix('#26303c', '#4a3a12', warmth)],
        [1, mix('#0b0e14', '#171008', warmth)]
      ]);
      const px = -(cam?.x ?? W / 2) * 0.06;
      // Main building with rows of windows
      ctx.fillStyle = mix('#141922', '#2c2410', warmth);
      ctx.fillRect(240 + px * 0.7, 110, 800, GROUND_Y - 110);
      ctx.save();
      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 14; col += 1) {
          const lit = ((row * 14 + col) * 37) % 10 > 6 - warmth * 2;
          ctx.globalAlpha = lit ? 0.5 + 0.3 * Math.sin(t * 0.8 + col) : 0.1;
          ctx.fillStyle = lit ? '#ffd75e' : '#39404d';
          ctx.fillRect(272 + col * 54 + px * 0.7, 140 + row * 66, 30, 40);
        }
      }
      ctx.restore();
      // Clock that ticks faster in later years
      const speed = 1 + phase * 0.9;
      ctx.save();
      ctx.translate(640 + px * 0.7, 92);
      ctx.strokeStyle = '#f5c518';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.sin(t * speed) * 22, -Math.cos(t * speed) * 22);
      ctx.stroke();
      ctx.restore();
      // Notice board / deadlines pinned up
      ctx.fillStyle = 'rgba(245,197,24,0.15)';
      for (let i = 0; i < 6 + phase * 3; i += 1) {
        const nx = 90 + ((i * 197) % (W - 180));
        const ny = 180 + ((i * 83) % 120);
        ctx.fillRect(nx, ny, 46, 60);
      }
      floor(ctx, { top: mix('#1b2029', '#2e2612', warmth), bottom: '#07080b', horizonGlow: '#f5c518' });
      vignette(ctx, 0.62);
    }
  },

  /* ----------------------------------------------------------- unstable */
  unstable: {
    name: 'THE UNSTABLE HOUR',
    palette: { primary: '#c9a6ff', fog: '#0e0a18' },
    serious: true,
    draw(ctx, t, cam, { phase = 0 } = {}) {
      // No flashing: slow hue drift + geometry warp only.
      const flashScale = settings.flashScale;
      const warp = (0.5 + phase * 0.5) * flashScale;
      skyGradient(ctx, [
        [0, '#0a0714'],
        [0.5, mix('#171029', '#2a1440', 0.5 + 0.5 * Math.sin(t * 0.35))],
        [1, '#05040c']
      ]);
      const px = -(cam?.x ?? W / 2) * 0.05;

      // Warped horizon bands
      ctx.save();
      ctx.translate(W / 2, GROUND_Y - 140);
      for (let i = 0; i < 16; i += 1) {
        const k = i / 16;
        ctx.globalAlpha = 0.05 + 0.05 * (1 - k);
        ctx.fillStyle = i % 2 ? '#c9a6ff' : '#6ee7ff';
        ctx.beginPath();
        ctx.moveTo(-W / 2 - 100, 0);
        for (let x = -100; x <= W + 100; x += 40) {
          const y =
            Math.sin(x * 0.006 + t * (0.6 + i * 0.06) + i) * (18 + i * 3) * warp +
            i * 12 -
            240;
          ctx.lineTo(x - W / 2, y);
        }
        ctx.lineTo(W / 2 + 100, -260);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Fractured monoliths drifting
      ctx.save();
      for (let i = 0; i < 7; i += 1) {
        const bx = 120 + ((i * 191) % (W - 240)) + Math.sin(t * 0.3 + i) * 30 * warp;
        const bh = 180 + (i % 4) * 70;
        ctx.fillStyle = 'rgba(20,14,36,0.9)';
        ctx.beginPath();
        ctx.moveTo(bx, GROUND_Y);
        ctx.lineTo(bx + 40, GROUND_Y - bh * 0.7);
        ctx.lineTo(bx + 76, GROUND_Y - bh);
        ctx.lineTo(bx + 96, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(201,166,255,${0.25 + 0.15 * Math.sin(t + i)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      // Slow pulse rings (deliberately gentle)
      const rings = [];
      for (let i = 0; i < 5; i += 1) {
        rings.push({
          x: 200 + i * 220,
          y: 220 + (i % 3) * 70,
          w: 40 + i * 12,
          alpha: 0.1 + 0.05 * Math.sin(t * 0.6 + i),
          speed: 0.2,
          phase: i,
          amp: 20,
          kind: 'ring',
          color: '#c9a6ff'
        });
      }
      floating(ctx, rings, t);
      floor(ctx, { top: '#140f24', bottom: '#05040a', horizonGlow: '#8b6bd6' });
      vignette(ctx, 0.8, '#03020a');
    }
  },

  /* ---------------------------------------------------------------- dojo */
  dojo: {
    name: 'TRAINING HALL',
    palette: { primary: '#8b7355', fog: '#141210' },
    draw(ctx, t, cam) {
      skyGradient(ctx, [
        [0, '#0f0d0b'],
        [0.5, '#211d18'],
        [1, '#0a0908']
      ]);
      const px = -(cam?.x ?? W / 2) * 0.04;
      // Shoji-style wall panels
      ctx.strokeStyle = 'rgba(200,170,120,0.16)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i += 1) {
        const x = 60 + i * 150 + px * 0.5;
        ctx.strokeRect(x, 120, 120, GROUND_Y - 160);
        ctx.beginPath();
        ctx.moveTo(x, 240);
        ctx.lineTo(x + 120, 240);
        ctx.moveTo(x + 60, 120);
        ctx.lineTo(x + 60, GROUND_Y - 40);
        ctx.stroke();
      }
      floor(ctx, { top: '#241f18', bottom: '#0a0806', horizonGlow: '#8b7355' });
      // Distance markers
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#8b7355';
      ctx.setLineDash([10, 14]);
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y - 2);
      ctx.lineTo(W, GROUND_Y - 2);
      ctx.stroke();
      ctx.restore();
      vignette(ctx, 0.6);
    }
  },

  /* ---------------------------------------------------------------- menu */
  menu: {
    name: 'THE LEDGE',
    palette: { primary: '#ff2b3c', fog: '#160a10' },
    draw(ctx, t, cam) {
      skyGradient(ctx, [
        [0, '#0a0508'],
        [0.42, '#250b12'],
        [0.72, '#4d1319'],
        [1, '#0b0407']
      ]);
      const px = -(cam?.x ?? W / 2) * 0.03;
      // Distant skyline
      silhouetteRow(ctx, { y: GROUND_Y - 30, count: 16, width: 84, height: 210, color: '#120609', seed: 17, parallax: px * 0.5 });
      silhouetteRow(ctx, { y: GROUND_Y - 4, count: 10, width: 140, height: 120, color: '#080305', seed: 29, parallax: px });
      // Slow drifting red embers
      const embers = [];
      for (let i = 0; i < 22; i += 1) {
        embers.push({
          x: (i * 113) % W,
          y: 100 + ((i * 71) % 400),
          w: 1.6 + (i % 3) * 0.7,
          alpha: 0.14 + (i % 4) * 0.05,
          speed: 0.25 + (i % 5) * 0.06,
          phase: i * 1.3,
          amp: 40,
          color: i % 4 === 0 ? '#ffd166' : '#ff5c5c'
        });
      }
      floating(ctx, embers, t);
      floor(ctx, { top: '#1a0a0f', bottom: '#060305', horizonGlow: '#ff2b3c' });
      vignette(ctx, 0.72);
    }
  }
};

function mix(a, b, t) {
  const ca = hex(a);
  const cb = hex(b);
  const r = Math.round(lerp(ca[0], cb[0], clamp(t, 0, 1)));
  const g = Math.round(lerp(ca[1], cb[1], clamp(t, 0, 1)));
  const bl = Math.round(lerp(ca[2], cb[2], clamp(t, 0, 1)));
  return `rgb(${r},${g},${bl})`;
}

function hex(h) {
  const v = h.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function getArena(id) {
  return ARENAS[id] || ARENAS.rooftop;
}

export function drawArena(ctx, id, time, camera, extra = {}) {
  const arena = getArena(id);
  ctx.save();
  arena.draw(ctx, time, camera, extra);
  ctx.restore();
}

export function arenaName(id) {
  return getArena(id).name;
}

export const ARENA_IDS = Object.keys(ARENAS);
void pulse;
