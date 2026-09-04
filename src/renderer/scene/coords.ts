/**
 * Board ↔ world coordinate mapping.
 *
 * The board is centred on the origin, lies in the XZ plane, and each square is
 * one world unit. White plays from -Z looking toward +Z.
 */

import * as THREE from 'three';
import { fileIndex, rankIndex, squareAt, type Color, type Square } from '../core/types';

export const SQUARE_SIZE = 1;
export const BOARD_SPAN = SQUARE_SIZE * 8;
export const HALF = BOARD_SPAN / 2;
export const BOARD_THICKNESS = 0.25;
export const BORDER = 0.45;

/** Centre of a square, on the playing surface (y = 0). */
export function squareToWorld(square: Square, target = new THREE.Vector3()): THREE.Vector3 {
  const x = (fileIndex(square) - 3.5) * SQUARE_SIZE;
  const z = (3.5 - rankIndex(square)) * SQUARE_SIZE;
  return target.set(x, 0, z);
}

/** Nearest square to a world point, or null if the point is off the board. */
export function worldToSquare(point: THREE.Vector3): Square | null {
  const file = Math.round(point.x / SQUARE_SIZE + 3.5);
  const rank = Math.round(3.5 - point.z / SQUARE_SIZE);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return squareAt(file, rank);
}

export function isLightSquare(square: Square): boolean {
  return (fileIndex(square) + rankIndex(square)) % 2 === 1;
}

/**
 * Pieces face the enemy. White's home rank is at +Z, so white looks down -Z.
 * Meshes are authored facing +Z, which is why white gets the half turn.
 */
export function facingFor(color: Color): number {
  return color === 'w' ? Math.PI : 0;
}

/** Yaw that makes a piece look from `from` toward `to`. */
export function headingBetween(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}
