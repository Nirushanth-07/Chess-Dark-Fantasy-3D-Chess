/**
 * Core domain types.
 *
 * ARCHITECTURE RULE:
 * Nothing in `core/` may import three.js or React. This layer is pure,
 * synchronous, and fully testable headlessly. The 3D layer *replays* what
 * this layer decides; it never decides anything itself.
 */

export type File = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
export type Rank = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
export type Square = `${File}${Rank}`;

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Color = 'w' | 'b';

/** Stable identity for one physical piece, e.g. `w-p-3`. Survives every move
 *  so the 3D scene can track the same mesh from spawn to capture. */
export type PieceId = string;

export interface PieceState {
  id: PieceId;
  type: PieceType;
  color: Color;
  /** null once captured. */
  square: Square | null;
  /** Set when a pawn promotes; the mesh is swapped, the id is kept. */
  promotedFrom?: PieceType;
}

export interface MoveIntent {
  from: Square;
  to: Square;
  promotion?: Exclude<PieceType, 'p' | 'k'>;
}

// ---------------------------------------------------------------------------
// Cinematics — the only thing the presentation layer is ever handed.
// ---------------------------------------------------------------------------

export type Cinematic =
  | { kind: 'move'; piece: PieceId; from: Square; to: Square; pieceType: PieceType }
  | {
      kind: 'capture';
      attacker: PieceId;
      victim: PieceId;
      from: Square;
      to: Square;
      /** Differs from `to` on en passant — the victim is NOT on the destination. */
      victimSquare: Square;
      attackerType: PieceType;
      victimType: PieceType;
    }
  | { kind: 'castle'; king: PieceId; rook: PieceId; side: 'k' | 'q'; kingFrom: Square; kingTo: Square; rookFrom: Square; rookTo: Square }
  | { kind: 'promote'; pawn: PieceId; into: PieceType; at: Square }
  | { kind: 'check'; king: PieceId; at: Square }
  | { kind: 'gameOver'; result: GameResult; winnerKing: PieceId | null };

export type GameResultKind =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'threefold-repetition'
  | 'fifty-move'
  | 'resignation'
  | 'timeout';

export interface GameResult {
  kind: GameResultKind;
  /** null for a draw. */
  winner: Color | null;
}

// ---------------------------------------------------------------------------
// Session configuration
// ---------------------------------------------------------------------------

export type GameMode = 'human-vs-human' | 'human-vs-computer';
export type ThemeId = 'classical' | 'animated';

/** 1 = beginner … 5 = strongest. Maps to search depth + deliberate error rate. */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface GameConfig {
  mode: GameMode;
  theme: ThemeId;
  difficulty: Difficulty;
  /** Which colour the human plays in human-vs-computer. */
  humanColor: Color;
  animationSpeed: number; // 1 = normal, 2 = double speed
  skipAnimations: boolean;
  /**
   * Hotseat only: swing the camera round to the side of whoever is to move, so
   * both players always look at the board from behind their own back rank.
   */
  autoFlipBoard: boolean;
}

export const DEFAULT_CONFIG: GameConfig = {
  mode: 'human-vs-computer',
  theme: 'classical',
  difficulty: 2,
  humanColor: 'w',
  animationSpeed: 1,
  skipAnimations: false,
  autoFlipBoard: true,
};

// ---------------------------------------------------------------------------
// Square helpers — shared by rules and scene, so they live here.
// ---------------------------------------------------------------------------

export const FILES: readonly File[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
export const RANKS: readonly Rank[] = ['1', '2', '3', '4', '5', '6', '7', '8'];

export function fileIndex(sq: Square): number {
  return sq.charCodeAt(0) - 97; // 'a' -> 0
}

export function rankIndex(sq: Square): number {
  return sq.charCodeAt(1) - 49; // '1' -> 0
}

export function squareAt(fileIdx: number, rankIdx: number): Square {
  return `${FILES[fileIdx]}${RANKS[rankIdx]}` as Square;
}

export function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

/** Relative value used for the momentum aura and for engine evaluation. */
export const PIECE_VALUE: Record<PieceType, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

export const PIECE_NAME: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};
