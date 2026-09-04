/**
 * Engine tests.
 *
 * `search()` is deliberately pure and takes an injectable RNG, so the whole AI
 * is testable in Node without spawning the worker.
 */

import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { DIFFICULTY, budgetFor, search } from '../src/renderer/core/engine/search';
import { evaluate } from '../src/renderer/core/engine/evaluate';
import type { Difficulty } from '../src/renderer/core/types';

/** Deterministic RNG so "blunder" difficulty levels behave repeatably. */
const noRandom = () => 0.999;

const LEVELS: Difficulty[] = [1, 2, 3, 4, 5];

describe('evaluate', () => {
  it('is symmetric at the start of the game', () => {
    expect(evaluate(new Chess())).toBe(0);
  });

  it('scores a missing black queen in white s favour', () => {
    const score = evaluate(new Chess('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
    expect(score).toBeGreaterThan(800);
  });

  it('rewards the bishop pair', () => {
    const withPair = evaluate(new Chess('4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1'));
    const withoutPair = evaluate(new Chess('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1'));
    expect(withPair - withoutPair).toBeGreaterThan(330);
  });
});

describe('search', () => {
  it('finds mate in one', () => {
    // Back-rank mate: Ra8#.
    const result = search('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', 3, 2000, noRandom);
    expect(result.move).toEqual({ from: 'a1', to: 'a8', promotion: undefined });
  });

  it('takes a free queen', () => {
    const result = search('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1', 3, 2000, noRandom);
    expect(result.move?.from).toBe('e4');
    expect(result.move?.to).toBe('d5');
  });

  it('escapes check rather than ignoring it', () => {
    // Black rook on e8 checks down the open e-file; white must step aside.
    const fen = '4r1k1/8/8/8/8/8/8/4K2R w - - 0 1';
    const result = search(fen, 3, 2000, noRandom);
    expect(result.move).not.toBeNull();

    const board = new Chess(fen);
    expect(() => board.move(result.move!)).not.toThrow();
    expect(board.inCheck()).toBe(false);
  });

  it('returns null when the position is already checkmate', () => {
    // Fool's Mate — white is mated and has no legal move at all.
    const result = search('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', 2, 500, noRandom);
    expect(result.move).toBeNull();
  });

  it.each(LEVELS)('level %i returns a legal move within its time budget', (level) => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const started = Date.now();
    const result = search(fen, level, budgetFor(level), noRandom);
    const elapsed = Date.now() - started;

    expect(result.move).not.toBeNull();
    expect(result.depth).toBeGreaterThanOrEqual(1); // a complete pass, not a guess

    const board = new Chess(fen);
    expect(() => board.move(result.move!)).not.toThrow();

    // PROJECT_PLAN §9 Phase 3 exit criterion: a move in under two seconds.
    // Iterative deepening is what makes this a guarantee rather than a hope:
    // an unfinished deeper pass is discarded in favour of the last complete one.
    expect(elapsed).toBeLessThan(2000);
  }, 10_000);

  it('gets stronger as difficulty rises', () => {
    // Depth must be monotonic, or the ladder is meaningless.
    const depths = LEVELS.map((level) => DIFFICULTY[level].depth);
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]).toBeGreaterThanOrEqual(depths[i - 1]);
    }
    expect(DIFFICULTY[5].blunderChance).toBe(0);
    expect(DIFFICULTY[1].blunderChance).toBeGreaterThan(0);
  });

  it('never plays an illegal move over a full self-play opening', () => {
    const board = new Chess();
    for (let ply = 0; ply < 20 && !board.isGameOver(); ply++) {
      const result = search(board.fen(), 2, 250, noRandom);
      if (!result.move) break;
      expect(() => board.move(result.move!)).not.toThrow();
    }
    expect(board.history().length).toBeGreaterThan(10);
  }, 20_000);
});
