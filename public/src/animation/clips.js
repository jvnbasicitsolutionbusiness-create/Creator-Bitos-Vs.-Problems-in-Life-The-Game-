/**
 * clips.js — procedural animation clips.
 *
 * Each clip is a pure function that returns an additive pose offset for a given
 * moment, layered on top of the character's base stance. This keeps every
 * character readable while letting each one carry its own posture and flavour,
 * and it means new animations never need new art.
 *
 * Signature: ({ t, p, dur, rng, style, ctx }) -> poseDelta
 *   t   seconds since the clip started
 *   p   phase through the clip, 0..1 (NaN-safe for looping clips)
 *   dur total clip duration in seconds
 */

/* ---------------------------------------------------------------- helpers */
const sin = Math.sin;
const TAU = Math.PI * 2;

/** 0 -> 1 -> 0 spike peaking at `at`. */
function spike(p, at = 0.5, width = 0.5) {
  if (!Number.isFinite(p)) return 0;
  const d = (p - at) / width;
  return d < -1 || d > 1 ? 0 : Math.cos((d * Math.PI) / 2) ** 2;
}

/** Ease a 0..1 ramp. */
function ramp(p, from, to) {
  if (!Number.isFinite(p)) return 0;
  if (p <= from) return 0;
  if (p >= to) return 1;
  const x = (p - from) / (to - from);
  return x * x * (3 - 2 * x);
}

function decay(p, from, to) {
  return 1 - ramp(p, from, to);
}

const D = (obj = {}) => obj;

/* ------------------------------------------------------------------ clips */

