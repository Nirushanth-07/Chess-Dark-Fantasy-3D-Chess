import { Suspense, useEffect } from 'react';
import { GameScene } from './scene/GameScene';
import { Hud } from './ui/Hud';
import { Menu } from './ui/Menu';
import { useGame } from './ui/useGame';
import { gameStore } from './core/gameStore';
import { getEngine } from './core/engine';
import { initAudio } from './audio';
import './ui/styles.css';

export function App() {
  const screen = useGame((s) => s.screen);

  useEffect(() => {
    // The engine lives for the life of the app; the store only ever sees the
    // `ChessEngine` interface (PROJECT_PLAN §3.1).
    gameStore.getState().attachEngine(getEngine());
    return initAudio();
  }, []);

  return (
    <div className="app">
      {screen === 'game' && (
        <>
          <div className="canvas-host">
            <Suspense fallback={<div className="loading">Mustering</div>}>
              <GameScene />
            </Suspense>
          </div>
          <Hud />
        </>
      )}
      {screen === 'menu' && <Menu />}
    </div>
  );
}
