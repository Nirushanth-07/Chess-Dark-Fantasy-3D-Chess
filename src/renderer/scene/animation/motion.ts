/**
 * Mutable per-piece motion state.
 *
 * The director writes here every frame and the piece components read it inside
 * `useFrame`. Deliberately OUTSIDE React state: animating 32 pieces through
 * `setState` at 60 fps would re-render the tree 60 times a second for no reason.
 */

import * as THREE from 'three';
import type { PieceId, Square } from '../../core/types';
import { squareToWorld } from '../coords';
import type { PoseName } from './poses';

export interface PieceMotion {
  position: THREE.Vector3;
  yaw: number;
  pose: PoseName;
  /** Seconds for looping poses, normalised 0…1 for one-shot poses. */
  poseTime: number;
  opacity: number;
  /** 0…1 emissive boost, driven by the aura system. */
  aura: number;
  auraColor: THREE.Color;
  visible: boolean;
  /** Non-uniform scale used by the shatter/dissolve fallback. */
  scale: number;
}

const registry = new Map<PieceId, PieceMotion>();

export function motionFor(id: PieceId): PieceMotion | undefined {
  return registry.get(id);
}

export function ensureMotion(id: PieceId, square: Square | null, yaw: number): PieceMotion {
  let entry = registry.get(id);
  if (!entry) {
    entry = {
      position: square ? squareToWorld(square) : new THREE.Vector3(0, -5, 0),
      yaw,
      pose: 'idle',
      poseTime: Math.random() * 4, // desynchronise idle breathing across the board
      opacity: 1,
      aura: 0,
      auraColor: new THREE.Color(0xffffff),
      visible: square !== null,
      scale: 1,
    };
    registry.set(id, entry);
  }
  return entry;
}

/** Snaps a piece to its square with no animation — used on load and on skip. */
export function snapTo(id: PieceId, square: Square | null, yaw: number): void {
  const entry = ensureMotion(id, square, yaw);
  if (square) {
    squareToWorld(square, entry.position);
    entry.visible = true;
    entry.opacity = 1;
    entry.scale = 1;
  } else {
    entry.visible = false;
    entry.opacity = 0;
  }
  entry.yaw = yaw;
  entry.pose = 'idle';
}

export function clearMotion(): void {
  registry.clear();
}

export function allMotion(): Map<PieceId, PieceMotion> {
  return registry;
}
