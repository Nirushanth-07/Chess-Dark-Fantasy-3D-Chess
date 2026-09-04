/**
 * Square overlays: selection, legal targets, the last move, and the checked
 * king. All are emissive so the bloom pass picks them up.
 */

import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Square } from '../core/types';
import { SQUARE_SIZE, squareToWorld } from './coords';

const Y = 0.012;

function Overlay({
  square,
  color,
  opacity,
  ring = false,
}: {
  square: Square;
  color: string;
  opacity: number;
  ring?: boolean;
}) {
  const position = squareToWorld(square);
  return (
    <mesh position={[position.x, Y, position.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      {ring ? (
        <ringGeometry args={[SQUARE_SIZE * 0.16, SQUARE_SIZE * 0.24, 24]} />
      ) : (
        <planeGeometry args={[SQUARE_SIZE * 0.96, SQUARE_SIZE * 0.96]} />
      )}
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** The checked king's square pulses — it must be impossible to miss. */
function Pulse({ square, color }: { square: Square; color: string }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const position = squareToWorld(square);

  useFrame(({ clock }) => {
    if (material.current) {
      material.current.opacity = 0.3 + Math.sin(clock.elapsedTime * 6) * 0.22;
    }
  });

  return (
    <mesh position={[position.x, Y + 0.001, position.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={3}>
      <planeGeometry args={[SQUARE_SIZE * 0.98, SQUARE_SIZE * 0.98]} />
      <meshBasicMaterial ref={material} color={color} transparent opacity={0.4} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

interface HighlightsProps {
  selected: Square | null;
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  checkedKing: Square | null;
  captureTargets: Set<Square>;
}

export function Highlights({ selected, targets, lastMove, checkedKing, captureTargets }: HighlightsProps) {
  return (
    <group>
      {lastMove && (
        <>
          <Overlay square={lastMove.from} color="#f2c96b" opacity={0.16} />
          <Overlay square={lastMove.to} color="#f2c96b" opacity={0.24} />
        </>
      )}
      {selected && <Overlay square={selected} color="#7fe3ff" opacity={0.4} />}
      {targets.map((square) =>
        captureTargets.has(square) ? (
          // A capturable square gets a full outline rather than a dot.
          <Overlay key={square} square={square} color="#ff6b4a" opacity={0.38} />
        ) : (
          <Overlay key={square} square={square} color="#7fe3ff" opacity={0.55} ring />
        ),
      )}
      {checkedKing && <Pulse square={checkedKing} color="#ff2d18" />}
    </group>
  );
}
