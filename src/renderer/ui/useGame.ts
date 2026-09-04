/**
 * React binding for the vanilla game store.
 *
 * `core/gameStore.ts` is framework-free on purpose; this is the only file that
 * knows both about it and about React.
 */

import { useStore } from 'zustand';
import { gameStore, type GameStore } from '../core/gameStore';

export function useGame<T>(selector: (state: GameStore) => T): T {
  return useStore(gameStore, selector);
}

/** Actions are stable, so components can call them without subscribing. */
export const actions = {
  newGame: (...args: Parameters<GameStore['newGame']>) => gameStore.getState().newGame(...args),
  openMenu: () => gameStore.getState().openMenu(),
  clickSquare: (...args: Parameters<GameStore['clickSquare']>) => gameStore.getState().clickSquare(...args),
  choosePromotion: (...args: Parameters<GameStore['choosePromotion']>) =>
    gameStore.getState().choosePromotion(...args),
  cancelPromotion: () => gameStore.getState().cancelPromotion(),
  completeCinematic: () => gameStore.getState().completeCinematic(),
  resign: () => gameStore.getState().resign(),
  setConfig: (...args: Parameters<GameStore['setConfig']>) => gameStore.getState().setConfig(...args),
  toggleSkipAnimations: () => gameStore.getState().toggleSkipAnimations(),
  setAnimationSpeed: (...args: Parameters<GameStore['setAnimationSpeed']>) =>
    gameStore.getState().setAnimationSpeed(...args),
};
