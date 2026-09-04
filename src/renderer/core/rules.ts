/**
 * Authoritative rules layer. Wraps chess.js and adds the one thing it does not
 * provide: **stable piece identity**. chess.js thinks in squares; the 3D scene
 * thinks in objects, and needs to know that the knight now on f3 is the same
 * knight that was on g1.
 *
 * This module is pure. No three.js, no React. See doc/PROJECT_PLAN.md §4.1.
 */

import { Chess, type Move as ChessJsMove } from 'chess.js';
import {
  type Cinematic,
  type Color,
  type GameResult,
  type MoveIntent,
  type PieceId,
  type PieceState,
  type PieceType,
  type Square,
  isSquare,
} from './types';

export interface AppliedMove {
  san: string;
  intent: MoveIntent;
  color: Color;
  /** Ordered list the presentation layer replays, start to finish. */
  cinematics: Cinematic[];
}

/** A move that needs the player to pick a promotion piece before it can run. */
export interface PendingPromotion {
  from: Square;
  to: Square;
  color: Color;
}

export class Rules {
  private chess: Chess;
  private pieces = new Map<PieceId, PieceState>();
  private bySquare = new Map<Square, PieceId>();
  private counter: Record<string, number> = {};

  constructor(fen?: string) {
    this.chess = new Chess(fen);
    this.seedIdentityFromBoard();
  }

  // -- queries -------------------------------------------------------------

  get fen(): string {
    return this.chess.fen();
  }

  get turn(): Color {
    return this.chess.turn() as Color;
  }

  get isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  get inCheck(): boolean {
    return this.chess.inCheck();
  }

  get moveNumber(): number {
    return this.chess.moveNumber();
  }

  /** Every live and captured piece, for the scene to render. */
  allPieces(): PieceState[] {
    return [...this.pieces.values()];
  }

  pieceAt(square: Square): PieceState | null {
    const id = this.bySquare.get(square);
    return id ? this.pieces.get(id) ?? null : null;
  }

  pieceById(id: PieceId): PieceState | null {
    return this.pieces.get(id) ?? null;
  }

  /** Legal destination squares for the piece on `square`. */
  legalTargets(square: Square): Square[] {
    const moves = this.chess.moves({ square, verbose: true }) as ChessJsMove[];
    return moves.map((m) => m.to as Square);
  }

  /** All legal moves in the position, used by the engine. */
  legalMoves(): MoveIntent[] {
    const moves = this.chess.moves({ verbose: true }) as ChessJsMove[];
    return moves.map((m) => ({
      from: m.from as Square,
      to: m.to as Square,
      promotion: m.promotion as MoveIntent['promotion'],
    }));
  }

  /** True when this from/to pair is a pawn reaching the last rank. */
  needsPromotion(from: Square, to: Square): boolean {
    const moves = this.chess.moves({ square: from, verbose: true }) as ChessJsMove[];
    return moves.some((m) => m.to === to && m.promotion !== undefined);
  }

  history(): string[] {
    return this.chess.history();
  }

  /** Material balance in centipawns, positive = white ahead. Drives the
   *  ambient momentum aura (PROJECT_PLAN §6). */
  materialBalance(): number {
    const value: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    let score = 0;
    for (const piece of this.pieces.values()) {
      if (piece.square === null) continue;
      score += (piece.color === 'w' ? 1 : -1) * value[piece.type];
    }
    return score;
  }

  kingId(color: Color): PieceId | null {
    for (const piece of this.pieces.values()) {
      if (piece.type === 'k' && piece.color === color && piece.square !== null) return piece.id;
    }
    return null;
  }

  // -- mutation ------------------------------------------------------------

  /**
   * Commits a move to the authoritative model **immediately** and returns the
   * cinematics for the 3D layer to replay. Returns null if the move is illegal.
   */
  move(intent: MoveIntent): AppliedMove | null {
    let result: ChessJsMove;
    try {
      const moved = this.chess.move({
        from: intent.from,
        to: intent.to,
        promotion: intent.promotion,
      });
      if (!moved) return null;
      result = moved;
    } catch {
      return null; // chess.js throws on illegal input
    }

    const cinematics = this.applyToIdentity(result);
    return {
      san: result.san,
      intent,
      color: result.color as Color,
      cinematics,
    };
  }

  /** Result of the game, or null if it is still running. */
  result(): GameResult | null {
    if (this.chess.isCheckmate()) {
      // The side to move is the one that has been mated.
      return { kind: 'checkmate', winner: this.turn === 'w' ? 'b' : 'w' };
    }
    if (this.chess.isStalemate()) return { kind: 'stalemate', winner: null };
    if (this.chess.isInsufficientMaterial()) return { kind: 'insufficient-material', winner: null };
    if (this.chess.isThreefoldRepetition()) return { kind: 'threefold-repetition', winner: null };
    if (this.chess.isDraw()) return { kind: 'fifty-move', winner: null };
    return null;
  }

