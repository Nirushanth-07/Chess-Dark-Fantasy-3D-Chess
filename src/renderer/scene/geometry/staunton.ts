/**
 * Procedural Staunton chess set — the Classical theme's 3D objects.
 *
 * Every piece is generated at runtime from a lathe profile plus a small amount
 * of added detail geometry (rook crenellations, queen coronet, king cross,
 * knight head). Nothing here loads an external model file, which means the
 * Classical theme ships with zero art dependencies and every proportion below
 * is a number you can tune and see change immediately.
 *
 * All pieces are built for a board with `SQUARE_SIZE = 1` and stand on y = 0.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PieceType } from '../../core/types';
import { collar, lathe, pedestal, type ControlPoint } from './profile';

/**
 * Merges piece parts into one geometry.
 *
 * `mergeGeometries` refuses to mix indexed and non-indexed inputs, and the
 * knight's extruded head is non-indexed while every lathe is indexed. De-index
 * everything first: these pieces are small enough that the extra vertices cost
 * nothing, and it makes the merge total rather than conditional.
 */
function mergeParts(parts: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  const flattened = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const merged = mergeGeometries(flattened, false);
  if (!merged) throw new Error(`Failed to merge geometry for ${label}`);
  // Do NOT recompute normals here: every part already carries correct ones,
  // and recomputing across the merged seams facets the smooth lathe surfaces.
  return merged;
}

/** Height of each piece relative to the board square, king = tallest. */
export const PIECE_HEIGHT: Record<PieceType, number> = {
  p: 0.52,
  n: 0.70,
  b: 0.78,
  r: 0.60,
  q: 0.88,
  k: 1.0,
};

const BASE_RADIUS: Record<PieceType, number> = {
  p: 0.155,
  n: 0.175,
  b: 0.175,
  r: 0.185,
  q: 0.2,
  k: 0.205,
};

// ---------------------------------------------------------------------------
// Individual pieces
// ---------------------------------------------------------------------------

function pawn(): THREE.BufferGeometry {
  const r = BASE_RADIUS.p;
  const h = PIECE_HEIGHT.p;
  const headRadius = r * 0.62;
  const headCentre = h - headRadius * 1.05;

  const points: ControlPoint[] = [
    ...pedestal(r, h * 0.5),
    ...collar(r * 0.42, h * 0.5, 1.7),
    [r * 0.34, h * 0.6],
    // Head sphere, described as a profile arc.
    [headRadius * 0.55, headCentre - headRadius * 0.82],
    [headRadius * 0.95, headCentre - headRadius * 0.45],
    [headRadius, headCentre],
    [headRadius * 0.86, headCentre + headRadius * 0.5],
    [headRadius * 0.45, headCentre + headRadius * 0.88],
    [0, h],
  ];
  return lathe(points);
}

function rook(): THREE.BufferGeometry {
  const r = BASE_RADIUS.r;
  const h = PIECE_HEIGHT.r;
  const rimTop = h - 0.075;
  const towerRadius = r * 0.78;

  const body: ControlPoint[] = [
    ...pedestal(r, h * 0.42),
    [r * 0.5, h * 0.5],
    [r * 0.58, h * 0.62],
    [towerRadius * 0.92, rimTop - 0.09],
    [towerRadius, rimTop - 0.055],
    [towerRadius * 1.06, rimTop - 0.02],
    [towerRadius * 1.06, rimTop],
    [towerRadius * 0.72, rimTop],
    [towerRadius * 0.72, rimTop - 0.03],
    [0, rimTop - 0.035],
  ];

  const parts: THREE.BufferGeometry[] = [lathe(body)];

  // Crenellations: five merlons round the rim. Built as added boxes rather than
  // boolean-subtracted notches — no CSG dependency, and it reads identically.
  const merlonCount = 5;
  const merlonHeight = 0.075;
  // Centre of the rim wall, so each merlon straddles it instead of spanning
  // the whole top face.
  const wallRadius = towerRadius * 0.89;
  for (let i = 0; i < merlonCount; i++) {
    const angle = (i / merlonCount) * Math.PI * 2;
    const merlon = new THREE.BoxGeometry(0.088, merlonHeight, 0.058);
    merlon.translate(0, rimTop + merlonHeight / 2 - 0.008, wallRadius);
    merlon.rotateY(angle);
    parts.push(merlon);
  }

  return mergeParts(parts, 'rook');
}

