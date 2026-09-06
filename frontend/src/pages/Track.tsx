import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import ClockBar from '../components/ClockBar';
import ClockCorrectDialog from '../components/ClockCorrectDialog';
import EventGrid from '../components/EventGrid';
import EventLog from '../components/EventLog';
import PlayerSheet from '../components/PlayerSheet';
import SummaryTables from '../components/SummaryTables';
import { elapsedSeconds } from '../domain/clock';
import type { EventType } from '../domain/events';
import { buildSummary } from '../domain/stats';
import type { Half } from '../domain/types';
import { useMatchStore } from '../store/matchStore';

/** An event whose button was tapped; the clock time is frozen at that moment. */
interface PendingEvent {
  event: EventType;
  half: Half;
  clockSeconds: number;
}

export default function Track() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = useMatchStore();
  const { match, loading, loadError, sync, pendingCount, notice } = store;
  const [pending, setPending] = useState<PendingEvent | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [panel, setPanel] = useState<'summary' | 'log' | null>('summary');
  const [finishError, setFinishError] = useState<string | null>(null);

  useEffect(() => {
    if (id) void store.load(id);
    return () => store.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const summary = useMemo(
    () => (match ? buildSummary(match.roster, match.events) : null),
    [match],
  );

  const onSelectEvent = useCallback(
    (event: EventType) => {
      if (!match) return;
      const half = match.clock.half;
      const clockSeconds = elapsedSeconds(match.clock, Date.now());
      if (event.target === 'none') {
        store.addEvent(event.id, null, half, clockSeconds);
      } else {
        setPending({ event, half, clockSeconds });
      }
    },
    [match, store],
  );

  const cancelPending = useCallback(() => setPending(null), []);

  function pickPlayer(playerId: string) {
    if (!pending) return;
    store.addEvent(pending.event.id, playerId, pending.half, pending.clockSeconds);
    setPending(null);
  }

  function endHalf() {
    if (window.confirm('1. Halbzeit beenden? Die Uhr springt auf 30:00.')) store.clock('end_half');
  }

  async function finish() {
    if (!window.confirm('Spiel beenden? Danach können keine Ereignisse mehr erfasst werden.')) return;
    setFinishError(null);
    try {
      const finished = await store.finish();
      navigate(`/spiel/${finished.id}/auswertung`);
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : 'Spiel konnte nicht beendet werden.');
    }
  }

  if (!id) return <Navigate to="/" replace />;

  if (!match) {
    return (
      <div className="page">
        {loading ? <p className="muted">Lade Spiel …</p> : <p className="error">{loadError ?? 'Spiel nicht gefunden.'}</p>}
        <Link to="/">Zur Übersicht</Link>
      </div>
    );
  }

  if (match.status === 'finished') return <Navigate to={`/spiel/${match.id}/auswertung`} replace />;

  return (
    <div className="track">
      <ClockBar
        clock={match.clock}
        score={summary!.score}
        opponent={match.opponent}
        sync={sync}
        pending={pendingCount}
        canUndo={match.events.length > 0}
        onStartStop={() => store.clock(match.clock.running ? 'stop' : 'start')}
        onEndHalf={endHalf}
        onCorrect={() => setCorrecting(true)}
        onUndo={() => store.undo()}
        onFinish={finish}
      />

      <div className="track-body">
        {(notice || finishError) && (
          <div className="notice">
            <span>{finishError ?? notice}</span>
            <button
              type="button"
              className="small ghost"
              onClick={() => {
                setFinishError(null);
                store.dismissNotice();
              }}
            >
              OK
            </button>
          </div>
        )}

        <EventGrid onSelect={onSelectEvent} />

        <div className="panels">
          <div className="panel-tabs">
            <button type="button" className={panel === 'summary' ? 'active' : ''} onClick={() => setPanel(panel === 'summary' ? null : 'summary')}>
              Zusammenfassung
            </button>
            <button type="button" className={panel === 'log' ? 'active' : ''} onClick={() => setPanel(panel === 'log' ? null : 'log')}>
              Verlauf ({match.events.length})
            </button>
          </div>
          {panel === 'summary' && summary && (
            <div className="panel-body">
              <SummaryTables players={summary.players} goalkeepers={summary.goalkeepers} team={summary.team} compact />
            </div>
          )}
          {panel === 'log' && (
            <div className="panel-body">
              <EventLog events={match.events} roster={match.roster} onDelete={(eid) => store.deleteEvent(eid)} />
            </div>
          )}
        </div>
      </div>

      {pending && (
        <PlayerSheet event={pending.event} roster={match.roster} onPick={pickPlayer} onCancel={cancelPending} />
      )}
      {correcting && (
        <ClockCorrectDialog
          clock={match.clock}
          onClose={() => setCorrecting(false)}
          onApply={(seconds, half) => {
            store.clock('correct', seconds, half);
            setCorrecting(false);
          }}
        />
      )}
    </div>
  );
}
