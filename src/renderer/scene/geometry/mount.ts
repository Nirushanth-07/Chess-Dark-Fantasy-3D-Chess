/**
 * The knight's horse.
 *
 * At board distance a horse reads almost entirely from five things: a deep
 * barrel, an arched neck, a small tapered head with pricked ears, legs with a
 * visible knee and hock, and a tail. Getting those right matters far more than
 * surface detail, so the barding stays sparse and never breaks the silhouette —
 * a flank drape tried in the first pass read as a shield bolted to the horse.
 *
 * The coat uses the matte `cloth` material, not the metallic `dark` one. Hide
 * has no specular sheen, and it gives each army its own horse: a grey for
 * White, a black for Black.
 *
 * The rider is assembled by `character.ts` and hung off `body`, so the animal's
 * motion carries the rider rather than being written twice.
 */

import * as THREE from 'three';
import { band, bladeShape, dome, limbPlate, plate, tearShape, turned, type ArmourBuilder } from './armour';
import type { MountJoints } from './character';

/** Horse dimensions, in body units with the hooves at y = 0. */
const HORSE = {
  bodyY: 0.43,
  legTop: -0.02,
  knee: -0.19,
  frontZ: 0.2,
  hindZ: -0.23,
  span: 0.082,
};

/** Where the rider's hips sit, in the horse body's space. */
export const SADDLE_SEAT_Y = 0.175;

/**
 * The rider is scaled down around the saddle. The foot figures have heroic,
 * oversized proportions; at full size a rider stands twice the horse's withers
 * height and the horse reads as a pony. About 1.5× is what reads as mounted.
 */
export const RIDER_SCALE = 0.84;

