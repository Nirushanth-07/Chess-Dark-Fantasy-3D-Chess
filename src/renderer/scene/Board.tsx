/**
 * The board: 64 clickable squares, a bevelled frame, and rank/file labels.
 *
 * Squares are individual meshes rather than one instanced mesh — 64 draw calls
 * is nothing, and it makes picking a plain `onClick` instead of a raycast
 * against instance ids.
 */

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { FILES, RANKS, type Square } from '../core/types';
import { BOARD_SPAN, BOARD_THICKNESS, BORDER, SQUARE_SIZE, isLightSquare, squareToWorld } from './coords';
import type { ThemeId } from '../core/types';

/**
 * Rank/file labels drawn to a canvas rather than rendered with drei's <Text>.
 *
 * Troika (which backs <Text>) fetches font data from a CDN on first use and
 * SUSPENDS until it arrives. Offline that promise never settles, so the whole
 * Canvas subtree — director included — stays suspended and the game freezes
 * mid-cinematic. A canvas texture uses a system font, needs no network, and
 * ships no font file.
 */
function labelTexture(text: string, color: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.font = '600 76px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function Label({
  text,
  color,
  position,
}: {
  text: string;
  color: string;
  position: [number, number, number];
}) {
  const texture = useMemo(() => labelTexture(text, color), [text, color]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.34, 0.34]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

interface BoardProps {
  theme: ThemeId;
  onSquareClick(square: Square): void;
}

const PALETTE: Record<ThemeId, { light: string; dark: string; frame: string; label: string }> = {
  classical: { light: '#e8d8bb', dark: '#8a5a3b', frame: '#3b2617', label: '#f0e4cd' },
  animated: { light: '#9aa3ad', dark: '#20242b', frame: '#12141a', label: '#8e99a6' },
};

export function Board({ theme, onSquareClick }: BoardProps) {
  const palette = PALETTE[theme];

  const materials = useMemo(
    () => ({
      light: new THREE.MeshStandardMaterial({
        color: palette.light,
        roughness: theme === 'classical' ? 0.55 : 0.42,
        metalness: theme === 'classical' ? 0.05 : 0.35,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: palette.dark,
        roughness: theme === 'classical' ? 0.6 : 0.5,
        metalness: theme === 'classical' ? 0.05 : 0.4,
      }),
      frame: new THREE.MeshStandardMaterial({
        color: palette.frame,
        roughness: 0.7,
        metalness: theme === 'classical' ? 0.1 : 0.55,
      }),
    }),
    [palette, theme],
  );

  const squares = useMemo(() => {
    const list: { square: Square; position: THREE.Vector3; light: boolean }[] = [];
    for (const file of FILES) {
      for (const rank of RANKS) {
        const square = `${file}${rank}` as Square;
        list.push({ square, position: squareToWorld(square), light: isLightSquare(square) });
      }
    }
    return list;
  }, []);

  const frameOuter = BOARD_SPAN + BORDER * 2;

  return (
    <group>
      {/* Frame */}
      <mesh position={[0, -BOARD_THICKNESS / 2 - 0.01, 0]} receiveShadow material={materials.frame}>
        <boxGeometry args={[frameOuter, BOARD_THICKNESS, frameOuter]} />
      </mesh>

      {/* Playing surface */}
      {squares.map(({ square, position, light }) => (
        <mesh
          key={square}
          position={[position.x, -0.02, position.z]}
          receiveShadow
          material={light ? materials.light : materials.dark}
          onClick={(event) => {
            event.stopPropagation();
            onSquareClick(square);
          }}
        >
          <boxGeometry args={[SQUARE_SIZE, 0.04, SQUARE_SIZE]} />
        </mesh>
      ))}

      {/* Rank and file labels */}
      {FILES.map((file, index) => (
        <Label
          key={`file-${file}`}
          text={file}
          color={palette.label}
          position={[(index - 3.5) * SQUARE_SIZE, 0.01, BOARD_SPAN / 2 + BORDER * 0.5]}
        />
      ))}
      {RANKS.map((rank, index) => (
        <Label
          key={`rank-${rank}`}
          text={rank}
          color={palette.label}
          position={[-BOARD_SPAN / 2 - BORDER * 0.5, 0.01, (3.5 - index) * SQUARE_SIZE]}
        />
      ))}
    </group>
  );
}
