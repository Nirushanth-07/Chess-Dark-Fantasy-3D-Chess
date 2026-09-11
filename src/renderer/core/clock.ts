/**
 * Chess clock.
 *
 * Pure data and pure functions — no timers live here. Time is never counted
 * down tick by tick: the clock stores what a side had banked when its clock
 * last started, and when that was, and derives everything else from `now`. A
 * throttled timer or a slow frame can delay when the display refreshes, but it
 * can never make the clock itself wrong.
 *
 * *When* a clock runs is the store's decision, not this module's.
 */

import type { Color, TimeControl } from './types';

export interface ClockState {
  control: TimeControl;
  /** Time banked per side, as of the moment `running` last started. */
  remaining: Record<Color, number>;
  running: Color | null;
  /** `clockNow()` reading when `running` started; null while stopped. */
  since: number | null;
}

export interface TimeControlPreset {
  id: string;
  label: string;
  hint: string;
  control: TimeControl;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

export const TIME_CONTROL_PRESETS: readonly TimeControlPreset[] = [
  { id: '1+0', label: '1 + 0', hint: 'bullet', control: { initialMs: 1 * MINUTE, incrementMs: 0 } },
  { id: '3+2', label: '3 + 2', hint: 'blitz', control: { initialMs: 3 * MINUTE, incrementMs: 2 * SECOND } },
  { id: '10+5', label: '10 + 5', hint: 'rapid', control: { initialMs: 10 * MINUTE, incrementMs: 5 * SECOND } },
  { id: '30+0', label: '30 + 0', hint: 'classical', control: { initialMs: 30 * MINUTE, incrementMs: 0 } },
];

/** Monotonic, so changing the system clock mid-game cannot add or steal time. */
export function clockNow(): number {
  return performance.now();
}

export function createClock(control: TimeControl): ClockState {
  return {
    control: { ...control },
    remaining: { w: control.initialMs, b: control.initialMs },
    running: null,
    since: null,
  };
}

export function remainingMs(clock: ClockState, color: Color, now: number): number {
  const banked = clock.remaining[color];
  if (clock.running !== color || clock.since === null) return Math.max(0, banked);
  // Elapsed is clamped so a `now` read just before the clock started can never add time.
  return Math.max(0, banked - Math.max(0, now - clock.since));
}

function withRemaining(remaining: Record<Color, number>, color: Color, value: number): Record<Color, number> {
  const next = { ...remaining };
  next[color] = value;
  return next;
}

export function stopClock(clock: ClockState, now: number): ClockState {
  if (clock.running === null) return clock;
  return {
    ...clock,
    remaining: withRemaining(clock.remaining, clock.running, remainingMs(clock, clock.running, now)),
    running: null,
    since: null,
  };
}

export function startClock(clock: ClockState, color: Color, now: number): ClockState {
  if (clock.running === color) return clock;
  return { ...stopClock(clock, now), running: color, since: now };
}

/**
 * The mover hits the clock: their time stops and the increment is banked.
 * Starting the opponent's clock is deliberately not part of this — it waits
 * until the opponent can actually move.
 */
export function pressClock(clock: ClockState, mover: Color, now: number): ClockState {
  const stopped = stopClock(clock, now);
  return {
    ...stopped,
    remaining: withRemaining(stopped.remaining, mover, stopped.remaining[mover] + clock.control.incrementMs),
  };
}

/** The side whose flag has fallen, if any. Only a running clock can flag. */
export function flaggedSide(clock: ClockState, now: number): Color | null {
  if (clock.running === null) return null;
  return remainingMs(clock, clock.running, now) <= 0 ? clock.running : null;
}

/** An eighth of the starting time, clamped to 10–60 seconds. */
export function isLowTime(clock: ClockState, color: Color, now: number): boolean {
  const threshold = Math.min(60 * SECOND, Math.max(10 * SECOND, clock.control.initialMs / 8));
  return remainingMs(clock, color, now) < threshold;
}

/**
 * How long the engine may think on this move. Spends a thirtieth of what is
 * left plus most of the increment, never more than half the remaining time —
 * without this a fast engine still loses bullet games on time, simply by using
 * its full per-move budget every move.
 */
export function thinkingBudget(clock: ClockState, color: Color, now: number): number {
  const left = remainingMs(clock, color, now);
  return Math.max(50, Math.min(left / 30 + clock.control.incrementMs * 0.8, left / 2));
}

/**
 * `m:ss`, switching to tenths under ten seconds, where a player needs them.
 * Rounds up, so the display only reads zero once the flag has actually fallen.
 */
export function formatClock(ms: number): string {
  const tenths = Math.ceil(Math.max(0, ms) / 100);
  if (tenths < 100) return (tenths / 10).toFixed(1);

  const total = Math.ceil(ms / SECOND);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}
