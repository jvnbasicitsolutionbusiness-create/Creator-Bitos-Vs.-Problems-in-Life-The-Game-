/**
 * manifest.js — the single place that describes where art and audio live.
 *
 * The game ships fully playable with procedural animation and synthesised
 * audio. Every entry below declares the exact location a real asset would be
 * dropped into. Set `enabled: true` for an entry once the file exists and the
 * loader will use it instead of the procedural version — no engine code
 * changes required (spec section 41).
 */

export const SPRITE_ROOT = '/assets/sprites';
export const AUDIO_ROOT = '/assets/audio';

/** Animation clips every character sheet is expected to provide. */
export const CHARACTER_CLIPS = [
  'idle', 'walk', 'walkBack', 'run', 'jump', 'fall', 'land', 'crouch', 'block',
  'lightPunch', 'heavyPunch', 'lightKick', 'heavyKick', 'special', 'ultimate',
  'hit', 'knockdown', 'getup', 'victory', 'defeat', 'intro'
];

export const CHARACTER_IDS = [
  'creator-bitos', 'laziness', 'gadget', 'addiction', 'lust', 'society',
  'suicide', 'suffering', 'wrath', 'school', 'seizure', 'training-dummy'
];

/**
 * Sprite sheet descriptor. Frame counts default to a sensible 60 Hz timing and
 * are overridden per sheet when the art is supplied.
 */
export function spriteSheetFor(characterId, clip) {
  return {
    path: `${SPRITE_ROOT}/${characterId}/${clip}.png`,
    frames: clip === 'idle' ? 8 : clip === 'ultimate' ? 24 : 12,
    fps: 60,
    loop: ['idle', 'walk', 'walkBack', 'run', 'victory', 'defeat'].includes(clip),
    enabled: false // <- flip to true when the sheet is added to /public/assets/sprites
  };
}

export const SFX_MANIFEST = {
  punch: { path: `${AUDIO_ROOT}/sfx/punch.mp3`, enabled: false },
  kick: { path: `${AUDIO_ROOT}/sfx/kick.mp3`, enabled: false },
  hit: { path: `${AUDIO_ROOT}/sfx/hit.mp3`, enabled: false },
  heavy: { path: `${AUDIO_ROOT}/sfx/heavy.mp3`, enabled: false },
  block: { path: `${AUDIO_ROOT}/sfx/block.mp3`, enabled: false },
  jump: { path: `${AUDIO_ROOT}/sfx/jump.mp3`, enabled: false },
  land: { path: `${AUDIO_ROOT}/sfx/land.mp3`, enabled: false },
  special: { path: `${AUDIO_ROOT}/sfx/special.mp3`, enabled: false },
  ultimate: { path: `${AUDIO_ROOT}/sfx/ultimate.mp3`, enabled: false },
  knockdown: { path: `${AUDIO_ROOT}/sfx/knockdown.mp3`, enabled: false },
  sweep: { path: `${AUDIO_ROOT}/sfx/sweep.mp3`, enabled: false },
  shockwave: { path: `${AUDIO_ROOT}/sfx/shockwave.mp3`, enabled: false },
  teleport: { path: `${AUDIO_ROOT}/sfx/teleport.mp3`, enabled: false },
  summon: { path: `${AUDIO_ROOT}/sfx/summon.mp3`, enabled: false },
  flurry: { path: `${AUDIO_ROOT}/sfx/flurry.mp3`, enabled: false },
  grab: { path: `${AUDIO_ROOT}/sfx/grab.mp3`, enabled: false },
  hover: { path: `${AUDIO_ROOT}/sfx/menu-hover.mp3`, enabled: false },
  click: { path: `${AUDIO_ROOT}/sfx/menu-click.mp3`, enabled: false }
};

export const MUSIC_MANIFEST = {
  auth: { path: `${AUDIO_ROOT}/music/authentication.mp3`, enabled: false },
  loading: { path: `${AUDIO_ROOT}/music/loading.mp3`, enabled: false },
  menu: { path: `${AUDIO_ROOT}/music/main-menu.mp3`, enabled: false },
  campaign: { path: `${AUDIO_ROOT}/music/campaign.mp3`, enabled: false },
  boss: { path: `${AUDIO_ROOT}/music/boss.mp3`, enabled: false },
  training: { path: `${AUDIO_ROOT}/music/training.mp3`, enabled: false },
  versus: { path: `${AUDIO_ROOT}/music/multiplayer.mp3`, enabled: false },
  extras: { path: `${AUDIO_ROOT}/music/extras.mp3`, enabled: false },
  victory: { path: `${AUDIO_ROOT}/music/victory.mp3`, enabled: false },
  defeat: { path: `${AUDIO_ROOT}/music/defeat.mp3`, enabled: false }
};

/** Loading-screen tips, themed per destination. */
export const LOADING_TIPS = [
  'Hold back to block. Lows must be blocked crouching.',
  'Gadget can only call each distraction ONCE per battle.',
  'Landing a hit lets you cancel into your special.',
  'Wrath builds meter faster than anyone — respect the flurry.',
  'Suffering has armour on its heavy starters. Whiff-punish instead of trading.',
  'Lust teleports behind you. Turn your guard around.',
  'School changes form as its health drops. Relearn the spacing each year.',
  'You can adjust screen shake and flash effects in Settings → Accessibility.',
  'Every problem you defeat becomes playable in Multiplayer.',
  'Training mode: the dummy never dies. Practise your longest combos there.',
  'Block an ultimate to reduce it to chip damage.',
  'Your meter fills when you attack — and when you get hit.'
];

export function tipForScene(sceneId) {
  const map = {
    battle: [1, 3, 4, 5, 6, 11],
    campaign: [8, 9],
    training: [9, 0, 2],
    versus: [8],
    intro: [7]
  };
  const pool = map[sceneId] || null;
  const index = pool ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * LOADING_TIPS.length);
  return LOADING_TIPS[index];
}
