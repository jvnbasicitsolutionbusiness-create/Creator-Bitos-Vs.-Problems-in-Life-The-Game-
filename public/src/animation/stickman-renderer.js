/**
 * stickman-renderer.js — draws a solved skeleton as a stylised stickman.
 *
 * Rendering details that make the characters read as "game" rather than
 * "diagram":
 *   • back limbs are darker and thinner (depth without a second asset)
 *   • front limbs get a coloured glow pass and a bright core stroke
 *   • a head with a directional gaze (used heavily by the main menu)
 *   • optional silhouette / flash / trail modes for cinematics
 */
import { rgba, mixHex, clamp, lerp } from '../core/utils.js';

export function drawStickman(ctx, solved, {
  x,
  y,
  facing = 1,
  height = 150,
  color = '#ff2b3c',
  accent = '#ffd9dd',
  lineWidth = 7,
  glow = 1,
  alpha = 1,
  silhouette = false,
  silhouetteColor = '#000000',
  eye = { x: 0, y: 0 },
  flash = 0,
  squashY = 1,
  scaleX = 1,
  tilt = 0,
  eyeStyle = 'angry',
  aura = null,
  charId = null
} = {}) {
  const stroke = silhouette ? silhouetteColor : color;
  const strokeBack = silhouette ? silhouetteColor : mixHex(color, '#000000', 0.42);
  const skin = silhouette ? silhouetteColor : accent;
  const lw = (lineWidth / 150) * height;

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(facing * scaleX, squashY);
  if (tilt) ctx.rotate(tilt);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Convert solved joints (y up) to canvas space (y down).
  const px = (p) => p.x;
  const py = (p) => -p.y;

  if (aura && aura.strength > 0.01) {
    const r = height * (0.55 + 0.35 * aura.strength);
    const g = ctx.createRadialGradient(0, -height * 0.5, height * 0.1, 0, -height * 0.5, r);
    g.addColorStop(0, rgba(aura.color || color, 0.45 * aura.strength));
    g.addColorStop(1, rgba(aura.color || color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-r, -height * 0.5 - r, r * 2, r * 2);
  }

  /* ---------------------------------------------------------- back limbs */
  ctx.strokeStyle = strokeBack;
  ctx.lineWidth = lw * 0.86;
  ctx.shadowBlur = 0;
  limb(ctx, solved.hipB, solved.kneeB, solved.footB, px, py);
  limb(ctx, solved.shoulderB, solved.elbowB, solved.handB, px, py);

  /* -------------------------------------------------------- front limbs */
  ctx.strokeStyle = stroke;
  if (glow > 0 && !silhouette) {
    ctx.shadowColor = rgba(color, 0.85);
    ctx.shadowBlur = 14 * glow * (height / 150);
  }
  ctx.lineWidth = lw * 0.95;
  limb(ctx, solved.hipF, solved.kneeF, solved.footF, px, py);
  limb(ctx, solved.shoulderF, solved.elbowF, solved.handF, px, py);

  /* -------------------------------------------------------------- torso */
  ctx.lineWidth = lw * 1.18;
  ctx.beginPath();
  ctx.moveTo(px(solved.pelvis), py(solved.pelvis));
  ctx.lineTo(px(solved.chest), py(solved.chest));
  ctx.lineTo(px(solved.neck), py(solved.neck));
  ctx.stroke();

  /* --------------------------------------------------------------- head */
  const headR = solved.headRadius;
  ctx.beginPath();
  ctx.arc(px(solved.head), py(solved.head), headR, 0, Math.PI * 2);
  if (silhouette) {
    ctx.fillStyle = stroke;
    ctx.fill();
  } else {
    ctx.fillStyle = mixHex(color, '#000000', 0.25);
    ctx.fill();
    ctx.lineWidth = lw * 0.5;
    ctx.strokeStyle = skin;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  drawFace(ctx, px(solved.head), py(solved.head), headR, {
    eye,
    facing: 1,
    color: silhouette ? silhouetteColor : '#0b0509',
    glowColor: skin,
    style: eyeStyle,
    silhouette
  });

  if (flash > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ffffff', clamp(flash, 0, 1));
    ctx.lineWidth = lw * 1.35;
    ctx.shadowColor = rgba('#ffffff', 0.9);
    ctx.shadowBlur = 26 * flash;
    limb(ctx, solved.hipF, solved.kneeF, solved.footF, px, py);
    limb(ctx, solved.hipB, solved.kneeB, solved.footB, px, py);
    limb(ctx, solved.shoulderF, solved.elbowF, solved.handF, px, py);
    limb(ctx, solved.shoulderB, solved.elbowB, solved.handB, px, py);
    ctx.beginPath();
    ctx.moveTo(px(solved.pelvis), py(solved.pelvis));
    ctx.lineTo(px(solved.chest), py(solved.chest));
    ctx.lineTo(px(solved.neck), py(solved.neck));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px(solved.head), py(solved.head), headR, 0, Math.PI * 2);
    ctx.fillStyle = rgba('#ffffff', clamp(flash * 0.8, 0, 1));
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  if (!silhouette && charId !== null) {
    drawAnimeUpgrade(ctx, solved, { x, y, facing, height, color, accent, lineWidth, glow, charId }, lw);
  }

  ctx.restore();
}

function limb(ctx, a, b, c, px, py) {
  ctx.beginPath();
  ctx.moveTo(px(a), py(a));
  ctx.lineTo(px(b), py(b));
  ctx.lineTo(px(c), py(c));
  ctx.stroke();
}

/** Tapered trapezoid between two joints, wider at the proximal end. */
function taperedLimb(ctx, a, b, halfW0, halfW1, px, py) {
  const ax = px(a), ay = py(a), bx = px(b), by = py(b);
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(ax + nx * halfW0, ay + ny * halfW0);
  ctx.lineTo(ax - nx * halfW0, ay - ny * halfW0);
  ctx.lineTo(bx - nx * halfW1, by - ny * halfW1);
  ctx.lineTo(bx + nx * halfW1, by + ny * halfW1);
  ctx.closePath();
  ctx.fill();
}

/**
 * drawAnimeUpgrade — adds tapered fills, hands, feet, hair, nose and mouth
 * on top of the base stickman render. Private; never exported.
 * Only called when silhouette=false AND charId is non-null.
 */
function drawAnimeUpgrade(ctx, solved, opts, lw) {
  const { color, accent, height, charId } = opts;
  const TAU = Math.PI * 2;
  const px = (p) => p.x;
  const py = (p) => -p.y;
  const headRadius = solved.headRadius;

  ctx.save();

  /* ---- tapered limb fills ---- */
  const proxW = lw * 1.4;
  const distW = lw * 0.7;
  ctx.fillStyle = rgba(color, 0.55);
  const pairs = [
    [solved.shoulderF, solved.elbowF],
    [solved.elbowF, solved.handF],
    [solved.hipF, solved.kneeF],
    [solved.kneeF, solved.footF],
    [solved.shoulderB, solved.elbowB],
    [solved.elbowB, solved.handB],
    [solved.hipB, solved.kneeB],
    [solved.kneeB, solved.footB]
  ];
  for (const [a, b] of pairs) taperedLimb(ctx, a, b, proxW, distW, px, py);

  /* ---- body silhouette fill ---- */
  ctx.fillStyle = rgba(color, 0.45);
  ctx.beginPath();
  ctx.moveTo(px(solved.shoulderF), py(solved.shoulderF));
  ctx.lineTo(px(solved.shoulderB), py(solved.shoulderB));
  ctx.lineTo(px(solved.hipB), py(solved.hipB));
  ctx.lineTo(px(solved.hipF), py(solved.hipF));
  ctx.closePath();
  ctx.fill();

  /* ---- hands ---- */
  ctx.fillStyle = rgba(color, 0.9);
  ctx.beginPath();
  ctx.arc(px(solved.handF), py(solved.handF), lw * 0.85, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(color, 0.6);
  ctx.beginPath();
  ctx.arc(px(solved.handB), py(solved.handB), lw * 0.85, 0, TAU);
  ctx.fill();

  /* ---- feet ---- */
  ctx.fillStyle = rgba(color, 0.7);
  ctx.save();
  ctx.translate(px(solved.footF), py(solved.footF));
  ctx.scale(1, 0.45);
  ctx.beginPath();
  ctx.arc(0, 0, lw * 1.1, 0, TAU);
  ctx.restore();
  ctx.fill();

  ctx.fillStyle = rgba(color, 0.5);
  ctx.save();
  ctx.translate(px(solved.footB), py(solved.footB));
  ctx.scale(1, 0.45);
  ctx.beginPath();
  ctx.arc(0, 0, lw * 1.1, 0, TAU);
  ctx.restore();
  ctx.fill();

  /* ---- larger head overlay ---- */
  ctx.fillStyle = rgba(color, 0.25);
  ctx.beginPath();
  ctx.arc(px(solved.head), py(solved.head), headRadius * 0.35 + lw * 0.3, 0, TAU);
  ctx.fill();

  /* ---- default hair shape (dark-brown toned) ---- */
  const hairColor = mixHex(color, '#2a1a0a', 0.6);
  ctx.fillStyle = hairColor;
  const hx = px(solved.head), hy = py(solved.head);
  ctx.beginPath();
  ctx.moveTo(hx - headRadius * 0.7, hy - headRadius * 0.2);
  ctx.bezierCurveTo(
    hx - headRadius * 0.4, hy - headRadius * 1.4,
    hx + headRadius * 0.4, hy - headRadius * 1.4,
    hx + headRadius * 0.7, hy - headRadius * 0.2
  );
  ctx.arc(hx, hy, headRadius * 0.72, -Math.PI * 0.12, Math.PI + Math.PI * 0.12, true);
  ctx.closePath();
  ctx.fill();

  /* ---- nose dot ---- */
  ctx.fillStyle = rgba(accent, 0.6);
  ctx.beginPath();
  ctx.arc(hx + headRadius * 0.18, hy + headRadius * 0.12, lw * 0.22, 0, TAU);
  ctx.fill();

  /* ---- mouth curve ---- */
  ctx.strokeStyle = rgba(accent, 0.4);
  ctx.lineWidth = lw * 0.2;
  ctx.beginPath();
  ctx.arc(hx + headRadius * 0.22, hy + headRadius * 0.32, headRadius * 0.18, 0, Math.PI);
  ctx.stroke();

  /* ---- per-character details ---- */
  switch (charId) {
    case 'creator-bitos': {
      // Dark-brown hair blob swept right
      ctx.fillStyle = '#3d2106';
      ctx.beginPath();
      ctx.moveTo(hx - headRadius * 0.6, hy - headRadius * 0.3);
      ctx.bezierCurveTo(
        hx - headRadius * 0.2, hy - headRadius * 1.2,
        hx + headRadius * 0.8, hy - headRadius * 1.2,
        hx + headRadius * 0.6, hy - headRadius * 0.0
      );
      ctx.bezierCurveTo(
        hx + headRadius * 1.0, hy - headRadius * 1.4,
        hx + headRadius * 0.4, hy - headRadius * 1.6,
        hx - headRadius * 0.4, hy - headRadius * 0.8
      );
      ctx.closePath();
      ctx.fill();

      // Scarf rectangle at neck
      const nx = px(solved.neck), neckY = py(solved.neck);
      ctx.fillStyle = '#8b0000';
      ctx.fillRect(nx - headRadius * 0.9, neckY - headRadius * 0.1, headRadius * 1.8, headRadius * 0.4);

      // Red accent diagonal stripes on torso
      ctx.strokeStyle = rgba('#ff2b3c', 0.4);
      ctx.lineWidth = lw * 0.4;
      ctx.beginPath();
      ctx.moveTo(px(solved.chest) - lw * 0.5, py(solved.chest));
      ctx.lineTo(px(solved.pelvis) + lw * 0.5, py(solved.pelvis));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px(solved.chest) + lw * 0.5, py(solved.chest));
      ctx.lineTo(px(solved.pelvis) - lw * 0.5, py(solved.pelvis));
      ctx.stroke();
      break;
    }
    case 'laziness': {
      // Droopy purple hair
      ctx.fillStyle = '#4a2b6b';
      ctx.beginPath();
      ctx.moveTo(hx - headRadius * 0.7, hy - headRadius * 0.5);
      ctx.bezierCurveTo(
        hx - headRadius * 1.2, hy + headRadius * 0.8,
        hx - headRadius * 0.9, hy + headRadius * 1.4,
        hx - headRadius * 0.5, hy + headRadius * 1.6
      );
      ctx.bezierCurveTo(
        hx - headRadius * 0.2, hy + headRadius * 0.4,
        hx - headRadius * 0.4, hy - headRadius * 1.1,
        hx - headRadius * 0.1, hy - headRadius * 1.0
      );
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hx + headRadius * 0.4, hy - headRadius * 0.6);
      ctx.bezierCurveTo(
        hx + headRadius * 1.1, hy + headRadius * 0.5,
        hx + headRadius * 0.8, hy + headRadius * 1.2,
        hx + headRadius * 0.4, hy + headRadius * 1.5
      );
      ctx.bezierCurveTo(
        hx + headRadius * 0.1, hy + headRadius * 0.3,
        hx + headRadius * 0.2, hy - headRadius * 1.0,
        hx + headRadius * 0.5, hy - headRadius * 0.8
      );
      ctx.closePath();
      ctx.fill();

      // Purple radial aura
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const auraG = ctx.createRadialGradient(hx, hy - height * 0.3, height * 0.05, hx, hy - height * 0.3, height * 0.55);
      auraG.addColorStop(0, rgba('#7b4bd6', 0.22));
      auraG.addColorStop(1, rgba('#7b4bd6', 0));
      ctx.fillStyle = auraG;
      ctx.fillRect(hx - height * 0.6, hy - height * 0.9, height * 1.2, height * 1.2);
      ctx.restore();
      break;
    }
    case 'gadget': {
      // Visor bar across eye region
      const eyeRegionY = py(solved.head) - headRadius * 0.06;
      ctx.fillStyle = rgba('#22d3ee', 0.85);
      ctx.fillRect(hx - headRadius * 0.1, eyeRegionY - headRadius * 0.28, headRadius * 1.05, headRadius * 0.28);

      // Antenna bumps on head
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(hx + headRadius * 0.1, hy - headRadius - lw * 0.6, lw * 0.6, lw * 0.6);
      ctx.fillRect(hx + headRadius * 0.45, hy - headRadius - lw * 0.4, lw * 0.4, lw * 0.4);

      // Circuit lines on front arm
      ctx.strokeStyle = rgba('#22d3ee', 0.5);
      ctx.lineWidth = lw * 0.18;
      const sF = solved.shoulderF, eF = solved.elbowF;
      for (let i = 0; i < 3; i += 1) {
        const t0 = (i + 1) * 0.22;
        const t1 = t0 + 0.15;
        const x0 = px(sF) + (px(eF) - px(sF)) * t0;
        const y0 = py(sF) + (py(eF) - py(sF)) * t0;
        const x1 = px(sF) + (px(eF) - px(sF)) * t1;
        const y1 = py(sF) + (py(eF) - py(sF)) * t1;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(x0 + lw * 0.5, y0 - lw * 0.3, x1 + lw * 0.3, y1 - lw * 0.2, x1, y1);
        ctx.stroke();
      }
      break;
    }
    case 'addiction': {
      // Hollow eye sockets
      ctx.strokeStyle = '#0a0a1a';
      ctx.lineWidth = lw * 0.18;
      ctx.beginPath();
      ctx.arc(hx + headRadius * 0.22, hy - headRadius * 0.06, headRadius * 0.2, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx + headRadius * 0.22 + headRadius * 0.3, hy - headRadius * 0.06, headRadius * 0.2, 0, TAU);
      ctx.stroke();

      // Cracked vein lines on front forearm
      ctx.strokeStyle = rgba('#0a1a3d', 0.7);
      ctx.lineWidth = lw * 0.15;
      const eFa = solved.elbowF, hFa = solved.handF;
      for (let i = 0; i < 3; i += 1) {
        const startT = 0.1 + i * 0.12;
        const sx0 = px(eFa) + (px(hFa) - px(eFa)) * startT;
        const sy0 = py(eFa) + (py(hFa) - py(eFa)) * startT;
        ctx.beginPath();
        ctx.moveTo(sx0, sy0);
        ctx.bezierCurveTo(
          sx0 + lw * (i % 2 === 0 ? 0.4 : -0.3), sy0 + lw * 0.5,
          sx0 + lw * (i % 2 === 0 ? 0.2 : -0.4), sy0 + lw * 1.0,
          px(hFa) + lw * (i - 1) * 0.3, py(hFa) - lw * 0.2
        );
        ctx.stroke();
      }
      break;
    }
    case 'society': {
      // Grey suit collar lines
      const socNx = px(solved.neck), socNy = py(solved.neck);
      ctx.strokeStyle = '#9aa0a6';
      ctx.lineWidth = lw * 0.6;
      ctx.beginPath();
      ctx.moveTo(socNx, socNy);
      ctx.lineTo(px(solved.shoulderF) - lw, py(solved.shoulderF) + lw);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(socNx, socNy);
      ctx.lineTo(px(solved.shoulderB) + lw, py(solved.shoulderB) + lw);
      ctx.stroke();

      // Crowd echo silhouettes
      const offsets = [{ dx: 50, dy: 10 }, { dx: 100, dy: 20 }, { dx: -60, dy: 5 }];
      for (const off of offsets) {
        ctx.save();
        ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.06;
        ctx.fillStyle = '#9aa0a6';
        ctx.beginPath();
        ctx.moveTo(px(solved.shoulderF) + off.dx, py(solved.shoulderF) + off.dy);
        ctx.lineTo(px(solved.shoulderB) + off.dx, py(solved.shoulderB) + off.dy);
        ctx.lineTo(px(solved.hipB) + off.dx, py(solved.hipB) + off.dy);
        ctx.lineTo(px(solved.hipF) + off.dx, py(solved.hipF) + off.dy);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'seizure': {
      // Glitch offset limb copies — cyan + magenta
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba('#22d3ee', 0.14);
      const glitchPairs = [
        [solved.shoulderF, solved.elbowF],
        [solved.elbowF, solved.handF],
        [solved.hipF, solved.kneeF],
        [solved.kneeF, solved.footF]
      ];
      for (const [a, b] of glitchPairs) {
        const off = 8;
        const ax = px(a) + off, ay = py(a), bx = px(b) + off, by = py(b);
        ctx.beginPath();
        ctx.moveTo(ax - distW, ay);
        ctx.lineTo(ax + distW, ay);
        ctx.lineTo(bx + distW * 0.5, by);
        ctx.lineTo(bx - distW * 0.5, by);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = rgba('#ff3dbe', 0.12);
      for (const [a, b] of glitchPairs) {
        const off = -6;
        const ax = px(a) + off, ay = py(a), bx = px(b) + off, by = py(b);
        ctx.beginPath();
        ctx.moveTo(ax - distW, ay);
        ctx.lineTo(ax + distW, ay);
        ctx.lineTo(bx + distW * 0.5, by);
        ctx.lineTo(bx - distW * 0.5, by);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'wrath': {
      // Spiky orange hair — 6 triangles fanning from head top
      ctx.fillStyle = '#ff7a18';
      const spikes = 6;
      for (let i = 0; i < spikes; i += 1) {
        const angle = -Math.PI * 0.85 + (i / (spikes - 1)) * Math.PI * 0.7;
        const baseAngleL = angle - 0.22;
        const baseAngleR = angle + 0.22;
        const tipR = headRadius * (1.3 + (i % 2) * 0.25);
        ctx.beginPath();
        ctx.moveTo(hx + Math.cos(baseAngleL) * headRadius * 0.82, hy + Math.sin(baseAngleL) * headRadius * 0.82);
        ctx.lineTo(hx + Math.cos(angle) * tipR, hy + Math.sin(angle) * tipR);
        ctx.lineTo(hx + Math.cos(baseAngleR) * headRadius * 0.82, hy + Math.sin(baseAngleR) * headRadius * 0.82);
        ctx.closePath();
        ctx.fill();
      }

      // Flame circles at fists
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const hand of [solved.handF, solved.handB]) {
        const fg = ctx.createRadialGradient(px(hand), py(hand), 0, px(hand), py(hand), lw * 2.2);
        fg.addColorStop(0, rgba('#ff7a18', 0.7));
        fg.addColorStop(1, rgba('#ff7a18', 0));
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(px(hand), py(hand), lw * 2.2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'school': {
      // V-collar lines
      const schNx = px(solved.neck), schNy = py(solved.neck);
      ctx.strokeStyle = rgba('#fff3bd', 0.7);
      ctx.lineWidth = lw * 0.5;
      ctx.beginPath();
      ctx.moveTo(schNx, schNy);
      ctx.lineTo(px(solved.shoulderF) - lw * 0.5, py(solved.shoulderF) + headRadius * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(schNx, schNy);
      ctx.lineTo(px(solved.shoulderB) + lw * 0.5, py(solved.shoulderB) + headRadius * 0.6);
      ctx.stroke();

      // Small badge on chest
      ctx.fillStyle = '#f5c518';
      const chestX = px(solved.chest), chestY = py(solved.chest);
      ctx.fillRect(chestX - lw * 0.7, chestY + lw * 0.3, lw * 1.4, lw * 1.0);
      break;
    }
    case 'suffering': {
      // Heavy dark aura
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const suffG = ctx.createRadialGradient(hx, hy - height * 0.3, height * 0.1, hx, hy - height * 0.3, height * 0.65);
      suffG.addColorStop(0, rgba('#000000', 0.45));
      suffG.addColorStop(1, rgba('#000000', 0));
      ctx.fillStyle = suffG;
      ctx.fillRect(hx - height * 0.7, hy - height * 1.0, height * 1.4, height * 1.2);
      ctx.restore();

      // Extra thick back limbs
      ctx.fillStyle = rgba('#4a0a0a', 0.35);
      ctx.lineWidth = lw * 1.5;
      taperedLimb(ctx, solved.shoulderB, solved.elbowB, proxW * 1.1, distW * 1.1, px, py);
      taperedLimb(ctx, solved.elbowB, solved.handB, proxW * 1.1, distW * 1.1, px, py);
      taperedLimb(ctx, solved.hipB, solved.kneeB, proxW * 1.1, distW * 1.1, px, py);
      taperedLimb(ctx, solved.kneeB, solved.footB, proxW * 1.1, distW * 1.1, px, py);
      break;
    }
    case 'lust': {
      // Flowing wavy pink hair
      ctx.fillStyle = '#ff3dbe';
      ctx.beginPath();
      ctx.moveTo(hx - headRadius * 0.5, hy - headRadius * 0.8);
      ctx.bezierCurveTo(
        hx - headRadius * 1.6, hy - headRadius * 0.2,
        hx - headRadius * 2.0, hy + headRadius * 0.6,
        hx - headRadius * 1.5, hy + headRadius * 1.5
      );
      ctx.bezierCurveTo(
        hx - headRadius * 1.0, hy + headRadius * 0.8,
        hx - headRadius * 0.6, hy - headRadius * 0.4,
        hx - headRadius * 0.2, hy - headRadius * 1.2
      );
      ctx.closePath();
      ctx.fill();

      // Pink ghost silhouette offsets
      ctx.save();
      for (let i = 1; i <= 3; i += 1) {
        const silOff = i * -18;
        ctx.save();
        ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.08;
        ctx.fillStyle = '#ff3dbe';
        ctx.strokeStyle = '#ff3dbe';
        ctx.lineWidth = lw * 0.8;
        ctx.beginPath();
        ctx.moveTo(px(solved.shoulderF) + silOff, py(solved.shoulderF));
        ctx.lineTo(px(solved.shoulderB) + silOff, py(solved.shoulderB));
        ctx.lineTo(px(solved.hipB) + silOff, py(solved.hipB));
        ctx.lineTo(px(solved.hipF) + silOff, py(solved.hipF));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      break;
    }
    default:
      break;
  }

  ctx.restore();
}

/**
 * Eyes carry most of the character's acting. `eye.x` is gaze direction
 * (-1 back .. +1 forward), `eye.y` is vertical (-1 down .. +1 up).
 */
function drawFace(ctx, hx, hy, r, { eye, color, glowColor, style, silhouette }) {
  if (silhouette) return;
  const gx = clamp(eye?.x ?? 0, -1, 1);
  const gy = clamp(eye?.y ?? 0, -1, 1);
  const spread = r * 0.34;
  const eyeY = hy - r * 0.06 + gy * r * 0.16;
  const eyeX = hx + r * 0.22 + gx * r * 0.2;

  ctx.save();
  if (style === 'wide') {
    ctx.fillStyle = glowColor;
    for (const sx of [0, spread * 0.9]) {
      ctx.beginPath();
      ctx.arc(eyeX + sx, eyeY, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = color;
    for (const sx of [0, spread * 0.9]) {
      ctx.beginPath();
      ctx.arc(eyeX + sx + gx * r * 0.06, eyeY + gy * r * 0.05, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 'hollow') {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    for (const sx of [0, spread * 0.9]) {
      ctx.beginPath();
      ctx.arc(eyeX + sx, eyeY, r * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (style === 'closed') {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.4, r * 0.14);
    for (const sx of [0, spread * 0.9]) {
      ctx.beginPath();
      ctx.moveTo(eyeX + sx - r * 0.16, eyeY);
      ctx.lineTo(eyeX + sx + r * 0.16, eyeY);
      ctx.stroke();
    }
  } else if (style === 'visor') {
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.1, eyeY - r * 0.22);
    ctx.lineTo(hx + r * 0.92, eyeY - r * 0.06);
    ctx.lineTo(hx + r * 0.92, eyeY + r * 0.16);
    ctx.lineTo(hx - r * 0.1, eyeY + r * 0.24);
    ctx.closePath();
    ctx.fill();
  } else {
    // 'angry' — angled brows over bright eyes, the default fighting look.
    ctx.fillStyle = glowColor;
    for (const sx of [0, spread * 0.92]) {
      ctx.beginPath();
      ctx.ellipse(eyeX + sx, eyeY, r * 0.2, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = color;
    for (const sx of [0, spread * 0.92]) {
      ctx.beginPath();
      ctx.ellipse(eyeX + sx + gx * r * 0.09, eyeY + gy * r * 0.06, r * 0.1, r * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.6, r * 0.15);
    for (const sx of [0, spread * 0.92]) {
      ctx.beginPath();
      ctx.moveTo(eyeX + sx - r * 0.2, eyeY - r * 0.26);
      ctx.lineTo(eyeX + sx + r * 0.2, eyeY - r * 0.14);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Simple ground shadow ellipse. */
export function drawShadow(ctx, x, y, width, alpha = 0.5) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, width);
  g.addColorStop(0, `rgba(0,0,0,${0.55 * alpha})`);
  g.addColorStop(0.6, `rgba(0,0,0,${0.22 * alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, width, width * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Motion trail: redraw the previous solved poses with fading alpha. */
export function drawTrail(ctx, frames, options) {
  const n = frames.length;
  for (let i = 0; i < n; i += 1) {
    const f = frames[i];
    const t = (i + 1) / n;
    drawStickman(ctx, f.solved, {
      ...options,
      x: f.x,
      y: f.y,
      facing: f.facing,
      alpha: (options.alpha ?? 1) * 0.16 * t,
      glow: 0,
      silhouette: true,
      silhouetteColor: options.color
    });
  }
}

export function lerpSolved(a, b, t) {
  const out = {};
  for (const key of Object.keys(a)) {
    if (typeof a[key] === 'number') out[key] = lerp(a[key], b[key], t);
    else if (a[key] && typeof a[key] === 'object' && 'x' in a[key]) {
      out[key] = { x: lerp(a[key].x, b[key].x, t), y: lerp(a[key].y, b[key].y, t) };
    } else out[key] = a[key];
  }
  return out;
}
