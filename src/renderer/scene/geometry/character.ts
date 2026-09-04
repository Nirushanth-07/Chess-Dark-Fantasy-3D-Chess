/**
 * Procedural armoured characters — the Animated theme's 3D objects.
 *
 * These are BLOCKOUTS built to the silhouettes in `characters/`: closed helms,
 * layered plate, cloaks, and each piece's signature weapon. They exist so the
 * whole animated pipeline — locomotion, duels, hit frames, auras — can be built
 * and tuned NOW, before any Blender work happens (PROJECT_PLAN §9, "vertical
 * slice before breadth").
 *
 * The rig is deliberately built from RIGID SEGMENTS rather than a skinned mesh.
 * Plate armour genuinely is rigid plates, so segmentation reads correctly, and
 * it removes skin weights from the blockout entirely. When the sculpted GLB
 * models arrive, this function is replaced by a loader that returns the same
 * `RigJoints`, and `applyPose` (animation/poses.ts) becomes AnimationMixer
 * clips. Nothing above those two seams changes.
 */

import * as THREE from 'three';
import type { Color, PieceType } from '../../core/types';

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
  p: 0.90,
  n: 1.05,
  b: 1.02,
  r: 1.08,
  q: 1.12,
  k: 1.18,
};

const STEEL_LIGHT = 0xb9c0c9;
const STEEL_DARK = 0x3a4048;
const CLOTH_LIGHT = 0x6d7887;
const CLOTH_DARK = 0x232830;
const ACCENT_LIGHT = 0x9fd8ff; // cold blue-white — white army
const ACCENT_DARK = 0xff7a3c; // ember — black army

interface Palette {
  steel: number;
  cloth: number;
  accent: number;
  metalness: number;
  roughness: number;
}

function paletteFor(color: Color): Palette {
  return color === 'w'
    ? { steel: STEEL_LIGHT, cloth: CLOTH_LIGHT, accent: ACCENT_LIGHT, metalness: 0.85, roughness: 0.34 }
    : { steel: STEEL_DARK, cloth: CLOTH_DARK, accent: ACCENT_DARK, metalness: 0.9, roughness: 0.46 };
}

/**
 * Builds one character. Geometry and materials are per-instance because each
 * piece animates independently and the aura writes to its own materials.
 */
