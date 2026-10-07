/**
 * canvas-stub.js — a minimal DOM + Canvas2D stand-in for headless testing.
 *
 * Lets the entire rendering layer (arenas, characters, HUD, menus) run inside
 * Node so scene code can be smoke-tested without a browser.
 */

function makeGradient() {
  return { addColorStop() {} };
}

function makeContext(canvas) {
  const state = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '10px sans-serif',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowBlur: 0,
    shadowColor: 'transparent',
    filter: 'none',
    imageSmoothingEnabled: true,
    lineCap: 'butt',
    lineJoin: 'miter'
  };

  const ops = [];
  const record = (name) => (...args) => {
    ops.push({ name, args });
    return undefined;
  };

  const ctx = {
    canvas,
    __ops: ops,
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    scale: record('scale'),
    rotate: record('rotate'),
    setTransform: record('setTransform'),
    transform: record('transform'),
    resetTransform: record('resetTransform'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    quadraticCurveTo: record('quadraticCurveTo'),
    bezierCurveTo: record('bezierCurveTo'),
    arc: record('arc'),
    arcTo: record('arcTo'),
    ellipse: record('ellipse'),
    rect: record('rect'),
    fill: record('fill'),
    stroke: record('stroke'),
    clip: record('clip'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    clearRect: record('clearRect'),
    fillText: record('fillText'),
    strokeText: record('strokeText'),
    setLineDash: record('setLineDash'),
    drawImage: record('drawImage'),
    createLinearGradient: () => makeGradient(),
    createRadialGradient: () => makeGradient(),
    createPattern: () => null,
    measureText: (text) => ({ width: String(text).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData: record('putImageData')
  };

  // Style properties are plain writable fields recorded on assignment.
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

function makeCanvas(contextFactory = makeContext) {
  const canvas = {
    width: 1280,
    height: 720,
    style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    getContext: () => contextFactory(canvas),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 }),
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    blur() {},
    remove() {}
  };
  return canvas;
}

/** Install the stub globals. Returns a handle for teardown / inspection. */
/** Install the stub globals. `contextFactory` lets a caller swap in a real
 *  recording graphics context (see tools/recorder.js) for visual capture. */
/** A faithful-enough localStorage so browser-side storage code can be tested. */
function makeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(String(k)); },
    clear: () => map.clear()
  };
}

export function installDomStub({ contextFactory = makeContext } = {}) {
  const listeners = new Map();
  const store = new Map();

  const element = (id) => ({
    id,
    style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    value: '',
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    blur() {},
    remove() {},
    appendChild() {},
    textContent: '',
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 })
  });

  const doc = {
    documentElement: element('html'),
    body: element('body'),
    activeElement: null,
    hidden: false,
    fullscreenElement: null,
    fullscreenEnabled: false,
    getElementById: (id) => (id === 'game-canvas' ? canvas : element(id)),
    createElement: (tag) => (tag === 'canvas' ? makeCanvas(contextFactory) : element(tag)),
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener() {},
    exitFullscreen() {},
    requestFullscreen() {}
  };

  const canvas = makeCanvas(contextFactory);

  const win = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener() {},
    requestAnimationFrame: (fn) => setTimeout(() => fn(performance.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    localStorage: makeStorage(),
    AudioContext: undefined // deliberately absent: audio must fail safe
  };

  globalThis.window = win;
  globalThis.document = doc;
  try {
    globalThis.navigator = { userAgent: 'node' };
  } catch (_) {
    // Node.js v24+ makes navigator read-only; define it safely if it's absent
    if (!globalThis.navigator) {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'node' },
        writable: true,
        configurable: true
      });
    }
  }
  globalThis.localStorage = win.localStorage;
  globalThis.sessionStorage = makeStorage();
  globalThis.Image = class {
    set src(_v) {
      setTimeout(() => this.onload && this.onload(), 0);
    }
  };
  if (typeof globalThis.performance === 'undefined') {
    globalThis.performance = { now: () => Date.now() };
  }

  return {
    window: win,
    document: doc,
    canvas,
    dispatch(type, event) {
      for (const fn of listeners.get(type) || []) fn(event);
    }
  };
}

export { makeCanvas, makeContext };
