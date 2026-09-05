/**
 * Armoured characters — the Animated theme's 3D objects.
 *
 * Built to the silhouettes in `characters/`: closed faceless helms, layered
 * plate, cloaks, and each piece's signature weapon.
 *
 * Design rules, all taken from the concept art:
 *
 * - **Heroic proportions, not human ones.** Broad shoulders, narrow waist,
 *   oversized helm. A realistically proportioned figure reads as a toy at
 *   game-camera distance.
 * - **Overlapping plates.** Armour is layered forged plate with rolled edges,
 *   so pauldrons are three stacked domes rather than one, and limbs taper into
 *   couters and poleyns. This is the single biggest difference between "a
 *   person" and "a knight".
 * - **Gold trim carries rank.** Pawns get none, the King and Queen are edged in
 *   it. Rank has to be legible from across the board.
 * - **Side identity is emissive, not hue.** Both armies stay in the sketch's
 *   steel palette and are told apart by the glow in the visor slit.
 *
 * The rig is deliberately built from RIGID SEGMENTS rather than a skinned mesh.
 * Plate armour genuinely is rigid plates, so segmentation reads correctly and
 * skin weights leave the problem entirely. When sculpted GLB models arrive this
 * function is replaced by a loader returning the same `RigJoints`, and
 * `applyPose` (animation/poses.ts) by AnimationMixer clips. Nothing above those
 * two seams changes.
 */

import * as THREE from 'three';
import type { Color, PieceType } from '../../core/types';
import {
  ArmourBuilder,
  band,
  bladeShape,
  dome,
  limbPlate,
  plate,
  tearShape,
  turned,
  type MatKey,
} from './armour';

export interface RigJoints {
  root: THREE.Group;
  hips: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  /** Cape / plume / mantle chain, animated as trailing secondary motion. */
  cloth: THREE.Group[];
}

export interface CharacterBuild {
  group: THREE.Group;
  joints: RigJoints;
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  /** Emissive visor material, driven by the aura system. */
  visor: THREE.MeshStandardMaterial;
}

/** Overall height of each character, in board squares. */
export const CHARACTER_HEIGHT: Record<PieceType, number> = {
  p: 0.92,
  n: 1.06,
  b: 1.04,
  r: 1.12,
  q: 1.14,
  k: 1.2,
};

/** How much gold trim a piece carries. Rank must read at a glance. */
const RANK: Record<PieceType, number> = { p: 0, n: 1, b: 1, r: 2, q: 3, k: 3 };

/** Shoulder-width multiplier — the heavies are visibly broader. */
const BUILD: Record<PieceType, number> = { p: 1, n: 1.05, b: 0.94, r: 1.24, q: 1.02, k: 1.12 };

interface Palette {
  steel: number;
  dark: number;
  cloth: number;
  gold: number;
  accent: number;
  metalness: number;
  roughness: number;
}

function paletteFor(color: Color): Palette {
  return color === 'w'
    ? {
        steel: 0xb9c2ce,
        dark: 0x4c545f,
        cloth: 0x76889e,
        gold: 0xd9a94e,
        accent: 0x9fd8ff, // cold blue-white
        metalness: 0.82,
        roughness: 0.4,
      }
    : {
        steel: 0x565e6b,
        dark: 0x1b1f26,
        cloth: 0x272d36,
        gold: 0xb8863a,
        accent: 0xff7a3c, // ember
        metalness: 0.86,
        roughness: 0.5,
      };
}

// ---------------------------------------------------------------------------

