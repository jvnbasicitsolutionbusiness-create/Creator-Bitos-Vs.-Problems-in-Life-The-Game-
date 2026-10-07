/**
 * recorder.js — a Canvas2D implementation that records drawing operations
 * (with transforms resolved) so tools/render_png.py can rasterise them.
 *
 * Used for offline visual QA: it lets the real scene code run in Node and
 * produce an image without a browser.
 */
import fs from 'node:fs';

const DEG = Math.PI / 180;

function mul(a, b) {
  // Column-vector convention: apply the new transform `b` first, then the
  // existing matrix `a`.  result = a · b
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function parseColor(value) {
  if (typeof value !== 'string') return { r: 255, g: 255, b: 255, a: 1 };
  if (value.startsWith('#')) {
    const h = value.slice(1);
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
    const n = parseInt(full.slice(0, 6), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 ? parts[3] : 1 };
  }
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  return { r: 255, g: 255, b: 255, a: 1 };
}

/** Flatten a gradient to a representative colour (visual QA does not need exact ramps). */
function gradientColor(gradient) {
  const stops = gradient?.__stops || [];
  if (!stops.length) return { r: 255, g: 0, b: 0, a: 1 };
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const [pos, color] of stops) {
    const c = parseColor(color);
    const w = 0.25 + (1 - Math.abs(pos - 0.5) * 1.2) * 0.75;
    r += c.r * w; g += c.g * w; b += c.b * w; a += c.a * w;
  }
  const total = stops.reduce((sum, [, color]) => sum, 0) || 1;
  const n = stops.length;
  return { r: r / n, g: g / n, b: b / n, a: Math.min(1, a / n) };
}

