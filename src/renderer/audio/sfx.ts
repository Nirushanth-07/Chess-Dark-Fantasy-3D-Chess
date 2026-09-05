/**
 * The game's sound palette: movement, combat, UI, stings and an ambient bed.
 *
 * Victory and defeat are given the most attention deliberately — they are the
 * two sounds a player actually remembers.
 */

import type { PieceType } from '../core/types';
import { duckMusic, musicOutput, noise, note, tone } from './synth';

export function playSelect(): void {
  tone({ frequency: 620, duration: 0.07, type: 'triangle', gain: 0.1 });
}

export function playIllegal(): void {
  tone({ frequency: 150, endFrequency: 110, duration: 0.16, type: 'square', gain: 0.09 });
}

export function playHover(): void {
  tone({ frequency: 900, duration: 0.03, type: 'sine', gain: 0.03 });
}

/** Wood-on-wood click for the classical theme. */
export function playPlace(): void {
  noise({ duration: 0.09, frequency: 1500, q: 0.9, gain: 0.28, sweepTo: 500 });
  tone({ frequency: 220, endFrequency: 120, duration: 0.1, type: 'sine', gain: 0.12 });
}

/** Armoured footfall — pitched by how heavy the piece is. */
export function playFootstep(type: PieceType): void {
  const weight: Record<PieceType, number> = { p: 1, n: 0.95, b: 1.2, r: 0.6, q: 0.9, k: 0.7 };
  const w = weight[type];
  noise({ duration: 0.11, frequency: 260 * w, q: 1.6, gain: 0.16, sweepTo: 90 * w });
  tone({ frequency: 70 * w, duration: 0.12, type: 'sine', gain: 0.1 });
  // Mail rustle.
  noise({ duration: 0.07, frequency: 5200, q: 0.7, gain: 0.035, delay: 0.02 });
}

/**
 * The impact at the hit frame of a duel. Character comes from the attacker's
 * weapon; the victim's mass sets the low thud.
 */
export function playImpact(attacker: PieceType, victim: PieceType): void {
  const mass: Record<PieceType, number> = { p: 1.25, n: 1.1, b: 1.15, r: 0.8, q: 0.9, k: 0.75 };
  const m = mass[victim];

  switch (attacker) {
    case 'b':
      // The bishop casts rather than strikes.
      tone({ frequency: 880, endFrequency: 240, duration: 0.5, type: 'sawtooth', gain: 0.16 });
      tone({ frequency: 1320, endFrequency: 300, duration: 0.42, type: 'sine', gain: 0.1, delay: 0.02 });
      noise({ duration: 0.55, frequency: 3000, q: 0.5, gain: 0.14, sweepTo: 400 });
      break;
    case 'r':
      // Poleaxe: a heavy, low cleave.
      noise({ duration: 0.16, frequency: 900, q: 1.1, gain: 0.42, sweepTo: 180 });
      tone({ frequency: 90 * m, endFrequency: 45 * m, duration: 0.35, type: 'sine', gain: 0.3 });
      noise({ duration: 0.4, frequency: 260, q: 2.2, gain: 0.14, delay: 0.03 });
      break;
    case 'n':
      // Lance thrust: sharp and bright.
      noise({ duration: 0.09, frequency: 4200, q: 1.4, gain: 0.34, sweepTo: 1200 });
      tone({ frequency: 2100, endFrequency: 700, duration: 0.14, type: 'triangle', gain: 0.14 });
      tone({ frequency: 110 * m, duration: 0.2, type: 'sine', gain: 0.18 });
      break;
    default:
      // Sword on plate.
      noise({ duration: 0.11, frequency: 2600, q: 1.3, gain: 0.36, sweepTo: 700 });
      tone({ frequency: 1600, endFrequency: 520, duration: 0.18, type: 'triangle', gain: 0.13 });
      tone({ frequency: 100 * m, endFrequency: 55 * m, duration: 0.28, type: 'sine', gain: 0.22 });
      break;
  }

  // Body falling, timed to land after the blow.
  noise({ duration: 0.22, frequency: 180 * m, q: 1.0, gain: 0.2, sweepTo: 60, delay: 0.34 });
}