export function buildCharacter(type: PieceType, color: Color): CharacterBuild {
  const palette = paletteFor(color);
  const rank = RANK[type];
  const broad = BUILD[type];

  const steel = new THREE.MeshStandardMaterial({
    color: palette.steel,
    metalness: palette.metalness,
    roughness: palette.roughness,
    envMapIntensity: 0.9,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: palette.dark,
    metalness: 0.7,
    roughness: 0.62,
  });
  const cloth = new THREE.MeshStandardMaterial({
    color: palette.cloth,
    metalness: 0.04,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: palette.gold,
    metalness: 1,
    roughness: 0.28,
    envMapIntensity: 1.6,
  });
  const visor = new THREE.MeshStandardMaterial({
    color: 0x05070a,
    emissive: new THREE.Color(palette.accent),
    emissiveIntensity: 2.2,
    metalness: 0.2,
    roughness: 0.4,
  });

  const materials: Record<MatKey, THREE.Material> = { steel, dark, cloth, gold, visor };
  const builder = new ArmourBuilder();

  // -- skeleton ------------------------------------------------------------
  // Heroic proportions in body units: hip 0.47, shoulder 0.73, helm top ~1.0.

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.47;
  root.add(hips);

  const chest = new THREE.Group();
  chest.position.y = 0.15;
  hips.add(chest);

  const head = new THREE.Group();
  head.position.y = 0.235;
  chest.add(head);

  const span = 0.142 * broad;
  const shoulderL = new THREE.Group();
  shoulderL.position.set(span, 0.108, 0);
  chest.add(shoulderL);
  const shoulderR = new THREE.Group();
  shoulderR.position.set(-span, 0.108, 0);
  chest.add(shoulderR);

  const elbowL = new THREE.Group();
  elbowL.position.y = -0.16;
  shoulderL.add(elbowL);
  const elbowR = new THREE.Group();
  elbowR.position.y = -0.16;
  shoulderR.add(elbowR);

  const hipL = new THREE.Group();
  hipL.position.set(0.072, -0.03, 0);
  hips.add(hipL);
  const hipR = new THREE.Group();
  hipR.position.set(-0.072, -0.03, 0);
  hips.add(hipR);

  const kneeL = new THREE.Group();
  kneeL.position.y = -0.21;
  hipL.add(kneeL);
  const kneeR = new THREE.Group();
  kneeR.position.y = -0.21;
  hipR.add(kneeR);

  const clothChain = [new THREE.Group(), new THREE.Group(), new THREE.Group()];

  const joints: RigJoints = {
    root, hips, chest, head,
    shoulderL, shoulderR, elbowL, elbowR,
    hipL, hipR, kneeL, kneeR,
    cloth: [],
  };

  // -- assembly ------------------------------------------------------------

  const robed = type === 'b'; // the bishop's floor-length robe replaces legs

  buildTorso(builder, joints, rank, broad);
  buildArms(builder, joints, type, rank);
  if (robed) buildRobe(builder, joints);
  else buildLegs(builder, joints, rank);
  buildHelm(builder, joints, type, rank);
  buildCloak(builder, joints, clothChain, type, rank);
  buildWeapon(builder, joints, type, rank);

  joints.cloth = clothChain.filter((segment) => segment.parent !== null);

  const { geometries } = builder.build(materials);

  root.scale.setScalar(CHARACTER_HEIGHT[type]);
  const group = new THREE.Group();
  group.add(root);

  return { group, joints, materials: [steel, dark, cloth, gold, visor], geometries, visor };
}

// ---------------------------------------------------------------------------
// Torso: cuirass, gorget, faulds, tassets
// ---------------------------------------------------------------------------

function buildTorso(b: ArmourBuilder, j: RigJoints, rank: number, broad: number) {
  const w = 0.118 * broad;

  // Cuirass: a turned volume that pinches at the waist and flares at the chest.
  // The pinch is what gives the figure a heroic rather than tubular read.
  b.place(
    j.chest,
    'steel',
    turned(
      [
        [w * 0.7, -0.11],
        [w * 0.88, -0.05],
        [w * 1.0, 0.02],
        [w * 1.05, 0.08],
        [w * 0.99, 0.15],
        [w * 0.8, 0.2],
        [w * 0.58, 0.225],
      ],
      26,
      0.7,
    ),
    [0, 0.01, 0],
  );

  // Keel ridge down the breastplate — catches a highlight and reads as forged.
  const keel = new THREE.Shape();
  keel.moveTo(0, 0.11);
  keel.lineTo(0.026, 0.05);
  keel.lineTo(0.02, -0.1);
  keel.lineTo(-0.02, -0.1);
  keel.lineTo(-0.026, 0.05);
  keel.closePath();
  b.place(j.chest, 'steel', plate(keel, 0.032, 0.012), [0, 0.05, w * 0.66], [0.12, 0, 0]);

  // Gorget: the collar the helm sits into.
  b.place(j.chest, rank >= 2 ? 'gold' : 'steel', band(w * 0.6, 0.018, 0.82), [0, 0.208, 0]);

  // Etched breastplate banding for high rank — the Queen's sketch.
  if (rank >= 2) {
    b.place(j.chest, 'gold', band(w * 0.94, 0.009, 0.72), [0, 0.075, 0], [0.28, 0, 0]);
    if (rank >= 3) b.place(j.chest, 'gold', band(w * 0.82, 0.008, 0.72), [0, 0.15, 0], [0.35, 0, 0]);
  }

  // Besagews: small discs guarding the armpits.
  for (const side of [1, -1]) {
    b.place(j.chest, 'steel', dome(0.028, 0.5), [side * w * 0.84, 0.1, w * 0.4], [1.3, 0, 0]);
  }

  // Faulds: stacked hoops over the hips.
  for (let i = 0; i < 3; i++) {
    b.place(j.hips, 'steel', band(0.132 - i * 0.004, 0.019, 0.82), [0, 0.01 - i * 0.032, 0]);
  }
  b.place(j.hips, rank >= 1 ? 'gold' : 'dark', band(0.136, 0.014, 0.84), [0, 0.045, 0]);

  // Tassets: hanging thigh plates, front and sides.
  const tasset = tearShape(0.088, 0.14, 0.42);
  for (const [x, z, ry] of [
    [0.052, 0.085, 0.25],
    [-0.052, 0.085, -0.25],
    [0.115, 0.0, 1.4],
    [-0.115, 0.0, -1.4],
  ] as const) {
    b.place(j.hips, 'steel', plate(tasset, 0.022, 0.008), [x, -0.095, z], [0.16, ry, 0]);
  }
}

