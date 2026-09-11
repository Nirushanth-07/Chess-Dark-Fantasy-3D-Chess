/**
 * Main menu: mode, theme, side and difficulty.
 */

import { useGame, actions } from './useGame';
import { DIFFICULTY } from '../core/engine';
import { unlockAudio } from '../audio';
import { TIME_CONTROL_PRESETS } from '../core/clock';
import type { Color, Difficulty, GameMode, ThemeId, TimeControl } from '../core/types';

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];

const UNTIMED = 'off';

function presetIdFor(control: TimeControl | null): string {
  if (!control) return UNTIMED;
  const match = TIME_CONTROL_PRESETS.find(
    (preset) => preset.control.initialMs === control.initialMs && preset.control.incrementMs === control.incrementMs,
  );
  return match?.id ?? UNTIMED;
}

function Options<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange(next: T): void;
}) {
  return (
    <div className="option-row">
      {options.map((option) => (
        <button
          key={String(option.value)}
          className="option"
          data-active={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.hint && <small>{option.hint}</small>}
        </button>
      ))}
    </div>
  );
}

export function Menu() {
  const config = useGame((s) => s.config);

  const start = () => {
    unlockAudio(); // browsers require a gesture before audio can play
    actions.newGame();
  };

  return (
    <div className="menu">
      <div className="menu-panel">
        <h1 className="menu-title">CHESS</h1>
        <p className="menu-subtitle">Two armies, one board</p>

        <div className="field">
          <label className="field-label">Mode</label>
          <Options<GameMode>
            value={config.mode}
            onChange={(mode) => actions.setConfig({ mode })}
            options={[
              { value: 'human-vs-human', label: 'Man vs Man', hint: 'hotseat' },
              { value: 'human-vs-computer', label: 'Man vs Machine', hint: 'engine' },
            ]}
          />
        </div>

        <div className="field">
          <label className="field-label">Theme</label>
          <Options<ThemeId>
            value={config.theme}
            onChange={(theme) => actions.setConfig({ theme })}
            options={[
              { value: 'classical', label: 'Classical', hint: 'Staunton set' },
              { value: 'animated', label: 'Animated', hint: '3D characters' },
            ]}
          />
        </div>

        <div className="field">
          <label className="field-label">Clock &middot; minutes + seconds per move</label>
          <Options<string>
            value={presetIdFor(config.timeControl)}
            onChange={(id) =>
              actions.setConfig({
                timeControl: TIME_CONTROL_PRESETS.find((preset) => preset.id === id)?.control ?? null,
              })
            }
            options={[
              { value: UNTIMED, label: 'Off', hint: 'untimed' },
              ...TIME_CONTROL_PRESETS.map((preset) => ({ value: preset.id, label: preset.label, hint: preset.hint })),
            ]}
          />
        </div>

        {config.mode === 'human-vs-human' && (
          <div className="field">
            <label className="field-label">Board</label>
            <Options<'on' | 'off'>
              value={config.autoFlipBoard ? 'on' : 'off'}
              onChange={(value) => actions.setConfig({ autoFlipBoard: value === 'on' })}
              options={[
                { value: 'on', label: 'Auto-flip', hint: 'faces each player in turn' },
                { value: 'off', label: 'Fixed', hint: "always white's view" },
              ]}
            />
          </div>
        )}

        {config.mode === 'human-vs-computer' && (
          <>
            <div className="field">
              <label className="field-label">Your side</label>
              <Options<Color>
                value={config.humanColor}
                onChange={(humanColor) => actions.setConfig({ humanColor })}
                options={[
                  { value: 'w', label: 'White', hint: 'moves first' },
                  { value: 'b', label: 'Black', hint: 'moves second' },
                ]}
              />
            </div>

            <div className="field">
              <label className="field-label">Difficulty</label>
              <Options<Difficulty>
                value={config.difficulty}
                onChange={(difficulty) => actions.setConfig({ difficulty })}
                options={DIFFICULTIES.map((level) => ({
                  value: level,
                  label: DIFFICULTY[level].label,
                  hint: DIFFICULTY[level].approxElo,
                }))}
              />
            </div>
          </>
        )}

        <button className="start-button" onClick={start}>
          Begin
        </button>

        <p className="menu-footnote">
          Classical is the fast, low-spec set.
          <br />
          Animated runs the full duel and aura system.
        </p>
      </div>
    </div>
  );
}
