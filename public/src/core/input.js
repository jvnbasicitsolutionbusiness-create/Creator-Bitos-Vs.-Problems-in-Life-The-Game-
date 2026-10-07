/**
 * input.js — keyboard + pointer input with rebindable, per-player action maps.
 *
 * Actions (not raw keys) are what the game reads, so Settings → Controls can
 * rebind anything at runtime. Two logical devices exist:
 *   device 0 = Player 1 / menus
 *   device 1 = Player 2 (local multiplayer)
 *
 * A hidden DOM <input> ("text bridge") is borrowed whenever a canvas text field
 * is focused, which keeps real keyboards, IME and paste working.
 */
import { storage } from './utils.js';

export const ACTIONS = [
  'left',
  'right',
  'up',
  'down',
  'block',
  'lightPunch',
  'heavyPunch',
  'lightKick',
  'heavyKick',
  'special',
  'ultimate',
  'pause',
  'confirm',
  'back'
];

export const ACTION_LABELS = {
  left: 'Move Left',
  right: 'Move Right',
  up: 'Jump',
  down: 'Crouch',
  block: 'Block',
  lightPunch: 'Light Punch',
  heavyPunch: 'Heavy Punch',
  lightKick: 'Light Kick',
  heavyKick: 'Heavy Kick',
  special: 'Special',
  ultimate: 'Ultimate / Super',
  pause: 'Pause',
  confirm: 'Confirm',
  back: 'Back'
};

export const DEFAULT_BINDINGS_P1 = {
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['KeyW'],
  down: ['KeyS'],
  block: ['Space'],
  lightPunch: ['KeyJ'],
  heavyPunch: ['KeyK'],
  lightKick: ['KeyU'],
  heavyKick: ['KeyI'],
  special: ['KeyO'],
  ultimate: ['KeyP'],
  pause: ['Escape'],
  confirm: ['Enter'],
  back: ['Escape', 'Backspace']
};

export const DEFAULT_BINDINGS_P2 = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  block: ['Numpad0', 'ShiftRight'],
  lightPunch: ['Numpad1'],
  heavyPunch: ['Numpad2'],
  lightKick: ['Numpad4'],
  heavyKick: ['Numpad5'],
  special: ['Numpad7'],
  ultimate: ['Numpad8'],
  pause: ['Escape'],
  confirm: ['NumpadEnter'],
  back: ['NumpadDecimal']
};

/** Keys the browser would otherwise scroll/navigate with. */
const SWALLOW = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Tab', 'Enter', 'Backspace', 'Slash', 'Quote'
]);

class Device {
  constructor(bindings) {
    this.bindings = bindings;
    this.held = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.buffer = []; // recent actions for motion/double-tap detection
    this.bufferTime = 0;
  }

  isDown(action) {
    return this.held.has(action);
  }

  wasPressed(action) {
    return this.pressed.has(action);
  }

  wasReleased(action) {
    return this.released.has(action);
  }

  /** Horizontal axis as -1 / 0 / +1. */
  get axisX() {
    return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
  }

  get axisY() {
    return (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }
}

export class InputManager {
  constructor() {
    this.devices = [new Device({ ...DEFAULT_BINDINGS_P1 }), new Device({ ...DEFAULT_BINDINGS_P2 })];
    this.pointer = { x: 640, y: 360, down: false, pressed: false, released: false, moved: false, inside: false };
    this.wheel = 0;
    this.enabled = true;
    this.textTarget = null;
    this.bridge = null;
    this.anyKeyPressed = false;
    this.lastActivity = performance.now();
    this.rawKeys = new Set();
    this.onKeyCaptured = null; // set while rebinding a control
    this.#loadBindings();
  }

