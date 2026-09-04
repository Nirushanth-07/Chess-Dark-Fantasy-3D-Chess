import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { gameStore } from './core/gameStore';
import { actions } from './ui/useGame';

/**
 * Debug handle. Lets DevTools — and the automated smoke test — drive the game
 * directly: `__chess.store.getState().newGame({ theme: 'animated' })`.
 */
declare global {
  interface Window {
    __chess: { store: typeof gameStore; actions: typeof actions; view?: { camera: unknown; controls: unknown } };
  }
}
window.__chess = { store: gameStore, actions };

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
