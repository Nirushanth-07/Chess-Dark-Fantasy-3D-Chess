/**
 * The 3D canvas. Composes board, pieces, lighting, director and post-processing.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing';
import { useGame, actions } from '../ui/useGame';
import { Board } from './Board';
import { Highlights } from './Highlights';
import { Pieces } from './Pieces';
import { DirectorRunner } from './DirectorRunner';
import { CameraRig, Lights, ProceduralEnvironment } from './Stage';
import { useThree } from '@react-three/fiber';
import type { Square } from '../core/types';

/** Exposes the r3f camera on the debug handle, for tuning and smoke tests. */
function DebugHandle() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  window.__chess.view = { camera, controls };
  return null;
}

export function GameScene() {
  const theme = useGame((s) => s.config.theme);
  const humanColor = useGame((s) => s.config.humanColor);
  const gameId = useGame((s) => s.gameId);
  const pieces = useGame((s) => s.pieces);
  const selected = useGame((s) => s.selected);
  const targets = useGame((s) => s.targets);
  const lastMove = useGame((s) => s.lastMove);
  const checkedKing = useGame((s) => s.checkedKing);

  // Which of the highlighted targets are captures — they get a different marker.
  const captureTargets = useMemo(() => {
    const occupied = new Set<Square>();
    for (const piece of pieces) if (piece.square) occupied.add(piece.square);
    return new Set(targets.filter((square) => occupied.has(square)));
  }, [targets, pieces]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.1, far: 100, position: [0, 7.4, 8.2] }}
      gl={{ antialias: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.92 }}
      onCreated={({ gl }) => {
        gl.setClearColor(theme === 'classical' ? '#1c1a17' : '#07080b');
      }}
    >
      <ProceduralEnvironment theme={theme} />
      <Lights theme={theme} />
      <CameraRig humanColor={humanColor} gameId={gameId} />

      <Board theme={theme} onSquareClick={actions.clickSquare} />
      <Highlights
        selected={selected}
        targets={targets}
        lastMove={lastMove}
        checkedKing={checkedKing}
        captureTargets={captureTargets}
      />
      <Pieces pieces={pieces} theme={theme} gameId={gameId} />

      <DirectorRunner />
      <DebugHandle />

      <EffectComposer enableNormalPass={false}>
        <Bloom
          intensity={theme === 'animated' ? 0.85 : 0.4}
          luminanceThreshold={0.72}
          luminanceSmoothing={0.28}
          mipmapBlur
        />
        <Vignette offset={0.28} darkness={theme === 'animated' ? 0.75 : 0.45} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}
