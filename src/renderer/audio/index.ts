/**
 * Wires the audio layer to the game store's event bus.
 *
 * Audio subscribes to game events rather than being called from the scene, so
 * sound stays correct whether a move came from a click, the engine, or a
 * skipped animation.
 */

import { gameStore } from '../core/gameStore';
import {
  playCheck,
  playDefeat,
  playDraw,
  playIllegal,
  playPlace,
  playPromote,
  playVictory,
  startAmbient,
  stopAmbient,
} from './sfx';
import { resumeAudio } from './synth';

export * from './sfx';
export { resumeAudio, setMasterVolume, setMusicVolume } from './synth';

let detach: (() => void) | null = null;

export function initAudio(): () => void {
  if (detach) return detach;

  const unsubscribe = gameStore.getState().subscribeEvents((event) => {
    switch (event.type) {
      case 'illegal':
        playIllegal();
        break;

      case 'cinematic-start': {
        const cinematic = event.cinematic;
        if (!cinematic) break;
        if (cinematic.kind === 'move' || cinematic.kind === 'castle') playPlace();
        if (cinematic.kind === 'promote') playPromote();
        if (cinematic.kind === 'check') playCheck();
        break;
      }

      case 'game-over': {
        const result = event.result;
        if (!result) break;
        const { config } = gameStore.getState();
        if (result.winner === null) {
          playDraw();
        } else if (config.mode === 'human-vs-computer') {
          result.winner === config.humanColor ? playVictory() : playDefeat();
        } else {
          playVictory();
        }
        break;
      }

      default:
        break;
    }
  });

  detach = () => {
    unsubscribe();
    stopAmbient();
    detach = null;
  };
  return detach;
}

/** Must be called from a user gesture before any sound will play. */
export function unlockAudio(): void {
  resumeAudio();
  startAmbient();
}