// ---------------------------------------------------------------------------
// Arms: pauldrons, rerebrace, couter, vambrace, gauntlet
// ---------------------------------------------------------------------------

function buildArms(b: ArmourBuilder, j: RigJoints, type: PieceType, rank: number) {
  const heavy = type === 'r' || type === 'k' || type === 'q';
  const layers = heavy ? 3 : 2;
  const base = heavy ? 0.072 : 0.062;

  for (const [side, shoulder, elbow] of [
    [1, j.shoulderL, j.elbowL],
    [-1, j.shoulderR, j.elbowR],
  ] as const) {
    // Pauldron: overlapping domes, each larger and lower than the last. This
    // layering is what separates a knight's shoulder from a ball joint.
    for (let i = 0; i < layers; i++) {
      b.place(
        shoulder,
        'steel',
        dome(base * (1 + i * 0.26), 0.62, Math.PI * 2, Math.PI * 0.72),
        [side * 0.012 * i, 0.026 - i * 0.03, -0.005 * i],
        // Real pauldrons curve down over the arm; flat discs read as saucers.
        [0, 0, side * 0.42],
      );
    }
    if (rank >= 2) {
      b.place(shoulder, 'gold', band(base * 1.34, 0.008), [0, 0.028 - (layers - 1) * 0.032, 0]);
    }

    b.place(shoulder, 'steel', limbPlate(0.043, 0.036, 0.15), [0, -0.082, 0]);
    b.place(elbow, 'steel', dome(0.041, 0.72, Math.PI * 2, Math.PI * 0.85), [0, 0.006, 0]);
    b.place(elbow, 'steel', limbPlate(0.036, 0.032, 0.13), [0, -0.078, 0]);
    b.place(elbow, 'dark', limbPlate(0.034, 0.03, 0.05), [0, -0.163, 0]);
    b.place(elbow, 'steel', dome(0.033, 0.6), [0, -0.15, 0.008], [0.4, 0, 0]);
  }
}

// ---------------------------------------------------------------------------
// Legs: cuisse, poleyn, greave, sabaton
// ---------------------------------------------------------------------------

function buildLegs(b: ArmourBuilder, j: RigJoints, rank: number) {
  for (const [hip, knee] of [
    [j.hipL, j.kneeL],
    [j.hipR, j.kneeR],
  ] as const) {
    b.place(hip, 'dark', limbPlate(0.055, 0.046, 0.2), [0, -0.1, 0]);
    b.place(hip, 'steel', plate(tearShape(0.092, 0.17, 0.3), 0.03, 0.01), [0, -0.09, 0.03], [0.1, 0, 0]);

    // Poleyn: knee dome with a side fin, the classic gothic-armour tell.
    b.place(knee, 'steel', dome(0.049, 0.8, Math.PI * 2, Math.PI * 0.9), [0, 0.008, 0.008]);
    b.place(knee, 'steel', plate(bladeShape(0.05, 0.05, 0.4), 0.014, 0.006), [0, 0.0, -0.03], [1.2, 0, 0]);

    b.place(knee, 'steel', limbPlate(0.044, 0.034, 0.16), [0, -0.09, 0]);
    if (rank >= 2) b.place(knee, 'gold', band(0.046, 0.007), [0, -0.02, 0]);

    // Sabaton: a pointed armoured foot, not a box.
    const foot = new THREE.Shape();
    foot.moveTo(-0.036, -0.075);
    foot.lineTo(0.036, -0.075);
    foot.lineTo(0.03, 0.055);
    foot.lineTo(0.0, 0.088);
    foot.lineTo(-0.03, 0.055);
    foot.closePath();
    b.place(knee, 'dark', plate(foot, 0.052, 0.012), [0, -0.184, 0.012], [Math.PI / 2, 0, 0]);
  }
}

