/**
 * Renders every piece for the active theme and drives it from the motion
 * registry each frame.
 *
 * Both themes read the SAME motion state — the director does not know or care
 * which theme is mounted. That is what makes swapping themes mid-game free.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Color, PieceState, PieceType, ThemeId } from '../core/types';
import { facingFor } from './coords';
import { PIECE_HEIGHT, stauntonGeometry } from './geometry/staunton';
import { buildCharacter, type CharacterBuild } from './geometry/character';
import { applyPose } from './animation/poses';
import { ensureMotion, motionFor, snapTo } from './animation/motion';

const CLASSICAL_MATERIAL: Record<Color, THREE.MeshStandardMaterialParameters> = {
  w: { color: 0xf0e6d2, roughness: 0.34, metalness: 0.06 },
  b: { color: 0x2b2a2e, roughness: 0.38, metalness: 0.12 },
};

/** Applies shared motion state (position, yaw, fade, aura) to a piece root. */
function useMotionSync(
  piece: PieceState,
  group: React.RefObject<THREE.Group | null>,
  materials: THREE.Material[],
  onFrame?: (poseTime: number, pose: ReturnType<typeof motionFor>) => void,
) {
  useFrame(() => {
    const node = group.current;
    if (!node) return;
    const motion = motionFor(piece.id);
    if (!motion) return;

    node.visible = motion.visible;
    if (!motion.visible) return;

    node.position.copy(motion.position);
    node.rotation.y = motion.yaw;
    node.scale.setScalar(motion.scale);

    for (const material of materials) {
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.opacity !== undefined) {
        standard.opacity = motion.opacity;
        standard.transparent = motion.opacity < 0.999;
      }
      if (standard.emissive && standard.userData.baseEmissive !== undefined) {
        // Enough to bloom hard without erasing the silhouette inside the glow.
        standard.emissiveIntensity = standard.userData.baseEmissive + motion.aura * 1.35;
        if (motion.aura > 0.01) standard.emissive.copy(motion.auraColor);
        else if (standard.userData.baseColor) standard.emissive.set(standard.userData.baseColor);
      }
    }

    onFrame?.(motion.poseTime, motion);
  });
}

// ---------------------------------------------------------------------------

function ClassicalPiece({ piece }: { piece: PieceState }) {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => stauntonGeometry(piece.type), [piece.type]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      ...CLASSICAL_MATERIAL[piece.color],
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    m.userData.baseEmissive = 0;
    m.userData.baseColor = 0x000000;
    return m;
  }, [piece.color]);

  useEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    ensureMotion(piece.id, piece.square, facingFor(piece.color));
  }, [piece.id, piece.square, piece.color]);

  useMotionSync(piece, group, [material]);

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      {/* Contact shadow disc — cheap grounding that survives low shadow quality. */}
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[PIECE_HEIGHT[piece.type] * 0.24, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------

function AnimatedPiece({ piece }: { piece: PieceState }) {
  const group = useRef<THREE.Group>(null);
  const build = useRef<CharacterBuild | null>(null);

  const character = useMemo<CharacterBuild>(() => {
    const created = buildCharacter(piece.type, piece.color);
    for (const material of created.materials) {
      const standard = material as THREE.MeshStandardMaterial;
      standard.userData.baseEmissive = standard.emissiveIntensity ?? 0;
      standard.userData.baseColor = standard.emissive?.getHex() ?? 0x000000;
    }
    build.current = created;
    return created;
  }, [piece.type, piece.color]);

  useEffect(
    () => () => {
      for (const material of character.materials) material.dispose();
      for (const geometry of character.geometries) geometry.dispose();
    },
    [character],
  );

  useLayoutEffect(() => {
    ensureMotion(piece.id, piece.square, facingFor(piece.color));
  }, [piece.id, piece.square, piece.color]);

  useMotionSync(piece, group, character.materials, (poseTime) => {
    const motion = motionFor(piece.id);
    if (!motion) return;
    applyPose(character.joints, motion.pose, poseTime, piece.type);
  });

  // Idle poses advance on their own clock so the board is never frozen.
  useFrame((_, delta) => {
    const motion = motionFor(piece.id);
    if (motion && (motion.pose === 'idle' || motion.pose === 'seated')) motion.poseTime += delta;
  });

  return (
    <group ref={group}>
      <primitive object={character.group} />
      {/* A horse's shadow is long, not round; the disc turns with the piece. */}
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={piece.type === 'n' ? [0.85, 1.5, 1] : 1}>
        <circleGeometry args={[0.3, 20]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------

interface PiecesProps {
  pieces: PieceState[];
  theme: ThemeId;
  gameId: number;
}

export function Pieces({ pieces, theme, gameId }: PiecesProps) {
  // A new game resets every piece to its home square with no animation.
  useLayoutEffect(() => {
    for (const piece of pieces) snapTo(piece.id, piece.square, facingFor(piece.color));
    // Only on a genuinely new game, never on an ordinary move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, theme]);

  return (
    <group>
      {pieces.map((piece) =>
        theme === 'animated' ? (
          // The key includes the type so a promotion rebuilds the character.
          <AnimatedPiece key={`${piece.id}-${piece.type}`} piece={piece} />
        ) : (
          <ClassicalPiece key={`${piece.id}-${piece.type}`} piece={piece} />
        ),
      )}
    </group>
  );
}

export type { PieceType };
