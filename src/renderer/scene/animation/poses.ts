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
import type { MountJoints, RigJoints } from '../geometry/character';

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
  j.hips.position.y = j.hipRest;
  j.root.position.y = 0;
  j.root.rotation.set(0, j.root.rotation.y, 0);
  j.weapon?.rotation.set(0, 0, 0);

  const mount = j.mount;
  if (!mount) return;
  mount.body.position.set(0, mount.restY, 0);
  mount.body.rotation.set(0, 0, 0);
  mount.neck.rotation.set(0, 0, 0);
  mount.head.rotation.set(0, 0, 0);
  for (const leg of mount.legs) {
    leg.upper.rotation.set(0, 0, 0);
    leg.lower.rotation.set(0, 0, 0);
  }
  for (const segment of mount.tail) segment.rotation.set(0, 0, 0);
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
  j.hips.position.y = j.hipRest + breathe * 0.006;
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
  j.hips.position.y = j.hipRest + Math.abs(Math.cos(phase)) * 0.022;
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
    j.hips.position.y = j.hipRest + Math.sin(time * 2.4) * 0.02;
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
  j.hips.position.y = j.hipRest - Math.sin(clamp01(u) * Math.PI) * 0.05;

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

  j.hips.position.y = lerp(j.hipRest, j.hipRest - 0.34, fall);
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
  j.hips.position.y = j.hipRest - 0.04 * hit;
  j.shoulderL.rotation.x = -0.2 + 0.5 * hit;
  j.shoulderR.rotation.x = -0.1 + 0.6 * hit;
  j.hipL.rotation.x = -0.2 * hit;
  j.kneeR.rotation.x = 0.35 * hit;
  applyCloth(j, u * 6, 0.3 * hit);
}

// ---------------------------------------------------------------------------
// Mounted poses
//
// The horse carries the motion and the rider reacts to it. Because the rider's
// hips hang off the horse's body, anything written to `mount.body` moves both —
// these functions only ever add the rider's own reaction on top.
// ---------------------------------------------------------------------------

/** The rider's seat: thighs forward over the saddle, feet in the stirrups. */
function seat(j: RigJoints, lean: number): void {
  j.chest.rotation.x = lean;
  // Thighs angle down and splay round the barrel, and the shin tucks back so the
  // heel sits under the hip. Level thighs read as a man sitting on a chair that
  // happens to be a horse.
  j.hipL.rotation.x = -0.55;
  j.hipR.rotation.x = -0.55;
  j.hipL.rotation.z = 0.3;
  j.hipR.rotation.z = -0.3;
  j.kneeL.rotation.x = 0.95;
  j.kneeR.rotation.x = 0.95;

  // Reins in the off hand; the lance rests upright in the weapon hand.
  j.shoulderR.rotation.x = -0.6;
  j.shoulderR.rotation.z = 0.3;
  j.elbowR.rotation.x = -0.75;
  j.shoulderL.rotation.x = -0.12;
  j.shoulderL.rotation.z = -0.16;
  j.elbowL.rotation.x = -0.35;
  aimLance(j, 0);
}

/**
 * Points the lance `pitch` radians forward of upright, measured against the
 * horse's back. The grip hangs off the elbow, so every rotation up the arm would
 * otherwise swing the lance with it — the charge raises the arm by about as much
 * as it lowers the lance, and they cancel out. Poses must call this after they
 * have finished moving the arm.
 */
function aimLance(j: RigJoints, pitch: number): void {
  if (!j.weapon) return;
  const arm = j.hips.rotation.x + j.chest.rotation.x + j.shoulderL.rotation.x + j.elbowL.rotation.x;
  j.weapon.rotation.x = pitch - arm;
}

/** Just short of level: a couched lance rides slightly nose-up. */
const COUCHED = 1.45;

function horseTail(m: MountJoints, time: number, sway: number): void {
  m.tail.forEach((segment, index) => {
    segment.rotation.x = Math.sin(time * 2.4 - index * 0.5) * 0.06 + sway * (0.5 + index * 0.4);
    segment.rotation.z = Math.sin(time * 1.7 - index * 0.6) * 0.05;
  });
}

