/**
 * Rules-layer tests.
 *
 * The point of keeping core/ pure is that this file needs no browser, no
 * three.js and no React — the entire game model is testable in Node.
 */

import { describe, expect, it } from 'vitest';
import { Rules } from '../src/renderer/core/rules';
import type { Cinematic, Square } from '../src/renderer/core/types';

function play(rules: Rules, moves: [Square, Square][]): void {
  for (const [from, to] of moves) {
    const applied = rules.move({ from, to });
    expect(applied, `move ${from}${to} should be legal`).not.toBeNull();
    rules.assertConsistent();
  }
}

function firstOfKind<K extends Cinematic['kind']>(
  cinematics: Cinematic[],
  kind: K,
): Extract<Cinematic, { kind: K }> | undefined {
  return cinematics.find((c) => c.kind === kind) as Extract<Cinematic, { kind: K }> | undefined;
}

describe('setup', () => {
  it('starts with 32 tracked pieces, all on the board', () => {
    const rules = new Rules();
    expect(rules.allPieces()).toHaveLength(32);
    expect(rules.allPieces().every((p) => p.square !== null)).toBe(true);
    rules.assertConsistent();
  });

  it('gives every piece a unique id', () => {
    const rules = new Rules();
    const ids = new Set(rules.allPieces().map((p) => p.id));
    expect(ids.size).toBe(32);
  });

  it('rejects illegal moves without mutating anything', () => {
    const rules = new Rules();
    const before = rules.fen;
    expect(rules.move({ from: 'e2', to: 'e5' })).toBeNull();
    expect(rules.fen).toBe(before);
    rules.assertConsistent();
  });
});

describe('piece identity', () => {
  it('follows the same piece across many moves', () => {
    const rules = new Rules();
    const knight = rules.pieceAt('g1');
    expect(knight).not.toBeNull();

    play(rules, [
      ['g1', 'f3'],
      ['e7', 'e5'],
      ['f3', 'e5'],
    ]);

    expect(rules.pieceById(knight!.id)?.square).toBe('e5');
  });

  it('marks a captured piece as off the board but keeps it tracked', () => {
    const rules = new Rules();
    play(rules, [
      ['e2', 'e4'],
      ['d7', 'd5'],
    ]);
    const victim = rules.pieceAt('d5');
    play(rules, [['e4', 'd5']]);

    expect(rules.pieceById(victim!.id)?.square).toBeNull();
    expect(rules.allPieces()).toHaveLength(32); // still tracked, for the HUD
    expect(rules.allPieces().filter((p) => p.square !== null)).toHaveLength(31);
  });
});

