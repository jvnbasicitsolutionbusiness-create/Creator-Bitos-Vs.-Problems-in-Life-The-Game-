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
  aura = null
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

  ctx.restore();
}

function limb(ctx, a, b, c, px, py) {
  ctx.beginPath();
  ctx.moveTo(px(a), py(a));
  ctx.lineTo(px(b), py(b));
  ctx.lineTo(px(c), py(c));
  ctx.stroke();
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