  // -- identity bookkeeping ------------------------------------------------

  private nextId(color: Color, type: PieceType): PieceId {
    const key = `${color}-${type}`;
    this.counter[key] = (this.counter[key] ?? 0) + 1;
    return `${key}-${this.counter[key]}`;
  }

  private seedIdentityFromBoard(): void {
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (!cell) continue;
        const square = cell.square as Square;
        const id = this.nextId(cell.color as Color, cell.type as PieceType);
        this.pieces.set(id, {
          id,
          type: cell.type as PieceType,
          color: cell.color as Color,
          square,
        });
        this.bySquare.set(square, id);
      }
    }
  }

  private relocate(id: PieceId, to: Square | null): void {
    const piece = this.pieces.get(id);
    if (!piece) return;
    if (piece.square !== null) this.bySquare.delete(piece.square);
    piece.square = to;
    if (to !== null) this.bySquare.set(to, id);
  }

  /**
   * Updates the identity map to match a move chess.js has already validated,
   * and derives the cinematic list as a side effect.
   */
  private applyToIdentity(move: ChessJsMove): Cinematic[] {
    const cinematics: Cinematic[] = [];
    const from = move.from as Square;
    const to = move.to as Square;
    const moverId = this.bySquare.get(from);
    if (!moverId) throw new Error(`No tracked piece on ${from} — identity map desynced`);
    const mover = this.pieces.get(moverId)!;

    const isCastle = move.flags.includes('k') || move.flags.includes('q');
    const isEnPassant = move.flags.includes('e');

    if (isCastle) {
      const side: 'k' | 'q' = move.flags.includes('k') ? 'k' : 'q';
      const rank = from[1] as Square[1];
      const rookFrom = (side === 'k' ? `h${rank}` : `a${rank}`) as Square;
      const rookTo = (side === 'k' ? `f${rank}` : `d${rank}`) as Square;
      const rookId = this.bySquare.get(rookFrom);
      if (!rookId) throw new Error(`Castling without a rook on ${rookFrom}`);

      this.relocate(moverId, to);
      this.relocate(rookId, rookTo);

      cinematics.push({
        kind: 'castle',
        king: moverId,
        rook: rookId,
        side,
        kingFrom: from,
        kingTo: to,
        rookFrom,
        rookTo,
      });
    } else if (move.captured) {
      // En passant takes a pawn that is NOT on the destination square.
      const victimSquare = isEnPassant ? (`${to[0]}${from[1]}` as Square) : to;
      const victimId = this.bySquare.get(victimSquare);
      if (!victimId) throw new Error(`Capture with no tracked victim on ${victimSquare}`);

      this.relocate(victimId, null);
      this.relocate(moverId, to);

      cinematics.push({
        kind: 'capture',
        attacker: moverId,
        victim: victimId,
        from,
        to,
        victimSquare,
        attackerType: mover.type,
        victimType: move.captured as PieceType,
      });
    } else {
      this.relocate(moverId, to);
      cinematics.push({ kind: 'move', piece: moverId, from, to, pieceType: mover.type });
    }

    if (move.promotion) {
      mover.promotedFrom = mover.type;
      mover.type = move.promotion as PieceType;
      cinematics.push({ kind: 'promote', pawn: moverId, into: mover.type, at: to });
    }

    const outcome = this.result();
    if (outcome) {
      const winnerKing = outcome.winner ? this.kingId(outcome.winner) : null;
      cinematics.push({ kind: 'gameOver', result: outcome, winnerKing });
    } else if (this.chess.inCheck()) {
      const kingId = this.kingId(this.turn);
      const king = kingId ? this.pieces.get(kingId) : null;
      if (king?.square) cinematics.push({ kind: 'check', king: king.id, at: king.square });
    }

    return cinematics;
  }

  /** Debug helper used by the tests to assert the identity map never drifts. */
  assertConsistent(): void {
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (!cell) continue;
        const square = cell.square as Square;
        const tracked = this.pieceAt(square);
        if (!tracked) throw new Error(`Untracked piece on ${square}`);
        if (tracked.type !== cell.type || tracked.color !== cell.color) {
          throw new Error(
            `Identity drift on ${square}: tracked ${tracked.color}${tracked.type}, board ${cell.color}${cell.type}`,
          );
        }
      }
    }
    for (const [square, id] of this.bySquare) {
      if (!isSquare(square)) throw new Error(`Bad square key ${square}`);
      const piece = this.pieces.get(id);
      if (!piece || piece.square !== square) throw new Error(`Stale bySquare entry for ${square}`);
    }
  }
}
