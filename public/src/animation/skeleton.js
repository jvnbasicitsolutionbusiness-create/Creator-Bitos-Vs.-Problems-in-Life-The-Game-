/**
 * skeleton.js — forward-kinematic stickman rig.
 *
 * Every stickman is driven by a named pose (joint angles in degrees) and
 * solved into screen-space joints each frame. Poses are plain data, so:
 *   • procedural clips can blend into them (animation/clips.js)
 *   • a future sprite sheet can replace the whole renderer without touching
 *     combat code (animation/spritesheet.js)
 *
 * Angle convention (facing space, +x = the direction the fighter faces,
 * +y = up):
 *   0deg   -> limb points straight down
 *   +90deg -> limb points forward
 *   -90deg -> limb points backward
 */

export const DEG = Math.PI / 180;

/** Proportions as a fraction of total height. */
export const PROPORTIONS = {
  headRadius: 0.072,
  neck: 0.185, // chest -> neck
  torso: 0.205, // pelvis -> chest
  upperArm: 0.155,
  foreArm: 0.15,
  thigh: 0.235,
  shin: 0.235,
  shoulderWidth: 0.075,
  hipWidth: 0.06
};

/** A neutral, guard-ready fighting stance. */
export const NEUTRAL_POSE = {
  root: { x: 0, y: 0 },
  lean: 0,
  spine: 4,
  neck: -2,
  head: { x: 0, y: 0 },
  armF: [58, 78], // front arm: up and bent (guard)
  armB: [34, 96], // back arm: tighter guard
  legF: [16, -14],
  legB: [-14, -10],
  squash: 1,
  headScale: 1
};

export function clonePose(pose) {
  return {
    root: { x: pose.root?.x ?? 0, y: pose.root?.y ?? 0 },
    lean: pose.lean ?? 0,
    spine: pose.spine ?? 0,
    neck: pose.neck ?? 0,
    head: { x: pose.head?.x ?? 0, y: pose.head?.y ?? 0 },
    armF: [pose.armF?.[0] ?? 0, pose.armF?.[1] ?? 0],
    armB: [pose.armB?.[0] ?? 0, pose.armB?.[1] ?? 0],
    legF: [pose.legF?.[0] ?? 0, pose.legF?.[1] ?? 0],
    legB: [pose.legB?.[0] ?? 0, pose.legB?.[1] ?? 0],
    squash: pose.squash ?? 1,
    headScale: pose.headScale ?? 1
  };
}

/** Linear blend between two poses (`t` = 0..1). */
export function blendPose(a, b, t) {
  if (t <= 0) return clonePose(a);
  if (t >= 1) return clonePose(b);
  const mixArr = (x, y) => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t];
  return {
    root: { x: a.root.x + (b.root.x - a.root.x) * t, y: a.root.y + (b.root.y - a.root.y) * t },
    lean: a.lean + (b.lean - a.lean) * t,
    spine: a.spine + (b.spine - a.spine) * t,
    neck: a.neck + (b.neck - a.neck) * t,
    head: { x: a.head.x + (b.head.x - a.head.x) * t, y: a.head.y + (b.head.y - a.head.y) * t },
    armF: mixArr(a.armF, b.armF),
    armB: mixArr(a.armB, b.armB),
    legF: mixArr(a.legF, b.legF),
    legB: mixArr(a.legB, b.legB),
    squash: a.squash + (b.squash - a.squash) * t,
    headScale: a.headScale + (b.headScale - a.headScale) * t
  };
}

/** Additive pose offset (used by clips, breathing, hit reactions). */
export function addPose(base, delta, weight = 1) {
  if (!delta || weight === 0) return base;
  const pose = clonePose(base);
  if (delta.root) {
    pose.root.x += (delta.root.x || 0) * weight;
    pose.root.y += (delta.root.y || 0) * weight;
  }
  for (const key of ['lean', 'spine', 'neck', 'squash']) {
    if (typeof delta[key] === 'number') pose[key] += delta[key] * weight;
  }
  if (delta.head) {
    pose.head.x += (delta.head.x || 0) * weight;
    pose.head.y += (delta.head.y || 0) * weight;
  }
  for (const key of ['armF', 'armB', 'legF', 'legB']) {
    if (delta[key]) {
      pose[key][0] += (delta[key][0] || 0) * weight;
      pose[key][1] += (delta[key][1] || 0) * weight;
    }
  }
  if (typeof delta.headScale === 'number') pose.headScale += (delta.headScale - 1) * weight;
  return pose;
}

