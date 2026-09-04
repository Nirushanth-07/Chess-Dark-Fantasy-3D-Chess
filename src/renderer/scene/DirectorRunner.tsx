/**
 * Drives the cinematic director from the store's queue.
 *
 * This is the whole bridge between game logic and the 3D layer: it takes the
 * one active cinematic, plays it, and reports back when it is done so the FSM
 * can unlock input.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Cinematic } from '../core/types';
import { gameStore, currentRules } from '../core/gameStore';
import { actions } from '../ui/useGame';
import { playFootstep, playImpact } from '../audio';
import { CinematicDirector } from './animation/director';
import { motionFor } from './animation/motion';
import { pushShake } from './animation/cameraShake';

export function DirectorRunner() {
  const activeRef = useRef<Cinematic | null>(null);
  const footstepClock = useRef(0);

  const director = useMemo(
    () =>
      new CinematicDirector({
        describe(id) {
          const piece = currentRules().pieceById(id);
          return piece ? { type: piece.type, color: piece.color } : null;
        },
        onImpact(attacker, victim) {
          playImpact(attacker, victim);
        },
        onCameraShake(strength) {
          pushShake(strength);
        },
      }),
    [],
  );

  useFrame((_, delta) => {
    const state = gameStore.getState();
    const active = state.active;

    // A new cinematic arrived — plan it.
    if (active !== activeRef.current) {
      activeRef.current = active;
      if (active) {
        director.configure({
          speed: state.config.animationSpeed,
          animated: state.config.theme === 'animated',
        });
        const duration = director.start(active, state.config.skipAnimations);
        if (duration === 0) {
          actions.completeCinematic();
          return;
        }
      }
    }

    if (!active) {
      applyMomentumAura();
      return;
    }

    if (director.isPlaying) {
      if (director.update(delta)) actions.completeCinematic();
      emitFootsteps(delta, footstepClock, state.config.theme === 'animated');
    } else {
      actions.completeCinematic();
    }
  });

  return null;
}

/**
 * Footsteps are emitted on a timer while anything is walking rather than from
 * the pose itself — the poses are procedural, so there is no keyframe to hang
 * an event on. When GLB clips land in Phase 5 this moves onto clip events.
 */
function emitFootsteps(delta: number, clock: React.RefObject<number>, animated: boolean): void {
  if (!animated) return;
  clock.current -= delta;
  if (clock.current > 0) return;

  for (const [id, motion] of Object.entries(walkingPieces())) {
    if (motion.pose !== 'walk') continue;
    const piece = currentRules().pieceById(id);
    if (piece) {
      playFootstep(piece.type);
      clock.current = 0.3;
      break; // one footfall at a time is plenty
    }
  }
}

function walkingPieces(): Record<string, { pose: string }> {
  const state = gameStore.getState();
  const result: Record<string, { pose: string }> = {};
  for (const piece of state.pieces) {
    const motion = motionFor(piece.id);
    if (motion) result[piece.id] = motion;
  }
  return result;
}

/**
 * Ambient momentum aura (PROJECT_PLAN §6): the leading side's king carries a
 * faint rim glow that tracks material balance. Subtle by design — the player
 * should feel it rather than notice it.
 */
function applyMomentumAura(): void {
  const state = gameStore.getState();
  if (state.phase === 'over') return;

  const balance = state.materialBalance;
  const leader = balance > 60 ? 'w' : balance < -60 ? 'b' : null;
  const intensity = Math.min(0.35, Math.abs(balance) / 2400);

  for (const piece of state.pieces) {
    if (piece.type !== 'k' || piece.square === null) continue;
    const motion = motionFor(piece.id);
    if (!motion) continue;
    if (piece.color === leader) {
      motion.aura = intensity;
      motion.auraColor.set(piece.color === 'w' ? 0x9fd8ff : 0xff9a5c);
    } else if (motion.aura > 0 && motion.aura <= 0.36) {
      motion.aura = 0;
    }
  }
}
