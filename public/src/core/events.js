/**
 * events.js — minimal synchronous event bus shared by UI, audio and systems.
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }

  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(type, handler) {
    const set = this.listeners.get(type);
    if (set) set.delete(handler);
  }

  emit(type, payload) {
    const set = this.listeners.get(type);
    if (set) for (const handler of Array.from(set)) handler(payload);
    const any = this.listeners.get('*');
    if (any) for (const handler of Array.from(any)) handler({ type, payload });
  }

  clear() {
    this.listeners.clear();
  }
}

export const bus = new EventBus();

/** Event name constants (keeps typos impossible). */
export const EV = {
  SFX: 'sfx',
  MUSIC: 'music',
  SCENE_CHANGE: 'scene:change',
  SAVE_OK: 'save:ok',
  SAVE_FAIL: 'save:fail',
  MODE_CHANGE: 'mode:change',
  UNLOCK: 'progress:unlock',
  ROUND_WIN: 'match:win',
  ROUND_LOSE: 'match:lose',
  HIT: 'combat:hit',
  KO: 'combat:ko'
};
