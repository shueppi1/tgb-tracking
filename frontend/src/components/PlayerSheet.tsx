import { useEffect } from 'react';
import { allowedPositions, type EventType } from '../domain/events';
import type { RosterEntry } from '../domain/types';

interface Props {
  event: EventType;
  roster: RosterEntry[];
  onPick(playerId: string): void;
  onCancel(): void;
}

const GROUP_COLOR: Record<string, string> = {
  team: 'var(--group-team)',
  offense: 'var(--group-offense)',
  defense: 'var(--group-defense)',
  keeper: 'var(--group-keeper)',
};

/** Step 2: pick the roster member for the chosen event. Number + display name only. */
export default function PlayerSheet({ event, roster, onPick, onCancel }: Props) {
  const positions = allowedPositions(event.target);
  const field = positions.includes('field') ? roster.filter((m) => m.position === 'field') : [];
  const keepers = positions.includes('goalkeeper')
    ? roster.filter((m) => m.position === 'goalkeeper')
    : [];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const tiles = (members: RosterEntry[]) => (
    <div className="tile-grid">
      {members.map((m) => (
        <button
          type="button"
          key={m.playerId}
          className={`tile${m.position === 'goalkeeper' ? ' keeper' : ''}`}
          onClick={() => onPick(m.playerId)}
        >
          <span className="number">{m.number}</span>
          <span className="name">{m.displayName}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="title">
            <span className="badge" style={{ background: GROUP_COLOR[event.group] }}>
              {event.label}
            </span>
            Wer?
          </div>
          <button type="button" className="ghost" onClick={onCancel}>
            Abbrechen
          </button>
        </div>
        {field.length > 0 && (
          <>
            {keepers.length > 0 && <h3>Feldspieler</h3>}
            {tiles(field)}
          </>
        )}
        {keepers.length > 0 && (
          <>
            {field.length > 0 && <h3>Torhüter</h3>}
            {tiles(keepers)}
          </>
        )}
        {field.length === 0 && keepers.length === 0 && (
          <p className="muted">Kein passender Spieler im Kader.</p>
        )}
      </div>
    </div>
  );
}