/** The bishop wears an ankle-length robe in place of visible legs. */
function buildRobe(b: ArmourBuilder, j: RigJoints) {
  b.place(
    j.hips,
    'cloth',
    turned(
      [
        [0.13, 0.02],
        [0.155, -0.1],
        [0.2, -0.26],
        [0.255, -0.4],
        [0.282, -0.462],
        [0.268, -0.475],
        [0.14, -0.47],
      ],
      24,
    ),
    [0, 0, 0],
  );
  // Quilted banding, echoing the sketch's stitched robe.
  for (let i = 0; i < 3; i++) {
    b.place(j.hips, 'dark', band(0.172 + i * 0.038, 0.008), [0, -0.16 - i * 0.1, 0]);
  }
}

// ---------------------------------------------------------------------------
// Helms — the primary identifier at game-camera distance
// ---------------------------------------------------------------------------

function buildHelm(b: ArmourBuilder, j: RigJoints, type: PieceType, rank: number) {
  const head = j.head;

  // Skull: a turned helm with a brow ridge and a tapered jaw, not a sphere.
  b.place(
    head,
    'steel',
    turned(
      [
        [0.052, -0.075],
        [0.076, -0.05],
        [0.09, -0.015],
        [0.094, 0.025],
        [0.088, 0.062],
        [0.068, 0.088],
        [0.036, 0.1],
      ],
      22,
      0.92,
    ),
    [0, 0.03, 0],
  );

  // Brow ridge above the visor — the feature that gives a helm a "face".
  b.place(head, 'steel', band(0.082, 0.011, 0.95), [0, 0.052, 0], [0.18, 0, 0]);

  // Visor slit: the emissive accent that identifies the army.
  const slit = new THREE.Shape();
  slit.moveTo(-0.056, 0.012);
  slit.lineTo(0.056, 0.012);
  slit.lineTo(0.046, -0.012);
  slit.lineTo(-0.046, -0.012);
  slit.closePath();
  b.place(head, 'visor', plate(slit, 0.02, 0.004), [0, 0.032, 0.078]);

  // Bevor / chin plate.
  b.place(
    head,
    'dark',
    turned([[0.05, -0.08], [0.072, -0.055], [0.078, -0.02], [0.05, 0.0]], 18, 0.9),
    [0, 0.0, 0.012],
  );

  if (rank >= 2) b.place(head, 'gold', band(0.088, 0.008, 0.95), [0, -0.012, 0]);

  switch (type) {
    case 'p': {
      // Sallet: a swept tail over the neck.
      const tail = new THREE.Shape();
      tail.moveTo(-0.062, 0.0);
      tail.lineTo(0.062, 0.0);
      tail.lineTo(0.03, -0.12);
      tail.lineTo(-0.03, -0.12);
      tail.closePath();
      b.place(head, 'steel', plate(tail, 0.05, 0.01), [0, 0.06, -0.07], [-1.15, 0, 0]);
      break;
    }

    case 'n': {
      // Crest rail plus a tall horsehair plume — the sketch's defining feature.
      b.place(head, rank >= 1 ? 'gold' : 'steel', plate(bladeShape(0.03, 0.19, 0.5), 0.016, 0.006), [0, 0.12, -0.01], [1.45, 0, 0]);
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        b.place(
          head,
          'cloth',
          plate(bladeShape(0.058 - t * 0.022, 0.17 - t * 0.05, 0.6), 0.01, 0.004),
          [0, 0.185 - t * 0.055, -0.03 - t * 0.06],
          [0.75 + t * 0.45, 0, 0],
        );
      }
      break;
    }

    case 'b': {
      // Mitre: four-sided, as in the sketch.
      b.place(head, 'steel', turned([[0.088, -0.01], [0.086, 0.03], [0.062, 0.13], [0.03, 0.2], [0.0, 0.235]], 4), [0, 0.075, 0], [0, Math.PI / 4, 0]);
      b.place(head, 'gold', band(0.086, 0.01), [0, 0.086, 0]);
      break;
    }

    case 'r': {
      // Crenellated crown-helm — the literal battlement from the sketch.
      b.place(head, 'steel', turned([[0.098, 0.0], [0.105, 0.02], [0.105, 0.06], [0.098, 0.075]], 22), [0, 0.096, 0]);
      const merlon = new THREE.Shape();
      merlon.moveTo(-0.024, -0.032);
      merlon.lineTo(0.024, -0.032);
      merlon.lineTo(0.024, 0.032);
      merlon.lineTo(-0.024, 0.032);
      merlon.closePath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        b.place(head, 'steel', plate(merlon, 0.03, 0.007), [Math.sin(angle) * 0.09, 0.198, Math.cos(angle) * 0.09], [0, angle, 0]);
      }
      break;
    }

    case 'q': {
      // Spiked crown, alternating tall and short points.
      b.place(head, 'gold', band(0.092, 0.014), [0, 0.108, 0]);
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2;
        const tall = i % 2 === 0;
        b.place(
          head,
          'gold',
          plate(bladeShape(0.03, tall ? 0.12 : 0.075, 0.55), 0.012, 0.005),
          [Math.sin(angle) * 0.086, 0.165 + (tall ? 0.022 : 0), Math.cos(angle) * 0.086],
          [0, angle, 0],
        );
      }
      break;
    }

    case 'k': {
      // Crown with a cross finial.
      b.place(head, 'gold', band(0.098, 0.016), [0, 0.108, 0]);
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        b.place(head, 'gold', plate(bladeShape(0.036, 0.09, 0.45), 0.013, 0.005), [Math.sin(angle) * 0.092, 0.16, Math.cos(angle) * 0.092], [0, angle, 0]);
      }
      const cross = new THREE.Shape();
      cross.moveTo(-0.012, -0.05);
      cross.lineTo(0.012, -0.05);
      cross.lineTo(0.012, 0.018);
      cross.lineTo(0.042, 0.018);
      cross.lineTo(0.042, 0.042);
      cross.lineTo(0.012, 0.042);
      cross.lineTo(0.012, 0.078);
      cross.lineTo(-0.012, 0.078);
      cross.lineTo(-0.012, 0.042);
      cross.lineTo(-0.042, 0.042);
      cross.lineTo(-0.042, 0.018);
      cross.lineTo(-0.012, 0.018);
      cross.closePath();
      b.place(head, 'gold', plate(cross, 0.016, 0.005), [0, 0.228, 0]);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Cloaks, mantles and tabards