/** Direction vector for an angle in facing space (y up). */
function dir(angleDeg) {
  const a = angleDeg * DEG;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

/**
 * Solve a pose into joint positions, in facing space with the pelvis at the
 * origin and +y up. Multiply x by `facing` when drawing.
 */
export function solvePose(pose, height, proportions = PROPORTIONS) {
  const P = { ...PROPORTIONS, ...proportions };
  const h = height;
  // Root offsets are authored in pixels (stances use -5px, clips up to ±34px),
  // NOT as a fraction of the character height — scaling them here launched
  // fighters off-screen the moment any animation keyframed the root.
  const px = pose.root.x;
  const py = pose.root.y;

  const pelvis = { x: px, y: py };
  // Limb angles use "0deg = straight down", so the torso (pelvis -> chest ->
  // neck -> head) runs along the OPPOSITE direction: 180 + spine.
  const spineDir = dir(180 + pose.spine + pose.lean);
  const chest = {
    x: pelvis.x + spineDir.x * P.torso * h,
    y: pelvis.y + spineDir.y * P.torso * h
  };
  const neckAngle = 180 + pose.spine + pose.neck + pose.lean;
  const neckDir = dir(neckAngle);
  const neck = {
    x: chest.x + neckDir.x * P.neck * h,
    y: chest.y + neckDir.y * P.neck * h
  };
  const headR = P.headRadius * h * pose.headScale;
  const head = {
    x: neck.x + neckDir.x * headR * 1.15 + pose.head.x * h,
    y: neck.y + neckDir.y * headR * 1.15 + pose.head.y * h
  };

  // Shoulders and hips sit perpendicular to the body axis (+x = forward).
  const bodyAngle = pose.spine + pose.lean;
  const shoulderL = rotatePoint(chest, P.shoulderWidth * h * 0.55, bodyAngle); // front shoulder
  const shoulderR = rotatePoint(chest, -P.shoulderWidth * h * 0.55, bodyAngle); // back shoulder
  const hipF = rotatePoint(pelvis, P.hipWidth * h * 0.5, pose.spine + pose.lean);
  const hipB = rotatePoint(pelvis, -P.hipWidth * h * 0.5, pose.spine + pose.lean);

  const frontArm = solveLimb(shoulderL, pose.armF[0] + pose.lean, pose.armF[1], P.upperArm * h, P.foreArm * h);
  const backArm = solveLimb(shoulderR, pose.armB[0] + pose.lean, pose.armB[1], P.upperArm * h, P.foreArm * h);
  const frontLeg = solveLimb(hipF, pose.legF[0] + pose.lean, pose.legF[1], P.thigh * h, P.shin * h);
  const backLeg = solveLimb(hipB, pose.legB[0] + pose.lean, pose.legB[1], P.thigh * h, P.shin * h);

  return {
    pelvis,
    chest,
    neck,
    head,
    headRadius: headR,
    shoulderF: shoulderL,
    shoulderB: shoulderR,
    elbowF: frontArm.joint,
    handF: frontArm.end,
    elbowB: backArm.joint,
    handB: backArm.end,
    hipF,
    hipB,
    kneeF: frontLeg.joint,
    footF: frontLeg.end,
    kneeB: backLeg.joint,
    footB: backLeg.end
  };
}

function solveLimb(origin, angleA, angleB, lenA, lenB) {
  const d1 = dir(angleA);
  const joint = { x: origin.x + d1.x * lenA, y: origin.y + d1.y * lenA };
  const d2 = dir(angleA + angleB);
  const end = { x: joint.x + d2.x * lenB, y: joint.y + d2.y * lenB };
  return { joint, end };
}

function rotatePoint(origin, offsetAlong, angleDeg) {
  // Offset perpendicular to the body axis (creates shoulder/hip width).
  const a = angleDeg * DEG;
  return {
    x: origin.x + Math.cos(a) * offsetAlong,
    y: origin.y + Math.sin(a) * offsetAlong
  };
}

/**
 * Distance the solved pose must be lifted so its lowest point sits exactly on
 * the ground plane (y = 0 in facing space, where +y is up).
 */
export function groundOffsetFor(pose, height, proportions) {
  const solved = solvePose(pose, height, proportions);
  let lowest = 0;
  for (const key of ['footF', 'footB', 'handF', 'handB', 'head']) {
    if (solved[key]) lowest = Math.min(lowest, solved[key].y - (key === 'head' ? solved.headRadius : 0));
  }
  return Math.abs(Math.min(0, lowest));
}

const JOINT_KEYS = [
  'pelvis', 'chest', 'neck', 'head', 'shoulderF', 'shoulderB', 'elbowF', 'handF',
  'elbowB', 'handB', 'hipF', 'hipB', 'kneeF', 'footF', 'kneeB', 'footB'
];

/**
 * Solve a pose and plant it on the ground: the lowest joint ends at y = 0, so
 * hurtboxes, hitboxes and rendering all share one coordinate space.
 */
export function solvePosePlanted(pose, height, proportions) {
  const solved = solvePose(pose, height, proportions);
  const lift = groundOffsetFor(pose, height, proportions);
  if (lift > 0.01) {
    for (const key of JOINT_KEYS) {
      if (solved[key]) solved[key] = { x: solved[key].x, y: solved[key].y + lift };
    }
  }
  return solved;
}

/** Hurtbox in facing space for a solved pose (x: forward, y: up, origin = feet). */
export function hurtboxFor(solved, height, { widthScale = 1 } = {}) {
  const xs = [solved.head.x, solved.chest.x, solved.pelvis.x, solved.footF.x, solved.footB.x, solved.handF.x, solved.handB.x];
  const ys = [solved.head.y, solved.chest.y, solved.pelvis.y, solved.footF.y, solved.footB.y, solved.handF.y, solved.handB.y];
  const minX = Math.min(...xs) - solved.headRadius;
  const maxX = Math.max(...xs) + solved.headRadius;
  const minY = Math.min(...ys) - solved.headRadius;
  const maxY = Math.max(...ys) + solved.headRadius;
  return {
    x: minX * widthScale,
    y: minY,
    w: (maxX - minX) * widthScale,
    h: maxY - minY,
    height
  };
}
