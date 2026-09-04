/**
 * Camera rig, lighting and environment.
 *
 * The environment map is generated procedurally with PMREM rather than loaded
 * from a CDN HDR — the app must work offline, and a gradient sky is all these
 * materials need to stop looking flat.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Color, ThemeId } from '../core/types';
import { consumeShake } from './animation/cameraShake';

/** Builds a two-tone gradient environment and installs it on the scene. */
export function ProceduralEnvironment({ theme }: { theme: ThemeId }) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();

    const source = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(50, 32, 32);
    const top = theme === 'classical' ? new THREE.Color(0xbfd2e8) : new THREE.Color(0x2c3a4d);
    const bottom = theme === 'classical' ? new THREE.Color(0x3a3129) : new THREE.Color(0x0b0d11);

    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { top: { value: top }, bottom: { value: bottom } },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 bottom;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y * 0.5 + 0.5;
          gl_FragColor = vec4(mix(bottom, top, smoothstep(0.0, 0.8, h)), 1.0);
        }
      `,
    });
    source.add(new THREE.Mesh(geometry, material));

    const target = pmrem.fromScene(source, 0.04);
    scene.environment = target.texture;

    return () => {
      target.dispose();
      pmrem.dispose();
      geometry.dispose();
      material.dispose();
      scene.environment = null;
    };
  }, [gl, scene, theme]);

  return null;
}

export function Lights({ theme }: { theme: ThemeId }) {
  const classical = theme === 'classical';
  return (
    <>
      <hemisphereLight
        args={[classical ? 0xdfe9f5 : 0x5a6b82, classical ? 0x4a3d2f : 0x0d1014, classical ? 0.5 : 0.5]}
      />
      <directionalLight
        position={[6, 11, 5]}
        intensity={classical ? 1.35 : 1.7}
        color={classical ? 0xfff3dd : 0xd8e6ff}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
      />
      {/* Rim lights in each army's accent colour — sells the armour silhouettes. */}
      <directionalLight position={[-7, 4, -6]} intensity={classical ? 0.5 : 1.0} color={0x7fb6ff} />
      <directionalLight position={[7, 3, -7]} intensity={classical ? 0.35 : 0.8} color={0xff8b52} />
      <ambientLight intensity={classical ? 0.22 : 0.22} />
    </>
  );
}

interface CameraRigProps {
  humanColor: Color;
  /** Bumping this re-frames the camera to the player's side. */
  gameId: number;
}

export function CameraRig({ humanColor, gameId }: CameraRigProps) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const shakeOffset = useMemo(() => new THREE.Vector3(), []);

  // Frame the board from behind the human's back rank.
  useEffect(() => {
    const z = humanColor === 'w' ? 8.2 : -8.2;
    camera.position.set(0, 7.4, z);
    camera.lookAt(0, 0, 0);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
  }, [camera, humanColor, gameId]);

  useFrame((_, delta) => {
    const strength = consumeShake(delta);
    // Undo last frame's offset before applying this frame's, so shake never
    // accumulates into a drifting camera.
    camera.position.sub(shakeOffset);
    if (strength > 0.001) {
      shakeOffset.set(
        (Math.random() - 0.5) * strength * 0.22,
        (Math.random() - 0.5) * strength * 0.16,
        (Math.random() - 0.5) * strength * 0.22,
      );
    } else {
      shakeOffset.set(0, 0, 0);
    }
    camera.position.add(shakeOffset);
  });

  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      minDistance={5}
      maxDistance={18}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2 - 0.08}
      enableDamping
      dampingFactor={0.08}
      makeDefault
    />
  );
}