function bishop(): THREE.BufferGeometry {
  const r = BASE_RADIUS.b;
  const h = PIECE_HEIGHT.b;
  const mitreBase = h * 0.52;

  const body: ControlPoint[] = [
    ...pedestal(r, h * 0.4),
    ...collar(r * 0.42, h * 0.4, 1.75),
    [r * 0.36, mitreBase - 0.03],
    // The mitre: a teardrop tapering to the finial.
    [r * 0.68, mitreBase + 0.02],
    [r * 0.72, mitreBase + 0.06],
    [r * 0.66, mitreBase + 0.14],
    [r * 0.5, mitreBase + 0.22],
    [r * 0.28, mitreBase + 0.28],
    [r * 0.13, mitreBase + 0.305],
    // Finial ball.
    [r * 0.2, h - 0.055],
    [r * 0.22, h - 0.035],
    [r * 0.15, h - 0.012],
    [0, h],
  ];

  const parts: THREE.BufferGeometry[] = [lathe(body)];

  // The mitre slit — the detail that makes a bishop read as a bishop.
  const slit = new THREE.BoxGeometry(0.016, 0.14, r * 0.85);
  slit.translate(0, mitreBase + 0.14, r * 0.18);
  slit.rotateX(-0.32);
  parts.push(slit);

  return mergeParts(parts, 'bishop');
}

function queen(): THREE.BufferGeometry {
  const r = BASE_RADIUS.q;
  const h = PIECE_HEIGHT.q;
  const crownBase = h * 0.58;
  const crownRadius = r * 0.72;

  const body: ControlPoint[] = [
    ...pedestal(r, h * 0.36),
    ...collar(r * 0.42, h * 0.36, 1.7),
    [r * 0.33, h * 0.46],
    [r * 0.36, crownBase - 0.06],
    // Flared coronet cup.
    [crownRadius * 0.86, crownBase - 0.01],
    [crownRadius, crownBase + 0.035],
    [crownRadius * 0.96, crownBase + 0.075],
    [crownRadius * 0.6, crownBase + 0.085],
    [crownRadius * 0.58, crownBase + 0.06],
    [0, crownBase + 0.055],
  ];

  const parts: THREE.BufferGeometry[] = [lathe(body)];

  // Coronet points.
  const points = 9;
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const spike = new THREE.SphereGeometry(0.028, 10, 8);
    spike.translate(crownRadius * 0.88, crownBase + 0.085, 0);
    spike.rotateY(angle);
    parts.push(spike);
  }

  // Central finial.
  const finial = new THREE.SphereGeometry(0.045, 16, 12);
  finial.translate(0, h - 0.045, 0);
  parts.push(finial);
  const neck = new THREE.CylinderGeometry(0.03, 0.05, 0.07, 16);
  neck.translate(0, crownBase + 0.09, 0);
  parts.push(neck);

  return mergeParts(parts, 'queen');
}