describe('cinematics', () => {
  it('emits a move cinematic for a quiet move', () => {
    const rules = new Rules();
    const applied = rules.move({ from: 'e2', to: 'e4' })!;
    expect(applied.cinematics).toHaveLength(1);
    expect(applied.cinematics[0].kind).toBe('move');
  });

  it('emits a capture cinematic naming both pieces', () => {
    const rules = new Rules();
    play(rules, [
      ['e2', 'e4'],
      ['d7', 'd5'],
    ]);
    const victim = rules.pieceAt('d5')!;
    const attacker = rules.pieceAt('e4')!;

    const applied = rules.move({ from: 'e4', to: 'd5' })!;
    const capture = firstOfKind(applied.cinematics, 'capture');

    expect(capture).toBeDefined();
    expect(capture!.attacker).toBe(attacker.id);
    expect(capture!.victim).toBe(victim.id);
    expect(capture!.victimSquare).toBe('d5');
  });

  // The case animated chess games get wrong most often.
  it('points en passant at the pawn, NOT at the destination square', () => {
    const rules = new Rules();
    play(rules, [
      ['e2', 'e4'],
      ['a7', 'a6'],
      ['e4', 'e5'],
      ['d7', 'd5'], // black double-steps past the white pawn
    ]);

    const victim = rules.pieceAt('d5')!;
    const applied = rules.move({ from: 'e5', to: 'd6' })!;
    const capture = firstOfKind(applied.cinematics, 'capture');

    expect(capture).toBeDefined();
    expect(capture!.to).toBe('d6');
    expect(capture!.victimSquare).toBe('d5'); // the victim is one square away
    expect(capture!.victim).toBe(victim.id);
    expect(rules.pieceById(victim.id)?.square).toBeNull();
    rules.assertConsistent();
  });

  it('moves both king and rook on kingside castling', () => {
    const rules = new Rules();
    play(rules, [
      ['e2', 'e4'],
      ['e7', 'e5'],
      ['g1', 'f3'],
      ['b8', 'c6'],
      ['f1', 'c4'],
      ['f8', 'c5'],
    ]);

    const king = rules.pieceAt('e1')!;
    const rook = rules.pieceAt('h1')!;
    const applied = rules.move({ from: 'e1', to: 'g1' })!;
    const castle = firstOfKind(applied.cinematics, 'castle');

    expect(castle).toBeDefined();
    expect(castle!.side).toBe('k');
    expect(castle!.king).toBe(king.id);
    expect(castle!.rook).toBe(rook.id);
    expect(castle!.rookFrom).toBe('h1');
    expect(castle!.rookTo).toBe('f1');
    expect(rules.pieceById(rook.id)?.square).toBe('f1');
    rules.assertConsistent();
  });

  it('handles queenside castling', () => {
    const rules = new Rules();
    play(rules, [
      ['d2', 'd4'],
      ['d7', 'd5'],
      ['b1', 'c3'],
      ['b8', 'c6'],
      ['c1', 'f4'],
      ['c8', 'f5'],
      ['d1', 'd2'],
      ['d8', 'd7'],
    ]);

    const applied = rules.move({ from: 'e1', to: 'c1' })!;
    const castle = firstOfKind(applied.cinematics, 'castle');
    expect(castle?.side).toBe('q');
    expect(castle?.rookFrom).toBe('a1');
    expect(castle?.rookTo).toBe('d1');
    rules.assertConsistent();
  });

  it('emits a promote cinematic and keeps the pawn id', () => {
    const rules = new Rules('8/P7/8/8/8/8/8/K6k w - - 0 1');
    const pawn = rules.pieceAt('a7')!;

    const applied = rules.move({ from: 'a7', to: 'a8', promotion: 'q' })!;
    const promote = firstOfKind(applied.cinematics, 'promote');

    expect(promote).toBeDefined();
    expect(promote!.pawn).toBe(pawn.id); // same object, new mesh
    expect(promote!.into).toBe('q');
    expect(rules.pieceById(pawn.id)?.type).toBe('q');
    expect(rules.pieceById(pawn.id)?.promotedFrom).toBe('p');
    rules.assertConsistent();
  });

  it('reports promotion as required before the move is made', () => {
    const rules = new Rules('8/P7/8/8/8/8/8/K6k w - - 0 1');
    expect(rules.needsPromotion('a7', 'a8')).toBe(true);

    const quiet = new Rules();
    expect(quiet.needsPromotion('e2', 'e4')).toBe(false);
  });

  it('emits check after a checking move', () => {
    const rules = new Rules();
    play(rules, [
      ['e2', 'e4'],
      ['f7', 'f6'],
      ['d1', 'h5'],
    ]);
    // The last move above was the check; re-run it on a fresh board to inspect.
    const board = new Rules();
    play(board, [
      ['e2', 'e4'],
      ['f7', 'f6'],
    ]);
    const applied = board.move({ from: 'd1', to: 'h5' })!;
    expect(firstOfKind(applied.cinematics, 'check')).toBeDefined();
    expect(board.inCheck).toBe(true);
  });
});

describe('terminal positions', () => {
  it("detects Fool's Mate and names the winner", () => {
    const rules = new Rules();
    play(rules, [
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['g2', 'g4'],
    ]);
    const applied = rules.move({ from: 'd8', to: 'h4' })!;
    const over = firstOfKind(applied.cinematics, 'gameOver');

    expect(over).toBeDefined();
    expect(over!.result.kind).toBe('checkmate');
    expect(over!.result.winner).toBe('b');
    expect(over!.winnerKing).toBe(rules.kingId('b'));
    expect(rules.isGameOver).toBe(true);
  });

  it('emits gameOver INSTEAD of check when the check is mate', () => {
    const rules = new Rules();
    play(rules, [
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['g2', 'g4'],
    ]);
    const applied = rules.move({ from: 'd8', to: 'h4' })!;
    expect(firstOfKind(applied.cinematics, 'check')).toBeUndefined();
    expect(firstOfKind(applied.cinematics, 'gameOver')).toBeDefined();
  });

  it('detects stalemate as a draw', () => {
    // White Kf7 + Qg5. Qg6 covers g7, g8 and h7 but never touches h8,
    // so black is left with no legal move and no check.
    const rules = new Rules('7k/5K2/8/6Q1/8/8/8/8 w - - 0 1');
    const applied = rules.move({ from: 'g5', to: 'g6' })!;
    const over = firstOfKind(applied.cinematics, 'gameOver');
    expect(over?.result.kind).toBe('stalemate');
    expect(over?.result.winner).toBeNull();
    expect(over?.winnerKing).toBeNull();
  });

  it('detects insufficient material', () => {
    const rules = new Rules('8/8/8/4k3/8/8/4Kb2/8 w - - 0 1');
    const applied = rules.move({ from: 'e2', to: 'f2' })!;
    expect(firstOfKind(applied.cinematics, 'gameOver')?.result.kind).toBe('insufficient-material');
  });
});

