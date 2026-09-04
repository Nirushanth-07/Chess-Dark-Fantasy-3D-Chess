/**
 * Static evaluation: material + piece-square tables + a little mobility.
 * Pure and synchronous so it can be unit tested without a worker.
 *
 * Scores are centipawns from WHITE's point of view.
 */

import type { Chess } from 'chess.js';
import type { PieceType } from '../types';

const MATERIAL: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

/** Tables are written from white's perspective, rank 8 first (reading order). */
// prettier-ignore
const PST: Record<PieceType, number[]> = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0, 20, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

/** King wants the centre once the queens are gone. */
// prettier-ignore
const KING_ENDGAME: number[] = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50,
];

export const MATE_SCORE = 100_000;

/**
 * @returns centipawn score, positive = white is better.
 */
export function evaluate(chess: Chess): number {
  const board = chess.board();

  // Endgame detection drives the king table swap.
  let nonPawnMaterial = 0;
  for (const row of board) {
    for (const cell of row) {
      if (cell && cell.type !== 'p' && cell.type !== 'k') {
        nonPawnMaterial += MATERIAL[cell.type as PieceType];
      }
    }
  }
  const endgame = nonPawnMaterial < 1500;

  let score = 0;
  let whiteBishops = 0;
  let blackBishops = 0;

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const cell = board[rank][file];
      if (!cell) continue;
      const type = cell.type as PieceType;
      const white = cell.color === 'w';

      // board() returns rank 8 first, which is already PST reading order for white.
      const index = white ? rank * 8 + file : (7 - rank) * 8 + file;
      const positional = type === 'k' && endgame ? KING_ENDGAME[index] : PST[type][index];
      const value = MATERIAL[type] + positional;

      score += white ? value : -value;
      if (type === 'b') white ? whiteBishops++ : blackBishops++;
    }
  }

  // Bishop pair.
  if (whiteBishops >= 2) score += 30;
  if (blackBishops >= 2) score -= 30;

  return score;
}

/** Cheap ordering heuristic: MVV-LVA, promotions first, then checks. */
export function moveScore(move: { captured?: string; promotion?: string; san?: string }): number {
  let score = 0;
  if (move.promotion) score += 900;
  if (move.captured) {
    const victim = MATERIAL[move.captured as PieceType] ?? 0;
    score += 1000 + victim;
  }
  if (move.san?.includes('+')) score += 50;
  if (move.san?.includes('#')) score += 10_000;
  return score;
}
