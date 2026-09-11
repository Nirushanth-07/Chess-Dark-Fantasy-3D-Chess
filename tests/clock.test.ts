/**
 * Chess clock tests — the pure clock, and how the store drives it.
 *
 * The store tests run on fake timers, including `performance`, so a whole
 * bullet game's worth of time passes instantly and deterministically.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClock,
  flaggedSide,
  formatClock,
  isLowTime,
  pressClock,
  remainingMs,
  startClock,
  stopClock,
  thinkingBudget,
} from '../src/renderer/core/clock';
import { __setRulesForTest, gameStore, type GameEvent } from '../src/renderer/core/gameStore';
import { Rules } from '../src/renderer/core/rules';
import type { ChessEngine, EngineMove } from '../src/renderer/core/engine';
import type { Color, Square, TimeControl } from '../src/renderer/core/types';

const BLITZ: TimeControl = { initialMs: 180_000, incrementMs: 2_000 };
const BULLET: TimeControl = { initialMs: 60_000, incrementMs: 0 };

describe('clock', () => {
  it('starts both sides on the initial time with nothing running', () => {
    const clock = createClock(BLITZ);
    expect(clock.remaining).toEqual({ w: 180_000, b: 180_000 });
    expect(clock.running).toBeNull();
  });

  it('only counts down the running side', () => {
    const clock = startClock(createClock(BLITZ), 'w', 1_000);
    expect(remainingMs(clock, 'w', 6_000)).toBe(175_000);
    expect(remainingMs(clock, 'b', 6_000)).toBe(180_000);
  });

  it('never adds time for a reading taken before the clock started', () => {
    const clock = startClock(createClock(BLITZ), 'w', 5_000);
    expect(remainingMs(clock, 'w', 4_000)).toBe(180_000);
  });

  it('clamps at zero rather than going negative', () => {
    const clock = startClock(createClock(BULLET), 'b', 0);
    expect(remainingMs(clock, 'b', 90_000)).toBe(0);
  });

  it('banks elapsed time on stop and carries on from there on restart', () => {
    let clock = startClock(createClock(BLITZ), 'w', 0);
    clock = stopClock(clock, 10_000);
    expect(clock.running).toBeNull();
    expect(remainingMs(clock, 'w', 999_999)).toBe(170_000);

    clock = startClock(clock, 'w', 50_000);
    expect(remainingMs(clock, 'w', 55_000)).toBe(165_000);
  });

  it('switching sides stops the other clock', () => {
    let clock = startClock(createClock(BLITZ), 'w', 0);
    clock = startClock(clock, 'b', 4_000);
    expect(clock.running).toBe('b');
    expect(remainingMs(clock, 'w', 20_000)).toBe(176_000);
  });

  it('pressing stops the mover and banks the increment, without starting the opponent', () => {
    const clock = pressClock(startClock(createClock(BLITZ), 'w', 0), 'w', 7_000);
    expect(clock.running).toBeNull();
    expect(clock.remaining).toEqual({ w: 175_000, b: 180_000 });
  });

  it('reports a flag only for a running clock at zero', () => {
    const running = startClock(createClock(BULLET), 'w', 0);
    expect(flaggedSide(running, 59_999)).toBeNull();
    expect(flaggedSide(running, 60_000)).toBe('w');
    expect(flaggedSide(stopClock(running, 60_000), 60_000)).toBeNull();
  });

  it('marks low time at an eighth of the start, clamped to 10–60 seconds', () => {
    const bullet = createClock(BULLET); // an eighth is 7.5s, clamped up to 10s
    expect(isLowTime({ ...bullet, remaining: { w: 10_001, b: 0 } }, 'w', 0)).toBe(false);
    expect(isLowTime({ ...bullet, remaining: { w: 9_999, b: 0 } }, 'w', 0)).toBe(true);

    const blitz = createClock(BLITZ); // 22.5s
    expect(isLowTime({ ...blitz, remaining: { w: 23_000, b: 0 } }, 'w', 0)).toBe(false);
    expect(isLowTime({ ...blitz, remaining: { w: 22_000, b: 0 } }, 'w', 0)).toBe(true);

    const classical = createClock({ initialMs: 1_800_000, incrementMs: 0 }); // clamped down to 60s
    expect(isLowTime({ ...classical, remaining: { w: 59_000, b: 0 } }, 'w', 0)).toBe(true);
  });

  it('never lets the engine think for more than half its remaining time', () => {
    for (const left of [120_000, 20_000, 3_000, 800]) {
      const clock = { ...createClock(BLITZ), remaining: { w: left, b: left } };
      expect(thinkingBudget(clock, 'w', 0)).toBeLessThanOrEqual(left / 2);
    }
  });

  it.each([
    [300_000, '5:00'],
    [299_001, '5:00'],
    [299_000, '4:59'],
    [65_000, '1:05'],
    [10_000, '0:10'],
    [9_901, '0:10'],
    [9_900, '9.9'],
    [50, '0.1'],
    [0, '0.0'],
    [-20, '0.0'],
    [3_600_000, '1:00:00'],
  ])('formats %i ms as %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// Store integration
// ---------------------------------------------------------------------------

const store = () => gameStore.getState();

function left(color: Color): number {
  const { clock } = store();
  if (!clock) throw new Error('game is untimed');
  return remainingMs(clock, color, performance.now());
}

function move(from: Square, to: Square): void {
  store().clickSquare(from);
  store().clickSquare(to);
}

/** Stands in for the 3D director: plays out every queued cinematic instantly. */
function drain(): void {
  for (let guard = 0; store().phase === 'animating'; guard++) {
    if (guard > 20) throw new Error('cinematic queue never drained');
    store().completeCinematic();
  }
}

