/**
 * The game state machine.
 *
 * Uses zustand's *vanilla* store so this file stays free of React and can be
 * driven directly from tests. See doc/PROJECT_PLAN.md §4.1: a move is committed
 * to `Rules` the instant it is made; the cinematic queue is only a replay
 * instruction for the 3D layer, and input stays locked until it drains.
 */

import { createStore } from 'zustand/vanilla';
import { Rules } from './rules';
import {
  DEFAULT_CONFIG,
  type Cinematic,
  type Color,
  type GameConfig,
  type GameResult,
  type MoveIntent,
  type PieceState,
  type PieceType,
  type Square,
} from './types';
import type { ChessEngine } from './engine';

export type Phase = 'idle' | 'animating' | 'promoting' | 'thinking' | 'over';
export type Screen = 'menu' | 'game';

export interface GameEvent {
  type: 'cinematic-start' | 'cinematic-end' | 'move-committed' | 'game-over' | 'illegal';
  cinematic?: Cinematic;
  result?: GameResult;
}

type Listener = (event: GameEvent) => void;

export interface GameSnapshot {
  screen: Screen;
  config: GameConfig;
  phase: Phase;
  /** Incremented on every new game so the scene can snap pieces home. */
  gameId: number;

  // Board model — a plain snapshot so React re-renders correctly.
  pieces: PieceState[];
  turn: Color;
  fen: string;
  history: string[];
  materialBalance: number;

  // Interaction
  selected: Square | null;
  targets: Square[];
  lastMove: { from: Square; to: Square } | null;
  checkedKing: Square | null;
  result: GameResult | null;
  pendingPromotion: { from: Square; to: Square } | null;

  // Cinematic queue
  queue: Cinematic[];
  active: Cinematic | null;

  // Engine
  thinking: boolean;
  evaluation: number;
}

export interface GameActions {
  attachEngine(engine: ChessEngine): void;
  subscribeEvents(listener: Listener): () => void;

  setConfig(patch: Partial<GameConfig>): void;
  newGame(config?: Partial<GameConfig>): void;
  openMenu(): void;

  /** Primary board input. Selects, deselects, or moves depending on context. */
  clickSquare(square: Square): void;
  choosePromotion(piece: Exclude<PieceType, 'p' | 'k'>): void;
  cancelPromotion(): void;

  /** Called by the 3D director when the active cinematic has finished. */
  completeCinematic(): void;

  resign(): void;
  toggleSkipAnimations(): void;
  setAnimationSpeed(speed: number): void;
}

export type GameStore = GameSnapshot & GameActions;

function snapshotOf(rules: Rules) {
  return {
    pieces: rules.allPieces().map((p) => ({ ...p })),
    turn: rules.turn,
    fen: rules.fen,
    history: rules.history(),
    materialBalance: rules.materialBalance(),
  };
}

// The Rules instance is deliberately kept OUT of the store: it is mutable, and
// putting mutable objects in a snapshot store confuses React's equality checks.
let rules = new Rules();
let engine: ChessEngine | null = null;
const listeners = new Set<Listener>();

function emit(event: GameEvent): void {
  for (const listener of listeners) listener(event);
}

