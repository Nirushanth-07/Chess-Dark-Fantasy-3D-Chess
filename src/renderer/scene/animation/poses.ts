/**
 * Procedural animation for the blockout characters.
 *
 * Each pose is a pure function of (joints, time) that writes joint rotations —
 * no keyframes, so every timing below is a number you can tune live.
 *
 * When the sculpted GLB models land in Phase 5 these are replaced by
 * `AnimationMixer` clips. The consumer only ever calls `applyPose`, so nothing
 * above this file changes when that swap happens.
 */

import type { PieceType } from '../../core/types';
import type { RigJoints } from '../geometry/character';

export type PoseName = 'idle' | 'walk' | 'attack' | 'death' | 'victory' | 'stagger' | 'seated';

/** Where in a normalised attack (0…1) the weapon connects. */
export const HIT_FRAME: Record<PieceType, number> = {
  p: 0.42,
  n: 0.46,
  b: 0.55, // the bishop casts — contact is late and at range
  r: 0.5, // heavy poleaxe windup
  q: 0.44,
  k: 0.45,
};

/** How long an attack takes, in seconds, before the speed multiplier. */
export const ATTACK_DURATION: Record<PieceType, number> = {
  p: 0.85,
  n: 0.95,
  b: 1.2,
  r: 1.25,
  q: 1.05,
  k: 1.0,
};