function hotseat(timeControl: TimeControl | null): void {
  store().newGame({ mode: 'human-vs-human', timeControl });
}

/** An engine whose replies the test releases by hand. */
function manualEngine() {
  const calls: { maxTimeMs?: number; resolve: (move: EngineMove) => void }[] = [];
  const engine: ChessEngine = {
    bestMove: (_fen, _difficulty, maxTimeMs) =>
      new Promise<EngineMove>((resolve) => calls.push({ maxTimeMs, resolve })),
    evaluate: async () => 0,
    dispose: () => {},
  };
  return { engine, calls };
}

function reply(from: Square, to: Square): EngineMove {
  return { move: { from, to }, score: 0, depth: 1, nodes: 1, timeMs: 1 };
}

describe('clock in the game store', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  });

  afterEach(() => {
    store().openMenu(); // stops any running clock and its flag timer
    vi.useRealTimers();
  });

  it('stays untimed unless a clock is chosen', () => {
    hotseat(null);
    expect(store().clock).toBeNull();
    vi.advanceTimersByTime(3_600_000);
    expect(store().phase).toBe('idle');
    expect(store().result).toBeNull();
  });

  it("runs White's clock from the moment the game begins", () => {
    hotseat(BLITZ);
    vi.advanceTimersByTime(5_000);
    expect(left('w')).toBe(175_000);
    expect(left('b')).toBe(180_000);
  });

  it('freezes both clocks while a move animates, then starts the opponent', () => {
    hotseat(BLITZ);
    vi.advanceTimersByTime(1_000);
    move('e2', 'e4');
    expect(store().phase).toBe('animating');

    // However long the cinematic takes, nobody is charged for it.
    vi.advanceTimersByTime(60_000);
    expect(left('w')).toBe(181_000); // 179s + 2s increment
    expect(left('b')).toBe(180_000);

    drain();
    vi.advanceTimersByTime(3_000);
    expect(store().clock?.running).toBe('b');
    expect(left('b')).toBe(177_000);
    expect(left('w')).toBe(181_000);
  });

  it('keeps running while the promotion picker is open', () => {
    hotseat(BLITZ);
    __setRulesForTest(new Rules('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'));
    move('a7', 'a8');
    expect(store().phase).toBe('promoting');
    vi.advanceTimersByTime(4_000);
    expect(left('w')).toBe(176_000);
  });

  it('ends the game on a flag fall through the normal cinematic queue', () => {
    const events: GameEvent[] = [];
    const unsubscribe = store().subscribeEvents((event) => events.push(event));
    try {
      hotseat(BULLET);
      vi.advanceTimersByTime(60_000);

      expect(store().active).toMatchObject({ kind: 'gameOver', result: { kind: 'timeout', winner: 'b' } });
      expect(left('w')).toBe(0);
      expect(store().clock?.running).toBeNull();

      drain();
      expect(store().phase).toBe('over');
      expect(events.at(-1)).toEqual({ type: 'game-over', result: { kind: 'timeout', winner: 'b' } });
    } finally {
      unsubscribe();
    }
  });

  it('scores a flag fall as a draw when the opponent could never mate', () => {
    hotseat(BULLET);
    // White has a rook and runs out of time; Black has a bare king.
    __setRulesForTest(new Rules('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'));
    vi.advanceTimersByTime(60_000);
    expect(store().result).toEqual({ kind: 'timeout', winner: null });
  });

  it('rejects a move that arrives after the flag has already fallen', () => {
    hotseat(BULLET);
    // Simulate a flag timer running late: time is up but the timer has not fired.
    const realNow = performance.now();
    const spy = vi.spyOn(performance, 'now').mockReturnValue(realNow + 60_500);
    try {
      move('e2', 'e4');
    } finally {
      spy.mockRestore();
    }
    expect(store().history).toEqual([]);
    expect(store().result).toEqual({ kind: 'timeout', winner: 'b' });
  });

  it('stops the clock when leaving for the menu', () => {
    hotseat(BULLET);
    store().openMenu();
    vi.advanceTimersByTime(120_000);
    expect(store().result).toBeNull();
    expect(store().clock?.running).toBeNull();
  });

  it('stops the clock on resignation', () => {
    hotseat(BLITZ);
    vi.advanceTimersByTime(2_000);
    store().resign();
    vi.advanceTimersByTime(600_000);
    expect(store().clock?.running).toBeNull();
    expect(left('w')).toBe(178_000);
  });

  it("charges the engine while it thinks and caps its search to fit its clock", async () => {
    const { engine, calls } = manualEngine();
    store().attachEngine(engine);
    store().newGame({ mode: 'human-vs-computer', humanColor: 'b', timeControl: BLITZ });

    expect(store().phase).toBe('thinking');
    expect(calls).toHaveLength(1);
    expect(calls[0].maxTimeMs).toBeLessThanOrEqual(90_000);

    vi.advanceTimersByTime(1_500);
    expect(left('w')).toBe(178_500);

    calls[0].resolve(reply('e2', 'e4'));
    await Promise.resolve();
    expect(store().history).toEqual(['e4']);
    expect(left('w')).toBe(180_500); // increment banked
  });

  it('ignores an engine reply that arrives after its flag fell', async () => {
    const { engine, calls } = manualEngine();
    store().attachEngine(engine);
    store().newGame({ mode: 'human-vs-computer', humanColor: 'b', timeControl: BULLET });

    vi.advanceTimersByTime(60_000);
    expect(store().result).toEqual({ kind: 'timeout', winner: 'b' });

    calls[0].resolve(reply('e2', 'e4'));
    await Promise.resolve();
    expect(store().history).toEqual([]);
  });
});