export function buildCharacter(type: PieceType, color: Color): CharacterBuild {
  const palette = paletteFor(color);
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const steel = new THREE.MeshStandardMaterial({
    color: palette.steel,
    metalness: palette.metalness,
    roughness: palette.roughness,
  });
  const cloth = new THREE.MeshStandardMaterial({
    color: palette.cloth,
    metalness: 0.05,
    roughness: 0.92,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.5, roughness: 0.7 });
  const visor = new THREE.MeshStandardMaterial({
    color: 0x05070a,
    emissive: new THREE.Color(palette.accent),
    emissiveIntensity: 1.6,
    metalness: 0.2,
    roughness: 0.4,
  });
  materials.push(steel, cloth, dark, visor);

  const scale = CHARACTER_HEIGHT[type];

  // Helper that tracks geometry for disposal.
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // -- skeleton ------------------------------------------------------------
  // Proportions are in "body units" where 1.0 = full height, then scaled.

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.46;
  root.add(hips);

  const chest = new THREE.Group();
  chest.position.y = 0.16;
  hips.add(chest);

  const head = new THREE.Group();
  head.position.y = 0.25;
  chest.add(head);

  // Shoulders sit clearly below the head, or the pauldrons read as ears.
  const shoulderL = new THREE.Group();
  shoulderL.position.set(0.115, 0.115, 0);
  chest.add(shoulderL);
  const shoulderR = new THREE.Group();
  shoulderR.position.set(-0.115, 0.115, 0);
  chest.add(shoulderR);

  const elbowL = new THREE.Group();
  elbowL.position.y = -0.15;
  shoulderL.add(elbowL);
  const elbowR = new THREE.Group();
  elbowR.position.y = -0.15;
  shoulderR.add(elbowR);

  const hipL = new THREE.Group();
  hipL.position.set(0.07, -0.02, 0);
  hips.add(hipL);
  const hipR = new THREE.Group();
  hipR.position.set(-0.07, -0.02, 0);
  hips.add(hipR);

  const kneeL = new THREE.Group();
  kneeL.position.y = -0.22;
  hipL.add(kneeL);
  const kneeR = new THREE.Group();
  kneeR.position.y = -0.22;
  hipR.add(kneeR);

  const cloth3 = [new THREE.Group(), new THREE.Group(), new THREE.Group()];

  // -- torso ---------------------------------------------------------------

  const cuirass = new THREE.CylinderGeometry(0.11, 0.132, 0.34, 12);
  cuirass.scale(1, 1, 0.72);
  chest.add(withY(mesh(cuirass, steel), 0.05));

  // Pauldrons — the flared shoulder plates that define the whole set.
  for (const [side, joint] of [
    [1, shoulderL],
    [-1, shoulderR],
  ] as const) {
    const pauldron = new THREE.SphereGeometry(0.058, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
    pauldron.scale(1.15, 0.85, 1.1);
    const m = mesh(pauldron, steel);
    m.position.set(side * 0.012, 0.022, 0);
    joint.add(m);
  }

  // Belt / faulds.
  const faulds = new THREE.CylinderGeometry(0.14, 0.16, 0.1, 12);
  faulds.scale(1, 1, 0.78);
  hips.add(withY(mesh(faulds, steel), -0.03));

  // -- limbs ---------------------------------------------------------------

  const limb = (radiusTop: number, radiusBottom: number, length: number) => {
    const g = new THREE.CapsuleGeometry(radiusBottom, length, 4, 8);
    void radiusTop;
    return g;
  };

  for (const joint of [shoulderL, shoulderR]) {
    joint.add(withY(mesh(limb(0.05, 0.045, 0.11), steel), -0.075));
  }
  for (const joint of [elbowL, elbowR]) {
    joint.add(withY(mesh(limb(0.042, 0.038, 0.1), steel), -0.07));
  }

  // Bishop wears a floor-length robe instead of visible legs (§2.2).
  const robed = type === 'b';
  if (robed) {
    const skirt = new THREE.CylinderGeometry(0.16, 0.29, 0.44, 14, 1, true);
    const skirtMesh = mesh(skirt, cloth);
    skirtMesh.material = cloth;
    (skirtMesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    hips.add(withY(skirtMesh, -0.24));
  } else {
    for (const joint of [hipL, hipR]) {
      joint.add(withY(mesh(limb(0.058, 0.05, 0.14), steel), -0.1));
    }
    for (const joint of [kneeL, kneeR]) {
      joint.add(withY(mesh(limb(0.05, 0.042, 0.13), steel), -0.09));
      const boot = new THREE.BoxGeometry(0.075, 0.05, 0.13);
      const bootMesh = mesh(boot, dark);
      bootMesh.position.set(0, -0.19, 0.02);
      joint.add(bootMesh);
    }
  }

  // -- head & helm ---------------------------------------------------------

  buildHelm(type, head, mesh, steel, dark, visor);

  // -- tabard / cloak ------------------------------------------------------

  if (!robed) {
    const tabard = new THREE.BoxGeometry(0.165, 0.22, 0.018);
    hips.add(withZ(withY(mesh(tabard, cloth), -0.14), 0.082));
  }

  const capePieces = type === 'p' ? 0 : 2;
  let capeParent: THREE.Object3D = chest;
  for (let i = 0; i < capePieces; i++) {
    const segment = cloth3[i];
    segment.position.y = i === 0 ? 0.13 : -0.17;
    capeParent.add(segment);
    // Taper down the chain so the cape narrows toward the hem.
    const panel = new THREE.CylinderGeometry(0.115 - i * 0.02, 0.1 - i * 0.02, 0.18, 10, 1, true, -1.15, 2.3);
    const panelMesh = mesh(panel, cloth);
    (panelMesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    panelMesh.position.set(0, -0.09, 0);
    panelMesh.rotation.y = Math.PI; // opens toward the back
    segment.add(panelMesh);
    capeParent = segment;
  }

  // -- weapon --------------------------------------------------------------

  buildWeapon(type, elbowL, mesh, steel, dark);

  // -- assemble ------------------------------------------------------------

  root.scale.setScalar(scale);

  const group = new THREE.Group();
  group.add(root);

  return {
    group,
    joints: {
      root,
      hips,
      chest,
      head,
      shoulderL,
      shoulderR,
      elbowL,
      elbowR,
      hipL,
      hipR,
      kneeL,
      kneeR,
      cloth: cloth3.slice(0, capePieces),
    },
    materials,
    geometries,
    visor,
  };
}

// ---------------------------------------------------------------------------

type MeshFactory = (geometry: THREE.BufferGeometry, material: THREE.Material) => THREE.Mesh;

function withY<T extends THREE.Object3D>(object: T, y: number): T {
  object.position.y = y;
  return object;
}

function withZ<T extends THREE.Object3D>(object: T, z: number): T {
  object.position.z = z;
  return object;
}

/**
 * Helms are the primary identifier at game-camera distance, so each is
 * distinct and deliberately over-scaled (~15%) per PROJECT_PLAN §2.3.
 */
function buildHelm(
  type: PieceType,
  head: THREE.Group,
  mesh: MeshFactory,
  steel: THREE.Material,
  dark: THREE.Material,
  visor: THREE.Material,
): void {
  const skull = new THREE.SphereGeometry(0.082, 14, 12);
  skull.scale(1, 1.12, 1.08);
  head.add(withY(mesh(skull, steel), 0.04));

  // Visor slit — the emissive accent that identifies the army.
  const slit = new THREE.BoxGeometry(0.1, 0.018, 0.03);
  head.add(withZ(withY(mesh(slit, visor), 0.045), 0.078));

  switch (type) {
    case 'p': {
      // Sallet: a simple swept tail.
      const tail = new THREE.ConeGeometry(0.07, 0.1, 10, 1, true);
      const tailMesh = mesh(tail, steel);
      tailMesh.position.set(0, 0.02, -0.05);
      tailMesh.rotation.x = -1.9;
      head.add(tailMesh);
      break;
    }
    case 'n': {
      // Tall horsehair plume.
      const crest = new THREE.BoxGeometry(0.02, 0.05, 0.16);
      head.add(withY(mesh(crest, steel), 0.13));
      const plume = new THREE.ConeGeometry(0.035, 0.26, 8);
      const plumeMesh = mesh(plume, dark);
      plumeMesh.position.set(0, 0.18, -0.09);
      plumeMesh.rotation.x = 0.75;
      head.add(plumeMesh);
      break;
    }
    case 'b': {
      // Mitre.
      const mitre = new THREE.ConeGeometry(0.085, 0.2, 4);
      const mitreMesh = mesh(mitre, steel);
      mitreMesh.position.y = 0.16;
      mitreMesh.rotation.y = Math.PI / 4;
      head.add(mitreMesh);
      break;
    }
    case 'r': {
      // Crenellated crown-helm — the literal battlement from the sketch.
      const band = new THREE.CylinderGeometry(0.093, 0.093, 0.06, 12);
      head.add(withY(mesh(band, steel), 0.12));
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const merlon = new THREE.BoxGeometry(0.035, 0.05, 0.035);
        const merlonMesh = mesh(merlon, steel);
        merlonMesh.position.set(Math.sin(angle) * 0.075, 0.175, Math.cos(angle) * 0.075);
        head.add(merlonMesh);
      }
      break;
    }
    case 'q': {
      // Spiked crown.
      const band = new THREE.CylinderGeometry(0.09, 0.09, 0.045, 12);
      head.add(withY(mesh(band, steel), 0.115));
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2;
        const spike = new THREE.ConeGeometry(0.02, 0.085, 6);
        const spikeMesh = mesh(spike, steel);
        spikeMesh.position.set(Math.sin(angle) * 0.072, 0.175, Math.cos(angle) * 0.072);
        spikeMesh.rotation.z = -Math.sin(angle) * 0.25;
        spikeMesh.rotation.x = Math.cos(angle) * 0.25;
        head.add(spikeMesh);
      }
      break;
    }
    case 'k': {
      // Crown with cross finial.
      const band = new THREE.CylinderGeometry(0.095, 0.095, 0.05, 12);
      head.add(withY(mesh(band, steel), 0.12));
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const point = new THREE.ConeGeometry(0.022, 0.06, 6);
        const pointMesh = mesh(point, steel);
        pointMesh.position.set(Math.sin(angle) * 0.078, 0.172, Math.cos(angle) * 0.078);
        head.add(pointMesh);
      }
      const vertical = new THREE.BoxGeometry(0.018, 0.09, 0.018);
      head.add(withY(mesh(vertical, steel), 0.21));
      const horizontal = new THREE.BoxGeometry(0.055, 0.018, 0.018);
      head.add(withY(mesh(horizontal, steel), 0.225));
      break;
    }
  }
}