function mountedIdle(j: RigJoints, m: MountJoints, time: number): void {
  const breathe = Math.sin(time * 1.3) * 0.5 + 0.5;
  m.body.position.y = m.restY + breathe * 0.006;
  m.neck.rotation.x = 0.04 + Math.sin(time * 0.9) * 0.05;
  m.head.rotation.x = -0.05 + Math.sin(time * 0.9 + 0.6) * 0.06;
  m.head.rotation.y = Math.sin(time * 0.5) * 0.12;

  // A front hoof paws the ground on a slow cycle — the tell of an impatient horse.
  const paw = Math.max(0, Math.sin(time * 0.8 - 1.2));
  m.legs[0].upper.rotation.x = -paw * 0.45;
  m.legs[0].lower.rotation.x = paw * 0.7;

  horseTail(m, time, 0);
  seat(j, -0.04 - breathe * 0.02);
  j.head.rotation.y = Math.sin(time * 0.45) * 0.1;
  applyCloth(j, time, 0);
}

/** A canter: the hind legs drive, the front legs reach, the body rocks. */
function mountedWalk(j: RigJoints, m: MountJoints, time: number): void {
  const phase = time * 6.2;
  const offsets = [0, 0.4, Math.PI, Math.PI + 0.4]; // FL, FR, HL, HR

  m.legs.forEach((leg, index) => {
    const p = phase + offsets[index];
    leg.upper.rotation.x = Math.sin(p) * 0.7;
    // A knee folds backward and a hock forward, so the sign flips at the hips.
    leg.lower.rotation.x = Math.max(0, -Math.sin(p - 0.5)) * 0.95 * (index < 2 ? 1 : -1);
  });

  m.body.position.y = m.restY + Math.abs(Math.sin(phase)) * 0.035;
  m.body.rotation.x = Math.sin(phase * 2) * 0.07;
  m.neck.rotation.x = 0.1 + Math.sin(phase) * 0.12;
  m.head.rotation.x = -0.12 - Math.sin(phase) * 0.1;
  horseTail(m, time, -0.35);

  // The rider posts to the gait rather than sitting rigid.
  seat(j, -0.14 + Math.sin(phase * 2) * 0.04);
  j.hips.position.y = j.hipRest + Math.abs(Math.sin(phase)) * 0.01;
  j.head.rotation.x = 0.04;
  applyCloth(j, time, -0.3);
}

/** The charge: the horse gathers and drives, the lance drops to couched. */
function mountedAttack(j: RigJoints, m: MountJoints, u: number): void {
  const hit = HIT_FRAME.n;
  const windup = ease(clamp01(u / hit));
  const follow = ease(clamp01((u - hit) / (1 - hit)));
  const surge = Math.sin(clamp01(u) * Math.PI);

  m.body.position.y = m.restY + surge * 0.03;
  m.body.rotation.x = -0.2 * windup + 0.14 * follow;
  m.neck.rotation.x = 0.1 + 0.25 * windup - 0.12 * follow;
  m.head.rotation.x = -0.15 - 0.1 * windup;

  // Front legs lift on the gather and strike down through the follow-through.
  for (const index of [0, 1]) {
    m.legs[index].upper.rotation.x = lerp(0, -0.8, windup) + follow * 0.95;
    m.legs[index].lower.rotation.x = lerp(0, 0.85, windup) - follow * 0.6;
  }
  for (const index of [2, 3]) {
    m.legs[index].upper.rotation.x = lerp(0, 0.35, windup) - follow * 0.2;
  }
  horseTail(m, u * 6, -0.5 * windup);

  // The lance swings down from upright to level, landing flat on the hit frame.
  seat(j, -0.1 - 0.2 * windup + 0.12 * follow);
  j.shoulderL.rotation.x = lerp(-0.12, -0.55, windup) + follow * 0.25;
  j.shoulderL.rotation.z = lerp(-0.16, -0.32, windup);
  j.elbowL.rotation.x = lerp(-0.35, -0.5, windup);
  aimLance(j, lerp(0, COUCHED, windup) - follow * 0.2);
  j.head.rotation.x = 0.1 * windup;
  applyCloth(j, u * 5, -0.5 * windup + 0.3 * follow);
}

