/**
 * In-game overlay: turn indicator, controls, evaluation, captures, move list,
 * promotion picker and the result card.
 */

import { useMemo } from 'react';
import { useGame, actions } from './useGame';
import { PIECE_NAME, type Color, type PieceType } from '../core/types';

const GLYPH: Record<Color, Record<PieceType, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function TopBar() {
  const turn = useGame((s) => s.turn);
  const phase = useGame((s) => s.phase);
  const thinking = useGame((s) => s.thinking);
  const skip = useGame((s) => s.config.skipAnimations);
  const speed = useGame((s) => s.config.animationSpeed);
  const mode = useGame((s) => s.config.mode);
  const humanColor = useGame((s) => s.config.humanColor);

  const label = useMemo(() => {
    if (phase === 'over') return 'Game over';
    if (thinking) return 'The enemy considers';
    if (mode === 'human-vs-computer') {
      return turn === humanColor ? 'Your move' : 'Enemy move';
    }
    return turn === 'w' ? 'White to move' : 'Black to move';
  }, [phase, thinking, mode, turn, humanColor]);

  return (
    <div className="hud-top">
      <div className="turn-badge">
        <span className="turn-dot" data-color={turn} />
        {thinking ? <span className="thinking">{label}…</span> : <span>{label}</span>}
      </div>

      <div className="hud-buttons">
        <button
          className="hud-button"
          data-active={skip}
          onClick={actions.toggleSkipAnimations}
          title="Jump every cinematic straight to its final frame"
        >
          {skip ? 'Animations off' : 'Animations on'}
        </button>
        <button
          className="hud-button"
          onClick={() => actions.setAnimationSpeed(speed >= 3 ? 1 : speed + 1)}
          title="Animation speed"
        >
          {speed}×
        </button>
        <button className="hud-button" onClick={actions.resign}>
          Resign
        </button>
        <button className="hud-button" onClick={actions.openMenu}>
          Menu
        </button>
      </div>
    </div>
  );
}

function SidePanel() {
  const pieces = useGame((s) => s.pieces);
  const history = useGame((s) => s.history);
  const balance = useGame((s) => s.materialBalance);

  const captured = useMemo(() => {
    const dead = pieces.filter((p) => p.square === null);
    const byColor: Record<Color, string[]> = { w: [], b: [] };
    let points: Record<Color, number> = { w: 0, b: 0 };
    for (const piece of dead) {
      const type = piece.promotedFrom ?? piece.type;
      byColor[piece.color].push(GLYPH[piece.color][type]);
      points[piece.color] += VALUE[type];
    }
    return { byColor, points };
  }, [pieces]);

  const pairs = useMemo(() => {
    const rows: { number: number; white: string; black: string }[] = [];
    for (let i = 0; i < history.length; i += 2) {
      rows.push({ number: i / 2 + 1, white: history[i], black: history[i + 1] ?? '' });
    }
    return rows.reverse(); // newest first — you look at the last move most
  }, [history]);

  // Clamp the eval bar so a decisive advantage does not peg it instantly.
  const ratio = Math.max(-1, Math.min(1, balance / 1200));
  const advantage = captured.points.b - captured.points.w;

  return (
    <div className="hud-side">
      <p className="panel-heading">Momentum</p>
      <div className="eval-bar">
        <div
          className="eval-fill"
          data-side={ratio >= 0 ? 'w' : 'b'}
          style={
            ratio >= 0
              ? { left: '50%', width: `${ratio * 50}%` }
              : { left: `${50 + ratio * 50}%`, width: `${-ratio * 50}%` }
          }
        />
      </div>

      <p className="panel-heading">Fallen</p>
      <div className="captured-row" data-color="b">
        {captured.byColor.b.join(' ') || '—'}
      </div>
      <div className="captured-row" data-color="w">
        {captured.byColor.w.join(' ') || '—'}
      </div>
      {advantage !== 0 && (
        <div className="advantage">
          {advantage > 0 ? 'White' : 'Black'} +{Math.abs(advantage)}
        </div>
      )}

      {pairs.length > 0 && (
        <div className="history">
          {pairs.map((row) => (
            <div key={row.number}>
              <span className="history-number">{row.number}.</span>{' '}
              <span className="history-move">{row.white}</span>
              <span className="history-move">{row.black}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PromotionDialog() {
  const pending = useGame((s) => s.pendingPromotion);
  const turn = useGame((s) => s.turn);
  if (!pending) return null;

  const choices: Exclude<PieceType, 'p' | 'k'>[] = ['q', 'r', 'b', 'n'];

  return (
    <div className="overlay">
      <div className="promotion-card">
        <p className="panel-heading">Choose the pawn&rsquo;s reward</p>
        <div className="promotion-options">
          {choices.map((type) => (
            <button key={type} className="promotion-option" onClick={() => actions.choosePromotion(type)}>
              {GLYPH[turn][type]}
              <span>{PIECE_NAME[type]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultCard() {
  const phase = useGame((s) => s.phase);
  const result = useGame((s) => s.result);
  const config = useGame((s) => s.config);
  const active = useGame((s) => s.active);

  // Hold the card back until the victory cinematic has finished playing.
  if (phase !== 'over' || !result || active) return null;

  const outcome =
    result.winner === null
      ? 'draw'
      : config.mode === 'human-vs-computer'
        ? result.winner === config.humanColor
          ? 'win'
          : 'loss'
        : 'win';

  const title =
    result.winner === null
      ? 'Stalemate'
      : outcome === 'loss'
        ? 'Defeat'
        : config.mode === 'human-vs-computer'
          ? 'Victory'
          : `${result.winner === 'w' ? 'White' : 'Black'} wins`;

  const detail: Record<string, string> = {
    checkmate: 'By checkmate',
    stalemate: 'No legal moves remain',
    'insufficient-material': 'Neither army can force a win',
    'threefold-repetition': 'The same position, three times over',
    'fifty-move': 'Fifty moves without progress',
    resignation: 'Resigned the field',
    timeout: 'Out of time',
  };

  return (
    <div className="overlay">
      <div className="result-card">
        <h2 className="result-title" data-outcome={outcome}>
          {title}
        </h2>
        <p className="result-detail">{detail[result.kind] ?? ''}</p>
        <div className="result-actions">
          <button className="hud-button" onClick={() => actions.newGame()}>
            Play again
          </button>
          <button className="hud-button" onClick={actions.openMenu}>
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}

export function Hud() {
  return (
    <div className="hud">
      <TopBar />
      <SidePanel />
      <PromotionDialog />
      <ResultCard />
    </div>
  );
}
