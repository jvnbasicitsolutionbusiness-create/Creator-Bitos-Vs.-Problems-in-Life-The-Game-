/**
 * roster.js — every fighter in the game: identity, stats, stance, story.
 *
 * This is pure data. Combat reads it, the AI reads it, the menus read it and
 * the Extras database renders it. Adding a character means adding one entry
 * here plus its moveset in ./movesets.js — nothing else changes.
 */

export const CHARACTERS = {
  /* ------------------------------------------------------------------ 0 */
  'creator-bitos': {
    id: 'creator-bitos',
    name: 'CREATOR BITOS',
    short: 'BITOS',
    role: 'protagonist',
    color: '#ff2b3c',
    accent: '#ffd9dd',
    eyeStyle: 'angry',
    height: 152,
    lineWidth: 7.5,
    glow: 1.15,
    stats: {
      maxHp: 100,
      walkSpeed: 214,
      backSpeed: 168,
      jumpVelocity: 690,
      gravity: 2100,
      damageScale: 1.0,
      defense: 1.0,
      reach: 1.0,
      meterRate: 1.0,
      weight: 1.0
    },
    stance: { spine: 4, neck: -2, armF: [58, 78], armB: [34, 96], legF: [16, -14], legB: [-14, -10] },
    victoryStyle: 'default',
    introStyle: 'default',
    specialStyle: 'projectile',
    specialName: 'FOCUS BURST',
    ultimateName: 'UNBREAKABLE FOCUS',
    arena: 'rooftop',
    theme: 'Determination',
    blurb:
      'The one who keeps showing up. Creator Bitos has no supernatural gift — only the stubborn decision to stand back up one more time than the problem knocking him down.',
    playstyle: 'Balanced. Safe pokes, a reliable projectile, and a super that punishes panic.',
    tips: [
      'Light Punch into Heavy Punch is your fastest confirm.',
      'FOCUS BURST is safe from mid range — use it to stop a rushing problem.',
      'UNBREAKABLE FOCUS has armour on startup. Eat one hit to land it.'
    ],
    intro: [
      'Another day. Another list of things trying to stop me.',
      'I am not here to be perfect. I am here to keep going.'
    ],
    victoryLine: 'One down. The rest of you can wait your turn.',
    defeatLine: 'Not finished. Just... catching my breath.',
    unlockRequirement: null
  },

  /* ------------------------------------------------------------------ 1 */
  laziness: {
    id: 'laziness',
    name: 'LAZINESS',
    short: 'LAZINESS',
    role: 'boss',
    color: '#7b4bd6',
    accent: '#d9c9ff',
    eyeStyle: 'closed',
    height: 148,
    lineWidth: 7,
    glow: 0.9,
    stats: {
      maxHp: 96,
      walkSpeed: 132,
      backSpeed: 108,
      jumpVelocity: 600,
      gravity: 1950,
      damageScale: 0.94,
      defense: 0.95,
      reach: 0.95,
      meterRate: 0.85,
      weight: 1.05
    },
    stance: { spine: 13, neck: 10, armF: [22, 66], armB: [8, 78], legF: [10, -8], legB: [-10, -6], root: { y: -5 } },
    victoryStyle: 'slouch',
    introStyle: 'rise',
    specialStyle: 'grab',
    specialName: 'FIVE MORE MINUTES',
    ultimateName: 'THE BIG YAWN',
    arena: 'bedroom',
    theme: 'Stagnation',
    blurb:
      'Slow, soft-spoken and always reasonable. Laziness never shouts — it simply offers one more comfortable excuse, and then another, until the day is gone.',
    playstyle: 'Slow pressure with long limbs and a grab that drags you back into the fight.',
    tips: [
      'It wakes up fast when cornered — do not stand still next to it.',
      'FIVE MORE MINUTES grabs through blocks. Jump or backdash.',
      'Punish the long recovery after THE BIG YAWN.'
    ],
    intro: [
      'Why start today? Tomorrow is also a day.',
      'Just sit down. Nothing out there is going anywhere.'
    ],
    victoryLine: 'See? Resting was the correct answer.',
    defeatLine: 'Fine... fine. I am awake. I am awake.',
    unlockRequirement: 'Defeat LAZINESS in Campaign Round 1'
  },

  /* ------------------------------------------------------------------ 2 */
  gadget: {
    id: 'gadget',
    name: 'GADGET',
    short: 'GADGET',
    role: 'boss',
    color: '#22d3ee',
    accent: '#d7fbff',
    eyeStyle: 'visor',
    height: 150,
    lineWidth: 6.5,
    glow: 1.3,
    stats: {
      maxHp: 92,
      walkSpeed: 236,
      backSpeed: 198,
      jumpVelocity: 700,
      gravity: 2050,
      damageScale: 0.9,
      defense: 0.9,
      reach: 1.05,
      meterRate: 1.25,
      weight: 0.9
    },
    stance: { spine: 3, neck: -3, armF: [82, 42], armB: [18, 100], legF: [14, -12], legB: [-12, -8] },
    victoryStyle: 'tech',
    introStyle: 'materialise',
    specialStyle: 'summon',
    specialName: 'JUST ONE MORE THING',
    ultimateName: 'DOOMSCROLL OVERLOAD',
    arena: 'digital',
    theme: 'Distraction',
    blurb:
      'Gadget never runs out of notifications. It fights by flooding the arena with distractions, and it will happily send an army of them at you rather than face you alone.',
    playstyle: 'Summoner. Crowds the screen with minions, then strikes while you are busy.',
    tips: [
      'Every summoned distraction can only be summoned ONCE per match — clear it and Gadget loses it for good.',
      'Projectiles destroy minions in one hit.',
      'Gadget is fragile up close. Get in and stay in.'
    ],
    intro: [
      'Look at this. No wait — look at THIS.',
      'You will not even notice the hours going.'
    ],
    victoryLine: 'Refresh. Refresh. Refresh. Refresh.',
    defeatLine: 'Battery... low... must... charge...',
    unlockRequirement: 'Defeat GADGET in Campaign Round 2'
  },

  /* ------------------------------------------------------------------ 3 */
  addiction: {
    id: 'addiction',
    name: 'ADDICTION',
    short: 'ADDICTION',
    role: 'boss',
    color: '#1d4ed8',
    accent: '#a9c4ff',
    eyeStyle: 'hollow',
    height: 154,
    lineWidth: 7.5,
    glow: 1.0,
    stats: {
      maxHp: 108,
      walkSpeed: 186,
      backSpeed: 120,
      jumpVelocity: 660,
      gravity: 2150,
      damageScale: 1.05,
      defense: 1.1,
      reach: 1.02,
      meterRate: 1.15,
      weight: 1.1
    },
    stance: { spine: 17, neck: 6, armF: [50, 104], armB: [40, 110], legF: [20, -18], legB: [-18, -14] },
    victoryStyle: 'looming',
    introStyle: 'drift',
    specialStyle: 'dash',
    specialName: 'ONE MORE TIME',
    ultimateName: 'RELAPSE SPIRAL',
    arena: 'psych',
    theme: 'Compulsion',
    blurb:
      'Addiction does not need to win quickly. It only needs you to come back once more. It walks through damage, closes distance endlessly and never stops asking.',
    playstyle: 'Relentless rushdown with a command dash that ignores spacing.',
    tips: [
      'It does not retreat — use that. Walk it into your pokes.',
      'ONE MORE TIME has armour: block it, then punish the recovery.',
      'Keep your distance and it will eventually come to you anyway.'
    ],
    intro: [
      'You said last time was the last time.',
      'One more. That is all it ever takes.'
    ],
    victoryLine: 'You will be back. They always come back.',
    defeatLine: 'This is not... the end of me...',
    unlockRequirement: 'Defeat ADDICTION in Campaign Round 3'
  },

  /* ------------------------------------------------------------------ 4 */
  lust: {
    id: 'lust',
    name: 'LUST',
    short: 'LUST',
    role: 'boss',
    color: '#ff3dbe',
    accent: '#ffd6f2',
    eyeStyle: 'wide',
    height: 150,
    lineWidth: 6.5,
    glow: 1.2,
    stats: {
      maxHp: 88,
      walkSpeed: 258,
      backSpeed: 226,
      jumpVelocity: 740,
      gravity: 1950,
      damageScale: 0.88,
      defense: 0.85,
      reach: 1.0,
      meterRate: 1.35,
      weight: 0.85
    },
    stance: { spine: -4, neck: -2, armF: [72, 58], armB: [30, 92], legF: [24, -20], legB: [-20, -16] },
    victoryStyle: 'default',
    introStyle: 'materialise',
    specialStyle: 'teleport',
    specialName: 'LOOK OVER HERE',
    ultimateName: 'DISTRACTION FINALE',
    arena: 'neon',
    theme: 'Deception',
    blurb:
      'Lust fights like a rumour — always somewhere else than where you last saw it. It hits fast, leaves an after-image, and makes you swing at nothing.',
    playstyle: 'Hit-and-run. Teleports behind you and punishes committed attacks.',
    tips: [
      'It teleports BEHIND you — turn your block around.',
      'Do not throw slow heavies at nothing; it will punish the recovery.',
      'Sweep catches it out of its reappearance frames.'
    ],
    intro: [
      'Eyes up here. Or wherever you like.',
      'You were not even looking, were you?'
    ],
    victoryLine: 'You never saw the real me once.',
    defeatLine: 'Attention... span... fading...',
    unlockRequirement: 'Defeat LUST in Campaign Round 4'
  },

  /* ------------------------------------------------------------------ 5 */
  society: {
    id: 'society',
    name: 'SOCIETY',
    short: 'SOCIETY',
    role: 'boss',
    color: '#9aa0a6',
    accent: '#e6e9ec',
    eyeStyle: 'hollow',
    height: 166,
    lineWidth: 8,
    glow: 0.8,
    stats: {
      maxHp: 118,
      walkSpeed: 172,
      backSpeed: 150,
      jumpVelocity: 640,
      gravity: 2200,
      damageScale: 1.08,
      defense: 1.2,
      reach: 1.12,
      meterRate: 1.0,
      weight: 1.2
    },
    stance: { spine: -3, neck: -1, armF: [40, 112], armB: [58, 96], legF: [14, -12], legB: [-12, -10] },
    victoryStyle: 'looming',
    introStyle: 'march',
    specialStyle: 'shockwave',
    specialName: 'EXPECTATIONS',
    ultimateName: 'JUDGEMENT OF THE CROWD',
    arena: 'city',
    theme: 'Pressure',
    blurb:
      'Society is not one voice. It is thousands talking at once, all of them certain, none of them agreeing. It wins by weight of numbers and the sheer pressure of being watched.',
    playstyle: 'Long reach, heavy damage, ground shockwaves that control space.',
    tips: [
      'Its normals are long — whiff punishment is your best tool.',
      'EXPECTATIONS is a low shockwave. Jump it, do not block it low.',
      'Stay out of the corner; Society does its best work there.'
    ],
    intro: [
      'Everyone is looking. Do not embarrass yourself.',
      'You are behind. You have always been behind.'
    ],
    victoryLine: 'Disappointing. But predictable.',
    defeatLine: 'They... are still watching...',
    unlockRequirement: 'Defeat SOCIETY in Campaign Round 5'
  },

  /* ------------------------------------------------------------------ 6 */
  suicide: {
    id: 'suicide',
    name: 'SUICIDE',
    short: 'SUICIDE',
    role: 'boss',
    color: '#2a1633',
    accent: '#b98fd8',
    eyeStyle: 'closed',
    height: 150,
    lineWidth: 7,
    glow: 0.7,
    stats: {
      maxHp: 104,
      walkSpeed: 168,
      backSpeed: 140,
      jumpVelocity: 650,
      gravity: 2000,
      damageScale: 1.0,
      defense: 1.0,
      reach: 1.0,
      meterRate: 1.1,
      weight: 1.0
    },
    stance: { spine: 19, neck: 16, armF: [12, 26], armB: [8, 30], legF: [12, -10], legB: [-10, -8], root: { y: -4 } },
    victoryStyle: 'kneel',
    introStyle: 'drift',
    specialStyle: 'aura',
    specialName: 'THE QUIET ROOM',
    ultimateName: 'STAY — PLEASE STAY',
    arena: 'crisis',
    theme: 'The crisis',
    serious: true,
    blurb:
      'Handled as a crisis, never as a spectacle. This encounter is not about destroying an enemy — it is about holding on long enough to reach for help, and about staying until morning.',
    playstyle: 'Defensive and draining. Wins by attrition unless you keep moving forward.',
    tips: [
      'This fight rewards patience, not aggression. Block, breathe, advance.',
      'THE QUIET ROOM drains your meter — keep attacking to refill it.',
      'When STAY — PLEASE STAY lands, mash nothing: hold block and wait it out.'
    ],
    contentNote:
      'This round is presented as overcoming a crisis, not as self-harm. If you are struggling, please talk to someone you trust or contact a local crisis line. You deserve support, and it is out there.',
    intro: [
      'It would be easier if nobody noticed.',
      'You do not have to carry this by yourself.'
    ],
    victoryLine: 'You stayed. That was the whole fight.',
    defeatLine: '...',
    unlockRequirement: 'Defeat SUICIDE in Campaign Round 6'
  },

  /* ------------------------------------------------------------------ 7 */
  suffering: {
    id: 'suffering',
    name: 'SUFFERING',
    short: 'SUFFERING',
    role: 'boss',
    color: '#8b1a1a',
    accent: '#ffb3a7',
    eyeStyle: 'angry',
    height: 174,
    lineWidth: 9.5,
    glow: 0.85,
    stats: {
      maxHp: 132,
      walkSpeed: 146,
      backSpeed: 118,
      jumpVelocity: 610,
      gravity: 2300,
      damageScale: 1.22,
      defense: 1.3,
      reach: 1.08,
      meterRate: 0.95,
      weight: 1.35
    },
    stance: { spine: 7, neck: 0, armF: [46, 70], armB: [30, 88], legF: [32, -22], legB: [-28, -18] },
    victoryStyle: 'looming',
    introStyle: 'march',
    specialStyle: 'shockwave',
    specialName: 'HEAVY HOURS',
    ultimateName: 'THE LONG NIGHT',
    arena: 'ruin',
    theme: 'Endurance',
    blurb:
      'Suffering is not fast and it is not clever. It is simply still there. It absorbs everything you have and then keeps standing, waiting to see how much more you can give.',
    playstyle: 'Tank. Trades favourably, hits like a truck, punishes impatience.',
    tips: [
      'It has armour on most heavy starters — do not trade, whiff punish.',
      'Chip damage adds up: keep blocking and it will out-damage you.',
      'Its super is slow. If you see the windup, you have time to jump away.'
    ],
    intro: [
      'Everyone breaks eventually. Let us find out where you do.',
      'Pain is honest. It never pretends to be anything else.'
    ],
    victoryLine: 'You lasted longer than most.',
    defeatLine: 'Even this... passes.',
    unlockRequirement: 'Defeat SUFFERING in Campaign Round 7'
  },

  /* ------------------------------------------------------------------ 8 */
  wrath: {
    id: 'wrath',
    name: 'WRATH',
    short: 'WRATH',
    role: 'boss',
    color: '#ff7a18',
    accent: '#ffe0bd',
    eyeStyle: 'angry',
    height: 154,
    lineWidth: 8,
    glow: 1.35,
    stats: {
      maxHp: 90,
      walkSpeed: 268,
      backSpeed: 210,
      jumpVelocity: 730,
      gravity: 2100,
      damageScale: 1.12,
      defense: 0.8,
      reach: 0.98,
      meterRate: 1.45,
      weight: 0.92
    },
    stance: { spine: 18, lean: 8, neck: -4, armF: [66, 86], armB: [50, 98], legF: [34, -42], legB: [-30, -36] },
    victoryStyle: 'crouch',
    introStyle: 'rise',
    specialStyle: 'barrage',
    specialName: 'SHORT FUSE',
    ultimateName: 'EVERYTHING, ALL AT ONCE',
    arena: 'inferno',
    theme: 'Anger',
    blurb:
      'Wrath is the fastest problem in the game and the angriest. It opens with a flurry, keeps swinging through your guard, and dares you to keep your temper while it loses its own.',
    playstyle: 'Explosive rushdown with multi-hit flurries and the highest meter gain.',
    tips: [
      'Block the flurry, then punish the last hit — it is very unsafe.',
      'It builds meter faster than anyone. Expect frequent supers.',
      'Staying calm works: Wrath kills itself on your guard.'
    ],
    intro: [
      'Say it again. I dare you. SAY IT AGAIN.',
      'I am not angry. I am DONE.'
    ],
    victoryLine: 'Was that supposed to hurt?',
    defeatLine: 'Burned... out...',
    unlockRequirement: 'Defeat WRATH in Campaign Round 8'
  },

  /* ------------------------------------------------------------------ 9 */
  school: {
    id: 'school',
    name: 'SCHOOL',
    short: 'SCHOOL',
    role: 'boss',
    color: '#f5c518',
    accent: '#fff3bd',
    eyeStyle: 'wide',
    height: 158,
    lineWidth: 7.5,
    glow: 1.05,
    stats: {
      maxHp: 100,
      walkSpeed: 198,
      backSpeed: 172,
      jumpVelocity: 680,
      gravity: 2100,
      damageScale: 1.0,
      defense: 1.05,
      reach: 1.05,
      meterRate: 1.1,
      weight: 1.05
    },
    stance: { spine: 0, neck: -1, armF: [36, 92], armB: [28, 100], legF: [12, -10], legB: [-12, -8] },
    victoryStyle: 'stretch',
    introStyle: 'march',
    specialStyle: 'projectile',
    specialName: 'DEADLINE',
    ultimateName: 'FINALS WEEK',
    arena: 'campus',
    theme: 'Pressure of time',
    blurb:
      'Four years, four forms. School grows every time you survive it, and the version that meets you in fourth year has learned every trick you used on the first three.',
    playstyle: 'Four-phase zoner. Each year adds speed, reach and new pressure tools.',
    tips: [
      'Phase changes heal nothing but add moves — do not relax between forms.',
      'DEADLINE travels slowly: walk under it and take the space.',
      'FINALS WEEK covers the whole screen. Block low, then punish.'
    ],
    phases: [
      { name: 'FIRST YEAR COLLEGE', hp: 100, damageScale: 0.92, speed: 0.96, moves: ['deadline'] },
      { name: 'SECOND YEAR COLLEGE', hp: 110, damageScale: 1.0, speed: 1.03, moves: ['deadline', 'popquiz'] },
      { name: 'THIRD YEAR COLLEGE', hp: 120, damageScale: 1.08, speed: 1.1, moves: ['deadline', 'popquiz', 'thesis'] },
      { name: 'FOURTH YEAR COLLEGE', hp: 132, damageScale: 1.18, speed: 1.18, moves: ['deadline', 'popquiz', 'thesis', 'graduation'] }
    ],
    intro: [
      'Year one. Everyone smiles. Nobody sleeps.',
      'You wanted this. Remember that when it gets hard.'
    ],
    victoryLine: 'Submit your work. The deadline does not move.',
    defeatLine: 'Class... dismissed...',
    unlockRequirement: 'Defeat all four forms of SCHOOL in Campaign Round 9'
  },

  /* ------------------------------------------------------------------ 10 */
  seizure: {
    id: 'seizure',
    name: 'SEIZURE',
    short: 'SEIZURE',
    role: 'final-boss',
    color: '#f2f2f7',
    accent: '#c9a6ff',
    eyeStyle: 'wide',
    height: 170,
    lineWidth: 8.5,
    glow: 1.5,
    stats: {
      maxHp: 116,
      walkSpeed: 232,
      backSpeed: 200,
      jumpVelocity: 720,
      gravity: 2050,
      damageScale: 1.12,
      defense: 1.05,
      reach: 1.1,
      meterRate: 1.3,
      weight: 1.05
    },
    stance: { spine: 6, neck: -2, armF: [72, 52], armB: [40, 84], legF: [26, -26], legB: [-24, -20] },
    victoryStyle: 'kneel',
    introStyle: 'materialise',
    specialStyle: 'teleport',
    specialName: 'SIGNAL LOST',
    ultimateName: 'THE UNSTABLE HOUR',
    arena: 'unstable',
    theme: 'The uncontrollable',
    serious: true,
    blurb:
      'The final challenge is presented as a fictional, symbolic storm — not as a medical event. Nothing here can be "cured by winning". It is the part of life that arrives without permission, and the fight is about staying standing until it passes.',
    playstyle: 'Multi-phase final boss. Unstable movement, screen-wide pressure, three distinct phases.',
    tips: [
      'Phase 2 and 3 add new movement — relearn the spacing each time.',
      'SIGNAL LOST leaves an after-image where it started. Hit the real one.',
      'The arena distortion is cosmetic. Watch the fighter, not the background.'
    ],
    contentNote:
      'This finale deliberately avoids rapid flashing imagery. The instability is conveyed through motion, colour transitions and audio, and can be further reduced in Settings → Accessibility.',
    intro: [
      'This one does not ask permission. It never did.',
      'You cannot win this by force. You win it by still being here.'
    ],
    victoryLine: 'It passed. You are still here.',
    defeatLine: '...it passes. It always passes.',
    unlockRequirement: 'Defeat SEIZURE in Campaign Round 10'
  }
};

