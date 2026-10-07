/**
 * extras.js — the game's reference centre.
 *
 * Sections: Game Information, Story, Characters, Enemy Profiles, Combat System,
 * Controls, Unlocks, Animation Gallery, Cinematics, Soundtrack, Statistics,
 * Development & Credits, Version Information.
 */
import { drawText, roundRect } from '../core/canvas.js';
import { Button, TabBar, ScrollArea, panel } from '../ui/widgets.js';
import { getArena } from '../arenas/arenas.js';
import {
  getCharacter, CHARACTERS, CAMPAIGN_ROUNDS, ROSTER_ORDER,
  SUMMONS, SUMMON_ORDER, TRAINING_DUMMY
} from '../characters/roster.js';
import { movesetFor } from '../characters/movesets.js';
import { NEUTRAL_POSE, clonePose, addPose, solvePosePlanted } from '../animation/skeleton.js';
import { CLIPS } from '../animation/clips.js';
import { drawStickman } from '../animation/stickman-renderer.js';
import { gameState } from '../core/state.js';
import { input, ACTION_LABELS, DEFAULT_BINDINGS_P1, DEFAULT_BINDINGS_P2 } from '../core/input.js';
import { TRACKS } from '../audio/audio.js';
import { api } from '../core/api.js';
import { TRANSITIONS } from '../core/scene-manager.js';
import { clamp, damp, rgba, rand, TAU, formatDuration } from '../core/utils.js';
import { settings } from '../config/settings.js';
import { audio } from '../audio/audio.js';
import { DIFFICULTIES } from '../config/difficulty.js';

const SECTIONS = [
  { id: 'info', label: 'GAME INFO' },
  { id: 'story', label: 'STORY' },
  { id: 'characters', label: 'CHARACTERS' },
  { id: 'combat', label: 'COMBAT' },
  { id: 'controls', label: 'CONTROLS' },
  { id: 'unlocks', label: 'UNLOCKS' },
  { id: 'gallery', label: 'ANIMATION' },
  { id: 'cinematics', label: 'CINEMATICS' },
  { id: 'soundtrack', label: 'SOUNDTRACK' },
  { id: 'stats', label: 'STATISTICS' },
  { id: 'credits', label: 'CREDITS' }
];

export class ExtrasScene {
  constructor({ audio: audioEngine }) {
    this.audio = audioEngine;
    this.time = 0;
    this.section = 'info';
    this.galleryIndex = 0;
    this.galleryClip = 0;
    this.galleryTimer = 0;
    this.clips = Object.keys(CLIPS).filter((c) => !['blockHit'].includes(c));
  }

  enter() {
    this.time = 0;
    this.audio?.playMusic('extras');
    this.tabs = new TabBar({
      x: 40, y: 168, width: 210, tabs: SECTIONS, value: this.section,
      onChange: (id) => {
        this.section = id;
        audio.ui('click');
        this.scroll?.update?.(0, { inside: false });
        if (this.scroll) this.scroll.offset = 0;
      }
    });
    this.backButton = new Button({
      x: 40, y: 650, w: 190, h: 46, label: 'BACK', accent: '#3a2b30', size: 18,
      onClick: () => this.manager.change('menu', { transition: TRANSITIONS.SLIDE, duration: 0.7 })
    });
    this.actionButtons = [];
  }

  update(dt, pointer) {
    this.time += dt;
    this.tabs.update(dt, pointer);
    this.backButton.update(dt, pointer);
    this.scrollArea = new ScrollArea({ x: 280, y: 150, w: 960, h: 500, contentHeight: this.contentHeight || 600 });
    this.scrollArea.update(dt, pointer);

    if (this.section === 'gallery') {
      this.galleryTimer += dt;
      if (this.galleryTimer > 1.6) {
        this.galleryTimer = 0;
        this.galleryClip = (this.galleryClip + 1) % this.clips.length;
      }
      // Character switcher
      for (const b of this.#galleryButtons()) {
        if (b.update(dt, pointer)) this.galleryIndex = b.index;
      }
    }

    if (this.section === 'cinematics') {
      this.cinematicButtons = this.cinematicButtons || [
        new Button({
          x: 300, y: 300, w: 320, h: 52, label: 'REPLAY OPENING', accent: '#ff2b3c',
          sub: 'Creator Bitos vs every problem',
          onClick: () => this.manager.change('intro', { transition: TRANSITIONS.BLACK, duration: 0.9, params: { replay: true, next: 'extras' } })
        })
      ];
      for (const b of this.cinematicButtons) b.update(dt, pointer);
    }

    if (input.p1().wasPressed('back')) {
      this.manager.change('menu', { transition: TRANSITIONS.SLIDE, duration: 0.7 });
    }
  }