function mountedDeath(j: RigJoints, m: MountJoints, u: number): void {
  const fall = ease(u);
  const buckle = ease(clamp01(u * 1.7));

  // The horse goes down first and the rider is thrown forward over its neck.
  m.body.position.y = m.restY - fall * 0.3;
  m.body.rotation.x = fall * 0.55;
  m.body.rotation.z = fall * 0.32;
  m.neck.rotation.x = fall * 0.7;
  m.head.rotation.x = fall * 0.45;
  m.legs.forEach((leg, index) => {
    leg.upper.rotation.x = (index < 2 ? -1.1 : 0.9) * buckle;
    leg.lower.rotation.x = (index < 2 ? 1.4 : -1.2) * buckle;
  });
  horseTail(m, u * 3, 0.5 * fall);

  seat(j, 0.2 + fall * 0.7);
  j.chest.rotation.z = fall * 0.3;
  j.head.rotation.x = fall * 0.6;
  j.shoulderL.rotation.x = lerp(-0.12, 1.1, ease(clamp01(u * 2.2)));
  aimLance(j, lerp(0, 1.3, fall)); // the lance topples forward with him
  applyCloth(j, u * 3, 0.4 * fall);
}

/** The horse rears and the rider raises the lance. */
function mountedVictory(j: RigJoints, m: MountJoints, time: number): void {
  const settle = ease(clamp01(time / 0.8));
  const breathe = Math.sin(time * 2.0) * 0.5 + 0.5;

  m.body.rotation.x = lerp(0, -0.62, settle);
  m.body.position.y = m.restY + lerp(0, 0.05, settle);
  m.neck.rotation.x = lerp(0, -0.25, settle);
  m.head.rotation.x = lerp(0, 0.35, settle);
  for (const index of [0, 1]) {
    m.legs[index].upper.rotation.x = lerp(0, -1.25 - index * 0.15, settle);
    m.legs[index].lower.rotation.x = lerp(0, 1.1, settle);
  }
  for (const index of [2, 3]) {
    m.legs[index].upper.rotation.x = lerp(0, 0.3, settle);
  }
  horseTail(m, time, 0.2 * settle);

  // The rider leans back into the rear and thrusts the lance skyward.
  seat(j, lerp(-0.04, 0.3, settle));
  j.shoulderL.rotation.x = lerp(-0.12, -2.5, settle) + breathe * 0.04;
  j.shoulderL.rotation.z = lerp(-0.16, -0.1, settle);
  j.elbowL.rotation.x = lerp(-0.35, -0.1, settle);
  // The horse's rear tips everything back; lean the lance forward against it so
  // it still points at the sky.
  aimLance(j, lerp(0, 0.55, settle));
  j.head.rotation.x = lerp(0, -0.2, settle);
  applyCloth(j, time, -0.2 * settle);
}

function mountedStagger(j: RigJoints, m: MountJoints, u: number): void {
  const hit = Math.sin(clamp01(u) * Math.PI);
  m.body.rotation.x = -0.25 * hit;
  m.body.position.y = m.restY + 0.02 * hit;
  m.neck.rotation.x = -0.3 * hit;
  m.head.rotation.x = 0.4 * hit;
  for (const index of [0, 1]) {
    m.legs[index].upper.rotation.x = -0.6 * hit;
    m.legs[index].lower.rotation.x = 0.5 * hit;
  }
  horseTail(m, u * 6, 0.3 * hit);

  seat(j, 0.25 * hit);
  j.head.rotation.x = 0.35 * hit;
  j.shoulderL.rotation.x = -0.12 + 0.4 * hit;
  aimLance(j, 0.25 * hit);
  applyCloth(j, u * 6, 0.3 * hit);
}

function mountedPose(j: RigJoints, m: MountJoints, pose: PoseName, time: number): void {
  switch (pose) {
    case 'walk':
      mountedWalk(j, m, time);
      break;
    case 'attack':
      mountedAttack(j, m, time);
      break;
    case 'death':
      mountedDeath(j, m, time);
      break;
    case 'victory':
      mountedVictory(j, m, time);
      break;
    case 'stagger':
      mountedStagger(j, m, time);
      break;
    default:
      // 'seated' never reaches a mounted piece — he is already sitting down.
      mountedIdle(j, m, time);
      break;
  }
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
  if (joints.mount) {
    mountedPose(joints, joints.mount, pose, time);
    return;
  }
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
