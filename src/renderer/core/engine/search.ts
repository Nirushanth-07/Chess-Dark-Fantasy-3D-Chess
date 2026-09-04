/**
 * Negamax with alpha-beta pruning, quiescence search and MVV-LVA move ordering.
 *
 * Pure and synchronous — the worker in `searchWorker.ts` is a thin shell around
 * this so the search itself stays unit-testable in Node.
 *
 * See doc/PROJECT_PLAN.md §3.1 for the note on swapping this for Stockfish WASM.
 */

import { Chess, type Move as ChessJsMove } from 'chess.js';
import type { Difficulty, MoveIntent } from '../types';
import { MATE_SCORE, evaluate, moveScore } from './evaluate';

export interface SearchResult {
  move: MoveIntent | null;
  /** Centipawns from the side-to-move's point of view. */
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

export interface DifficultySpec {
  depth: number;
  /** Probability of choosing a deliberately sub-optimal move. */
  blunderChance: number;
  /** How far below best a "blunder" is allowed to be, in centipawns. */
  blunderWindow: number;
  quiescence: boolean;
  label: string;
  approxElo: string;
}

export const DIFFICULTY: Record<Difficulty, DifficultySpec> = {
  1: { depth: 1, blunderChance: 0.5, blunderWindow: 400, quiescence: false, label: 'Squire',  approxElo: '~500' },
  2: { depth: 2, blunderChance: 0.3, blunderWindow: 250, quiescence: false, label: 'Knight',  approxElo: '~900' },
  3: { depth: 3, blunderChance: 0.12, blunderWindow: 120, quiescence: true, label: 'Captain', approxElo: '~1300' },
  4: { depth: 4, blunderChance: 0.03, blunderWindow: 60,  quiescence: true, label: 'Warlord', approxElo: '~1650' },
  5: { depth: 5, blunderChance: 0,    blunderWindow: 0,   quiescence: true, label: 'Sovereign', approxElo: '~1900' },
};

/**
 * Time budget per difficulty. Shared with the tests so the Phase 3 exit
 * criterion ("a move in under two seconds at every level") is asserted against
 * the budget the app actually uses.
 */
export function budgetFor(difficulty: Difficulty): number {
  return Math.min(1700, 350 + DIFFICULTY[difficulty].depth * 300);
}

interface SearchContext {
  chess: Chess;
  nodes: number;
  deadline: number;
  quiescence: boolean;
  abort: boolean;
}

function orderedMoves(chess: Chess): ChessJsMove[] {
  const moves = chess.moves({ verbose: true }) as ChessJsMove[];
  return moves.sort((a, b) => moveScore(b) - moveScore(a));
}

/** Search only "loud" moves (captures/promotions) until the position is quiet,
 *  so the engine never mistakes a mid-exchange position for a good one. */
function quiesce(ctx: SearchContext, alpha: number, beta: number, sideSign: number): number {
  ctx.nodes++;
  if ((ctx.nodes & 63) === 0 && Date.now() > ctx.deadline) ctx.abort = true;
  if (ctx.abort) return sideSign * evaluate(ctx.chess);

  const standPat = sideSign * evaluate(ctx.chess);
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  const loud = (ctx.chess.moves({ verbose: true }) as ChessJsMove[])
    .filter((m) => m.captured || m.promotion)
    .sort((a, b) => moveScore(b) - moveScore(a));

  for (const move of loud) {
    ctx.chess.move(move);
    const score = -quiesce(ctx, -beta, -alpha, -sideSign);
    ctx.chess.undo();
    if (ctx.abort) return alpha;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(ctx: SearchContext, depth: number, alpha: number, beta: number, sideSign: number): number {
  ctx.nodes++;
  // Checked often: each node costs a full chess.js move generation, so a coarse
  // interval here lets the search blow well past its deadline.
  if ((ctx.nodes & 63) === 0 && Date.now() > ctx.deadline) ctx.abort = true;
  if (ctx.abort) return sideSign * evaluate(ctx.chess);

  // Generate once and derive everything from it. `isCheckmate()`, `isDraw()`
  // and `isStalemate()` each run their own move generation internally, so
  // calling them per node roughly quadrupled the cost of the search.
  const moves = orderedMoves(ctx.chess);
  if (moves.length === 0) {
    // No legal moves: mate if in check, otherwise stalemate.
    return ctx.chess.inCheck() ? -MATE_SCORE + (100 - depth) : 0; // prefer faster mates
  }

  if (depth === 0) {
    return ctx.quiescence ? quiesce(ctx, alpha, beta, sideSign) : sideSign * evaluate(ctx.chess);
  }

  let best = -Infinity;
  for (const move of moves) {
    ctx.chess.move(move);
    const score = -negamax(ctx, depth - 1, -beta, -alpha, -sideSign);
    ctx.chess.undo();
    if (ctx.abort) break;

    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break; // beta cutoff
  }
  return best === -Infinity ? sideSign * evaluate(ctx.chess) : best;
}

/**
 * Picks a move for the side to move, using **iterative deepening**.
 *
 * Searching straight to the target depth cannot honour a time budget: the only
 * way to stop is to abandon a partly-scored root move list. Deepening one ply
 * at a time means there is always a complete result from the previous depth to
 * fall back on, so the budget becomes a real guarantee rather than a hope.
 *
 * @param random injectable RNG so tests can be deterministic.
 */
export function search(
  fen: string,
  difficulty: Difficulty,
  timeBudgetMs = 2000,
  random: () => number = Math.random,
): SearchResult {
  const started = Date.now();
  const spec = DIFFICULTY[difficulty];
  const chess = new Chess(fen);
  const sideSign = chess.turn() === 'w' ? 1 : -1;

  const ctx: SearchContext = {
    chess,
    nodes: 0,
    deadline: started + timeBudgetMs,
    quiescence: spec.quiescence,
    abort: false,
  };

  let moves = orderedMoves(chess);
  if (moves.length === 0) {
    return { move: null, score: 0, depth: 0, nodes: 0, timeMs: Date.now() - started };
  }

  let scored: { move: ChessJsMove; score: number }[] = moves.map((move) => ({ move, score: 0 }));
  let completedDepth = 0;

  for (let depth = 1; depth <= spec.depth; depth++) {
    const attempt: { move: ChessJsMove; score: number }[] = [];
    let alpha = -Infinity;

    for (const move of moves) {
      if (Date.now() > ctx.deadline) {
        ctx.abort = true;
        break;
      }
      chess.move(move);
      const score = -negamax(ctx, depth - 1, -Infinity, -alpha, -sideSign);
      chess.undo();
      if (ctx.abort) break;
      attempt.push({ move, score });
      if (score > alpha) alpha = score;
    }

    // Only accept a depth that finished — a partial pass is worse than the
    // complete pass below it, because the unsearched moves look like zeros.
    if (ctx.abort || attempt.length !== moves.length) break;

    attempt.sort((a, b) => b.score - a.score);
    scored = attempt;
    completedDepth = depth;
    // Best-first ordering for the next, deeper pass: this is most of why
    // iterative deepening costs so little.
    moves = attempt.map((entry) => entry.move);

    // A forced mate is not going to get better with more depth.
    if (Math.abs(scored[0].score) > MATE_SCORE - 1000) break;
  }

  const best = scored[0];

  // Difficulty is expressed as *plausible* mistakes, not random moves: the
  // engine picks from the moves within `blunderWindow` of the best one, which
  // reads as a weaker opponent rather than a broken one.
  let chosen = best;
  if (spec.blunderChance > 0 && random() < spec.blunderChance) {
    const acceptable = scored.filter((entry) => best.score - entry.score <= spec.blunderWindow);
    chosen = acceptable[Math.floor(random() * acceptable.length)] ?? best;
  }

  return {
    move: {
      from: chosen.move.from as MoveIntent['from'],
      to: chosen.move.to as MoveIntent['to'],
      promotion: chosen.move.promotion as MoveIntent['promotion'],
    },
    score: chosen.score,
    depth: completedDepth,
    nodes: ctx.nodes,
    timeMs: Date.now() - started,
  };
}
