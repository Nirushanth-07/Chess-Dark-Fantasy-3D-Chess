/**
 * Engine facade. The rest of the app talks to `ChessEngine` and never to a
 * concrete implementation, so swapping the built-in search for Stockfish WASM
 * later is a one-file change.
 */

import type { Difficulty, MoveIntent } from '../types';
import type { SearchRequest, SearchResponse } from './searchWorker';
import { budgetFor } from './search';

export { DIFFICULTY } from './search';
export type { DifficultySpec, SearchResult } from './search';

export interface EngineMove {
  move: MoveIntent | null;
  /** Centipawns from the side-to-move's point of view. */
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

export interface ChessEngine {
  /**
   * @param maxTimeMs ceiling on thinking time, set by the chess clock. The
   *   difficulty's own budget still applies whenever it is the lower of the two.
   */
  bestMove(fen: string, difficulty: Difficulty, maxTimeMs?: number): Promise<EngineMove>;
  /** Quick shallow read used for the eval bar and the momentum aura. */
  evaluate(fen: string): Promise<number>;
  dispose(): void;
}

/** Built-in negamax engine running in a Web Worker. */
export class LocalEngine implements ChessEngine {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: EngineMove) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker = new Worker(new URL('./searchWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<SearchResponse>) => {
      const data = event.data;
      const entry = this.pending.get(data.id);
      if (!entry) return;
      this.pending.delete(data.id);
      if (data.ok) entry.resolve(data.result);
      else entry.reject(new Error(data.error));
    };
    this.worker.onerror = (event) => {
      const error = new Error(`Engine worker failed: ${event.message}`);
      for (const entry of this.pending.values()) entry.reject(error);
      this.pending.clear();
    };
  }

  private run(fen: string, difficulty: Difficulty, timeBudgetMs: number): Promise<EngineMove> {
    const id = this.nextId++;
    const request: SearchRequest = { id, fen, difficulty, timeBudgetMs };
    return new Promise<EngineMove>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(request);
    });
  }

  bestMove(fen: string, difficulty: Difficulty, maxTimeMs = Infinity): Promise<EngineMove> {
    // Deeper settings get a longer leash, but the budget leaves headroom so the
    // wall-clock stays inside the plan's 2s Phase 3 exit criterion.
    return this.run(fen, difficulty, Math.min(budgetFor(difficulty), maxTimeMs));
  }

  async evaluate(fen: string): Promise<number> {
    const result = await this.run(fen, 2, 250);
    return result.score;
  }

  dispose(): void {
    this.worker.terminate();
    this.pending.clear();
  }
}

let shared: ChessEngine | null = null;

export function getEngine(): ChessEngine {
  if (!shared) shared = new LocalEngine();
  return shared;
}

export function disposeEngine(): void {
  shared?.dispose();
  shared = null;
}
