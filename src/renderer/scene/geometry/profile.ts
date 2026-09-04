/**
 * Small helpers for building lathe profiles.
 *
 * A classical Staunton piece is a surface of revolution, so the honest way to
 * author one is a 2D silhouette spun around Y — no external mesh file needed,
 * and every proportion stays a tunable number rather than baked vertices.
 */

import * as THREE from 'three';

export type ControlPoint = [radius: number, height: number];

/**
 * Samples a Catmull-Rom spline through the control points so a dozen numbers
 * describe a smooth turned profile.
 *
 * @param points   control points, bottom to top, radius first
 * @param samples  output resolution
 */
export function smoothProfile(points: ControlPoint[], samples = 64): THREE.Vector2[] {
  const vectors = points.map(([r, h]) => new THREE.Vector2(r, h));
  if (vectors.length < 3) return vectors;

  const curve = new THREE.SplineCurve(vectors);
  const sampled = curve.getPoints(samples);

  // The lathe must not have a negative radius or it self-intersects.
  for (const point of sampled) point.x = Math.max(point.x, 0);

  // Pin the true endpoints — spline sampling can drift off them slightly.
  sampled[0].copy(vectors[0]);
  sampled[sampled.length - 1].copy(vectors[vectors.length - 1]);
  return sampled;
}

/**
 * The turned foot and stem that every Staunton piece shares.
 *
 * @param baseRadius radius of the foot disc
 * @param stemTop    height at which the piece's own top begins
 */
export function pedestal(baseRadius: number, stemTop: number): ControlPoint[] {
  const r = baseRadius;
  return [
    [0.0, 0.0],
    [r * 0.99, 0.0],
    [r, 0.012],
    [r * 0.97, 0.045],
    [r * 0.8, 0.062],
    [r * 0.62, 0.075],
    [r * 0.47, 0.105],
    [r * 0.4, stemTop * 0.55],
    [r * 0.38, stemTop * 0.8],
    [r * 0.42, stemTop],
  ];
}

/** A flared collar, the ring that sits under most Staunton heads. */
export function collar(radius: number, atHeight: number, flare = 1.45): ControlPoint[] {
  return [
    [radius * 0.95, atHeight],
    [radius * flare, atHeight + radius * 0.16],
    [radius * flare * 0.92, atHeight + radius * 0.3],
    [radius * 0.78, atHeight + radius * 0.42],
  ];
}

export function lathe(points: ControlPoint[], segments = 48): THREE.LatheGeometry {
  const geometry = new THREE.LatheGeometry(smoothProfile(points), segments);
  geometry.computeVertexNormals();
  return geometry;
}