describe('material balance', () => {
  it('starts level and swings when a piece is taken', () => {
    const rules = new Rules();
    expect(rules.materialBalance()).toBe(0);

    play(rules, [
      ['e2', 'e4'],
      ['d7', 'd5'],
      ['e4', 'd5'],
    ]);
    expect(rules.materialBalance()).toBe(100); // white is a pawn up
  });
});

describe('identity map integrity', () => {
  it('survives a long game with captures, castling and promotion', () => {
    const rules = new Rules();
    const moves: [Square, Square][] = [
      ['e2', 'e4'], ['c7', 'c5'],
      ['g1', 'f3'], ['d7', 'd6'],
      ['d2', 'd4'], ['c5', 'd4'],
      ['f3', 'd4'], ['g8', 'f6'],
      ['b1', 'c3'], ['a7', 'a6'],
      ['f1', 'e2'], ['e7', 'e6'],
      ['e1', 'g1'], ['f8', 'e7'],
      ['c1', 'e3'], ['e8', 'g8'],
    ];
    play(rules, moves);

    expect(rules.pieceAt('g1')?.type).toBe('k');
    expect(rules.pieceAt('f1')?.type).toBe('r');
    expect(rules.pieceAt('g8')?.type).toBe('k');
    // cxd4 then Nxd4 — two captures.
    expect(rules.allPieces().filter((p) => p.square !== null)).toHaveLength(30);
    rules.assertConsistent();
  });
});

describe('mating material (settles flag falls)', () => {
  // [description, fen, colour, expected]
  it.each([
    ['a bare king', '4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'w', false],
    ['king and knight against a bare king', '4k3/8/8/8/8/8/8/3NK3 w - - 0 1', 'w', false],
    ['king and knight against a pawn', '4k3/4p3/8/8/8/8/8/3NK3 w - - 0 1', 'w', true],
    ['king and knight against a queen', 'q3k3/8/8/8/8/8/8/3NK3 w - - 0 1', 'w', false],
    ['king and bishop against a rook', 'r3k3/8/8/8/8/8/8/2B1K3 w - - 0 1', 'w', false],
    ['king and bishop against a knight', '1n2k3/8/8/8/8/8/8/2B1K3 w - - 0 1', 'w', true],
    ['bishop against a same-coloured bishop', '4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1', 'w', false],
    ['bishop against an opposite-coloured bishop', '2b1k3/8/8/8/8/8/8/2B1K3 w - - 0 1', 'w', true],
    ['bishops on both colours', '4k3/8/8/8/8/8/8/2B1KB2 w - - 0 1', 'w', true],
    ['two knights', '4k3/8/8/8/8/8/8/1N2K1N1 w - - 0 1', 'w', true],
    ['a lone pawn', '4k3/4p3/8/8/8/8/8/3NK3 w - - 0 1', 'b', true],
    ['a rook', 'r3k3/8/8/8/8/8/8/2B1K3 w - - 0 1', 'b', true],
  ] as const)('%s → %s can mate: %s', (_label, fen, color, expected) => {
    expect(new Rules(fen).canEverMate(color)).toBe(expected);
  });

  it('ignores captured pieces', () => {
    const rules = new Rules('4k3/8/8/8/8/8/1p6/1R2K3 w - - 0 1');
    expect(rules.canEverMate('b')).toBe(true);
    play(rules, [['b1', 'b2']]); // the rook takes Black's last pawn
    expect(rules.canEverMate('b')).toBe(false);
  });
});