export function buildMount(b: ArmourBuilder, root: THREE.Group, rank: number): MountJoints {
  const body = new THREE.Group();
  body.position.y = HORSE.bodyY;
  root.add(body);

  // -- barrel --------------------------------------------------------------
  // One turned volume laid along Z. Lathes are built around Y, so the quarter
  // turn puts the axis nose-first, and the X squash makes the section deep
  // through the girth but narrow across the ribs — without it a horse's body
  // reads as a barrel of beer.
  b.place(
    body,
    'cloth',
    turned(
      [
        [0.02, -0.4],
        [0.078, -0.35],
        [0.116, -0.27],
        [0.126, -0.17],
        [0.117, -0.04],
        [0.121, 0.09],
        [0.127, 0.18],
        [0.107, 0.27],
        [0.07, 0.33],
        [0.044, 0.36],
      ],
      24,
    ),
    [0, 0, 0],
    [Math.PI / 2, 0, 0],
    [0.76, 1, 1],
  );

  // Shoulder and hindquarter masses — a horse is widest at these two points.
  b.place(body, 'cloth', dome(0.112, 0.6), [0, 0.02, 0.19], [0.3, 0, 0], [0.82, 1, 1]);
  b.place(body, 'cloth', dome(0.126, 0.58), [0, 0.02, -0.22], [-0.25, 0, 0], [0.86, 1, 1]);

  // -- tack and barding ----------------------------------------------------

  // Peytral: the plate across the chest.
  b.place(body, 'steel', plate(tearShape(0.16, 0.19, 0.45), 0.028, 0.009), [0, -0.015, 0.285], [0.4, 0, 0]);
  // Girth strap, turned to encircle the barrel rather than the spine.
  b.place(body, rank >= 1 ? 'gold' : 'dark', band(0.126, 0.009), [0, 0, 0.07], [Math.PI / 2, 0, 0], [0.78, 1, 1]);

  // Saddle, with a raised cantle behind the rider, and stirrups for his feet.
  b.place(
    body,
    'dark',
    turned([[0.045, 0], [0.086, 0.022], [0.09, 0.05], [0.058, 0.072]], 16),
    [0, 0.1, -0.015],
    undefined,
    [1, 1, 1.45],
  );
  b.place(body, rank >= 1 ? 'gold' : 'dark', plate(bladeShape(0.11, 0.07, 0.3), 0.012, 0.004), [0, 0.15, -0.1], [0.3, 0, 0]);
  for (const side of [1, -1]) {
    b.place(body, 'steel', band(0.022, 0.006), [side * 0.1, -0.055, 0.01], [0, 0, side * 0.2]);
  }

  // -- neck ----------------------------------------------------------------

  const neck = new THREE.Group();
  neck.position.set(0, 0.07, 0.31);
  body.add(neck);

  // Arched and rising: the most recognisable line on the whole animal. It has to
  // lean well forward — a long upright neck reads as a llama.
  b.place(neck, 'cloth', limbPlate(0.058, 0.105, 0.24), [0, 0.12, 0.048], [0.6, 0, 0], [0.8, 1, 1]);

  // Mane, in strands up the crest — the same trick as the plume on a helm.
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    b.place(
      neck,
      'dark',
      plate(bladeShape(0.05 - t * 0.012, 0.1 - t * 0.03, 0.55), 0.009, 0.003),
      [0, 0.03 + t * 0.19, -0.035 + t * 0.11],
      [0.6, 0, 0],
    );
  }

  // -- head ----------------------------------------------------------------

  const head = new THREE.Group();
  head.position.set(0, 0.225, 0.13);
  neck.add(head);

  // Skull tapering into a muzzle, rotated past the horizontal so the nose points
  // forward and slightly down, the way a horse actually carries its head.
  b.place(
    head,
    'cloth',
    turned([[0.052, -0.03], [0.058, 0.01], [0.05, 0.08], [0.04, 0.14], [0.034, 0.18], [0.02, 0.2]], 16),
    [0, 0.01, 0.02],
    [1.62, 0, 0],
    [0.86, 1, 1],
  );
  b.place(head, 'cloth', dome(0.045, 0.7), [0, -0.022, 0.045], [0.6, 0, 0], [0.86, 1, 1]); // jaw

  // Chamfron: the plate down the face, with a spike for rank.
  b.place(head, 'steel', plate(tearShape(0.082, 0.16, 0.45), 0.018, 0.006), [0, 0.028, 0.075], [1.5, 0, 0]);
  if (rank >= 1) {
    b.place(head, 'gold', plate(bladeShape(0.026, 0.085, 0.5), 0.01, 0.004), [0, 0.072, 0.045], [-0.25, 0, 0]);
  }

  // Ears, small and pricked forward. Leaving them off is what makes a horse
  // head read as a fish.
  for (const side of [1, -1]) {
    b.place(
      head,
      'cloth',
      plate(bladeShape(0.03, 0.055, 0.6), 0.008, 0.003),
      [side * 0.028, 0.055, -0.025],
      [-0.3, 0, side * 0.28],
    );
  }
  // Eyes carry the army's colour, the same tell as the rider's visor slit.
  for (const side of [1, -1]) {
    b.place(head, 'visor', dome(0.013, 0.8), [side * 0.042, 0.025, 0.035], [1.2, 0, side * 0.5]);
  }

  // -- legs ----------------------------------------------------------------

  const legs: MountJoints['legs'] = [];
  for (const [side, front] of [
    [1, true],
    [-1, true],
    [1, false],
    [-1, false],
  ] as const) {
    const upper = new THREE.Group();
    upper.position.set(side * HORSE.span, HORSE.legTop, front ? HORSE.frontZ : HORSE.hindZ);
    body.add(upper);

    const lower = new THREE.Group();
    lower.position.y = HORSE.knee;
    upper.add(lower);

    if (front) {
      b.place(upper, 'cloth', dome(0.058, 0.85), [0, 0.015, 0]);
      b.place(upper, 'cloth', limbPlate(0.05, 0.03, 0.2), [0, -0.095, 0], undefined, [1, 1, 1.15]);
      b.place(lower, 'cloth', limbPlate(0.025, 0.019, 0.17), [0, -0.085, 0]);
      if (rank >= 1) b.place(upper, 'steel', band(0.052, 0.007), [0, -0.03, 0]);
    } else {
      // The hind legs carry the drive: a heavy gaskin, and a hock that breaks
      // the opposite way from a knee.
      b.place(upper, 'cloth', dome(0.078, 0.8), [0, 0.005, -0.012]);
      b.place(upper, 'cloth', limbPlate(0.07, 0.034, 0.21), [0, -0.1, -0.014], [-0.14, 0, 0], [1, 1, 1.2]);
      b.place(lower, 'cloth', limbPlate(0.027, 0.02, 0.17), [0, -0.085, 0.024], [0.18, 0, 0]);
    }

    // Fetlock and hoof.
    const toe = front ? 0 : 0.045;
    b.place(lower, 'dark', dome(0.025, 0.9), [0, -0.152, toe]);
    b.place(lower, 'dark', new THREE.CylinderGeometry(0.029, 0.035, 0.05, 12), [0, -0.19, toe]);

    legs.push({ upper, lower });
  }

  // -- tail ----------------------------------------------------------------
  // A tapered fall of hair in two segments. A flat blade read as a board
  // sticking out of the horse from any angle but the side.

  const tail: THREE.Group[] = [];
  // Thin strands read as a spike; it needs real volume in the middle.
  const strands: [THREE.Vector3Tuple, number, number, number][] = [
    // [segment origin, top radius, bottom radius, tilt]
    [[0, 0.075, -0.37], 0.026, 0.05, 0.45],
    [[0, -0.135, -0.048], 0.05, 0.012, 0.18],
  ];
  let parent: THREE.Object3D = body;
  for (const [origin, top, bottom, tilt] of strands) {
    const segment = new THREE.Group();
    segment.position.set(...origin);
    parent.add(segment);
    b.place(segment, 'dark', limbPlate(top, bottom, 0.16), [0, -0.07, -0.015], [tilt, 0, 0], [0.75, 1, 0.9]);
    tail.push(segment);
    parent = segment;
  }

  return { body, neck, head, legs, tail, restY: HORSE.bodyY };
}