export const CLIPS = {
  /* ------------------------------------------------------------ idle ---- */
  idle: ({ t, rng = 0, guard = 1 }) => {
    const breathe = sin(t * 2.1 + rng) * 1.6;
    const sway = sin(t * 0.9 + rng * 2) * 2.2;
    const bob = sin(t * 2.1 + rng) * 2.4;
    const hand = sin(t * 1.7 + rng * 3) * 3.5;
    return D({
      spine: breathe + sway * 0.3,
      neck: -breathe * 0.6 - sway * 0.2,
      root: { y: bob, x: sway * 0.25 },
      armF: [hand * guard - sway, -hand * 0.8 * guard],
      armB: [-hand * guard + sway * 0.6, hand * 0.7 * guard],
      legF: [sway * 0.35, -sway * 0.2],
      legB: [-sway * 0.3, sway * 0.15],
      head: { x: sway * 0.15, y: 0 }
    });
  },

  /* ----------------------------------------------------- locomotion ---- */
  walk: ({ t, speed = 1, backward = false }) => {
    const cycle = t * 9 * speed;
    const s = sin(cycle);
    const c = cos01(cycle);
    const dir = backward ? -1 : 1;
    return D({
      spine: 4 + dir * 3 + s * 1.5,
      lean: dir * 2,
      root: { y: Math.abs(s) * 3.5, x: dir * 2 },
      legF: [dir * (26 * s + 6), -Math.max(0, -dir * s * 34) - 8],
      legB: [dir * (-26 * s + 6), -Math.max(0, dir * s * 34) - 8],
      armF: [46 - dir * s * 16, 70 + c * 8],
      armB: [30 + dir * s * 18, 88 - c * 8],
      neck: -1
    });
  },

  run: ({ t, backward = false }) => {
    const cycle = t * 13;
    const s = sin(cycle);
    const dir = backward ? -1 : 1;
    return D({
      spine: 14 + dir * 6 + s * 2,
      lean: dir * 7,
      root: { y: Math.abs(s) * 7, x: dir * 3 },
      legF: [dir * (46 * s + 10), -Math.max(0, -dir * s * 60) - 6],
      legB: [dir * (-46 * s + 10), -Math.max(0, dir * s * 60) - 6],
      armF: [70 - dir * s * 30, 40 + dir * s * 20],
      armB: [20 + dir * s * 34, 60 - dir * s * 16],
      neck: -4
    });
  },

  jumpUp: ({ p }) => {
    const r = ramp(p, 0, 0.35);
    return D({
      spine: 2 - r * 4,
      lean: -r * 5,
      root: { y: -r * 2 },
      legF: [r * 46, -r * 62],
      legB: [-r * 20, -r * 40],
      armF: [50 + r * 34, 60 - r * 34],
      armB: [30 + r * 40, 70 - r * 40],
      neck: r * 4
    });
  },

  fall: ({ p }) => {
    const r = ramp(p, 0, 0.5);
    return D({
      spine: -r * 6,
      lean: r * 4,
      legF: [34 - r * 12, -34 - r * 10],
      legB: [-26 + r * 10, -22 - r * 6],
      armF: [78 - r * 20, 44 + r * 16],
      armB: [58 - r * 16, 52 + r * 12]
    });
  },

  land: ({ p }) => {
    const s = spike(p, 0.15, 0.4);
    return D({
      squash: 1 - s * 0.16,
      root: { y: -s * 6 },
      legF: [20 + s * 22, -30 - s * 20],
      legB: [-16 - s * 18, -26 - s * 16],
      armF: [44 + s * 20, 74 - s * 20],
      armB: [26 + s * 16, 92 - s * 18],
      spine: 8 + s * 8
    });
  },

  crouch: ({ p = 1 }) => {
    const r = ramp(p, 0, 0.18);
    return D({
      root: { y: -34 * r },
      spine: 10 * r,
      lean: 2 * r,
      legF: [40 * r, -76 * r],
      legB: [-34 * r, -70 * r],
      armF: [52 + 14 * r, 74 - 10 * r],
      armB: [34 + 12 * r, 92 - 12 * r],
      neck: -3 * r
    });
  },

  block: ({ p = 1, hit = 0 }) => {
    const r = ramp(p, 0, 0.12);
    const shake = hit > 0 ? sin(hit * 60) * hit * 6 : 0;
    return D({
      spine: 2 - r * 6 - Math.abs(shake) * 0.4,
      root: { x: -r * 5 - shake, y: -r * 4 },
      armF: [64 + r * 6, 96 + r * 14],
      armB: [56 + r * 6, 104 + r * 12],
      legF: [18 + r * 6, -22],
      legB: [-16 - r * 4, -18],
      neck: -2 - r * 3
    });
  },

  dash: ({ p, backward = false }) => {
    const r = ramp(p, 0, 0.3);
    const d = ramp(p, 0.55, 1);
    const k = r * (1 - d);
    const dir = backward ? -1 : 1;
    return D({
      lean: dir * 16 * k,
      spine: 6 + 8 * k,
      root: { x: dir * 10 * k, y: -4 * k },
      legF: [dir * (30 + 40 * k), -30 - 30 * k],
      legB: [-dir * (24 + 30 * k), -22 - 20 * k],
      armF: [40 - dir * 40 * k, 60 - 20 * k],
      armB: [24 - dir * 34 * k, 70 - 18 * k]
    });
  },

  /* ------------------------------------------------------------ light --- */
  lightPunch: ({ p }) => {
    const out = spike(p, 0.42, 0.42);
    const wind = ramp(p, 0, 0.22) * 6;
    return D({
      spine: 6 + out * 6,
      lean: out * 5,
      root: { x: out * 8 },
      armF: [56 - wind + out * 34, 74 - out * 62],
      armB: [34 + out * 12, 96 - out * 16],
      legF: [16 + out * 6, -14],
      legB: [-14 - out * 5, -10],
      neck: -2 - out * 3
    });
  },

  heavyPunch: ({ p }) => {
    const wind = ramp(p, 0, 0.34);
    const strike = spike(p, 0.52, 0.36);
    return D({
      spine: 4 - wind * 14 + strike * 20,
      lean: -wind * 8 + strike * 12,
      root: { x: -wind * 7 + strike * 18, y: -strike * 3 },
      armF: [56 - wind * 62 + strike * 96, 74 + wind * 30 - strike * 74],
      armB: [34 + wind * 18 - strike * 30, 96 - wind * 20 + strike * 30],
      legF: [16 + strike * 16, -14 - strike * 6],
      legB: [-14 - strike * 12, -10],
      neck: -2 + strike * 6,
      squash: 1 - strike * 0.03
    });
  },

  lightKick: ({ p }) => {
    const out = spike(p, 0.4, 0.4);
    return D({
      spine: 2 - out * 8,
      lean: -out * 4,
      root: { x: out * 6, y: out * 2 },
      legF: [16 + out * 62, -14 - out * 54],
      legB: [-14 + out * 6, -10 - out * 10],
      armF: [52 + out * 10, 78 - out * 14],
      armB: [32 - out * 14, 94 + out * 10]
    });
  },

  heavyKick: ({ p }) => {
    const wind = ramp(p, 0, 0.3);
    const out = spike(p, 0.5, 0.4);
    return D({
      spine: 4 - wind * 10 - out * 16,
      lean: -wind * 5 - out * 10,
      root: { x: -wind * 4 + out * 14, y: -wind * 4 + out * 8 },
      legF: [16 + wind * 40 + out * 62, -14 - wind * 70 - out * 40],
      legB: [-14 - out * 22, -10 - out * 14],
      armF: [50 - wind * 20 - out * 30, 78 + wind * 14 + out * 24],
      armB: [32 + wind * 30 + out * 34, 94 - wind * 20 - out * 30],
      neck: wind * 4 + out * 6
    });
  },

  jumpKick: ({ p }) => {
    const out = spike(p, 0.35, 0.5);
    return D({
      spine: -6 - out * 14,
      lean: out * 10,
      legF: [20 + out * 76, -30 - out * 50],
      legB: [-10 - out * 20, -40 - out * 20],
      armF: [70 - out * 30, 50 + out * 20],
      armB: [50 + out * 24, 60 - out * 14]
    });
  },

  sweep: ({ p }) => {
    const out = spike(p, 0.4, 0.45);
    return D({
      root: { y: -30 - out * 6 },
      spine: 12 + out * 16,
      legF: [30 + out * 74, -84 - out * 20],
      legB: [-40, -80],
      armF: [40 - out * 20, 90 + out * 10],
      armB: [20 + out * 40, 100],
      lean: out * 6
    });
  },

  uppercut: ({ p }) => {
    const wind = ramp(p, 0, 0.3);
    const out = spike(p, 0.5, 0.4);
    return D({
      root: { y: -wind * 10 + out * 22, x: out * 8 },
      spine: 6 - wind * 10 + out * 18,
      lean: -wind * 6 + out * 6,
      armF: [56 - wind * 40 + out * 124, 74 + wind * 24 - out * 66],
      armB: [34 + wind * 20 - out * 46, 96 - wind * 24 + out * 40],
      legF: [16 + out * 12, -14 - wind * 20],
      legB: [-14 - out * 10, -10 - wind * 16],
      neck: -out * 8
    });
  },

  /* ---------------------------------------------------------- special --- */
  special: ({ p, style = 'projectile' }) => {
    const charge = ramp(p, 0, 0.42);
    const release = spike(p, 0.62, 0.45);
    const base = {
      spine: 4 - charge * 16 + release * 22,
      lean: -charge * 10 + release * 14,
      root: { x: -charge * 8 + release * 20, y: -charge * 4 + release * 4 },
      neck: -2 + release * 6
    };
    switch (style) {
      case 'aura':
        return D({
          ...base,
          root: { x: base.root.x, y: base.root.y + release * 10 },
          armF: [56 - charge * 30 - release * 20, 74 + charge * 40 - release * 90],
          armB: [34 + charge * 20 + release * 24, 96 - charge * 40 + release * 84],
          legF: [16 + release * 14, -14 - release * 10],
          legB: [-14 - release * 12, -10 - release * 8]
        });
      case 'summon':
        return D({
          ...base,
          spine: 4 - charge * 10 + release * 8,
          armF: [56 - charge * 50 + release * 70, 74 + charge * 30 - release * 76],
          armB: [34 - charge * 30 + release * 40, 96 + charge * 20 - release * 60],
          legF: [16 + release * 8, -14],
          legB: [-14 - release * 8, -10]
        });
      case 'dash':
        return D({
          ...base,
          lean: -charge * 12 + release * 26,
          spine: 6 - charge * 8 + release * 16,
          root: { x: -charge * 12 + release * 30, y: -release * 6 },
          armF: [56 - release * 70, 74 + release * 40],
          armB: [34 + release * 60, 96 - release * 40],
          legF: [16 + release * 50, -14 - release * 40],
          legB: [-14 - release * 40, -10 - release * 30]
        });
      case 'teleport':
        return D({
          ...base,
          squash: 1 - spike(p, 0.45, 0.3) * 0.3,
          armF: [56 - charge * 60 + release * 40, 74 + charge * 40 - release * 60],
          armB: [34 + charge * 50 - release * 30, 96 - charge * 40 + release * 50],
          legF: [16 + charge * 20, -14 - charge * 30],
          legB: [-14 - charge * 16, -10 - charge * 24]
        });
      case 'barrage': {
        const flurry = sin(p * 60) * release * 18;
        return D({
          ...base,
          armF: [56 + flurry, 74 - Math.abs(flurry) * 2.2],
          armB: [34 - flurry, 96 + Math.abs(flurry) * 1.4],
          legF: [16 + release * 10, -14],
          legB: [-14 - release * 8, -10]
        });
      }
      case 'grab':
        return D({
          ...base,
          root: { x: -charge * 6 + release * 26, y: 0 },
          armF: [56 - charge * 20 + release * 90, 74 + charge * 20 - release * 80],
          armB: [34 + charge * 16 + release * 70, 96 - charge * 18 - release * 74],
          lean: release * 12
        });
      case 'shockwave':
        return D({
          ...base,
          root: { x: base.root.x, y: -release * 8 },
          armF: [56 - charge * 70 + release * 20, 74 + charge * 50 - release * 10],
          armB: [34 + charge * 60 - release * 16, 96 - charge * 50 + release * 8],
          legF: [16 - release * 10, -14 - release * 20],
          legB: [-14 + release * 8, -10 - release * 18]
        });
      case 'projectile':
      default:
        return D({
          ...base,
          armF: [56 - charge * 40 + release * 88, 74 + charge * 30 - release * 78],
          armB: [34 + charge * 24 - release * 40, 96 - charge * 26 + release * 40],
          legF: [16 + release * 16, -14 - release * 8],
          legB: [-14 - release * 14, -10 - release * 6]
        });
    }
  },

  ultimate: ({ p, style = 'projectile' }) => {
    const charge = ramp(p, 0, 0.34);
    const hold = ramp(p, 0.34, 0.5) * decay(p, 0.6, 0.78);
    const burst = spike(p, 0.72, 0.4);
    const shake = hold > 0 ? sin(p * 120) * 3 * hold : 0;
    return D({
      spine: 4 - charge * 20 + burst * 26,
      lean: -charge * 12 + burst * 16,
      root: { x: -charge * 10 + burst * 24 + shake, y: -charge * 6 + burst * 14 - hold * 4 },
      neck: -2 - charge * 6 + burst * 10,
      armF: [56 - charge * 76 + burst * 96, 74 + charge * 44 - burst * 82],
      armB: [34 + charge * 70 - burst * 90, 96 - charge * 44 + burst * 86],
      legF: [16 + charge * 20 + burst * 20, -14 - charge * 26 - burst * 12],
      legB: [-14 - charge * 18 - burst * 18, -10 - charge * 20 - burst * 10],
      squash: 1 - burst * 0.05,
      headScale: 1 + hold * 0.04,
      style
    });
  },

  /* -------------------------------------------------------- reactions --- */
  hit: ({ p, severity = 1, high = true }) => {
    const s = spike(p, 0.12, 0.5) * severity;
    return D({
      spine: -12 * s,
      lean: -10 * s,
      root: { x: -10 * s, y: high ? 2 * s : -2 * s },
      neck: high ? -14 * s : 8 * s,
      head: { x: -4 * s, y: 0 },
      armF: [56 - 30 * s, 74 + 20 * s],
      armB: [34 - 24 * s, 96 + 14 * s],
      legF: [16 - 10 * s, -14 + 8 * s],
      legB: [-14 + 8 * s, -10 + 6 * s],
      squash: 1 + s * 0.04
    });
  },

  blockHit: ({ p, severity = 1 }) => {
    const s = spike(p, 0.14, 0.6) * severity;
    return D({
      spine: -4 * s,
      root: { x: -8 * s },
      armF: [64 + 8 * s, 96 + 10 * s],
      armB: [56 + 8 * s, 104 + 10 * s],
      head: { x: -2 * s, y: 0 }
    });
  },

  stun: ({ t }) => {
    const w = sin(t * 9);
    return D({
      spine: -8 + w * 5,
      lean: w * 6,
      neck: 6 + w * 8,
      armF: [40 - w * 16, 90 + w * 10],
      armB: [26 + w * 14, 104 - w * 8],
      legF: [22 + w * 6, -26],
      legB: [-20 - w * 5, -22],
      head: { x: w * 3, y: 0 }
    });
  },

  knockdown: ({ p }) => {
    const r = ramp(p, 0, 0.7);
    return D({
      spine: -r * 46,
      lean: -r * 62,
      root: { x: -r * 26, y: -r * 8 },
      neck: r * 22,
      armF: [56 + r * 60, 74 - r * 40],
      armB: [34 + r * 76, 96 - r * 50],
      legF: [16 + r * 40, -14 - r * 26],
      legB: [-14 + r * 30, -10 - r * 20],
      squash: 1 - r * 0.08
    });
  },

  getup: ({ p }) => {
    const early = decay(p, 0, 0.45);
    const up = ramp(p, 0.45, 1);
    return D({
      spine: -46 * early + 46 * up,
      lean: -62 * early + 62 * up,
      root: { x: -26 * early + 26 * up, y: -18 * early },
      neck: 22 * early - 22 * up,
      armF: [116 - 60 * up, 34 + 40 * up],
      armB: [110 - 76 * up, 46 + 50 * up],
      legF: [56 - 40 * up, -40 + 26 * up],
      legB: [16 - 30 * up, -30 + 20 * up]
    });
  },

  /* ---------------------------------------------------------- results --- */
  victory: ({ t, style = 'default' }) => {
    const breath = sin(t * 2.4) * 2;
    switch (style) {
      case 'slouch': // laziness
        return D({
          spine: -14 + breath,
          root: { y: -6 },
          armF: [30, 120],
          armB: [10, 130],
          legF: [4, -6],
          legB: [-6, -4],
          neck: 10
        });
      case 'tech': // gadget
        return D({
          spine: 4 + breath,
          armF: [110 + sin(t * 6) * 12, 30],
          armB: [70 - sin(t * 6) * 10, 40],
          legF: [8, -8],
          legB: [-8, -6],
          neck: -4,
          root: { y: sin(t * 6) * 3 }
        });
      case 'looming': // society / suffering
        return D({
          spine: -6 + breath * 0.5,
          armF: [96, 20],
          armB: [84, 26],
          legF: [24, -18],
          legB: [-22, -16],
          neck: -6,
          root: { y: 2 }
        });
      case 'kneel': // suicide / seizure
        return D({
          root: { y: -26 },
          spine: 16 + breath,
          legF: [56, -96],
          legB: [-40, -80],
          armF: [30, 40],
          armB: [16, 44],
          neck: 12
        });
      case 'stretch': // school
        return D({
          spine: 2 + breath,
          armF: [160, 10],
          armB: [150, 14],
          legF: [10, -8],
          legB: [-10, -6],
          neck: -4
        });
      case 'crouch': // wrath
        return D({
          root: { y: -18 },
          spine: 12,
          legF: [44, -80],
          legB: [-40, -76],
          armF: [70, 110],
          armB: [60, 116],
          neck: -6
        });
      default: // creator bitos
        return D({
          spine: 2 + breath,
          armF: [86 + sin(t * 2.2) * 6, 26],
          armB: [40, 70],
          legF: [18, -16],
          legB: [-16, -12],
          neck: -4,
          root: { y: sin(t * 2.2) * 2 }
        });
    }
  },

  defeat: ({ t, p = 0 }) => {
    const settle = ramp(p, 0, 0.6);
    const breath = sin(t * 1.6) * 2 * settle;
    return D({
      spine: 20 * settle + breath,
      lean: -30 * settle,
      root: { y: -8 * settle, x: -6 * settle },
      neck: 18 * settle,
      armF: [20 + 20 * settle, 40 + 20 * settle],
      armB: [10 + 18 * settle, 50 + 16 * settle],
      legF: [46 * settle, -70 * settle],
      legB: [-38 * settle, -60 * settle],
      squash: 1 - settle * 0.05
    });
  },

  /* --------------------------------------------------------- cinematic -- */
  intro: ({ p, style = 'default' }) => {
    const settle = ramp(p, 0.45, 1);
    switch (style) {
      case 'rise': // rises from the floor
        return D({
          root: { y: -70 * (1 - settle) },
          lean: -20 * (1 - settle),
          spine: 8,
          armF: [56 + 40 * (1 - settle), 74 - 40 * settle],
          armB: [34 + 34 * (1 - settle), 96 - 30 * settle],
          legF: [16 + 40 * (1 - settle), -14 - 40 * settle]
        });
      case 'drift': // floats down
        return D({
          root: { y: 60 * (1 - settle) },
          spine: 4 - 10 * (1 - settle),
          armF: [56 + 50 * (1 - settle), 74 - 46 * settle],
          armB: [34 + 46 * (1 - settle), 96 - 40 * settle],
          legF: [16 + 24 * (1 - settle), -14 - 24 * settle]
        });
      case 'march':
        return D({
          root: { x: -60 * (1 - settle) },
          spine: 4 + 6 * settle,
          armF: [56, 74],
          armB: [34, 96],
          legF: [16 + sin(p * 24) * 30 * (1 - settle), -14],
          legB: [-14 - sin(p * 24) * 24 * (1 - settle), -10]
        });
      case 'materialise':
        return D({
          squash: 0.4 + 0.6 * settle,
          root: { y: -20 * (1 - settle) },
          armF: [56 + 30 * (1 - settle), 74 - 20 * settle],
          armB: [34 + 26 * (1 - settle), 96 - 18 * settle],
          spine: 4
        });
      default:
        return D({
          root: { x: -40 * (1 - settle) },
          spine: 4 + 4 * settle,
          armF: [56 + 20 * (1 - settle), 74 - 16 * settle],
          armB: [34 + 16 * (1 - settle), 96 - 14 * settle],
          legF: [16, -14],
          legB: [-14, -10]
        });
    }
  },

  taunt: ({ p }) => {
    const w = sin(p * 18);
    return D({
      spine: 4 + w * 4,
      armF: [56 + 40 * ramp(p, 0, 0.3), 74 - 30 * ramp(p, 0, 0.3)],
      armB: [34 - 20 * ramp(p, 0, 0.3), 96],
      neck: w * 5,
      root: { y: Math.abs(w) * 4 }
    });
  },

  exhausted: ({ t }) => {
    const b = sin(t * 4.2);
    return D({
      spine: 16 + b * 4,
      neck: 8,
      armF: [30 + b * 6, 60],
      armB: [20 - b * 5, 70],
      legF: [26, -30],
      legB: [-22, -26],
      root: { y: -4 + b * 2 }
    });
  }
};

function cos01(x) {
  return Math.cos(x);
}

export function getClip(name) {
  return CLIPS[name] || CLIPS.idle;
}

/** Animations that should loop instead of holding their final frame. */
export const LOOPING_CLIPS = new Set(['idle', 'walk', 'run', 'stun', 'victory', 'defeat', 'exhausted', 'crouch', 'block']);

void TAU;