  attach(canvas, bridge) {
    this.canvas = canvas;
    this.bridge = bridge;

    window.addEventListener('keydown', this.#onKeyDown, { passive: false });
    window.addEventListener('keyup', this.#onKeyUp);
    window.addEventListener('blur', this.#onBlur);

    const updatePointer = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer.x = ((clientX - rect.left) / rect.width) * canvas.width;
      this.pointer.y = ((clientY - rect.top) / rect.height) * canvas.height;
      this.pointer.inside =
        this.pointer.x >= 0 && this.pointer.x <= canvas.width && this.pointer.y >= 0 && this.pointer.y <= canvas.height;
    };

    canvas.addEventListener('pointermove', (e) => {
      updatePointer(e.clientX, e.clientY);
      this.pointer.moved = true;
      this.lastActivity = performance.now();
    });
    canvas.addEventListener('pointerdown', (e) => {
      updatePointer(e.clientX, e.clientY);
      this.pointer.down = true;
      this.pointer.pressed = true;
      this.lastActivity = performance.now();
      e.preventDefault();
    });
    window.addEventListener('pointerup', () => {
      this.pointer.down = false;
      this.pointer.released = true;
    });
    canvas.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
    });
    canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    if (bridge) {
      bridge.addEventListener('input', () => {
        if (this.textTarget) {
          this.textTarget.value = bridge.value;
          if (this.textTarget.onChange) this.textTarget.onChange(bridge.value);
        }
      });
      bridge.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && this.textTarget) {
          e.preventDefault();
          if (this.textTarget.onSubmit) this.textTarget.onSubmit(this.textTarget.value);
        } else if (e.key === 'Escape' && this.textTarget) {
          this.endTextInput();
        }
        e.stopPropagation();
      });
      bridge.addEventListener('blur', () => {
        // Only release focus if the blur wasn't caused by our own refocus.
        setTimeout(() => {
          if (this.textTarget && document.activeElement !== bridge) this.endTextInput();
        }, 0);
      });
    }
  }

  #loadBindings() {
    const saved = storage.get('bindings', null);
    if (saved && saved.p1) this.devices[0].bindings = { ...DEFAULT_BINDINGS_P1, ...saved.p1 };
    if (saved && saved.p2) this.devices[1].bindings = { ...DEFAULT_BINDINGS_P2, ...saved.p2 };
  }

  saveBindings() {
    storage.set('bindings', { p1: this.devices[0].bindings, p2: this.devices[1].bindings });
  }

  setBinding(deviceIndex, action, code) {
    const device = this.devices[deviceIndex];
    // Remove this code from every other action on the same device.
    for (const other of Object.keys(device.bindings)) {
      device.bindings[other] = device.bindings[other].filter((c) => c !== code);
    }
    device.bindings[action] = [code];
    this.saveBindings();
  }

  resetBindings(deviceIndex) {
    this.devices[deviceIndex].bindings = deviceIndex === 0 ? { ...DEFAULT_BINDINGS_P1 } : { ...DEFAULT_BINDINGS_P2 };
    this.saveBindings();
  }

  bindingLabel(deviceIndex, action) {
    const codes = this.devices[deviceIndex].bindings[action] || [];
    return codes.map(prettyKey).join(' / ') || '—';
  }

  /* ---------------------------------------------------------------- */
  /* Text input bridge                                                 */
  /* ---------------------------------------------------------------- */

  beginTextInput(target) {
    this.textTarget = target;
    if (this.bridge) {
      this.bridge.value = target.value || '';
      this.bridge.type = target.password ? 'password' : 'text';
      this.bridge.style.left = '-9999px';
      this.bridge.focus({ preventScroll: true });
    }
  }

  endTextInput() {
    const target = this.textTarget;
    this.textTarget = null;
    if (this.bridge) {
      this.bridge.value = '';
      this.bridge.blur();
    }
    if (target && target.onBlur) target.onBlur();
  }

  get isTyping() {
    return this.textTarget !== null;
  }

  /* ---------------------------------------------------------------- */
  /* Raw events                                                        */
  /* ---------------------------------------------------------------- */

  #onKeyDown = (e) => {
    this.lastActivity = performance.now();
    if (this.onKeyCaptured) {
      e.preventDefault();
      const cb = this.onKeyCaptured;
      this.onKeyCaptured = null;
      cb(e.code);
      return;
    }
    if (this.isTyping) return; // the bridge handles its own keys
    if (SWALLOW.has(e.code)) e.preventDefault();
    if (this.rawKeys.has(e.code)) return; // ignore OS auto-repeat
    this.rawKeys.add(e.code);
    this.anyKeyPressed = true;

    for (const device of this.devices) {
      for (const action of Object.keys(device.bindings)) {
        if (device.bindings[action].includes(e.code)) {
          if (!device.held.has(action)) {
            device.pressed.add(action);
            device.buffer.push({ action, time: performance.now() });
          }
          device.held.add(action);
        }
      }
    }
  };

  #onKeyUp = (e) => {
    this.rawKeys.delete(e.code);
    for (const device of this.devices) {
      for (const action of Object.keys(device.bindings)) {
        if (device.bindings[action].includes(e.code)) {
          device.held.delete(action);
          device.released.add(action);
        }
      }
    }
  };

  #onBlur = () => {
    this.rawKeys.clear();
    for (const device of this.devices) {
      for (const action of Array.from(device.held)) device.released.add(action);
      device.held.clear();
    }
    this.pointer.down = false;
  };

  /** Call once per rendered frame, after all systems have read input. */
  endFrame() {
    for (const device of this.devices) {
      device.endFrame();
      // Trim the input buffer to the last 800ms.
      const cutoff = performance.now() - 800;
      device.buffer = device.buffer.filter((entry) => entry.time > cutoff);
    }
    this.pointer.pressed = false;
    this.pointer.released = false;
    this.pointer.moved = false;
    this.wheel = 0;
    this.anyKeyPressed = false;
  }

  /** Was `action` pressed within the last `window` ms? */
  pressedWithin(deviceIndex, action, windowMs = 300) {
    const device = this.devices[deviceIndex];
    if (device.pressed.has(action)) return true;
    const cutoff = performance.now() - windowMs;
    return device.buffer.some((entry) => entry.action === action && entry.time > cutoff);
  }

  /** Convenience accessors used by menus. */
  p1() {
    return this.devices[0];
  }

  p2() {
    return this.devices[1];
  }
}

export function prettyKey(code) {
  if (!code) return '—';
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, 'NUM ')
    .replace(/^Arrow/, '')
    .replace('Space', 'SPACE')
    .replace('Escape', 'ESC')
    .replace('Enter', 'ENTER')
    .replace('Backspace', 'BKSP')
    .replace('ShiftLeft', 'L-SHIFT')
    .replace('ShiftRight', 'R-SHIFT')
    .replace('ControlLeft', 'L-CTRL')
    .replace('ControlRight', 'R-CTRL')
    .toUpperCase();
}

export const input = new InputManager();