export function playCheck(): void {
  duckMusic(0.4, 0.9);
  // Low brass cluster — a warning, not a defeat.
  tone({ frequency: note(41), duration: 0.9, type: 'sawtooth', gain: 0.16 });
  tone({ frequency: note(44), duration: 0.9, type: 'sawtooth', gain: 0.13, detune: 6 });
  tone({ frequency: note(48), duration: 0.75, type: 'square', gain: 0.07, delay: 0.05 });
  noise({ duration: 0.6, frequency: 300, q: 0.8, gain: 0.1, sweepTo: 120 });
}

export function playPromote(): void {
  const chord = [note(72), note(76), note(79), note(84)];
  chord.forEach((f, i) => {
    tone({ frequency: f, duration: 0.9 - i * 0.08, type: 'triangle', gain: 0.14, delay: i * 0.05 });
  });
  noise({ duration: 0.7, frequency: 6000, q: 0.4, gain: 0.08, sweepTo: 2000 });
}

/** Rising major fanfare — one of the two sounds a player actually remembers. */
export function playVictory(): void {
  duckMusic(0.15, 3.2);
  const root = 53; // F3
  const fanfare: [number, number][] = [
    [root, 0],
    [root + 4, 0.13],
    [root + 7, 0.26],
    [root + 12, 0.39],
    [root + 12, 0.72],
    [root + 16, 0.85],
    [root + 19, 1.0],
  ];
  for (const [semitone, delay] of fanfare) {
    tone({ frequency: note(semitone), duration: 0.5, type: 'sawtooth', gain: 0.16, delay });
    tone({ frequency: note(semitone + 12), duration: 0.42, type: 'triangle', gain: 0.07, delay });
    tone({ frequency: note(semitone - 12), duration: 0.6, type: 'sine', gain: 0.1, delay });
  }
  // Sustained final chord.
  for (const semitone of [root, root + 7, root + 12, root + 16]) {
    tone({ frequency: note(semitone), duration: 2.4, type: 'sawtooth', gain: 0.1, delay: 1.25, attack: 0.12 });
  }
  noise({ duration: 1.6, frequency: 7000, q: 0.3, gain: 0.05, sweepTo: 1500, delay: 1.2 });
}

/** Slow descending minor dirge. */
export function playDefeat(): void {
  duckMusic(0.1, 3.6);
  const root = 45; // A2
  const dirge: [number, number][] = [
    [root + 12, 0],
    [root + 8, 0.45],
    [root + 7, 0.9],
    [root + 3, 1.4],
    [root, 1.95],
  ];
  for (const [semitone, delay] of dirge) {
    tone({ frequency: note(semitone), duration: 1.1, type: 'sine', gain: 0.18, delay, attack: 0.06 });
    tone({ frequency: note(semitone), duration: 1.0, type: 'sawtooth', gain: 0.05, delay, detune: -8 });
  }
  // Final low drone.
  tone({ frequency: note(root - 12), duration: 3.0, type: 'sine', gain: 0.2, delay: 1.9, attack: 0.3 });
  tone({ frequency: note(root - 12), duration: 2.8, type: 'triangle', gain: 0.06, delay: 2.0, detune: 11 });
  noise({ duration: 2.5, frequency: 140, q: 0.6, gain: 0.06, sweepTo: 50, delay: 1.9 });
}

export function playDraw(): void {
  duckMusic(0.3, 2.0);
  for (const [semitone, delay] of [[57, 0], [60, 0.3], [57, 0.6]] as [number, number][]) {
    tone({ frequency: note(semitone), duration: 1.2, type: 'sine', gain: 0.14, delay });
  }
}

// ---------------------------------------------------------------------------
// Ambient bed
// ---------------------------------------------------------------------------

let ambientTimer: number | null = null;

/** A slow, sparse drone so the board never sits in silence. */
export function startAmbient(): void {
  if (ambientTimer !== null) return;
  const out = musicOutput();
  const step = () => {
    const root = 33 + Math.floor(Math.random() * 3);
    tone({ frequency: note(root), duration: 7.5, type: 'sine', gain: 0.1, attack: 2.0, destination: out });
    tone({ frequency: note(root + 7), duration: 6.5, type: 'sine', gain: 0.05, attack: 2.4, destination: out, delay: 0.8 });
    if (Math.random() < 0.5) {
      tone({ frequency: note(root + 15), duration: 4.0, type: 'triangle', gain: 0.025, attack: 1.6, destination: out, delay: 2.2 });
    }
  };
  step();
  ambientTimer = window.setInterval(step, 7000);
}

export function stopAmbient(): void {
  if (ambientTimer !== null) {
    clearInterval(ambientTimer);
    ambientTimer = null;
  }
}
