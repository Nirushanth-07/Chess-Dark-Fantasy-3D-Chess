/**
 * Geometry primitives for building plate armour.
 *
 * Real armour is made of overlapping *forged plates* with rolled, bevelled
 * edges — that bevel catching the light is most of what makes armour read as
 * armour rather than as a painted cylinder. So the vocabulary here is plates,
 * shells, domes and trim rather than boxes and capsules.
 */

import * as THREE from 'three';
import { smoothProfile, type ControlPoint } from './profile';

/** Which material a part is drawn with. Parts are merged per joint per key. */
export type MatKey = 'steel' | 'dark' | 'cloth' | 'gold' | 'visor';

/**
 * An extruded plate with a rolled edge, centred on its own depth.
 * The bevel is the whole point: it gives armour its forged highlight.
 */
export function plate(shape: THREE.Shape, depth: number, bevel = 0.01): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** A squashed hemisphere — the base shape for pauldrons, couters and poleyns. */
export function dome(
  radius: number,
  squash = 0.7,
  phiLength = Math.PI * 2,
  thetaLength = Math.PI * 0.55,
): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, 18, 12, 0, phiLength, 0, thetaLength);
  geometry.scale(1, squash, 1);
  return geometry;
}

/** A turned volume from a radius/height profile, optionally made oval. */
export function turned(points: ControlPoint[], segments = 28, depthScale = 1): THREE.BufferGeometry {
  const geometry = new THREE.LatheGeometry(smoothProfile(points, 40), segments);
  if (depthScale !== 1) geometry.scale(1, 1, depthScale);
  geometry.computeVertexNormals();
  return geometry;
}

/** Decorative banding — belts, gorget rims, crown bases, weapon ferrules. */
export function band(radius: number, tube: number, depthScale = 1): THREE.BufferGeometry {
  const geometry = new THREE.TorusGeometry(radius, tube, 8, 24);
  geometry.rotateX(Math.PI / 2);
  if (depthScale !== 1) geometry.scale(1, 1, depthScale);
  return geometry;
}

/**
 * A tapered limb segment. Armour tapers toward the joint, which is what stops
 * arms and legs reading as tubes.
 */
export function limbPlate(topRadius: number, bottomRadius: number, length: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, length, 14, 1);
  geometry.scale(1, 1, 0.92);
  return geometry;
}

/** A rounded, slightly pointed plate outline — the workhorse armour silhouette. */
export function tearShape(width: number, height: number, point = 0.35): THREE.Shape {
  const shape = new THREE.Shape();
  const w = width / 2;
  shape.moveTo(0, height * 0.5);
  shape.bezierCurveTo(w * 0.9, height * 0.46, w, height * 0.1, w * 0.78, -height * (0.5 - point));
  shape.bezierCurveTo(w * 0.6, -height * 0.5, w * 0.25, -height * 0.54, 0, -height * 0.55);
  shape.bezierCurveTo(-w * 0.25, -height * 0.54, -w * 0.6, -height * 0.5, -w * 0.78, -height * (0.5 - point));
  shape.bezierCurveTo(-w, height * 0.1, -w * 0.9, height * 0.46, 0, height * 0.5);
  return shape;
}

/** A leaf/blade outline used for weapon heads and crest fins. */
export function bladeShape(width: number, length: number, tip = 0.32): THREE.Shape {
  const shape = new THREE.Shape();
  const w = width / 2;
  shape.moveTo(0, length * 0.5);
  shape.lineTo(w, length * (0.5 - tip));
  shape.lineTo(w * 0.72, -length * 0.5);
  shape.lineTo(-w * 0.72, -length * 0.5);
  shape.lineTo(-w, length * (0.5 - tip));
  shape.closePath();
  return shape;
}

/**
 * Collects geometry per joint and per material, then merges each bucket into a
 * single mesh.
 *
 * Without this, a character detailed enough to look forged would be 60+ meshes,
 * and 32 of them would be ~2000 draw calls before the shadow pass. Merging by
 * joint keeps the rig animatable while collapsing that to roughly one mesh per
 * joint per material.
 */
export class ArmourBuilder {
  private buckets = new Map<THREE.Object3D, Map<MatKey, THREE.BufferGeometry[]>>();

  /**
   * @param transform applied to the geometry before it is merged, in the
   *                  joint's local space.
   */
  add(joint: THREE.Object3D, key: MatKey, geometry: THREE.BufferGeometry, transform?: THREE.Matrix4): void {
    if (transform) geometry.applyMatrix4(transform);
    let byMaterial = this.buckets.get(joint);
    if (!byMaterial) {
      byMaterial = new Map();
      this.buckets.set(joint, byMaterial);
    }
    const list = byMaterial.get(key);
    if (list) list.push(geometry);
    else byMaterial.set(key, [geometry]);
  }

  /** Convenience: position (and optionally rotate) a part in one call. */
  place(
    joint: THREE.Object3D,
    key: MatKey,
    geometry: THREE.BufferGeometry,
    position: [number, number, number],
    rotation?: [number, number, number],
    scale?: [number, number, number],
  ): void {
    const matrix = new THREE.Matrix4();
    const euler = new THREE.Euler(...(rotation ?? [0, 0, 0]));
    matrix.compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(euler),
      new THREE.Vector3(...(scale ?? [1, 1, 1])),
    );
    this.add(joint, key, geometry, matrix);
  }

  /** Mirrors a part to the other side of the body. */
  mirrored(source: THREE.BufferGeometry): THREE.BufferGeometry {
    const clone = source.clone();
    clone.scale(-1, 1, 1);
    // Flipping one axis inverts winding, so normals must be rebuilt.
    clone.computeVertexNormals();
    return clone;
  }

  build(materials: Record<MatKey, THREE.Material>): {
    meshes: THREE.Mesh[];
    geometries: THREE.BufferGeometry[];
  } {
    const meshes: THREE.Mesh[] = [];
    const geometries: THREE.BufferGeometry[] = [];

    for (const [joint, byMaterial] of this.buckets) {
      for (const [key, parts] of byMaterial) {
        const merged = mergeAll(parts);
        if (!merged) continue;
        geometries.push(merged);
        const mesh = new THREE.Mesh(merged, materials[key]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        joint.add(mesh);
        meshes.push(mesh);
      }
    }
    return { meshes, geometries };
  }
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];

  // Lathes and spheres are indexed; extrusions are not. mergeGeometries refuses
  // the mix, so everything is de-indexed first.
  const flattened = parts.map((part) => {
    const geometry = part.index ? part.toNonIndexed() : part;
    // Merging also requires identical attribute sets; drop anything exotic.
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') {
        geometry.deleteAttribute(name);
      }
    }
    if (!geometry.attributes.uv) {
      const count = geometry.attributes.position.count;
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    }
    return geometry;
  });

  const merged = mergeGeometriesSafe(flattened);
  for (const part of parts) if (!flattened.includes(part)) part.dispose();
  return merged;
}

function mergeGeometriesSafe(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertexCount = 0;
  for (const part of parts) vertexCount += part.attributes.position.count;

  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);

  let offset = 0;
  for (const part of parts) {
    const count = part.attributes.position.count;
    position.set(part.attributes.position.array as ArrayLike<number>, offset * 3);
    normal.set(part.attributes.normal.array as ArrayLike<number>, offset * 3);
    uv.set(part.attributes.uv.array as ArrayLike<number>, offset * 2);
    offset += count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.computeBoundingSphere();
  return merged;
}
