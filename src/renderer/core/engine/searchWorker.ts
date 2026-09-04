/**
 * Web Worker shell around `search.ts`. Keeps the search off the render thread
 * so the 3D scene never stutters while the computer is thinking.
 */

import { search } from './search';
import type { Difficulty } from '../types';

export interface SearchRequest {
  id: number;
  fen: string;
  difficulty: Difficulty;
  timeBudgetMs: number;
}

export type SearchResponse =
  | { id: number; ok: true; result: ReturnType<typeof search> }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const { id, fen, difficulty, timeBudgetMs } = event.data;
  try {
    const result = search(fen, difficulty, timeBudgetMs);
    const response: SearchResponse = { id, ok: true, result };
    self.postMessage(response);
  } catch (error) {
    const response: SearchResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