  #galleryButtons() {
    const buttons = [];
    ROSTER_ORDER.forEach((id, i) => {
      buttons.push(new Button({
        x: 300 + (i % 6) * 158,
        y: 560 + Math.floor(i / 6) * 56,
        w: 148, h: 44,
        label: getCharacter(id).short,
        accent: i === this.galleryIndex ? getCharacter(id).color : '#3a2b30',
        size: 15,
        index: i,
        onClick: (b) => {
          this.galleryIndex = b.index;
        }
      }));
    });
    return buttons;
  }

  draw(ctx, dt) {
    const t = this.time;
    getArena('menu').draw(ctx, t * 0.2, null, {});
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,7,0.82)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.restore();

    drawText(ctx, 'EXTRAS', 640, 74, {
      size: 40, weight: '800', color: '#ffffff', align: 'center', spacing: 10,
      shadow: { color: rgba('#c084fc', 0.8), blur: 22 }
    });
    drawText(ctx, this.section.toUpperCase(), 640, 104, {
      size: 14, weight: '700', color: '#a3949a', align: 'center', spacing: 4
    });

    this.tabs.draw(ctx);

    panel(ctx, { x: 280, y: 130, w: 960, h: 540, alpha: 0.7 });

    this.scrollArea.begin(ctx, (c) => {
      switch (this.section) {
        case 'info': this.#drawInfo(c); break;
        case 'story': this.#drawStory(c); break;
        case 'characters': this.#drawCharacters(c, t); break;
        case 'combat': this.#drawCombat(c); break;
        case 'controls': this.#drawControls(c); break;
        case 'unlocks': this.#drawUnlocks(c, t); break;
        case 'gallery': this.#drawGallery(c, t, dt); break;
        case 'cinematics': this.#drawCinematics(c, dt); break;
        case 'soundtrack': this.#drawSoundtrack(c); break;
        case 'stats': this.#drawStats(c); break;
        case 'credits': this.#drawCredits(c); break;
        default: break;
      }
    });

    this.backButton.draw(ctx, dt);
    drawText(ctx, 'ESC  BACK', 640, 712, { size: 12, weight: '700', color: '#6d6469', align: 'center', spacing: 2 });
  }

  #head(c, text, y, color = '#ffd166') {
    drawText(c, text, 310, y, { size: 20, weight: '800', color, spacing: 3 });
    return y + 30;
  }

  #body(c, text, y, { size = 14, color = '#cfc2c6', maxWidth = 900 } = {}) {
    const words = String(text).split(' ');
    let line = '';
    let ly = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (test.length > maxWidth / (size * 0.5)) {
        drawText(c, line, 310, ly, { size, weight: '600', color });
        ly += size + 6;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      drawText(c, line, 310, ly, { size, weight: '600', color });
      ly += size + 6;
    }
    return ly + 6;
  }

  #drawInfo(c) {
    this.contentHeight = 760;
    let y = 170;
    y = this.#head(c, 'CREATOR BITOS VS PROBLEMS IN LIFE (THE GAME)', y, '#ffffff');
    y = this.#body(c, 'An original cinematic 2D stickman fighting game. Creator Bitos fights the problems, distractions, temptations, struggles and obstacles of life — one opponent at a time, ten rounds deep.', y);
    y += 10;
    y = this.#head(c, 'HOW IT IS BUILT', y);
    y = this.#body(c, 'Every character is driven by a forward-kinematic stickman rig with real frame data: startup, active and recovery windows, hitboxes and hurtboxes, hit stun, block stun, knockback, armour, cancels and meter. The enemy AI is a behaviour state machine with per-character personalities and difficulty-scaled reaction times. Nothing in the combat system is decorative.', y);
    y += 10;
    y = this.#head(c, 'ARENAS', y);
    const arenas = CAMPAIGN_ROUNDS.map((id) => `${getCharacter(id).name} — ${getArena(getCharacter(id).arena).name}`);
    y = this.#body(c, arenas.join(' · '), y);
    y += 10;
    y = this.#head(c, 'CONTENT NOTE', y, '#d8b46a');
    y = this.#body(c, 'Two encounters are handled with care. SUICIDE is framed as surviving a crisis and reaching for help, never as self-harm as spectacle. SEIZURE is a fictional, symbolic final challenge and is explicitly not a depiction of a medical condition being cured by winning. The finale avoids rapid flashing imagery throughout, and Settings → Accessibility can further reduce flash and shake.', y);
    y += 10;
    y = this.#head(c, 'DATABASE', y);
    let dbText;
    if (api.isOffline) {
      dbText = 'Accounts and progression are kept in this browser (offline mode). Passwords are hashed with PBKDF2-SHA256 and never stored in plain text. Connect a game server to sync to Google Sheets instead.';
    } else if (api.online) {
      dbText = 'Connected to the game server. Passwords are hashed with scrypt and never stored in plain text.';
    } else {
      dbText = `The game server is unreachable (${api.lastError || 'connection failed'}) and progress is not being saved.`;
    }
    y = this.#body(c, dbText, y);
  }

  #drawStory(c) {
    this.contentHeight = 700;
    let y = 170;
    y = this.#head(c, 'THE PREMISE', y);
    y = this.#body(c, 'Creator Bitos is confronted by manifestations of everything that interferes with a life. Each battle is another obstacle, and each one is harder than the last.', y);
    y += 8;
    for (let i = 0; i < CAMPAIGN_ROUNDS.length; i += 1) {
      const def = getCharacter(CAMPAIGN_ROUNDS[i]);
      const cleared = gameState.isDefeated(def.id);
      drawText(c, `ROUND ${i + 1}`, 310, y, { size: 13, weight: '800', color: '#ffd166', spacing: 2 });
      drawText(c, def.name, 380, y, { size: 16, weight: '800', color: def.color, spacing: 1.4 });
      drawText(c, cleared ? 'DEFEATED' : 'PENDING', 1210, y, {
        size: 12, weight: '800', color: cleared ? '#7fbf8a' : '#6d6469', align: 'right', spacing: 1.6
      });
      y += 22;
      y = this.#body(c, def.blurb, y, { size: 13, color: '#a3949a' });
      y += 6;
    }
  }

  #drawCharacters(c, t) {
    this.contentHeight = ROSTER_ORDER.length * 210 + 200;
    let y = 170;
    y = this.#head(c, 'ROSTER', y);
    y += 10;
    for (const id of ROSTER_ORDER) {
      const def = getCharacter(id);
      const unlocked = gameState.isUnlocked(id);
      panel(c, { x: 310, y: y - 16, w: 890, h: 180, alpha: 0.45, accent: def.color });
      const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), CLIPS.idle({ t: t * 0.8 + y * 0.01, rng: y }), 1);
      drawStickman(c, solvePosePlanted(pose, 130), {
        x: 380, y: y + 138, facing: 1, height: 130, color: def.color, accent: def.accent,
        lineWidth: 6, glow: unlocked ? 1 : 0, alpha: unlocked ? 1 : 0.4,
        silhouette: !unlocked, silhouetteColor: '#241b21', eye: { x: 0.7, y: 0 }, eyeStyle: def.eyeStyle
      });
      drawText(c, def.name, 460, y + 12, { size: 24, weight: '800', color: def.color, spacing: 2 });
      drawText(c, `THEME — ${def.theme || '—'}`, 460, y + 36, { size: 12, weight: '700', color: '#8d7f84', spacing: 1.6 });
      drawText(c, `SPECIAL — ${def.specialName}`, 460, y + 58, { size: 13, weight: '700', color: '#cfc2c6' });
      drawText(c, `SUPER — ${def.ultimateName}`, 460, y + 78, { size: 13, weight: '700', color: '#ffd166' });
      drawText(c, `ARENA — ${getArena(def.arena).name}`, 460, y + 98, { size: 12, weight: '600', color: '#8d7f84' });
      drawText(c, unlocked ? 'UNLOCKED' : 'LOCKED', 1180, y + 12, {
        size: 13, weight: '800', color: unlocked ? '#7fbf8a' : '#d8b46a', align: 'right', spacing: 2
      });

      const s = def.stats;
      const bars = [
        ['POWER', s.damageScale / 1.3],
        ['TOUGHNESS', s.defense / 1.35],
        ['SPEED', s.walkSpeed / 280],
        ['REACH', s.reach / 1.15],
        ['METER', s.meterRate / 1.5]
      ];
      bars.forEach(([label, value], i) => {
        const bx = 700;
        const by = y + 12 + i * 22;
        drawText(c, label, bx, by, { size: 10, weight: '700', color: '#8d7f84', baseline: 'middle', spacing: 1.2 });
        c.save();
        roundRect(c, bx + 90, by - 5, 140, 10, 5);
        c.fillStyle = 'rgba(255,255,255,0.08)';
        c.fill();
        roundRect(c, bx + 90, by - 5, 140 * clamp(value, 0, 1), 10, 5);
        c.fillStyle = def.color;
        c.fill();
        c.restore();
      });

      // Tips
      drawText(c, (def.tips || []).slice(0, 2).join('   •   '), 460, y + 128, {
        size: 12, weight: '600', color: '#a3949a'
      });
      y += 208;
    }

    y += 10;
    y = this.#head(c, 'GADGET — SUMMONED DISTRACTIONS', y);
    SUMMON_ORDER.forEach((id, i) => {
      const s = SUMMONS[id];
      const x = 310 + (i % 3) * 300;
      const yy = y + Math.floor(i / 3) * 40;
      drawText(c, s.name, x, yy, { size: 14, weight: '800', color: s.color, spacing: 1.2 });
      drawText(c, `${s.hp} HP · ${s.damage} DMG`, x, yy + 16, { size: 11, weight: '700', color: '#8d7f84' });
    });
    y += 90;
    drawText(c, 'Each distraction can only be summoned ONCE per battle — clear it and Gadget loses it for good.', 310, y, {
      size: 13, weight: '700', color: '#ffd166'
    });
    this.contentHeight = y + 120;
    void TRAINING_DUMMY;
  }

  #drawCombat(c) {
    this.contentHeight = 1400;
    let y = 170;
    y = this.#head(c, 'COMBAT SYSTEM', y);
    y = this.#body(c, 'Attacks have three phases. STARTUP frames run before the hitbox exists. ACTIVE frames are when the hitbox can connect. RECOVERY frames are the window where you are vulnerable if you missed or were blocked. Fast, light attacks have short startup; heavy attacks hit harder and are riskier.', y);
    y += 6;
    y = this.#head(c, 'DEFENCE', y);
    y = this.#body(c, 'Hold back or press BLOCK to guard. High and mid attacks can be blocked standing; low attacks must be blocked crouching. Blocking still takes a little chip damage. Some moves have super armour — they absorb a hit and keep coming. Grabs and unblockable specials ignore guard entirely.', y);
    y += 6;
    y = this.#head(c, 'METER & SUPERS', y);
    y = this.#body(c, 'Landing and taking damage fills your meter. Specials cost 25. The super (ultimate) costs the full 100 and is the highest-damage option you have.', y);
    y += 6;
    y = this.#head(c, 'DIFFICULTY', y);
    for (const key of Object.keys(DIFFICULTIES)) {
      const d = DIFFICULTIES[key];
      drawText(c, d.label, 310, y, { size: 14, weight: '800', color: '#ffffff', spacing: 2 });
      y = this.#body(c, d.blurb, y + 18, { size: 12, color: '#a3949a' });
      y += 4;
    }
    y += 6;
    y = this.#head(c, 'CREATOR BITOS — FRAME DATA', y);
    const moves = movesetFor('creator-bitos');
    const table = ['lightPunch', 'heavyPunch', 'lightKick', 'heavyKick', 'sweep', 'jumpKick', 'special', 'ultimate'];
    y += 6;
    table.forEach((id, i) => {
      const m = moves[id];
      if (!m) return;
      const rowY = y + i * 24;
      drawText(c, m.name, 310, rowY, { size: 13, weight: '800', color: '#ffffff', spacing: 1 });
      drawText(c, `START ${m.startup}`, 620, rowY, { size: 12, weight: '700', color: '#8d7f84' });
      drawText(c, `ACTIVE ${m.active}`, 720, rowY, { size: 12, weight: '700', color: '#8d7f84' });
      drawText(c, `RECOVERY ${m.recovery}`, 830, rowY, { size: 12, weight: '700', color: '#8d7f84' });
      drawText(c, `${m.damage} DMG`, 980, rowY, { size: 12, weight: '800', color: '#ff8c8c' });
      drawText(c, m.meterCost ? `${m.meterCost} METER` : `+${m.meterGain} METER`, 1090, rowY, {
        size: 12, weight: '700', color: m.meterCost ? '#ffd166' : '#7fbf8a'
      });
    });
    y += table.length * 24 + 20;
    y = this.#head(c, 'SUMMONS (GADGET ONLY)', y);
    y = this.#body(c, 'Gadget can call Social Media, Adult Content, Gaming, Gambling, Endless Scrolling and Notifications. Each type is available once per battle; once defeated it is gone for the rest of the fight.', y);
    this.contentHeight = y + 120;
  }

  #drawControls(c) {
    this.contentHeight = 900;
    let y = 170;
    y = this.#head(c, 'PLAYER 1 (DEFAULT)', y, '#ff2b3c');
    const p1Keys = Object.keys(DEFAULT_BINDINGS_P1);
    p1Keys.forEach((action, i) => {
      const rowY = y + i * 26;
      drawText(c, ACTION_LABELS[action] || action, 310, rowY, { size: 14, weight: '700', color: '#cfc2c6' });
      drawText(c, input.bindingLabel(0, action), 560, rowY, { size: 14, weight: '800', color: '#ffffff', spacing: 1.4 });
    });
    y += p1Keys.length * 26 + 20;

    y = this.#head(c, 'PLAYER 2 (DEFAULT)', y, '#22d3ee');
    const p2Keys = Object.keys(DEFAULT_BINDINGS_P2);
    p2Keys.forEach((action, i) => {
      const rowY = y + i * 26;
      drawText(c, ACTION_LABELS[action] || action, 310, rowY, { size: 14, weight: '700', color: '#cfc2c6' });
      drawText(c, input.bindingLabel(1, action), 560, rowY, { size: 14, weight: '800', color: '#ffffff', spacing: 1.4 });
    });
    y += p2Keys.length * 26 + 20;
    y = this.#body(c, 'Both control sets can be rebound in Settings → Controls. Menus accept arrow keys / WASD, ENTER to confirm and ESC to go back.', y);
    this.contentHeight = y + 120;
  }

  #drawUnlocks(c, t) {
    this.contentHeight = 780;
    let y = 170;
    y = this.#head(c, 'CHARACTER UNLOCKS', y);
    y = this.#body(c, 'Creator Bitos is available from the start. Defeating a problem makes it playable in Training and Multiplayer.', y);
    y += 8;
    ROSTER_ORDER.forEach((id, i) => {
      const def = getCharacter(id);
      const unlocked = gameState.isUnlocked(id);
      const x = 310 + (i % 2) * 450;
      const yy = y + Math.floor(i / 2) * 34;
      drawText(c, unlocked ? '✔' : '✖', x, yy, { size: 15, weight: '800', color: unlocked ? '#7fbf8a' : '#6d5f65' });
      drawText(c, def.name, x + 24, yy, { size: 14, weight: '800', color: unlocked ? def.color : '#7e6f75', spacing: 1.2 });
      drawText(c, unlocked ? 'UNLOCKED' : (def.unlockRequirement || 'LOCKED'), x + 400, yy, {
        size: 11, weight: '700', color: unlocked ? '#7fbf8a' : '#8d7f84', align: 'right'
      });
    });
    y += Math.ceil(ROSTER_ORDER.length / 2) * 34 + 20;
    y = this.#head(c, 'MULTIPLAYER', y, '#22d3ee');
    drawText(c, gameState.multiplayerUnlocked ? 'UNLOCKED' : 'LOCKED', 310, y, {
      size: 22, weight: '800', color: gameState.multiplayerUnlocked ? '#22d3ee' : '#d8b46a', spacing: 3
    });
    y += 30;
    y = this.#body(c, gameState.multiplayerUnlocked
      ? 'All ten problems defeated. Player 1 vs Player 2 is available with the full roster.'
      : `Defeat all 10 problems to unlock local versus. Progress: ${gameState.campaignProgress} / 10.`, y);
    void t;
    this.contentHeight = y + 140;
  }

  #drawGallery(c, t, dt) {
    this.contentHeight = 700;
    const id = ROSTER_ORDER[this.galleryIndex];
    const def = getCharacter(id);
    const clip = this.clips[this.galleryClip];

    drawText(c, def.name, 310, 172, { size: 22, weight: '800', color: def.color, spacing: 2 });
    drawText(c, `CLIP: ${clip.toUpperCase()}`, 1210, 172, { size: 14, weight: '800', color: '#ffd166', align: 'right', spacing: 2 });

    // Stage
    panel(c, { x: 310, y: 196, w: 600, h: 330, alpha: 0.4 });
    const pose = addPose(clonePose(def.stance || NEUTRAL_POSE), (CLIPS[clip] || CLIPS.idle)({
      t: this.galleryTimer * 1.0,
      p: clamp(this.galleryTimer / 1.6, 0, 1),
      style: def.specialStyle || def.victoryStyle,
      rng: 1,
      guard: 1,
      speed: 1,
      severity: 1,
      high: true
    }), 1);
    drawStickman(c, solvePosePlanted(pose, 240), {
      x: 610, y: 500, facing: 1, height: 240, color: def.color, accent: def.accent,
      lineWidth: 10, glow: 1.2, eye: { x: 0.7, y: 0 }, eyeStyle: def.eyeStyle
    });
    drawText(c, 'GROUND', 610, 520, { size: 10, weight: '700', color: '#6d6469', align: 'center', spacing: 2 });

    // Clip list
    this.clips.forEach((name, i) => {
      const x = 940 + (i % 2) * 180;
      const yy = 210 + Math.floor(i / 2) * 26;
      const active = i === this.galleryClip;
      drawText(c, name, x, yy, {
        size: 12, weight: active ? '800' : '600', color: active ? '#ffd166' : '#8d7f84', spacing: 1
      });
    });

    for (const b of this.#galleryButtons()) b.draw(c, dt);
    void t;
    this.contentHeight = 700;
  }

  #drawCinematics(c, dt) {
    this.contentHeight = 620;
    let y = 170;
    y = this.#head(c, 'CINEMATICS', y);
    y = this.#body(c, 'Replay the opening cinematic at any time. It shows Creator Bitos surrounded by every problem he is about to face, and can be skipped once watched.', y);
    y += 10;
    const watched = gameState.hasSeenIntro;
    drawText(c, watched ? 'STATUS: WATCHED — SKIPPABLE' : 'STATUS: NOT YET WATCHED', 310, y, {
      size: 13, weight: '800', color: watched ? '#7fbf8a' : '#d8b46a', spacing: 2
    });
    y += 20;
    if (this.cinematicButtons) {
      for (const b of this.cinematicButtons) {
        b.y = y + 30;
        b.draw(c, dt);
        y += 62;
      }
    }
    this.contentHeight = y + 200;
  }

  #drawSoundtrack(c) {
    this.contentHeight = 620;
    let y = 170;
    y = this.#head(c, 'SOUNDTRACK', y);
    y = this.#body(c, 'All music and sound effects are generated live by the game engine — no copyrighted audio is used. Each cue below can be replaced with a real audio file by dropping it into /assets/audio and enabling it in the asset manifest.', y);
    y += 10;
    Object.entries(TRACKS).forEach(([id, track], i) => {
      const rowY = y + i * 30;
      drawText(c, id.toUpperCase(), 310, rowY, { size: 14, weight: '800', color: '#ffffff', spacing: 2 });
      drawText(c, `${track.bpm} BPM`, 520, rowY, { size: 12, weight: '700', color: '#8d7f84' });
      drawText(c, `KEY ${track.root}`, 640, rowY, { size: 12, weight: '700', color: '#8d7f84' });
      drawText(c, 'SYNTHESISED', 1210, rowY, { size: 11, weight: '700', color: '#7fbf8a', align: 'right', spacing: 1.4 });
    });
    this.contentHeight = y + Object.keys(TRACKS).length * 30 + 160;
  }

  #drawStats(c) {
    this.contentHeight = 660;
    const stats = gameState.player?.stats || {};
    let y = 170;
    y = this.#head(c, 'PLAYER STATISTICS', y);
    const rows = [
      ['PLAYER', gameState.username || '—'],
      ['CAMPAIGN PROGRESS', `${gameState.campaignProgress} / ${CAMPAIGN_ROUNDS.length}`],
      ['PROBLEMS DEFEATED', `${gameState.defeatedEnemies.length}`],
      ['CHARACTERS UNLOCKED', `${gameState.unlockedCharacters.length} / 11`],
      ['MULTIPLAYER', gameState.multiplayerUnlocked ? 'UNLOCKED' : 'LOCKED'],
      ['MATCHES PLAYED', `${stats.matchesPlayed || 0}`],
      ['BEST COMBO', `${stats.bestCombo || 0} HITS`],
      ['DAMAGE DEALT', `${stats.totalDamageDealt || 0}`],
      ['DAMAGE TAKEN', `${stats.totalDamageTaken || 0}`],
      ['TIME PLAYED', formatDuration(stats.totalTimePlayedSeconds || 0)],
      ['INTRO WATCHED', gameState.hasSeenIntro ? 'YES' : 'NO']
    ];
    rows.forEach(([label, value], i) => {
      const rowY = y + i * 30;
      drawText(c, label, 310, rowY, { size: 13, weight: '700', color: '#8d7f84', spacing: 1.6 });
      drawText(c, value, 1210, rowY, { size: 15, weight: '800', color: '#ffffff', align: 'right' });
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.06)';
      c.beginPath();
      c.moveTo(310, rowY + 12);
      c.lineTo(1210, rowY + 12);
      c.stroke();
      c.restore();
    });
    y += rows.length * 30 + 20;

    y = this.#head(c, 'RECORDS VS EACH PROBLEM', y);
    const records = gameState.player?.enemyRecords || {};
    Object.keys(records).forEach((id, i) => {
      const r = records[id];
      const rowY = y + i * 24;
      drawText(c, getCharacter(id).name, 310, rowY, { size: 13, weight: '700', color: getCharacter(id).color, spacing: 1.2 });
      drawText(c, `W ${r.wins}  ·  L ${r.losses}  ·  BEST COMBO ${r.bestCombo}`, 700, rowY, {
        size: 12, weight: '700', color: '#a3949a'
      });
    });
    this.contentHeight = y + Object.keys(records).length * 24 + 160;
  }

  #drawCredits(c) {
    this.contentHeight = 700;
    let y = 170;
    y = this.#head(c, 'DEVELOPMENT', y);
    y = this.#body(c, 'Built as an original indie fighting game. Engine: custom zero-dependency HTML5 canvas engine (ES modules) with a Node HTTP server for accounts and progression. Animation: procedural forward-kinematic stickman rig. Audio: Web Audio synthesis. Persistence: swappable database adapters (local JSON by default, Google Sheets when configured).', y);
    y += 10;
    y = this.#head(c, 'ARCHITECTURE', y);
    const structure = [
      '/src/core — loop, input, scenes, transitions, state, api, canvas',
      '/src/animation — rig, clips, renderer, particles, camera',
      '/src/characters — roster data and frame-data movesets',
      '/src/combat — fighters, match flow, projectiles, summons',
      '/src/ai — personalities and the behaviour state machine',
      '/src/arenas — procedural arena painters',
      '/src/scenes — auth, loading, intro, menu, campaign, battle, results, training, versus, extras, settings',
      '/src/ui — widgets and the fight HUD',
      '/src/audio — synthesiser, music scheduler and SFX table',
      '/server — HTTP API, scrypt auth, pluggable database adapters'
    ];
    structure.forEach((line) => {
      drawText(c, line, 310, y, { size: 12, weight: '600', color: '#a3949a' });
      y += 20;
    });
    y += 10;
    y = this.#head(c, 'CREDITS', y);
    y = this.#body(c, 'Concept, characters and story: Creator Bitos. Design, systems, art direction and audio: the game team. Thanks to everyone who kept showing up.', y);
    y += 10;
    y = this.#head(c, 'VERSION INFORMATION', y);
    drawText(c, 'VERSION 1.0.0', 310, y, { size: 16, weight: '800', color: '#ffffff', spacing: 2 });
    drawText(c, `BUILD ${new Date().toISOString().slice(0, 10)}`, 520, y, { size: 12, weight: '700', color: '#8d7f84' });
    drawText(c, 'UI SCALE ' + settings.get('uiScale'), 700, y, { size: 12, weight: '700', color: '#8d7f84' });
    this.contentHeight = y + 180;
  }
}

void CHARACTERS;
void damp;
void rgba;
void rand;
void TAU;
void roundRect;