/** Weapons hang off the left elbow joint so they follow the attack swing. */
function buildWeapon(
  type: PieceType,
  hand: THREE.Group,
  mesh: MeshFactory,
  steel: THREE.Material,
  dark: THREE.Material,
): void {
  const grip = new THREE.Group();
  grip.position.set(0, -0.14, 0.02);
  hand.add(grip);

  switch (type) {
    case 'p': {
      const blade = new THREE.BoxGeometry(0.028, 0.26, 0.012);
      grip.add(withY(mesh(blade, steel), 0.13));
      const guard = new THREE.BoxGeometry(0.1, 0.016, 0.016);
      grip.add(mesh(guard, dark));
      break;
    }
    case 'n': {
      // Pike / lance.
      const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.72, 8);
      grip.add(withY(mesh(shaft, dark), 0.2));
      const tip = new THREE.ConeGeometry(0.03, 0.11, 8);
      grip.add(withY(mesh(tip, steel), 0.6));
      break;
    }
    case 'b': {
      // Staff with an ornate finial.
      const shaft = new THREE.CylinderGeometry(0.014, 0.014, 0.68, 8);
      grip.add(withY(mesh(shaft, dark), 0.18));
      const finial = new THREE.OctahedronGeometry(0.05, 0);
      grip.add(withY(mesh(finial, steel), 0.55));
      break;
    }
    case 'r': {
      // Poleaxe.
      const shaft = new THREE.CylinderGeometry(0.016, 0.016, 0.62, 8);
      grip.add(withY(mesh(shaft, dark), 0.16));
      const blade = new THREE.CylinderGeometry(0.09, 0.09, 0.014, 12, 1, false, 0, Math.PI * 0.7);
      const bladeMesh = mesh(blade, steel);
      bladeMesh.position.set(0.05, 0.44, 0);
      bladeMesh.rotation.z = Math.PI / 2;
      grip.add(bladeMesh);
      const spike = new THREE.ConeGeometry(0.022, 0.09, 6);
      grip.add(withY(mesh(spike, steel), 0.51));
      break;
    }
    case 'q': {
      // Greatsword.
      const blade = new THREE.BoxGeometry(0.036, 0.46, 0.014);
      grip.add(withY(mesh(blade, steel), 0.25));
      const guard = new THREE.BoxGeometry(0.17, 0.018, 0.02);
      grip.add(withY(mesh(guard, dark), 0.02));
      const pommel = new THREE.SphereGeometry(0.026, 10, 8);
      grip.add(withY(mesh(pommel, dark), -0.05));
      break;
    }
    case 'k': {
      // Longsword, carried point-down at rest.
      const blade = new THREE.BoxGeometry(0.034, 0.4, 0.014);
      grip.add(withY(mesh(blade, steel), 0.22));
      const guard = new THREE.BoxGeometry(0.14, 0.018, 0.02);
      grip.add(withY(mesh(guard, dark), 0.02));
      break;
    }
  }
}