/** The order of the campaign. Index 0 is Round 1. */
export const CAMPAIGN_ROUNDS = [
  'laziness',
  'gadget',
  'addiction',
  'lust',
  'society',
  'suicide',
  'suffering',
  'wrath',
  'school',
  'seizure'
];

export const ROSTER_ORDER = ['creator-bitos', ...CAMPAIGN_ROUNDS];

/** Minions Gadget summons. Each type may only be summoned once per match. */
export const SUMMONS = {
  'social-media': {
    id: 'social-media',
    name: 'SOCIAL MEDIA',
    color: '#38bdf8',
    hp: 26,
    speed: 168,
    damage: 4,
    height: 92,
    attack: 'Compare yourself to everyone.'
  },
  'adult-content': {
    id: 'adult-content',
    name: 'ADULT CONTENT',
    color: '#f472b6',
    hp: 22,
    speed: 196,
    damage: 6,
    height: 94,
    attack: 'Promises something it never delivers.'
  },
  gaming: {
    id: 'gaming',
    name: 'GAMING',
    color: '#a3e635',
    hp: 34,
    speed: 148,
    damage: 5,
    height: 96,
    attack: 'One more match. Forever.'
  },
  gambling: {
    id: 'gambling',
    name: 'GAMBLING',
    color: '#fbbf24',
    hp: 28,
    speed: 178,
    damage: 8,
    height: 94,
    attack: 'Almost. Almost. Almost.'
  },
  'endless-scrolling': {
    id: 'endless-scrolling',
    name: 'ENDLESS SCROLLING',
    color: '#c084fc',
    hp: 24,
    speed: 210,
    damage: 3,
    height: 88,
    attack: 'There is no bottom. That is the point.'
  },
  notifications: {
    id: 'notifications',
    name: 'NOTIFICATIONS',
    color: '#fb7185',
    hp: 18,
    speed: 232,
    damage: 3,
    height: 84,
    attack: 'Urgent! Probably not urgent.'
  }
};

