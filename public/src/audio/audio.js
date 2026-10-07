/**
 * audio.js — the complete audio architecture.
 *
 * Everything you hear is generated at runtime with the Web Audio API:
 *   • SFX       — synthesised one-shots (punches, blocks, UI, supers…)
 *   • Music     — small original compositions scheduled per scene
 *   • Character voice — stylised formant blips (no copyrighted voice clips)
 *
 * Nothing here is a placeholder stub: every cue produces sound. Any cue can be
 * replaced by a real audio file through `registerSample(name, url)` or by
 * dropping files into /public/assets/audio/<sfx|music>/<name>.mp3 and flipping
 * the flag in assets/manifest.js — the engine prefers loaded files when present
 * and falls back to synthesis when they are not.
 */
import { settings } from '../config/settings.js';
import { clamp, rand, pick } from '../core/utils.js';

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function noteFreq(name) {
  // e.g. "A3", "C#4"
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) return 440;
  const semitone = NOTE[m[1]] + (Number(m[2]) + 1) * 12;
  return 440 * 2 ** ((semitone - 69) / 12);
}

/* -------------------------------------------------------------------------- */
/* Scene music definitions (original progressions)                             */
/* -------------------------------------------------------------------------- */

export const TRACKS = {
  auth: {
    bpm: 72,
    root: 'D3',
    scale: [0, 3, 5, 7, 10],
    chords: [[0, 3, 7], [-2, 2, 5], [3, 7, 10], [-4, 0, 3]],
    pad: { wave: 'sine', gain: 0.16, filter: 700, attack: 1.4 },
    arp: { wave: 'triangle', gain: 0.07, pattern: [0, 2, 1, 2], rate: 2 },
    bass: { gain: 0.14, pattern: [1, 0, 0, 1, 0, 0, 1, 0] },
    drums: { kick: [1, 0, 0, 0, 1, 0, 0, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1], snare: [0, 0, 0, 0, 1, 0, 0, 0] }
  },
  loading: {
    bpm: 96,
    root: 'A2',
    scale: [0, 2, 3, 7, 8],
    chords: [[0, 3, 7], [0, 3, 7], [-2, 2, 5], [3, 7, 10]],
    pad: { wave: 'sawtooth', gain: 0.1, filter: 900, attack: 0.5 },
    arp: { wave: 'square', gain: 0.045, pattern: [0, 1, 2, 1], rate: 4 },
    bass: { gain: 0.17, pattern: [1, 0, 1, 0, 1, 0, 1, 0] },
    drums: { kick: [1, 0, 0, 1, 0, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0] }
  },
  menu: {
    bpm: 84,
    root: 'D2',
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [[0, 3, 7, 10], [-3, 0, 5, 8], [-5, 2, 5, 9], [-1, 2, 7, 11]],
    pad: { wave: 'sawtooth', gain: 0.09, filter: 800, attack: 1.1 },
    arp: { wave: 'triangle', gain: 0.05, pattern: [0, 2, 3, 2, 1, 2], rate: 2 },
    bass: { gain: 0.16, pattern: [1, 0, 0, 1, 0, 1, 0, 0] },
    drums: { kick: [1, 0, 0, 0, 0, 0, 1, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1], snare: [0, 0, 0, 0, 1, 0, 0, 0] }
  },
  intro: {
    // Slow, sparse and tense: pad and heartbeat only, so the cinematic's
    // impacts carry the rhythm instead of a drum kit.
    bpm: 68,
    root: 'C2',
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [[0, 3, 7], [-4, 0, 3], [-2, 3, 7], [-5, 0, 3]],
    pad: { wave: 'sine', gain: 0.2, filter: 620, attack: 2.2 },
    arp: { wave: 'triangle', gain: 0.045, pattern: [0, 2, 1, 2], rate: 1 },
    bass: { gain: 0.22, pattern: [1, 0, 0, 0, 1, 0, 0, 0] },
    drums: { kick: [1, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0] }
  },
  campaign: {
    bpm: 108,
    root: 'E2',
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [[0, 3, 7], [-2, 3, 7], [-4, 0, 5], [-5, 2, 7]],
    pad: { wave: 'sawtooth', gain: 0.075, filter: 1100, attack: 0.6 },
    arp: { wave: 'square', gain: 0.04, pattern: [0, 3, 2, 3, 1, 2], rate: 4 },
    bass: { gain: 0.2, pattern: [1, 0, 1, 1, 0, 1, 0, 1] },
    drums: { kick: [1, 0, 0, 1, 1, 0, 0, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0] }
  },
  boss: {
    bpm: 132,
    root: 'C2',
    scale: [0, 1, 3, 5, 6, 8, 10],
    chords: [[0, 3, 6, 10], [1, 5, 8, 11], [-1, 3, 6, 10], [0, 3, 7, 10]],
    pad: { wave: 'sawtooth', gain: 0.085, filter: 1300, attack: 0.35 },
    arp: { wave: 'square', gain: 0.05, pattern: [0, 1, 2, 3, 2, 1], rate: 8 },
    bass: { gain: 0.24, pattern: [1, 1, 0, 1, 1, 0, 1, 1] },
    drums: { kick: [1, 0, 1, 0, 1, 0, 1, 1], hat: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 1, 0, 0, 1, 0, 1] }
  },
  training: {
    bpm: 92,
    root: 'G2',
    scale: [0, 2, 4, 5, 7, 9, 11],
    chords: [[0, 4, 7, 11], [-3, 2, 5, 9], [-5, 0, 4, 7], [2, 5, 9, 12]],
    pad: { wave: 'sine', gain: 0.11, filter: 900, attack: 1.0 },
    arp: { wave: 'triangle', gain: 0.045, pattern: [0, 2, 4, 2], rate: 2 },
    bass: { gain: 0.13, pattern: [1, 0, 0, 1, 0, 0, 1, 0] },
    drums: { kick: [1, 0, 0, 0, 1, 0, 0, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1], snare: [0, 0, 0, 0, 1, 0, 0, 0] }
  },
  versus: {
    bpm: 120,
    root: 'F2',
    scale: [0, 2, 3, 5, 7, 8, 10],
    chords: [[0, 3, 7, 10], [-2, 2, 5, 8], [3, 7, 10, 14], [1, 5, 8, 12]],
    pad: { wave: 'sawtooth', gain: 0.08, filter: 1200, attack: 0.4 },
    arp: { wave: 'square', gain: 0.045, pattern: [0, 2, 1, 3], rate: 4 },
    bass: { gain: 0.2, pattern: [1, 0, 1, 0, 1, 1, 0, 1] },
    drums: { kick: [1, 0, 0, 1, 0, 1, 0, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0] }
  },
  extras: {
    bpm: 76,
    root: 'C3',
    scale: [0, 2, 4, 7, 9],
    chords: [[0, 4, 7, 11], [-3, 2, 7, 9], [-5, 0, 4, 7], [-1, 2, 7, 11]],
    pad: { wave: 'sine', gain: 0.13, filter: 800, attack: 1.6 },
    arp: { wave: 'triangle', gain: 0.04, pattern: [0, 2, 3, 4], rate: 2 },
    bass: { gain: 0.1, pattern: [1, 0, 0, 0, 1, 0, 0, 0] },
    drums: { kick: [1, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0] }
  },
  victory: {
    bpm: 100,
    root: 'D3',
    scale: [0, 2, 4, 7, 9, 11],
    chords: [[0, 4, 7], [2, 5, 9], [-3, 2, 7], [0, 4, 9]],
    pad: { wave: 'sawtooth', gain: 0.12, filter: 1500, attack: 0.3 },
    arp: { wave: 'square', gain: 0.06, pattern: [0, 2, 4, 7], rate: 4 },
    bass: { gain: 0.18, pattern: [1, 0, 1, 0, 1, 0, 1, 0] },
    drums: { kick: [1, 0, 0, 1, 1, 0, 0, 1], hat: [1, 1, 1, 1, 1, 1, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0] }
  },
  defeat: {
    bpm: 62,
    root: 'A2',
    scale: [0, 1, 3, 5, 7, 8, 10],
    chords: [[0, 3, 7], [-1, 3, 6], [-3, 0, 5], [-4, -1, 3]],
    pad: { wave: 'sine', gain: 0.15, filter: 500, attack: 2.0 },
    arp: { wave: 'triangle', gain: 0.03, pattern: [0, 1, 2], rate: 1 },
    bass: { gain: 0.12, pattern: [1, 0, 0, 0, 0, 0, 1, 0] },
    drums: { kick: [1, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0] }
  }
};

