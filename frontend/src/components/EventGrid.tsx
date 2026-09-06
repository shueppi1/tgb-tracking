import { useState } from 'react';
import { EVENT_GROUPS, eventsInGroup, type EventType } from '../domain/events';

interface Props {
  onSelect(event: EventType): void;
}

/** Step 1 of the two-step recorder: colour-coded event buttons, labels only. */
export default function EventGrid({ onSelect }: Props) {
  const [flashId, setFlashId] = useState<string | null>(null);

  function handle(event: EventType) {
    onSelect(event);
    if (event.target === 'none') {
      setFlashId(event.id);
      setTimeout(() => setFlashId((cur) => (cur === event.id ? null : cur)), 500);
    }
  }

  return (
    <div className="event-groups">
      {EVENT_GROUPS.map((group) => (
        <section className="event-group" key={group.id}>
          <h3>{group.label}</h3>
          <div className="buttons">
            {eventsInGroup(group.id).map((event) => (
              <button
                type="button"
                key={event.id}
                className={`evbtn${flashId === event.id ? ' flash' : ''}`}
                data-group={event.group}
                onClick={() => handle(event)}
              >
                {event.label}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