export function createRecorder(width = 1280, height = 720) {
  const ops = [];
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let path = [];
  let current = null;
  let clip = null;
  const clipStack = [];

  const state = {
    fillStyle: '#ffffff',
    strokeStyle: '#ffffff',
    lineWidth: 1,
    globalAlpha: 1,
    font: '600 16px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowBlur: 0,
    shadowColor: 'transparent',
    globalCompositeOperation: 'source-over',
    filter: 'none',
    lineCap: 'butt',
    lineJoin: 'miter',
    imageSmoothingEnabled: true
  };

  const fontSize = () => {
    const m2 = /(\d+(?:\.\d+)?)px/.exec(state.font);
    return m2 ? parseFloat(m2[1]) : 16;
  };

  const colorFor = (style) => {
    if (style && style.__gradient) return { ...gradientColor(style), __gradient: true };
    return parseColor(style);
  };

  const emit = (op) => {
    if (state.globalAlpha < 0.02) return;
    ops.push({
      ...op,
      alpha: state.globalAlpha,
      composite: state.globalCompositeOperation,
      clip: clip ? clip.slice() : null
    });
  };

  const beginSub = () => {
    current = { points: [], closed: false };
    path.push(current);
  };

  const ctx = {
    canvas: { width, height },
    save() {
      stack.push({ m: m.slice(), state: { ...state }, clip });
    },
    restore() {
      const s = stack.pop();
      if (s) {
        m = s.m;
        Object.assign(state, s.state);
        clip = s.clip;
      }
    },
    translate(x, y) { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale(x, y) { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate(a) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      m = mul(m, [c, s, -s, c, 0, 0]);
    },
    setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; },
    transform(a, b, c, d, e, f) { m = mul(m, [a, b, c, d, e, f]); },
    resetTransform() { m = [1, 0, 0, 1, 0, 0]; },
    beginPath() { path = []; current = null; },
    closePath() { if (current) current.closed = true; },
    moveTo(x, y) { beginSub(); current.points.push(apply(m, x, y)); },
    lineTo(x, y) {
      if (!current) beginSub();
      current.points.push(apply(m, x, y));
    },
    quadraticCurveTo(cx, cy, x, y) {
      if (!current) beginSub();
      const p0 = current.points[current.points.length - 1] || apply(m, x, y);
      const p1 = apply(m, cx, cy);
      const p2 = apply(m, x, y);
      for (let i = 1; i <= 8; i += 1) {
        const t = i / 8;
        const it = 1 - t;
        current.points.push([
          it * it * p0[0] + 2 * it * t * p1[0] + t * t * p2[0],
          it * it * p0[1] + 2 * it * t * p1[1] + t * t * p2[1]
        ]);
      }
    },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
      if (!current) beginSub();
      const p0 = current.points[current.points.length - 1] || apply(m, x, y);
      const p1 = apply(m, c1x, c1y);
      const p2 = apply(m, c2x, c2y);
      const p3 = apply(m, x, y);
      for (let i = 1; i <= 10; i += 1) {
        const t = i / 10;
        const it = 1 - t;
        current.points.push([
          it ** 3 * p0[0] + 3 * it * it * t * p1[0] + 3 * it * t * t * p2[0] + t ** 3 * p3[0],
          it ** 3 * p0[1] + 3 * it * it * t * p1[1] + 3 * it * t * t * p2[1] + t ** 3 * p3[1]
        ]);
      }
    },
    arc(cx, cy, r, a0, a1, ccw = false) {
      if (!current) beginSub();
      const steps = Math.max(12, Math.min(64, Math.round((Math.abs(a1 - a0) / (Math.PI * 2)) * 48)));
      const span = ccw ? a0 - a1 : a1 - a0;
      for (let i = 0; i <= steps; i += 1) {
        const a = a0 + (span * i) / steps;
        current.points.push(apply(m, cx + Math.cos(a) * r, cy + Math.sin(a) * r));
      }
      current.circle = Math.abs(Math.abs(a1 - a0) - Math.PI * 2) < 0.01;
      current.circleCenter = apply(m, cx, cy);
      current.circleRadius = r * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    },
    ellipse(cx, cy, rx, ry, rot, a0, a1) {
      if (!current) beginSub();
      const steps = 40;
      for (let i = 0; i <= steps; i += 1) {
        const a = a0 + ((a1 - a0) * i) / steps;
        const x = cx + Math.cos(a) * rx * Math.cos(rot) - Math.sin(a) * ry * Math.sin(rot);
        const y = cy + Math.cos(a) * rx * Math.sin(rot) + Math.sin(a) * ry * Math.cos(rot);
        current.points.push(apply(m, x, y));
      }
      current.circle = Math.abs(Math.abs(a1 - a0) - Math.PI * 2) < 0.01 && Math.abs(rx - ry) < 0.01;
      current.circleCenter = apply(m, cx, cy);
      current.circleRadius = rx * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    },
    rect(x, y, w, h) {
      beginSub();
      current.rect = true;
      current.points.push(apply(m, x, y), apply(m, x + w, y), apply(m, x + w, y + h), apply(m, x, y + h));
      current.closed = true;
    },
    fill() {
      const color = colorFor(state.fillStyle);
      for (const sub of path) {
        if (sub.points.length < 2) continue;
        emit({ type: 'fill', points: sub.points, color, circle: sub.circle ? { c: sub.circleCenter, r: sub.circleRadius } : null });
      }
    },
    stroke() {
      const color = colorFor(state.strokeStyle);
      for (const sub of path) {
        if (sub.points.length < 2) continue;
        emit({
          type: 'stroke',
          points: sub.points,
          color,
          width: state.lineWidth * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])),
          closed: sub.closed
        });
      }
    },
    clip() {
      const pts = path.flatMap((s) => s.points);
      if (!pts.length) return;
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      clip = [Math.max(0, Math.min(...xs)), Math.max(0, Math.min(...ys)), Math.min(width, Math.max(...xs)), Math.min(height, Math.max(...ys))];
      clipStack.push(clip);
    },
    fillRect(x, y, w, h) {
      const p = [apply(m, x, y), apply(m, x + w, y), apply(m, x + w, y + h), apply(m, x, y + h)];
      emit({ type: 'fill', points: p, color: colorFor(state.fillStyle), rect: true });
    },
    strokeRect(x, y, w, h) {
      const p = [apply(m, x, y), apply(m, x + w, y), apply(m, x + w, y + h), apply(m, x, y + h)];
      emit({ type: 'stroke', points: p, color: colorFor(state.strokeStyle), width: state.lineWidth, closed: true });
    },
    clearRect() {},
    fillText(text, x, y) {
      const [tx, ty] = apply(m, x, y);
      emit({
        type: 'text',
        text: String(text),
        x: tx,
        y: ty,
        size: fontSize() * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])),
        color: colorFor(state.fillStyle),
        align: state.textAlign,
        baseline: state.textBaseline,
        stroke: null
      });
    },
    strokeText(text, x, y) {
      const [tx, ty] = apply(m, x, y);
      emit({
        type: 'text',
        text: String(text),
        x: tx,
        y: ty,
        size: fontSize() * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])),
        color: colorFor(state.strokeStyle),
        align: state.textAlign,
        baseline: state.textBaseline,
        stroke: state.lineWidth
      });
    },
    setLineDash() {},
    drawImage() {},
    createLinearGradient(x0, y0, x1, y1) {
      const g = { __gradient: true, __stops: [], __coords: [x0, y0, x1, y1] };
      g.addColorStop = (pos, color) => g.__stops.push([pos, color]);
      return g;
    },
    createRadialGradient() {
      const g = { __gradient: true, __stops: [], __radial: true };
      g.addColorStop = (pos, color) => g.__stops.push([pos, color]);
      return g;
    },
    createPattern: () => null,
    measureText(text) {
      const size = fontSize();
      return { width: String(text).length * size * 0.52 };
    },
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData() {},
    __ops: ops,
    __reset() { ops.length = 0; path = []; current = null; clip = null; stack.length = 0; m = [1, 0, 0, 1, 0, 0]; }
  };

  return new Proxy(ctx, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop in state) return state[prop];
      return undefined;
    },
    set(target, prop, value) {
      state[prop] = value;
      return true;
    }
  });
}

export function writeOps(file, ops, meta = {}) {
  fs.writeFileSync(file, JSON.stringify({ width: 1280, height: 720, meta, ops }));
}

void DEG;