// ---------------------------------------------------------------------------

function buildCloak(b: ArmourBuilder, j: RigJoints, chain: THREE.Group[], type: PieceType, rank: number) {
  if (type !== 'b') {
    const tabard = new THREE.Shape();
    tabard.moveTo(-0.062, 0.09);
    tabard.lineTo(0.062, 0.09);
    tabard.lineTo(0.072, -0.12);
    tabard.lineTo(0.0, -0.152);
    tabard.lineTo(-0.072, -0.12);
    tabard.closePath();
    b.place(j.hips, 'cloth', plate(tabard, 0.012), [0, -0.09, 0.112], [0.06, 0, 0]);
  }

  // The rook wears a fur mantle over the pauldrons.
  if (type === 'r') {
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      b.place(
        j.chest,
        'cloth',
        dome(0.036 + (i % 3) * 0.005, 0.7),
        [Math.sin(angle) * 0.145, 0.148 + Math.cos(i * 2.1) * 0.01, Math.cos(angle) * 0.115],
      );
    }
  }

  const segments = type === 'p' ? 0 : 2;
  if (segments === 0) return;

  // Clasp across the shoulders.
  b.place(j.chest, rank >= 2 ? 'gold' : 'dark', band(0.115, 0.013, 0.85), [0, 0.185, 0], [0.2, 0, 0]);

  let parent: THREE.Object3D = j.chest;
  for (let i = 0; i < segments; i++) {
    const segment = chain[i];
    segment.position.y = i === 0 ? 0.17 : -0.15;
    parent.add(segment);

    // A curved shell rather than a flat slab — cloth needs a drape or it reads
    // as a signboard. The arc stays under half a turn so it hangs behind the
    // figure instead of closing into a skirt.
    const long = type === 'k' || type === 'q';
    const width = 0.108 + i * 0.024;
    b.place(
      segment,
      'cloth',
      new THREE.CylinderGeometry(width, width + 0.022, long ? 0.185 : 0.155, 14, 1, true, -0.95, 1.9),
      [0, long ? -0.093 : -0.078, -0.012],
      [0, Math.PI, 0],
    );
    parent = segment;
  }
}