function king(): THREE.BufferGeometry {
  const r = BASE_RADIUS.k;
  const h = PIECE_HEIGHT.k;
  const crownBase = h * 0.6;
  const crownRadius = r * 0.66;
  const crossHeight = 0.16;
  const crossBase = h - crossHeight;

  const body: ControlPoint[] = [
    ...pedestal(r, h * 0.34),
    ...collar(r * 0.42, h * 0.34, 1.7),
    [r * 0.32, h * 0.44],
    [r * 0.35, crownBase - 0.08],
    [crownRadius * 0.88, crownBase - 0.02],
    [crownRadius, crownBase + 0.03],
    [crownRadius * 0.94, crownBase + 0.07],
    [crownRadius * 0.62, crownBase + 0.09],
    [crownRadius * 0.5, crownBase + 0.12],
    [crownRadius * 0.42, crossBase],
    [0, crossBase],
  ];

  const parts: THREE.BufferGeometry[] = [lathe(body)];

  const barThickness = 0.032;
  const vertical = new THREE.BoxGeometry(barThickness, crossHeight, barThickness);
  vertical.translate(0, crossBase + crossHeight / 2, 0);
  parts.push(vertical);

  const horizontal = new THREE.BoxGeometry(0.095, barThickness, barThickness);
  horizontal.translate(0, crossBase + crossHeight * 0.68, 0);
  parts.push(horizontal);

  return mergeParts(parts, 'king');
}

function knight(): THREE.BufferGeometry {
  const r = BASE_RADIUS.n;
  const h = PIECE_HEIGHT.n;
  const neckTop = h * 0.42;

  const body: ControlPoint[] = [
    ...pedestal(r, h * 0.34),
    ...collar(r * 0.42, h * 0.34, 1.6),
    [r * 0.44, neckTop],
    [r * 0.42, neckTop + 0.02],
    [0, neckTop + 0.025],
  ];

  const parts: THREE.BufferGeometry[] = [lathe(body)];

  // The horse head, drawn as a 2D silhouette and extruded. This is the only
  // Staunton piece that is not a surface of revolution.
  //
  // The silhouette lives or dies on four features: the arched neck, two pricked
  // ears, the sloping forehead, and a muzzle with a cut-back jaw. Round any of
  // them off and the piece reads as a blob rather than a horse.
  const head = new THREE.Shape();
  head.moveTo(-0.1, 0.0);
  head.bezierCurveTo(-0.14, 0.1, -0.132, 0.205, -0.075, 0.275); // arched neck
  head.lineTo(-0.055, 0.348); // rear ear
  head.lineTo(-0.005, 0.284);
  head.lineTo(0.032, 0.352); // front ear
  head.lineTo(0.078, 0.272);
  head.bezierCurveTo(0.128, 0.252, 0.168, 0.204, 0.188, 0.148); // forehead
  head.bezierCurveTo(0.204, 0.118, 0.208, 0.094, 0.192, 0.078); // nose
  head.lineTo(0.138, 0.072); // upper lip
  head.bezierCurveTo(0.118, 0.1, 0.102, 0.1, 0.086, 0.072); // mouth notch
  head.bezierCurveTo(0.062, 0.046, 0.03, 0.018, -0.02, 0.004); // jaw and throat
  head.closePath();

  const headGeometry = new THREE.ExtrudeGeometry(head, {
    depth: 0.135,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 4,
    curveSegments: 20,
  });
  // The silhouette is drawn in XY and extruded along Z, so it already reads as
  // a profile from either side of the board. Centre the extrusion on Z and sit
  // it on the neck — do NOT turn it to face the enemy, which would present the
  // head edge-on and lose the shape entirely.
  headGeometry.scale(1.12, 1.12, 1);
  headGeometry.translate(0, 0, -0.0675);
  headGeometry.translate(-0.008, neckTop - 0.02, 0);
  parts.push(headGeometry);

  return mergeParts(parts, 'knight');
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const builders: Record<PieceType, () => THREE.BufferGeometry> = {
  p: pawn,
  n: knight,
  b: bishop,
  r: rook,
  q: queen,
  k: king,
};

const cache = new Map<PieceType, THREE.BufferGeometry>();

/** Geometries are shared across all instances of a piece type. */
export function stauntonGeometry(type: PieceType): THREE.BufferGeometry {
  let geometry = cache.get(type);
  if (!geometry) {
    geometry = builders[type]();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    cache.set(type, geometry);
  }
  return geometry;
}

export function disposeStauntonGeometry(): void {
  for (const geometry of cache.values()) geometry.dispose();
  cache.clear();
}