export const SUMMON_ORDER = [
  'social-media',
  'adult-content',
  'gaming',
  'gambling',
  'endless-scrolling',
  'notifications'
];

export const TRAINING_DUMMY = {
  id: 'training-dummy',
  name: 'TRAINING DUMMY',
  short: 'DUMMY',
  color: '#8b7355',
  accent: '#d9c7a8',
  eyeStyle: 'closed',
  height: 152,
  lineWidth: 7,
  glow: 0.4,
  stats: {
    maxHp: 100000,
    walkSpeed: 0,
    backSpeed: 0,
    jumpVelocity: 0,
    gravity: 2100,
    damageScale: 0,
    defense: 1,
    reach: 1,
    meterRate: 0,
    weight: 2
  },
  stance: { spine: 2, armF: [40, 70], armB: [26, 80], legF: [12, -10], legB: [-12, -8] },
  victoryStyle: 'default',
  introStyle: 'default',
  specialStyle: 'projectile',
  specialName: '—',
  ultimateName: '—',
  arena: 'dojo',
  blurb: 'It has all the time in the world and no intention of using it.',
  intro: ['...'],
  victoryLine: '...',
  defeatLine: '...'
};

export function getCharacter(id) {
  return CHARACTERS[id] || TRAINING_DUMMY;
}

export function characterName(id) {
  return (CHARACTERS[id] || TRAINING_DUMMY).name;
}

export function roundNumberOf(enemyId) {
  const idx = CAMPAIGN_ROUNDS.indexOf(enemyId);
  return idx === -1 ? null : idx + 1;
}

export function isFinalRound(enemyId) {
  return CAMPAIGN_ROUNDS.indexOf(enemyId) === CAMPAIGN_ROUNDS.length - 1;
}

export function roundTitle(roundNumber) {
  if (roundNumber >= CAMPAIGN_ROUNDS.length) return 'FINAL ROUND';
  return `ROUND ${roundNumber}`;
}