// ---------------------------------------------------------------------------
// Weapons — hung off the left hand so they follow the attack swing
// ---------------------------------------------------------------------------

function buildWeapon(b: ArmourBuilder, j: RigJoints, type: PieceType, rank: number) {
  const grip = new THREE.Group();
  grip.position.set(0, -0.155, 0.025);
  j.elbowL.add(grip);
  const trim: MatKey = rank >= 2 ? 'gold' : 'steel';

  switch (type) {
    case 'p':
      b.place(grip, 'steel', plate(bladeShape(0.05, 0.28, 0.22), 0.014, 0.006), [0, 0.15, 0]);
      b.place(grip, 'dark', plate(bladeShape(0.13, 0.026, 0.1), 0.018, 0.005), [0, 0.012, 0], [0, 0, Math.PI / 2]);
      b.place(grip, 'dark', dome(0.02, 1), [0, -0.04, 0], [Math.PI, 0, 0]);
      break;

    case 'n':
      // Lance: tapering shaft, ferrule, leaf-shaped head.
      b.place(grip, 'dark', limbPlate(0.011, 0.016, 0.72), [0, 0.2, 0]);
      b.place(grip, trim, band(0.019, 0.007), [0, 0.5, 0]);
      b.place(grip, 'steel', plate(bladeShape(0.05, 0.16, 0.55), 0.016, 0.006), [0, 0.62, 0]);
      break;

    case 'b': {
      // Staff with an ornate finial and a glowing core.
      b.place(grip, 'dark', limbPlate(0.013, 0.016, 0.7), [0, 0.19, 0]);
      b.place(grip, 'gold', band(0.026, 0.009), [0, 0.5, 0]);
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        b.place(
          grip,
          'gold',
          plate(bladeShape(0.026, 0.11, 0.5), 0.01, 0.004),
          [Math.sin(angle) * 0.026, 0.57, Math.cos(angle) * 0.026],
          [0, angle, Math.sin(angle) * 0.25],
        );
      }
      b.place(grip, 'visor', dome(0.026, 1, Math.PI * 2, Math.PI), [0, 0.572, 0]);
      break;
    }

    case 'r': {
      // Poleaxe: heavy shaft, crescent blade, back spike, top spike.
      b.place(grip, 'dark', limbPlate(0.016, 0.019, 0.64), [0, 0.16, 0]);
      b.place(grip, trim, band(0.023, 0.008), [0, 0.42, 0]);
      const crescent = new THREE.Shape();
      crescent.moveTo(0, 0.078);
      crescent.bezierCurveTo(0.112, 0.062, 0.132, -0.02, 0.076, -0.082);
      crescent.bezierCurveTo(0.076, -0.02, 0.04, 0.012, 0, -0.02);
      crescent.closePath();
      b.place(grip, 'steel', plate(crescent, 0.016, 0.006), [0.018, 0.475, 0]);
      b.place(grip, 'steel', plate(bladeShape(0.04, 0.09, 0.6), 0.014, 0.005), [-0.046, 0.46, 0], [0, 0, -1.9]);
      b.place(grip, 'steel', plate(bladeShape(0.032, 0.13, 0.6), 0.014, 0.005), [0, 0.578, 0]);
      break;
    }

    case 'q':
      // Greatsword: long blade, winged guard, gold pommel.
      b.place(grip, 'steel', plate(bladeShape(0.056, 0.5, 0.14), 0.015, 0.006), [0, 0.27, 0]);
      b.place(grip, 'dark', plate(bladeShape(0.2, 0.03, 0.12), 0.02, 0.006), [0, 0.022, 0], [0, 0, Math.PI / 2]);
      b.place(grip, 'gold', band(0.03, 0.011), [0, 0.04, 0]);
      b.place(grip, 'gold', dome(0.026, 1.1), [0, -0.05, 0], [Math.PI, 0, 0]);
      break;

    case 'k':
      // Longsword, carried point-down at rest.
      b.place(grip, 'steel', plate(bladeShape(0.052, 0.44, 0.16), 0.015, 0.006), [0, 0.24, 0]);
      b.place(grip, 'gold', plate(bladeShape(0.17, 0.028, 0.12), 0.019, 0.006), [0, 0.022, 0], [0, 0, Math.PI / 2]);
      b.place(grip, 'gold', dome(0.024, 1.1), [0, -0.048, 0], [Math.PI, 0, 0]);
      break;
  }
}
