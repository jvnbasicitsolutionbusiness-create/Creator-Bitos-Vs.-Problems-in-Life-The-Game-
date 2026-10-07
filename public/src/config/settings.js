/**
 * settings.js — persisted player settings.
 *
 * Values are mirrored to the server (authoritative) and cached locally so the
 * game boots with the right audio/video options even before login completes.
 * Every consumer reads through `settings.get(...)`, so accessibility toggles
 * (reduced shake / reduced flash) are honoured everywhere automatically.
 */
import { storage, deepMerge, clamp } from '../core/utils.js';
import { bus } from '../core/events.js';

export const DEFAULT_SETTINGS = {
  /* audio */
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.85,
  voiceVolume: 0.7,
  /* video */
  fullscreen: false,
  quality: 'high', // 'low' | 'medium' | 'high'
  screenShake: 1.0, // multiplier
  effects: 1.0, // particle/flash density multiplier
  showFps: false,
  /* gameplay */
  difficulty: 'normal', // 'easy' | 'normal' | 'hard' | 'veryHard'
  damageNumbers: true,
  comboDisplay: true,
  timerEnabled: true,
  autosave: true,
  /* accessibility */
  reducedShake: false,
  reducedFlash: false,
  subtitles: true,
  uiScale: 1.0, // 0.85 | 1.0 | 1.15
  highContrastText: false,
  /* match */
  roundsToWin: 2,
  roundTime: 99
};

export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'veryHard'];
export const QUALITY_ORDER = ['low', 'medium', 'high'];

export const SETTING_SCHEMA = [
  {
    group: 'AUDIO',
    items: [
      { key: 'masterVolume', label: 'Master Volume', type: 'slider', min: 0, max: 1, step: 0.05, format: 'percent' },
      { key: 'musicVolume', label: 'Music Volume', type: 'slider', min: 0, max: 1, step: 0.05, format: 'percent' },
      { key: 'sfxVolume', label: 'SFX Volume', type: 'slider', min: 0, max: 1, step: 0.05, format: 'percent' },
      { key: 'voiceVolume', label: 'Character Voice', type: 'slider', min: 0, max: 1, step: 0.05, format: 'percent' }
    ]
  },
  {
    group: 'VIDEO',
    items: [
      { key: 'fullscreen', label: 'Fullscreen', type: 'toggle' },
      { key: 'quality', label: 'Quality', type: 'cycle', options: QUALITY_ORDER },
      { key: 'screenShake', label: 'Screen Shake', type: 'slider', min: 0, max: 1.5, step: 0.1, format: 'x' },
      { key: 'effects', label: 'Effects Density', type: 'slider', min: 0.25, max: 1.5, step: 0.25, format: 'x' },
      { key: 'showFps', label: 'Show FPS', type: 'toggle' }
    ]
  },
  {
    group: 'GAMEPLAY',
    items: [
      { key: 'difficulty', label: 'Difficulty', type: 'cycle', options: DIFFICULTY_ORDER },
      { key: 'damageNumbers', label: 'Damage Numbers', type: 'toggle' },
      { key: 'comboDisplay', label: 'Combo Display', type: 'toggle' },
      { key: 'timerEnabled', label: 'Round Timer', type: 'toggle' },
      { key: 'roundsToWin', label: 'Rounds To Win', type: 'slider', min: 1, max: 3, step: 1, format: 'int' },
      { key: 'autosave', label: 'Auto-Save Progress', type: 'toggle' }
    ]
  },
  {
    group: 'ACCESSIBILITY',
    items: [
      { key: 'reducedShake', label: 'Reduced Screen Shake', type: 'toggle' },
      { key: 'reducedFlash', label: 'Reduced Flash Effects', type: 'toggle' },
      { key: 'subtitles', label: 'Subtitles & Dialogue', type: 'toggle' },
      { key: 'uiScale', label: 'UI Scale', type: 'cycle', options: [0.85, 1.0, 1.15], format: 'scale' },
      { key: 'highContrastText', label: 'High Contrast Text', type: 'toggle' }
    ]
  }
];

class SettingsStore {
  constructor() {
    this.values = deepMerge({ ...DEFAULT_SETTINGS }, storage.get('settings', {}));
    this.listeners = new Set();
    this.dirty = false;
  }

  get(key) {
    return this.values[key];
  }

  set(key, value, { silent = false } = {}) {
    if (this.values[key] === value) return;
    this.values[key] = value;
    this.persistLocal();
    this.dirty = true;
    if (!silent) {
      for (const fn of this.listeners) fn(key, value, this.values);
      bus.emit('settings:change', { key, value });
    }
  }

  cycle(key, options) {
    const idx = options.indexOf(this.values[key]);
    this.set(key, options[(idx + 1) % options.length]);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  replace(values) {
    this.values = deepMerge({ ...DEFAULT_SETTINGS }, values || {});
    this.persistLocal();
    for (const fn of this.listeners) fn('*', null, this.values);
  }

  persistLocal() {
    storage.set('settings', this.values);
  }

  reset() {
    this.replace({ ...DEFAULT_SETTINGS });
  }

  /** Settings that should be sent to the server. */
  serialise() {
    return { ...this.values };
  }

  /* --- derived, accessibility-aware helpers used by the renderer --- */
  get shakeScale() {
    return this.values.reducedShake ? 0 : clamp(this.values.screenShake, 0, 1.5);
  }

  get flashScale() {
    return this.values.reducedFlash ? 0.15 : clamp(this.values.effects, 0.25, 1.5);
  }

  get effectScale() {
    return clamp(this.values.effects, 0.25, 1.5);
  }

  get uiScale() {
    return clamp(this.values.uiScale, 0.85, 1.15);
  }
}

export const settings = new SettingsStore();

export function formatSettingValue(item, value) {
  switch (item.format) {
    case 'percent':
      return `${Math.round(value * 100)}%`;
    case 'x':
      return value === 0 ? 'OFF' : `${value.toFixed(1)}x`;
    case 'int':
      return String(Math.round(value));
    case 'scale':
      return `${Math.round(value * 100)}%`;
    default:
      if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
      return String(value);
  }
}