export const gameStore = createStore<GameStore>((set, get) => ({
  screen: 'menu',
  config: { ...DEFAULT_CONFIG },
  phase: 'idle',
  gameId: 0,

  ...snapshotOf(rules),

  selected: null,
  targets: [],
  lastMove: null,
  checkedKing: null,
  result: null,
  pendingPromotion: null,

  queue: [],
  active: null,

  thinking: false,
  evaluation: 0,

  // -- wiring --------------------------------------------------------------

  attachEngine(next) {
    engine = next;
  },

  subscribeEvents(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setConfig(patch) {
    set((state) => ({ config: { ...state.config, ...patch } }));
  },

  // -- lifecycle -----------------------------------------------------------

  newGame(patch) {
    rules = new Rules();
    const config = { ...get().config, ...patch };
    set({
      screen: 'game',
      config,
      phase: 'idle',
      gameId: get().gameId + 1,
      ...snapshotOf(rules),
      selected: null,
      targets: [],
      lastMove: null,
      checkedKing: null,
      result: null,
      pendingPromotion: null,
      queue: [],
      active: null,
      thinking: false,
      evaluation: 0,
    });
    maybeRunEngine(set, get);
  },

  openMenu() {
    set({ screen: 'menu' });
  },

  // -- board input ---------------------------------------------------------

  clickSquare(square) {
    const state = get();
    if (state.phase !== 'idle') return; // input is locked while anything animates

    // In human-vs-computer it is only ever the human's turn to click.
    if (state.config.mode === 'human-vs-computer' && state.turn !== state.config.humanColor) return;

    const piece = rules.pieceAt(square);

    // Completing a move.
    if (state.selected && state.targets.includes(square)) {
      const from = state.selected;
      if (rules.needsPromotion(from, square)) {
        set({ phase: 'promoting', pendingPromotion: { from, to: square }, selected: null, targets: [] });
        return;
      }
      commitMove(set, get, { from, to: square });
      return;
    }

    // Selecting / re-selecting / deselecting.
    if (piece && piece.color === state.turn) {
      if (state.selected === square) {
        set({ selected: null, targets: [] });
      } else {
        set({ selected: square, targets: rules.legalTargets(square) });
      }
      return;
    }

    if (state.selected) set({ selected: null, targets: [] });
  },

  choosePromotion(piece) {
    const pending = get().pendingPromotion;
    if (!pending) return;
    set({ pendingPromotion: null });
    commitMove(set, get, { from: pending.from, to: pending.to, promotion: piece });
  },

  cancelPromotion() {
    set({ pendingPromotion: null, phase: 'idle' });
  },

  // -- cinematic queue -----------------------------------------------------

  completeCinematic() {
    const state = get();
    if (state.active) emit({ type: 'cinematic-end', cinematic: state.active });
    advanceQueue(set, get);
  },

  // -- misc ----------------------------------------------------------------

  resign() {
    const state = get();
    const loser = state.config.mode === 'human-vs-computer' ? state.config.humanColor : state.turn;
    const result: GameResult = { kind: 'resignation', winner: loser === 'w' ? 'b' : 'w' };
    set({ phase: 'over', result, selected: null, targets: [] });
    emit({ type: 'game-over', result });
  },

  toggleSkipAnimations() {
    set((state) => ({ config: { ...state.config, skipAnimations: !state.config.skipAnimations } }));
  },

  setAnimationSpeed(speed) {
    set((state) => ({ config: { ...state.config, animationSpeed: speed } }));
  },
}));

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type Set = (partial: Partial<GameStore>) => void;
type Get = () => GameStore;

function commitMove(set: Set, get: Get, intent: MoveIntent): void {
  const applied = rules.move(intent);
  if (!applied) {
    emit({ type: 'illegal' });
    set({ selected: null, targets: [], phase: 'idle' });
    return;
  }

  emit({ type: 'move-committed' });

  // Model is already authoritative here. Everything below is presentation.
  set({
    ...snapshotOf(rules),
    selected: null,
    targets: [],
    lastMove: { from: intent.from, to: intent.to },
    queue: applied.cinematics,
    active: null,
    phase: 'animating',
    checkedKing: null,
  });

  advanceQueue(set, get);
}

function advanceQueue(set: Set, get: Get): void {
  const { queue } = get();

  if (queue.length === 0) {
    set({ active: null });
    finishTurn(set, get);
    return;
  }

  const [next, ...rest] = queue;
  set({ active: next, queue: rest, phase: 'animating' });

  if (next.kind === 'check') set({ checkedKing: next.at });
  if (next.kind === 'gameOver') set({ result: next.result });

  emit({ type: 'cinematic-start', cinematic: next });
}

function finishTurn(set: Set, get: Get): void {
  const state = get();

  if (state.result) {
    set({ phase: 'over' });
    emit({ type: 'game-over', result: state.result });
    return;
  }

  set({ phase: 'idle' });
  maybeRunEngine(set, get);
}

function maybeRunEngine(set: Set, get: Get): void {
  const state = get();
  if (state.phase === 'over' || state.result) return;
  if (state.config.mode !== 'human-vs-computer') return;
  if (state.turn === state.config.humanColor) return;
  if (!engine) return;

  const fen = rules.fen;
  set({ phase: 'thinking', thinking: true });

  engine
    .bestMove(fen, state.config.difficulty)
    .then((result) => {
      // Guard against a game that was restarted while the engine was thinking.
      if (rules.fen !== fen) {
        set({ thinking: false });
        return;
      }
      set({ thinking: false, evaluation: result.score * (state.turn === 'w' ? 1 : -1) });
      if (result.move) {
        commitMove(set, get, result.move);
      } else {
        set({ phase: 'idle' });
      }
    })
    .catch(() => {
      set({ thinking: false, phase: 'idle' });
    });
}

/** Test seam: swap the Rules instance directly. */
export function __setRulesForTest(next: Rules): void {
  rules = next;
  gameStore.setState(snapshotOf(next));
}

export function currentRules(): Rules {
  return rules;
}
