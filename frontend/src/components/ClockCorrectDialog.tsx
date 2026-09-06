import { useState } from 'react';
import { elapsedSeconds, formatClock, parseClock } from '../domain/clock';
import type { ClockState, Half } from '../domain/types';

interface Props {
  clock: ClockState;
  onApply(seconds: number, half: Half): void;
  onClose(): void;
}

export default function ClockCorrectDialog({ clock, onApply, onClose }: Props) {
  // Frozen at the moment the dialog opens — the user edits a fixed reference value.
  const [current] = useState(() => elapsedSeconds(clock, Date.now()));
  const [text, setText] = useState(() => formatClock(current));
  const [half, setHalf] = useState<Half>(clock.half);
  const parsed = parseClock(text);

  function nudge(delta: number) {
    const base = parsed ?? current;
    setText(formatClock(Math.max(0, base + delta)));
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h1>Zeit korrigieren</h1>
        <p className="muted">Aktuell: {formatClock(current)}</p>
        <div className="row" style={{ marginBottom: '0.75rem' }}>
          <button type="button" onClick={() => nudge(-60)}>
            −1:00
          </button>
          <button type="button" onClick={() => nudge(-10)}>
            −10s
          </button>
          <button type="button" onClick={() => nudge(10)}>
            +10s
          </button>
          <button type="button" onClick={() => nudge(60)}>
            +1:00
          </button>
        </div>
        <div className="grid-form">
          <div>
            <label htmlFor="clock-text">Spielzeit (mm:ss)</label>
            <input
              id="clock-text"
              inputMode="numeric"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="clock-half">Halbzeit</label>
            <select
              id="clock-half"
              value={half}
              onChange={(e) => setHalf(Number(e.target.value) as Half)}
            >
              <option value={1}>1. Halbzeit</option>
              <option value={2}>2. Halbzeit</option>
            </select>
          </div>
        </div>
        {parsed === null && <p className="error">Ungültige Zeit.</p>}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="primary"
            disabled={parsed === null}
            onClick={() => parsed !== null && onApply(parsed, half)}
          >
            Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}
