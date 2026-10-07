/**
 * smoketest.js — headless validation of the combat engine.
 *
 * Runs AI vs AI matches for every round of the campaign without a browser and
 * asserts that the simulation is doing real work: damage is dealt, hitboxes
 * connect, rounds resolve, phases fire, and nothing throws.
 *
 * Usage: node tools/smoketest.js
 */
import './seed-random.js'; // deterministic runs (must be first)
import { Match, MATCH_PHASE } from '../public/src/combat/match.js';
import { AIController } from '../public/src/ai/ai-controller.js';
import { CAMPAIGN_ROUNDS } from '../public/src/characters/roster.js';
import { difficultyFor, scaleDifficultyForRound } from '../public/src/config/difficulty.js';

const FIXED_DT = 1 / 60;
let failures = 0;
let checks = 0;

/** Advance past the entrance cinematic (fighters are invulnerable during it). */
function settle(match) {
  for (let f = 0; f < 80; f += 1) match.update(FIXED_DT, [{}, {}]);
}

function check(label, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label} ${detail}`);
  }
}

function simulate(enemyId, roundNumber, { frames = 60 * 90, difficulty = 'normal', p1Difficulty = null } = {}) {
  const match = new Match({
    mode: 'campaign',
    p1Id: 'creator-bitos',
    p2Id: enemyId,
    difficultyId: difficulty,
    roundNumber,
    totalRounds: CAMPAIGN_ROUNDS.length
  });
  const ai1 = new AIController({
    fighter: match.p1,
    opponent: match.p2,
    // A fixed reference opponent makes difficulty comparisons meaningful.
    difficulty: scaleDifficultyForRound(difficultyFor(p1Difficulty || difficulty), roundNumber, CAMPAIGN_ROUNDS.length)
  });
  const ai2 = new AIController({
    fighter: match.p2,
    opponent: match.p1,
    difficulty: scaleDifficultyForRound(difficultyFor(difficulty), roundNumber, CAMPAIGN_ROUNDS.length),
    roundNumber
  });
  match.controllers = [ai1, ai2];
  match.startRound();

  let maxCombo = 0;
  let phaseChanges = 0;
  let summons = 0;
  let hittable = 0;
  match.onEvent = (e) => {
    if (e.type === 'hit') hittable += 1;
    if (e.type === 'phaseChange') phaseChanges += 1;
    if (e.type === 'summon') summons += 1;
  };

  for (let f = 0; f < frames; f += 1) {
    const intents = [ai1.update(FIXED_DT), ai2.update(FIXED_DT)];
    match.update(FIXED_DT, intents);
    maxCombo = Math.max(maxCombo, match.combos[0], match.combos[1]);
    if (match.phase === MATCH_PHASE.MATCH_END) break;
  }

  return {
    match,
    maxCombo,
    phaseChanges,
    summons,
    hits: hittable,
    p1Hits: match.hits[0],
    p2Hits: match.hits[1],
    p1Damage: match.totalDamage[0],
    p2Damage: match.totalDamage[1]
  };
}

console.log('===============================================================');
console.log('  CREATOR BITOS — combat engine smoke test');
console.log('===============================================================');

/* ---------------------------------------------------------------- basics */
{
  console.log('\n[1] Fighter construction & frame data');
  const { Match: M } = { Match };
  const m = new M({ p1Id: 'creator-bitos', p2Id: 'laziness' });
  check('p1 has full HP', m.p1.hp === m.p1.maxHp, `hp=${m.p1.hp}`);
  check('p2 has full HP', m.p2.hp === m.p2.maxHp, `hp=${m.p2.hp}`);
  check('moveset loaded', Object.keys(m.p1.moveset).length >= 10, `${Object.keys(m.p1.moveset).length} moves`);
  const lp = m.p1.moveset.lightPunch;
  check('light punch has startup/active/recovery', lp.startup > 0 && lp.active > 0 && lp.recovery > 0);
  check('hitbox is defined', lp.hitbox.w > 0 && lp.hitbox.h > 0);
}

/* --------------------------------------------------------------- damage */
{
  console.log('\n[2] Hitbox resolution');
  const m = new Match({ p1Id: 'creator-bitos', p2Id: 'suffering' });
  m.startRound();
  m.phase = MATCH_PHASE.FIGHT;
  settle(m); // let the entrance animation and its invulnerability finish
  m.p1.x = 500;
  m.p2.x = 570; // point-blank
  const before = m.p2.hp;
  m.p1.startMove('heavyPunch');
  for (let f = 0; f < 30; f += 1) {
    m.update(FIXED_DT, [{}, {}]);
  }
  check('heavy punch connects and deals damage', m.p2.hp < before, `${before} -> ${m.p2.hp}`);
  check('attacker gained meter', m.p1.meter > 0, `meter=${m.p1.meter}`);
}

/* --------------------------------------------------------------- block */
{
  console.log('\n[3] Blocking');
  const m = new Match({ p1Id: 'creator-bitos', p2Id: 'wrath' });
  m.startRound();
  m.phase = MATCH_PHASE.FIGHT;
  settle(m);
  m.p1.x = 500;
  m.p2.x = 570;
  const before = m.p2.hp;
  m.p1.startMove('heavyPunch');
  for (let f = 0; f < 30; f += 1) {
    m.update(FIXED_DT, [{}, { block: true }]);
  }
  check('blocking prevents most damage', m.p2.hp > before - 5, `${before} -> ${m.p2.hp}`);
  check('chip damage still applies', m.p2.hp < before, `${m.p2.hp}`);
}

/* ---------------------------------------------------------- projectile */
{
  console.log('\n[4] Projectiles');
  const m = new Match({ p1Id: 'creator-bitos', p2Id: 'society' });
  m.startRound();
  m.phase = MATCH_PHASE.FIGHT;
  settle(m);
  m.p1.meter = 100; // specials cost meter by design
  m.p1.startMove('special');
  for (let f = 0; f < 20; f += 1) m.update(FIXED_DT, [{}, {}]);
  check('projectile spawned', m.projectiles.length > 0, `${m.projectiles.length}`);
  const before = m.p2.hp;
  for (let f = 0; f < 90; f += 1) m.update(FIXED_DT, [{}, {}]);
  check('projectile travelled and hit', m.p2.hp < before, `${before} -> ${m.p2.hp}`);
}

/* -------------------------------------------------------------- summon */
{
  console.log('\n[5] Gadget summons (once per type)');
  const m = new Match({ p1Id: 'gadget', p2Id: 'creator-bitos' });
  m.startRound();
  m.phase = MATCH_PHASE.FIGHT;
  settle(m);
  for (let i = 0; i < 8; i += 1) {
    m.p1.meter = 100;
    m.p1.startMove('special');
    for (let f = 0; f < 70; f += 1) m.update(FIXED_DT, [{}, {}]);
  }
  const remaining = 6 - m.p1.summonedTypes.size;
  check('summon types are consumed', m.p1.summonedTypes.size > 0, `spent=${m.p1.summonedTypes.size}`);
  check('at most six types exist', m.p1.summonedTypes.size <= 6, `spent=${m.p1.summonedTypes.size}`);
  // Exhaust everything, then confirm no more can be summoned.
  for (let i = 0; i < 12; i += 1) {
    m.p1.meter = 100;
    m.p1.startMove('special');
    for (let f = 0; f < 70; f += 1) m.update(FIXED_DT, [{}, {}]);
  }
  check('all six types eventually spent', m.p1.summonedTypes.size === 6, `spent=${m.p1.summonedTypes.size} remaining=${remaining}`);
  const minionsBefore = m.minions.length;
  m.p1.meter = 100;
  m.p1.startMove('special');
  for (let f = 0; f < 70; f += 1) m.update(FIXED_DT, [{}, {}]);
  check('no new minion after exhaustion', m.minions.length <= minionsBefore);
}

/* ------------------------------------------------------ full campaign */
{
  console.log('\n[6] AI vs AI across all ten rounds');
  for (let i = 0; i < CAMPAIGN_ROUNDS.length; i += 1) {
    const enemy = CAMPAIGN_ROUNDS[i];
    let r;
    try {
      r = simulate(enemy, i + 1, { frames: 60 * 120 });
    } catch (err) {
      failures += 1;
      console.error(`  ✗ round ${i + 1} (${enemy}) threw: ${err.stack}`);
      continue;
    }
    const m = r.match;
    const damageDone = m.totalDamage[0] + m.totalDamage[1];
    check(
      `round ${i + 1} ${enemy}: combat occurred (${r.hits} hits, ${Math.round(damageDone)} dmg, combo x${r.maxCombo})`,
      r.hits > 5 && damageDone > 20
    );

  }
}

/* -------------------------------------------------------- boss phases */
{
  console.log('\n[7] Boss phase transitions');

  // SCHOOL — four years.
  {
    const m = new Match({ p1Id: 'creator-bitos', p2Id: 'school', roundNumber: 9 });
    m.startRound();
    m.phase = MATCH_PHASE.FIGHT;
    settle(m);
    const names = [];
    m.onEvent = (e) => {
      if (e.type === 'phaseChange') names.push(e.name);
    };
    for (const hp of [0.7, 0.45, 0.2]) {
      m.p2.hp = m.p2.maxHp * hp;
      for (let f = 0; f < 5; f += 1) m.update(FIXED_DT, [{}, {}]);
    }
    check('school advances through all four years', m.bossPhaseIndex === 3 && names.length === 3, `names=${names.join(' / ')}`);
    check('school damage scales up per year', m.p2.damageScale > 1, `scale=${m.p2.damageScale.toFixed(2)}`);
  }

  // SEIZURE — three phases.
  {
    const m = new Match({ p1Id: 'creator-bitos', p2Id: 'seizure', roundNumber: 10 });
    m.startRound();
    m.phase = MATCH_PHASE.FIGHT;
    settle(m);
    for (const hp of [0.6, 0.25]) {
      m.p2.hp = m.p2.maxHp * hp;
      for (let f = 0; f < 5; f += 1) m.update(FIXED_DT, [{}, {}]);
    }
    check('seizure advances through phases', m.seizurePhaseIndex === 2, `phase=${m.seizurePhaseIndex}`);
  }
}

/* --------------------------------------------------------- difficulty */
{
  console.log('\n[7] Difficulty changes AI sharpness');
  // Average several trials: a single AI-vs-AI match is noisy by design.
  // Player 1 is always a fixed NORMAL opponent; only the enemy's difficulty moves.
  // Raw hit counts swing a lot in AI-vs-AI (blocking turns exchanges into
  // block stun), so the stable signal is the enemy's SHARE of the hits that
  // actually land, averaged over many matches.
  const trial = (difficulty) => {
    let hits = 0;
    let taken = 0;
    let damage = 0;
    let score = 0;
    const trials = 30;
    for (let i = 0; i < trials; i += 1) {
      const r = simulate('wrath', 5, { difficulty, p1Difficulty: 'normal', frames: 60 * 60 });
      hits += r.p2Hits;
      taken += r.p1Hits;
      damage += r.p2Damage;
      const m = r.match;
      // Win margin: rounds won plus the health difference left on the board.
      score += (m.p2Wins - m.p1Wins) + (m.p2.hpRatio - m.p1.hpRatio);
    }
    return {
      hits: hits / trials,
      damage: damage / trials,
      score: score / trials,
      share: hits / Math.max(1, hits + taken)
    };
  };
  const easy = trial('easy');
  const normal = trial('normal');
  const hard = trial('hard');
  const brutal = trial('veryHard');
  check(
    'harder enemy deals more damage on an identical opponent',
    brutal.damage > easy.damage * 1.05,
    `easy=${easy.damage.toFixed(0)} normal=${normal.damage.toFixed(0)} hard=${hard.damage.toFixed(0)} veryHard=${brutal.damage.toFixed(0)}`
  );
  const shares = [easy.share, normal.share, hard.share, brutal.share];
  const trendsUp = shares.every((v, i) => i === 0 || v > shares[i - 1] - 0.03);
  check(
    "enemy's share of the exchange rises with difficulty",
    trendsUp && brutal.share > easy.share + 0.06,
    shares.map((v) => v.toFixed(3)).join(' -> ')
  );
  check(
    'harder enemy ends the match in a better position',
    brutal.score > easy.score,
    `easy=${easy.score.toFixed(2)} normal=${normal.score.toFixed(2)} hard=${hard.score.toFixed(2)} veryHard=${brutal.score.toFixed(2)}`
  );
}

/* ------------------------------------------------------------ summons */
{
  console.log('\n[8] Gadget summons (deterministic)');
  const { MATCH_PHASE } = await import('../public/src/combat/match.js');
  const m = new Match({ mode: 'campaign', p1Id: 'creator-bitos', p2Id: 'gadget', difficultyId: 'normal', roundNumber: 2, totalRounds: CAMPAIGN_ROUNDS.length });
  m.controllers = [new AIController({ fighter: m.p1, opponent: m.p2, difficulty: difficultyFor('normal'), idle: true }),
    new AIController({ fighter: m.p2, opponent: m.p1, difficulty: difficultyFor('normal'), idle: true })].map((c) => { c.idle = true; return c; });
  m.startRound();
  m.phase = MATCH_PHASE.FIGHT;

  const gadget = m.fighters[1];
  let summonEvents = 0;
  m.onEvent = (e) => { if (e.type === 'summon') summonEvents += 1; };

  // Drive the special directly instead of hoping the AI picks it.
  gadget.meter = 100;
  const started = gadget.startMove('special');
  check('gadget can start its special with meter', started === true);
  for (let f = 0; f < 90; f += 1) m.update(FIXED_DT, [{}, {}]);
  check('special spawns a distraction', m.minions.length > 0, `minions=${m.minions.length}`);
  check('summon event fired', summonEvents > 0, `events=${summonEvents}`);
  const firstType = m.minions[0]?.type;

  // Each distraction type can only be called once per battle.
  const before = m.minions.length;
  for (let n = 0; n < 3; n += 1) {
    gadget.meter = 100;
    gadget.currentMove = null;
    gadget.startMove('special');
    for (let f = 0; f < 90; f += 1) m.update(FIXED_DT, [{}, {}]);
  }
  const types = new Set(m.minions.map((x) => x.type));
  check('the same distraction is never called twice', types.size === m.minions.length,
    `${m.minions.length} minions, ${types.size} distinct types`);
  check('repeated specials keep summoning new types', m.minions.length > before,
    `${before} -> ${m.minions.length}`);

  // The ultimate calls everything that is left.
  gadget.meter = 100;
  gadget.currentMove = null;
  gadget.startMove('ultimate');
  for (let f = 0; f < 140; f += 1) m.update(FIXED_DT, [{}, {}]);
  check('ultimate floods the stage with the rest', m.minions.length >= 3, `minions=${m.minions.length}`);

  // Minions are real: they have health, positions on stage and expire.
  const minion = m.minions[0];
  check('minions have health and stand on the stage',
    minion.hp > 0 && minion.x >= 0 && minion.x <= 1280 && Number.isFinite(minion.x),
    `hp=${minion.hp} x=${minion.x}`);
  const before2 = m.minions.length;
  for (let f = 0; f < 60 * 12; f += 1) m.update(FIXED_DT, [{}, {}]);
  check('minions leave the stage over time', m.minions.length < before2 || m.minions.every((x) => !x.alive),
    `${before2} -> ${m.minions.length}`);
  void firstType;
}

/* --------------------------------------------------------- rig sanity */
{
  console.log('\n[9] Character rig proportions');
  const { NEUTRAL_POSE, clonePose, addPose, solvePosePlanted, hurtboxFor } = await import('../public/src/animation/skeleton.js');
  const { ROSTER_ORDER, getCharacter } = await import('../public/src/characters/roster.js');

  // Every animation clip, at several points in time, must keep the figure
  // planted near the ground (a pose that solves far off the ground means the
  // fighter teleports out of frame when that clip plays).
  const { CLIPS } = await import('../public/src/animation/clips.js');
  const clipIds = Object.keys(CLIPS || {});
  let clipFails = 0;
  const worst = [];
  for (const clipId of clipIds) {
    for (const phase of [0, 0.25, 0.5, 0.75, 0.99]) {
      const delta = CLIPS[clipId]({
        t: phase * 2, p: phase, dur: 0.5, rng: 1.7, guard: 1, speed: 1, severity: 1, high: true
      }) || {};
      const pose = addPose(clonePose(NEUTRAL_POSE), delta, 1);
      const solved = solvePosePlanted(pose, 152);
      const lowest = Math.min(solved.footF.y, solved.footB.y);
      const top = solved.head.y + solved.headRadius;
      // Crouching clips (dash, sweep) legitimately drop to ~55% height, so the
      // band is generous — it only has to catch "teleported off the ground".
      // Knockdown/getup/defeat intentionally topple the body backwards, so the
      // head can sit below the chest — only standing clips must stack upward.
      const toppling = ['knockdown', 'getup', 'defeat'].includes(clipId);
      const upright = toppling || (solved.head.y > solved.chest.y && solved.chest.y > solved.pelvis.y);
      if (!(lowest > -3 && lowest < 46 && top > 55 && top < 250 && upright && Number.isFinite(top))) {
        clipFails += 1;
        worst.push(`${clipId}@${phase}: feet=${lowest.toFixed(1)} head=${top.toFixed(1)}`);
      }
    }
  }
  check(`all ${clipIds.length} animation clips stay planted`, clipFails === 0, worst.slice(0, 4).join(' | '));

  for (const id of ROSTER_ORDER) {
    const def = getCharacter(id);
    const pose = addPose(clonePose(NEUTRAL_POSE), def.stance || {}, 1);
    // addPose is additive, so apply the character stance directly instead.
    const stance = clonePose(NEUTRAL_POSE);
    for (const key of Object.keys(def.stance || {})) {
      if (key === 'root' || key === 'head') stance[key] = { ...stance[key], ...def.stance[key] };
      else stance[key] = def.stance[key];
    }
    const solved = solvePosePlanted(stance, def.height);
    const feetOnGround = Math.min(solved.footF.y, solved.footB.y) > -1.5 && Math.min(solved.footF.y, solved.footB.y) < 1.5;
    const headHeight = solved.head.y + solved.headRadius;
    const hb = hurtboxFor(solved, def.height);
    const ok =
      feetOnGround &&
      solved.head.y > solved.chest.y && solved.chest.y > solved.pelvis.y &&
      headHeight > def.height * 0.8 && headHeight < def.height * 1.15 &&
      hb.h > def.height * 0.75 && hb.h < def.height * 1.15;
    check(
      `${id}: rig proportions (h=${def.height}, head at ${headHeight.toFixed(0)}px, hurtbox ${hb.w.toFixed(0)}x${hb.h.toFixed(0)})`,
      ok,
      `feet=${Math.min(solved.footF.y, solved.footB.y).toFixed(2)} head=${solved.head.y.toFixed(0)} chest=${solved.chest.y.toFixed(0)} pelvis=${solved.pelvis.y.toFixed(0)}`
    );
    void pose;
  }
}

/* ------------------------------------------------------------ results */
console.log('\n===============================================================');
console.log(`  ${checks - failures}/${checks} checks passed`);
console.log('===============================================================');
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('Combat engine OK.');
