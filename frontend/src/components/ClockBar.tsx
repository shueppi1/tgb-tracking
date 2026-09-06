import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { elapsedSeconds, formatClock, halfEndSeconds } from '../domain/clock';
import type { ClockState, Score } from '../domain/types';
import type { SyncStatus } from '../store/matchStore';
import SyncBadge from './SyncBadge';

interface Props {
  clock: ClockState;
  score: Score;
  opponent: string;
  sync: SyncStatus;
  pending: number;
  canUndo: boolean;
  onStartStop(): void;
  onEndHalf(): void;
  onCorrect(): void;
  onUndo(): void;
  onFinish(): void;
}

/** Current wall-clock time, refreshed four times a second while the clock runs. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export default function ClockBar(props: Props) {
  const { clock, score, opponent, sync, pending, canUndo } = props;
  const now = useNow(clock.running);
  const [menuOpen, setMenuOpen] = useState(false);
  const seconds = elapsedSeconds(clock, now);
  const over = seconds > halfEndSeconds(clock.half);

  return (
    <div className="clockbar">
      <div>
        <div className={`time${over ? ' over' : ''}`}>{formatClock(seconds)}</div>
        <div className="half">
          {clock.half}. Halbzeit {clock.running ? '· läuft' : '· gestoppt'}
        </div>
      </div>
      <div className="score">
        {score.own} : {score.opponent}
        <small>TGB – {opponent}</small>
        <SyncBadge status={sync} pending={pending} />
      </div>
      <div className="controls">
        <button
          type="button"
          className={`startstop ${clock.running ? 'running' : 'stopped'}`}
          onClick={props.onStartStop}
        >
          {clock.running ? 'Stopp' : 'Start'}
        </button>
        <button type="button" disabled={!canUndo} onClick={props.onUndo} title="Letztes Ereignis löschen">
          Rückgängig
        </button>
        <div className="menu">
          <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-haspopup="menu">
            ⋯
          </button>
          {menuOpen && (
            <div className="menu-list" role="menu" onClick={() => setMenuOpen(false)}>
              <button type="button" onClick={props.onCorrect}>
                Zeit korrigieren
              </button>
              {clock.half === 1 && (
                <button type="button" onClick={props.onEndHalf}>
                  1. Halbzeit beenden
                </button>
              )}
              <button type="button" onClick={props.onFinish}>
                Spiel beenden
              </button>
              <Link to="/" role="menuitem" style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>
                Zur Übersicht
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