/* -------------------------------------------------------------------------- */
/* Engine                                                                      */
/* -------------------------------------------------------------------------- */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabled = true;
    this.samples = new Map();
    this.currentTrack = null;
    this.trackTimer = null;
    this.nextNoteTime = 0;
    this.step = 0;
    this.schedulerId = null;
    this.duckUntil = 0;
    this.onStateChange = null;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ready;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      this.enabled = false;
      return false;
    }
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = settings.get('masterVolume');

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = settings.get('musicVolume');
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = settings.get('sfxVolume');
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.gain.value = settings.get('voiceVolume');

    // Gentle bus compression keeps big moments from clipping.
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;

    this.musicBus.connect(this.comp);
    this.sfxBus.connect(this.comp);
    this.voiceBus.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    this.noiseBuffer = this.#createNoise(1.2);
    this.ready = true;

    settings.onChange((key) => this.applySettings(key));
    return true;
  }

  applySettings(key) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (key === 'masterVolume' || key === '*') this.master.gain.setTargetAtTime(settings.get('masterVolume'), now, 0.05);
    if (key === 'musicVolume' || key === '*') this.musicBus.gain.setTargetAtTime(settings.get('musicVolume'), now, 0.05);
    if (key === 'sfxVolume' || key === '*') this.sfxBus.gain.setTargetAtTime(settings.get('sfxVolume'), now, 0.05);
    if (key === 'voiceVolume' || key === '*') this.voiceBus.gain.setTargetAtTime(settings.get('voiceVolume'), now, 0.05);
  }

  #createNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* ------------------------------------------------------------ samples */

  /** Register a real audio file to replace a synthesised cue. */
  async registerSample(name, url) {
    if (!this.ctx) return false;
    try {
      const res = await fetch(url);
      if (!res.ok) return false;
      const buf = await res.arrayBuffer();
      const decoded = await this.ctx.decodeAudioData(buf);
      this.samples.set(name, decoded);
      return true;
    } catch {
      return false; // fall back to synthesis
    }
  }

  #playSample(name, { volume = 1, rate = 1, bus = 'sfx' } = {}) {
    const buf = this.samples.get(name);
    if (!buf) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(bus === 'voice' ? this.voiceBus : bus === 'music' ? this.musicBus : this.sfxBus);
    src.start();
    return true;
  }

  /* ---------------------------------------------------------------- sfx */

  play(name, { volume = 1, variant = 0, rate = 1 } = {}) {
    if (!this.ready || !this.enabled) return;
    if (this.#playSample(name, { volume, rate })) return;
    const fn = this.SFX[name] || this.SFX.hit;
    const t = this.ctx.currentTime;
    fn.call(this, t, volume, variant, rate);
  }

  /* -------------------------------------------------------------- music */

  playMusic(trackId, { fade = 1.2 } = {}) {
    if (!this.ready || !this.enabled) return;
    if (this.currentTrack === trackId) return;
    this.currentTrack = trackId;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    if (this.schedulerId) clearInterval(this.schedulerId);
    this.schedulerId = setInterval(() => this.#scheduler(), 25);
    void fade;
  }

  stopMusic() {
    this.currentTrack = null;
    if (this.schedulerId) clearInterval(this.schedulerId);
    this.schedulerId = null;
  }

  #scheduler() {
    if (!this.currentTrack || !this.ctx) return;
    const track = TRACKS[this.currentTrack];
    if (!track) return;
    const stepDur = 60 / track.bpm / 2; // eighth notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      this.#scheduleStep(track, this.step, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.step += 1;
    }
  }

  #scheduleStep(track, step, time, stepDur) {
    const bar = Math.floor(step / 8) % track.chords.length;
    const beat = step % 8;
    const chord = track.chords[bar];
    const rootFreq = noteFreq(track.root);

    // Pad: sustained chord at the top of each bar.
    if (beat === 0) {
      for (const semi of chord) {
        this.#voice({
          type: track.pad.wave,
          freq: rootFreq * 2 ** (semi / 12) * 2,
          time,
          dur: stepDur * 8.2,
          gain: track.pad.gain,
          attack: track.pad.attack,
          filter: track.pad.filter,
          bus: 'music'
        });
      }
    }

    // Bass
    if (track.bass.pattern[beat]) {
      this.#voice({
        type: 'sawtooth',
        freq: rootFreq * 2 ** (chord[0] / 12),
        time,
        dur: stepDur * 1.6,
        gain: track.bass.gain,
        attack: 0.01,
        filter: 320,
        bus: 'music'
      });
    }

    // Arp
    const arpStep = track.arp.pattern[step % track.arp.pattern.length];
    if (arpStep !== undefined && step % (8 / track.arp.rate) === 0) {
      const semi = chord[arpStep % chord.length] + (arpStep >= chord.length ? 12 : 0);
      this.#voice({
        type: track.arp.wave,
        freq: rootFreq * 2 ** (semi / 12) * 4,
        time,
        dur: stepDur * 0.8,
        gain: track.arp.gain,
        attack: 0.005,
        filter: 2600,
        bus: 'music'
      });
    }

    // Drums
    if (track.drums.kick[beat]) this.#kick(time, 0.5);
    if (track.drums.snare[beat]) this.#snare(time, 0.25);
    if (track.drums.hat[beat]) this.#hat(time, 0.1);
  }

  #voice({ type, freq, time, dur, gain, attack = 0.01, filter = 1200, bus = 'sfx', detune = 0, sweep = null }) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), time + dur);
    if (detune) osc.detune.value = detune;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filter;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(filt);
    filt.connect(g);
    g.connect(bus === 'music' ? this.musicBus : this.sfxBus);
    osc.start(time);
    osc.stop(time + dur + 0.05);
    return osc;
  }

  #noise(time, dur, { gain = 0.3, filter = 2000, type = 'lowpass', q = 1 } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = filter;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxBus);
    src.start(time);
    src.stop(time + dur + 0.02);
    return g;
  }

  #kick(time, gain = 0.6) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(44, time + 0.14);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  #snare(time, gain = 0.3) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 1900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.musicBus);
    src.start(time);
    src.stop(time + 0.18);
  }

  #hat(time, gain = 0.15) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 7200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.musicBus);
    src.start(time);
    src.stop(time + 0.08);
  }

  /** Stylised character "voice": formant-ish blips, not speech samples. */
  voice(kind = 'attack', { volume = 1, pitch = 1 } = {}) {
    if (!this.ready || !this.enabled) return;
    if (this.#playSample(`voice-${kind}`, { volume, bus: 'voice' })) return;
    const t = this.ctx.currentTime;
    const base = (kind === 'hit' ? 150 : kind === 'victory' ? 220 : kind === 'defeat' ? 130 : 190) * pitch;
    const osc = this.ctx.createOscillator();
    osc.type = kind === 'hit' ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(base * rand(1.15, 0.9), t);
    osc.frequency.exponentialRampToValueAtTime(base * (kind === 'defeat' ? 0.5 : kind === 'victory' ? 1.5 : 0.7), t + 0.22);
    const formant = this.ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 700 + (kind === 'hit' ? 500 : 300);
    formant.Q.value = 4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * volume, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(formant);
    formant.connect(g);
    g.connect(this.voiceBus);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /* --------------------------------------------------------- sfx table */

  SFX = {
    punch(t, v) {
      this.#noise(t, 0.07, { gain: 0.35 * v, filter: 2600, type: 'bandpass', q: 1.2 });
      this.#voice({ type: 'triangle', freq: rand(220, 160), time: t, dur: 0.08, gain: 0.28 * v, filter: 1400, sweep: 90 });
      void v;
    },
    kick(t, v) {
      this.#noise(t, 0.09, { gain: 0.36 * v, filter: 1500, type: 'bandpass', q: 1 });
      this.#voice({ type: 'triangle', freq: 180, time: t, dur: 0.12, gain: 0.3 * v, filter: 900, sweep: 70 });
    },
    hit(t, v) {
      this.#noise(t, 0.12, { gain: 0.5 * v, filter: 1800, type: 'bandpass', q: 0.8 });
      this.#voice({ type: 'square', freq: rand(300, 200), time: t, dur: 0.14, gain: 0.34 * v, filter: 2200, sweep: 60 });
    },
    heavy(t, v) {
      this.#noise(t, 0.2, { gain: 0.55 * v, filter: 900, type: 'lowpass' });
      this.#voice({ type: 'sawtooth', freq: 160, time: t, dur: 0.28, gain: 0.4 * v, filter: 1200, sweep: 45 });
    },
    block(t, v) {
      this.#noise(t, 0.1, { gain: 0.3 * v, filter: 5200, type: 'highpass' });
      this.#voice({ type: 'sine', freq: 900, time: t, dur: 0.1, gain: 0.2 * v, filter: 4000, sweep: 600 });
    },
    sweep(t, v) {
      this.#noise(t, 0.24, { gain: 0.32 * v, filter: 1200, type: 'bandpass', q: 0.7 });
    },
    jump(t, v) {
      this.#voice({ type: 'sine', freq: 320, time: t, dur: 0.16, gain: 0.18 * v, filter: 2400, sweep: 620 });
    },
    land(t, v) {
      this.#noise(t, 0.14, { gain: 0.34 * v, filter: 700, type: 'lowpass' });
      this.#voice({ type: 'sine', freq: 120, time: t, dur: 0.16, gain: 0.3 * v, filter: 600, sweep: 50 });
    },
    special(t, v) {
      this.#voice({ type: 'sawtooth', freq: 220, time: t, dur: 0.42, gain: 0.34 * v, filter: 2400, sweep: 1400 });
      this.#noise(t, 0.3, { gain: 0.22 * v, filter: 3000, type: 'bandpass', q: 2 });
    },
    ultimate(t, v) {
      this.#voice({ type: 'sawtooth', freq: 140, time: t, dur: 0.9, gain: 0.42 * v, filter: 3200, sweep: 1800 });
      this.#voice({ type: 'square', freq: 70, time: t, dur: 1.0, gain: 0.3 * v, filter: 800 });
      this.#noise(t, 0.7, { gain: 0.3 * v, filter: 1800, type: 'lowpass' });
    },
    knockdown(t, v) {
      this.#noise(t, 0.5, { gain: 0.5 * v, filter: 500, type: 'lowpass' });
      this.#voice({ type: 'sine', freq: 90, time: t, dur: 0.5, gain: 0.4 * v, filter: 500, sweep: 40 });
    },
    flurry(t, v) {
      for (let i = 0; i < 5; i += 1) {
        this.#noise(t + i * 0.055, 0.05, { gain: 0.24 * v, filter: 2400, type: 'bandpass', q: 1 });
      }
    },
    shockwave(t, v) {
      this.#voice({ type: 'sine', freq: 90, time: t, dur: 0.6, gain: 0.44 * v, filter: 700, sweep: 35 });
      this.#noise(t, 0.4, { gain: 0.26 * v, filter: 400, type: 'lowpass' });
    },
    teleport(t, v) {
      this.#voice({ type: 'sine', freq: 1200, time: t, dur: 0.24, gain: 0.24 * v, filter: 5000, sweep: 200 });
      this.#noise(t, 0.18, { gain: 0.18 * v, filter: 6000, type: 'highpass' });
    },
    summon(t, v) {
      for (let i = 0; i < 3; i += 1) {
        this.#voice({ type: 'square', freq: 400 + i * 220, time: t + i * 0.06, dur: 0.12, gain: 0.2 * v, filter: 3000, sweep: 900 });
      }
    },
    grab(t, v) {
      this.#noise(t, 0.18, { gain: 0.3 * v, filter: 900, type: 'lowpass' });
      this.#voice({ type: 'sawtooth', freq: 110, time: t, dur: 0.3, gain: 0.3 * v, filter: 700, sweep: 60 });
    },
    hover(t, v) {
      this.#voice({ type: 'sine', freq: 880, time: t, dur: 0.07, gain: 0.07 * v, filter: 4000 });
    },
    click(t, v) {
      this.#voice({ type: 'square', freq: 620, time: t, dur: 0.09, gain: 0.16 * v, filter: 3000, sweep: 380 });
      this.#noise(t, 0.05, { gain: 0.12 * v, filter: 4000, type: 'highpass' });
    },
    back(t, v) {
      this.#voice({ type: 'square', freq: 420, time: t, dur: 0.1, gain: 0.14 * v, filter: 2200, sweep: 220 });
    },
    error(t, v) {
      this.#voice({ type: 'sawtooth', freq: 220, time: t, dur: 0.22, gain: 0.2 * v, filter: 1200, sweep: 110 });
      this.#voice({ type: 'sawtooth', freq: 150, time: t + 0.1, dur: 0.22, gain: 0.18 * v, filter: 900, sweep: 80 });
    },
    save(t, v) {
      this.#voice({ type: 'sine', freq: 660, time: t, dur: 0.14, gain: 0.14 * v, filter: 4000 });
      this.#voice({ type: 'sine', freq: 990, time: t + 0.09, dur: 0.18, gain: 0.13 * v, filter: 4000 });
    },
    countdown(t, v) {
      this.#voice({ type: 'square', freq: 520, time: t, dur: 0.16, gain: 0.2 * v, filter: 3000 });
    },
    fightStart(t, v) {
      this.#voice({ type: 'sawtooth', freq: 180, time: t, dur: 0.5, gain: 0.34 * v, filter: 2600, sweep: 900 });
      this.#noise(t, 0.4, { gain: 0.24 * v, filter: 2000, type: 'bandpass', q: 1.4 });
    },
    whoosh(t, v) {
      this.#noise(t, 0.3, { gain: 0.18 * v, filter: 1400, type: 'bandpass', q: 0.6 });
    },
    impact(t, v) {
      this.#noise(t, 0.3, { gain: 0.45 * v, filter: 700, type: 'lowpass' });
      this.#voice({ type: 'sine', freq: 130, time: t, dur: 0.3, gain: 0.36 * v, filter: 600, sweep: 45 });
    },
    unlock(t, v) {
      [523, 659, 784, 1046].forEach((f, i) => {
        this.#voice({ type: 'triangle', freq: f, time: t + i * 0.08, dur: 0.4, gain: 0.18 * v, filter: 5000 });
      });
    },
    victory(t, v) {
      [523, 659, 784, 1046, 1318].forEach((f, i) => {
        this.#voice({ type: 'sawtooth', freq: f, time: t + i * 0.11, dur: 0.7, gain: 0.16 * v, filter: 3500 });
      });
    },
    defeat(t, v) {
      [392, 349, 311, 233].forEach((f, i) => {
        this.#voice({ type: 'sine', freq: f, time: t + i * 0.18, dur: 0.9, gain: 0.2 * v, filter: 1200 });
      });
    }
  };

  /** Shortcut used by UI code. */
  ui(kind) {
    if (kind === 'hover') this.play('hover', { volume: 0.8 });
    else if (kind === 'click') this.play('click');
    else if (kind === 'back') this.play('back');
    else if (kind === 'error') this.play('error');
  }
}

export const audio = new AudioEngine();
void noteFreq;
void clamp;
void pick;