/** Walking pace in squares per second. */
export const WALK_SPEED: Record<PieceType, number> = {
  p: 1.6,
  n: 2.4, // the knight leaps, so this is the arc's flight speed
  b: 2.0,
  r: 1.3, // heavy
  q: 1.8,
  k: 1.1, // slow and regal
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Smoothstep — used everywhere so nothing starts or stops with a jerk. */
const ease = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

function resetJoints(j: RigJoints): void {
  for (const joint of [
    j.hips, j.chest, j.head,
    j.shoulderL, j.shoulderR, j.elbowL, j.elbowR,
    j.hipL, j.hipR, j.kneeL, j.kneeR,
  ]) {
    joint.rotation.set(0, 0, 0);
  }
  j.hips.position.y = 0.46;
  j.root.position.y = 0;
  j.root.rotation.set(0, j.root.rotation.y, 0);
}

/**
 * Trailing secondary motion for cape / plume chains, driven by how fast the
 * body is moving. Cheap, stable, and enough at this camera distance — real
 * cloth simulation is explicitly out of scope.
 */
function applyCloth(j: RigJoints, time: number, sway: number): void {
  j.cloth.forEach((segment, index) => {
    const delay = index * 0.35;
    const amount = sway * (0.4 + index * 0.25);
    segment.rotation.x = Math.sin(time * 2.2 - delay) * 0.05 + amount;
  });
}

// ---------------------------------------------------------------------------

function idle(j: RigJoints, time: number, type: PieceType): void {
  const breathe = Math.sin(time * 1.4) * 0.5 + 0.5;
  j.chest.rotation.x = -0.02 - breathe * 0.025;
  j.hips.position.y = 0.46 + breathe * 0.006;
  j.head.rotation.y = Math.sin(time * 0.45) * 0.12;
  j.head.rotation.x = 0.03;

  // Weapon arm rests; off arm hangs.
  j.shoulderL.rotation.x = -0.15 + breathe * 0.03;
  j.shoulderL.rotation.z = -0.18;
  j.shoulderR.rotation.z = 0.22;
  j.elbowL.rotation.x = -0.55;
  j.elbowR.rotation.x = -0.2;

  if (type === 'r') {
    // The rook holds the poleaxe across the body — the sketch's active stance.
    j.shoulderL.rotation.x = -0.5;
    j.shoulderL.rotation.z = -0.35;
    j.elbowL.rotation.x = -0.7;
    j.hipL.rotation.z = -0.12;
    j.hipR.rotation.z = 0.12;
  }
  if (type === 'b') {
    // Staff held upright, off hand raised in the gesture from the sketch.
    j.shoulderL.rotation.x = -0.1;
    j.shoulderL.rotation.z = -0.12;
    j.elbowL.rotation.x = -0.3;
    j.shoulderR.rotation.x = -0.9;
    j.shoulderR.rotation.z = 0.5;
    j.elbowR.rotation.x = -1.1;
  }
  if (type === 'q') {
    j.shoulderR.rotation.z = 0.55; // hand on hip
    j.elbowR.rotation.x = -1.3;
    j.elbowR.rotation.z = -0.5;
  }

  applyCloth(j, time, 0);
}

/** The king's resting pose: seated on his throne, per the set 2 sketch. */
function seated(j: RigJoints, time: number): void {
  const breathe = Math.sin(time * 1.1) * 0.5 + 0.5;
  j.root.position.y = 0.0;
  j.hips.position.y = 0.34;
  j.chest.rotation.x = -0.06 - breathe * 0.02;
  j.head.rotation.x = 0.06;
  j.head.rotation.y = Math.sin(time * 0.4) * 0.08;

  // Thighs forward, shins down.
  j.hipL.rotation.x = -1.35;
  j.hipR.rotation.x = -1.35;
  j.kneeL.rotation.x = 1.4;
  j.kneeR.rotation.x = 1.4;

  // Sword resting point-down between both hands.
  j.shoulderL.rotation.x = 0.35;
  j.shoulderL.rotation.z = -0.28;
  j.elbowL.rotation.x = -0.5;
  j.shoulderR.rotation.x = 0.3;
  j.shoulderR.rotation.z = 0.3;
  j.elbowR.rotation.x = -0.45;

  applyCloth(j, time, 0);
}

function walk(j: RigJoints, time: number, type: PieceType): void {
  const cadence = type === 'r' ? 5.0 : type === 'k' ? 4.0 : 7.0;
  const swing = type === 'r' ? 0.55 : type === 'k' ? 0.3 : 0.65;
  const phase = time * cadence;
  const s = Math.sin(phase);

  j.hipL.rotation.x = s * swing;
  j.hipR.rotation.x = -s * swing;
  j.kneeL.rotation.x = Math.max(0, -Math.sin(phase - 0.6)) * 0.85;
  j.kneeR.rotation.x = Math.max(0, -Math.sin(phase + Math.PI - 0.6)) * 0.85;

  // Arms counter-swing; the weapon arm swings less so the weapon stays readable.
  j.shoulderR.rotation.x = s * 0.42;
  j.shoulderL.rotation.x = -s * 0.2 - 0.2;
  j.shoulderL.rotation.z = -0.2;
  j.shoulderR.rotation.z = 0.2;
  j.elbowL.rotation.x = -0.5;
  j.elbowR.rotation.x = -0.35 - Math.abs(s) * 0.2;

  // Vertical bob at twice cadence, plus a torso counter-rotation.
  j.hips.position.y = 0.46 + Math.abs(Math.cos(phase)) * 0.022;
  j.hips.rotation.y = s * 0.09;
  j.chest.rotation.y = -s * 0.14;
  j.chest.rotation.x = -0.06;
  j.head.rotation.y = s * 0.05;

  if (type === 'b') {
    // The bishop glides: no leg swing, a slow hover bob and a trailing lean.
    j.hipL.rotation.x = 0;
    j.hipR.rotation.x = 0;
    j.kneeL.rotation.x = 0;
    j.kneeR.rotation.x = 0;
    j.hips.position.y = 0.46 + Math.sin(time * 2.4) * 0.02;
    j.root.position.y = 0.05 + Math.sin(time * 2.0) * 0.015;
    j.chest.rotation.x = -0.12;
  }

  applyCloth(j, time, -0.28);
}

/**
 * Windup → strike → recover. `u` is normalised 0…1 over the whole attack, and
 * the hit lands at `HIT_FRAME[type]`.
 */
function attack(j: RigJoints, u: number, type: PieceType): void {
  const hit = HIT_FRAME[type];
  const windup = ease(clamp01(u / hit));
  const follow = ease(clamp01((u - hit) / (1 - hit)));

  // Lunge forward through the strike, settle back after.
  const lunge = Math.sin(clamp01(u) * Math.PI) * 0.22;
  j.root.position.y = 0;
  j.hips.position.y = 0.46 - Math.sin(clamp01(u) * Math.PI) * 0.05;

  if (type === 'b') {
    // Ranged cast — no lunge, staff thrust forward, off hand extended.
    j.chest.rotation.x = lerp(-0.1, 0.18, windup) - follow * 0.1;
    j.shoulderL.rotation.x = lerp(-0.2, -1.8, windup) + follow * 0.5;
    j.elbowL.rotation.x = lerp(-0.4, -0.2, windup);
    j.shoulderR.rotation.x = lerp(-0.9, -1.9, windup) + follow * 0.7;
    j.shoulderR.rotation.z = lerp(0.5, 0.15, windup);
    j.elbowR.rotation.x = lerp(-1.1, -0.15, windup);
    j.head.rotation.x = 0.1;
    applyCloth(j, u * 4, -0.15 * windup);
    return;
  }

  // Overhead / diagonal swing for everyone else.
  const raise = type === 'r' ? -2.5 : type === 'q' ? -2.3 : -2.0;
  const strike = type === 'r' ? 0.9 : 0.7;

  j.chest.rotation.y = lerp(0, type === 'r' ? -0.5 : -0.35, windup) * (1 - follow) + follow * 0.25;
  j.chest.rotation.x = lerp(-0.05, -0.25, windup) + follow * 0.5;

  j.shoulderL.rotation.x = lerp(-0.2, raise, windup);
  if (follow > 0) j.shoulderL.rotation.x = lerp(raise, strike, follow);
  j.shoulderL.rotation.z = lerp(-0.2, -0.45, windup) * (1 - follow * 0.6);
  j.elbowL.rotation.x = lerp(-0.5, -0.9, windup) * (1 - follow) - follow * 0.15;

  j.shoulderR.rotation.x = lerp(-0.1, 0.5, windup) - follow * 0.7;
  j.shoulderR.rotation.z = 0.3;
  j.elbowR.rotation.x = -0.4;

  // Step into the blow.
  j.hipL.rotation.x = lerp(0, -0.45, windup) + follow * 0.2;
  j.hipR.rotation.x = lerp(0, 0.4, windup) - follow * 0.25;
  j.kneeL.rotation.x = 0.25 * windup;
  j.kneeR.rotation.x = 0.4 * windup;
  j.head.rotation.x = 0.12 * windup;

  j.root.position.z = 0; // translation is owned by the director, not the pose
  void lunge;
  applyCloth(j, u * 5, -0.5 * windup + 0.3 * follow);
}

/** Collapse. `u` runs 0…1; the mesh is faded out by the caller after u = 1. */
function death(j: RigJoints, u: number): void {
  const fall = ease(u);
  const buckle = ease(clamp01(u * 1.8));

  j.hips.position.y = lerp(0.46, 0.12, fall);
  j.root.rotation.x = lerp(0, 0.5, fall);
  j.chest.rotation.x = lerp(0, 0.9, fall);
  j.chest.rotation.z = lerp(0, 0.3, fall);
  j.head.rotation.x = lerp(0, 0.7, fall);

  j.hipL.rotation.x = lerp(0, -1.5, buckle);
  j.hipR.rotation.x = lerp(0, -1.2, buckle);
  j.kneeL.rotation.x = lerp(0, 2.0, buckle);
  j.kneeR.rotation.x = lerp(0, 1.7, buckle);

  // Weapon arm drops first — the weapon falling sells the death.
  j.shoulderL.rotation.x = lerp(-0.2, 1.2, ease(clamp01(u * 2.2)));
  j.shoulderL.rotation.z = lerp(-0.2, -0.6, fall);
  j.elbowL.rotation.x = lerp(-0.5, -0.1, fall);
  j.shoulderR.rotation.x = lerp(-0.1, 1.0, fall);

  applyCloth(j, u * 3, 0.4 * fall);
}

/** Sword raised, chest out — the checkmate hero pose. */
function victory(j: RigJoints, time: number): void {
  const settle = ease(clamp01(time / 0.8));
  const breathe = Math.sin(time * 2.0) * 0.5 + 0.5;

  j.root.position.y = lerp(0, 0.04, settle);
  j.chest.rotation.x = lerp(-0.05, -0.22, settle);
  j.head.rotation.x = lerp(0, -0.2, settle);

  j.shoulderL.rotation.x = lerp(-0.2, -2.9, settle) + breathe * 0.03;
  j.shoulderL.rotation.z = lerp(-0.2, -0.1, settle);
  j.elbowL.rotation.x = lerp(-0.5, -0.05, settle);

  j.shoulderR.rotation.x = lerp(-0.1, -0.5, settle);
  j.shoulderR.rotation.z = lerp(0.2, 0.7, settle);
  j.elbowR.rotation.x = -0.6;

  j.hipL.rotation.x = -0.1 * settle;
  j.hipR.rotation.x = 0.12 * settle;

  applyCloth(j, time, -0.12 * settle);
}

/** A short flinch, used when a piece is checked or a duel is lost nearby. */
function stagger(j: RigJoints, u: number): void {
  const hit = Math.sin(clamp01(u) * Math.PI);
  j.chest.rotation.x = 0.35 * hit;
  j.chest.rotation.z = 0.18 * hit;
  j.head.rotation.x = 0.4 * hit;
  j.hips.position.y = 0.46 - 0.04 * hit;
  j.shoulderL.rotation.x = -0.2 + 0.5 * hit;
  j.shoulderR.rotation.x = -0.1 + 0.6 * hit;
  j.hipL.rotation.x = -0.2 * hit;
  j.kneeR.rotation.x = 0.35 * hit;
  applyCloth(j, u * 6, 0.3 * hit);
}

// ---------------------------------------------------------------------------

/**
 * Writes a pose onto the rig.
 *
 * @param time seconds for looping poses (idle/walk/victory), or normalised
 *             0…1 progress for one-shot poses (attack/death/stagger).
 */
export function applyPose(joints: RigJoints, pose: PoseName, time: number, type: PieceType): void {
  resetJoints(joints);
  switch (pose) {
    case 'idle':
      idle(joints, time, type);
      break;
    case 'seated':
      seated(joints, time);
      break;
    case 'walk':
      walk(joints, time, type);
      break;
    case 'attack':
      attack(joints, time, type);
      break;
    case 'death':
      death(joints, time);
      break;
    case 'victory':
      victory(joints, time);
      break;
    case 'stagger':
      stagger(joints, time);
      break;
  }
}
