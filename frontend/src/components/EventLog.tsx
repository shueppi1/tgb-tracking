import { formatClock } from '../domain/clock';
import { eventLabel } from '../domain/events';
import type { MatchEvent, RosterEntry } from '../domain/types';

interface Props {
  events: MatchEvent[];
  roster: RosterEntry[];
  onDelete?(eventId: string): void;
}

/** Reverse-chronological event list with per-entry delete. */
export default function EventLog({ events, roster, onDelete }: Props) {
  const byId = new Map(roster.map((m) => [m.playerId, m]));
  if (!events.length) return <p className="muted">Noch keine Ereignisse.</p>;
  return (
    <div>
      {[...events].reverse().map((ev) => {
        const member = ev.playerId ? byId.get(ev.playerId) : null;
        return (
          <div className="log-row" key={ev.eventId}>
            <span className="when">
              {ev.half}. HZ {formatClock(ev.clockSeconds)}
            </span>
            <span className="what">
              <strong>{eventLabel(ev.type)}</strong>
              {member && (
                <span>
                  #{member.number} {member.displayName}
                </span>
              )}
            </span>
            {onDelete && (
              <button
                type="button"
                className="small danger"
                onClick={() => onDelete(ev.eventId)}
                aria-label="Ereignis löschen"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
