/**
 * In-game overlay: turn indicator, controls, evaluation, captures, move list,
 * promotion picker and the result card.
 */

import { useEffect, useMemo, useState } from 'react';
import { useGame, actions } from './useGame';
import { PIECE_NAME, type Color, type PieceType } from '../core/types';
import { clockNow, formatClock, isLowTime, remainingMs, type ClockState } from '../core/clock';
import { EmberField } from './EmberField';

/** Flames along the foot of the banner: position, size and offset per plume. */
const FLAMES = [
  { left: 8, width: 64, height: 132, delay: 0.37, duration: 1.95 },
  { left: 22, width: 78, height: 168, delay: 0, duration: 1.6 },
  { left: 36, width: 70, height: 186, delay: 0.52, duration: 1.42 },
  { left: 50, width: 88, height: 206, delay: 0.14, duration: 1.78 },
  { left: 64, width: 72, height: 180, delay: 0.63, duration: 1.5 },
  { left: 78, width: 80, height: 162, delay: 0.26, duration: 2.05 },
  { left: 92, width: 62, height: 128, delay: 0.44, duration: 1.7 },
];

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
  const autoFlip = useGame((s) => s.config.autoFlipBoard);

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
        {mode === 'human-vs-human' && (
          <button
            className="hud-button"
            data-active={autoFlip}
            onClick={actions.toggleAutoFlip}
            title="Swing the board round to whoever is to move"
          >
            {autoFlip ? 'Auto-flip on' : 'Auto-flip off'}
          </button>
        )}
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

/** Re-renders the caller at 10 Hz while `active` — tenths are the finest unit shown. */
function useTicker(active: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), 100);
    return () => window.clearInterval(id);
  }, [active]);
}

function ClockFace({ clock, color, label, now }: { clock: ClockState; color: Color; label: string; now: number }) {
  const ms = remainingMs(clock, color, now);
  return (
    <div
      className="clock-face"
      data-running={clock.running === color}
      data-low={isLowTime(clock, color, now)}
      data-flagged={ms <= 0}
    >
      <span className="clock-label">
        <span className="turn-dot" data-color={color} />
        {label}
      </span>
      <span className="clock-time">{formatClock(ms)}</span>
    </div>
  );
}

function Clocks() {
  const clock = useGame((s) => s.clock);
  const mode = useGame((s) => s.config.mode);
  const humanColor = useGame((s) => s.config.humanColor);
  useTicker(clock?.running != null);
  if (!clock) return null;

  // The clock never counts down in state; each render derives it from now.
  const now = clockNow();
  const vsComputer = mode === 'human-vs-computer';
  // Your own clock sits nearest you, as it would across a real board.
  const bottom: Color = vsComputer ? humanColor : 'w';
  const top: Color = bottom === 'w' ? 'b' : 'w';
  const label = (color: Color) =>
    vsComputer ? (color === humanColor ? 'You' : 'Enemy') : color === 'w' ? 'White' : 'Black';

  return (
    <div className="clocks">
      <ClockFace clock={clock} color={top} label={label(top)} now={now} />
      <ClockFace clock={clock} color={bottom} label={label(bottom)} now={now} />
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
      <Clocks />
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

function ResultBanner() {
  const phase = useGame((s) => s.phase);
  const result = useGame((s) => s.result);
  const config = useGame((s) => s.config);
  const active = useGame((s) => s.active);

  // Hold the banner back until the victory cinematic has finished playing.
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
      ? result.kind === 'stalemate'
        ? 'Stalemate'
        : 'Draw'
      : outcome === 'loss'
        ? 'Defeat'
        : config.mode === 'human-vs-computer'
          ? 'Victory'
          : `${result.winner === 'w' ? 'White' : 'Black'} wins`;

  const loserName = result.winner === 'w' ? 'Black' : 'White';
  const timeoutDetail =
    result.winner === null
      ? 'Time ran out, but no mate was possible'
      : config.mode === 'human-vs-computer'
        ? outcome === 'win'
          ? 'The enemy ran out of time'
          : 'You ran out of time'
        : `${loserName} ran out of time`;

  const detail: Record<string, string> = {
    checkmate: 'By checkmate',
    stalemate: 'No legal moves remain',
    'insufficient-material': 'Neither army can force a win',
    'threefold-repetition': 'The same position, three times over',
    'fifty-move': 'Fifty moves without progress',
    resignation: 'Resigned the field',
    timeout: timeoutDetail,
  };

  return (
    <div className="overlay banner-overlay" data-outcome={outcome}>
      <EmberField tone={outcome} />

      <div className="banner">
        {/* The crossbar the banner hangs from. */}
        <div className="banner-bar" aria-hidden />

        {/* Gold edge with the cloth inset inside it — a clip-path cannot take a border. */}
        <div className="banner-edge">
          <div className="banner-cloth" role="status" aria-live="polite">
            <h2 className="banner-title" data-outcome={outcome}>
              {title}
            </h2>
            <p className="banner-detail">{detail[result.kind] ?? ''}</p>
          </div>
        </div>

        <div className="banner-fire" aria-hidden>
          {FLAMES.map((flame) => (
            <span
              key={flame.left}
              className="flame"
              style={{
                left: `${flame.left}%`,
                width: `${flame.width}px`,
                height: `${flame.height}px`,
                animationDelay: `${flame.delay}s`,
                animationDuration: `${flame.duration}s`,
              }}
            />
          ))}
        </div>

        <div className="banner-actions">
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
      <ResultBanner />
    </div>
  );
}
