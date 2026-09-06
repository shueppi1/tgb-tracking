import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { seasonFor, toLocalInputValue } from '../domain/season';
import type { HomeAway, Match, Player } from '../domain/types';

export default function NewMatch() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState<Player[]>([]);
  const [opponent, setOpponent] = useState('');
  const [kickoff, setKickoff] = useState(() => toLocalInputValue(new Date()));
  const [homeAway, setHomeAway] = useState<HomeAway>('home');
  // Season follows the kickoff date until the user overrides it.
  const [seasonOverride, setSeasonOverride] = useState<string | null>(null);
  const season = seasonOverride ?? seasonFor(kickoff ? new Date(kickoff) : new Date());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ players: Player[] }>('/players?active=true')
      .then((res) => setPlayers(res.players))
      .catch((err) => setError(err.message));
  }, []);

  const field = useMemo(() => players.filter((p) => p.position === 'field'), [players]);
  const keepers = useMemo(() => players.filter((p) => p.position === 'goalkeeper'), [players]);
  const selectedField = field.filter((p) => selected.has(p.id)).length;
  const selectedKeepers = keepers.filter((p) => selected.has(p.id)).length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(list: Player[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of list) {
        if (on) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!opponent.trim()) return setError('Bitte Gegner eingeben.');
    if (selectedField === 0) return setError('Mindestens ein Feldspieler muss ausgewählt sein.');
    if (selectedKeepers === 0) return setError('Mindestens ein Torwart muss ausgewählt sein.');
    setBusy(true);
    try {
      const res = await api<{ match: Match }>('/matches', {
        method: 'POST',
        body: {
          opponent: opponent.trim(),
          kickoff: new Date(kickoff).toISOString(),
          homeAway,
          season,
          playerIds: [...selected],
        },
      });
      navigate(`/spiel/${res.match.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spiel konnte nicht angelegt werden.');
    } finally {
      setBusy(false);
    }
  }

  const tiles = (list: Player[]) => (
    <div className="tile-grid">
      {list.map((p) => (
        <button
          type="button"
          key={p.id}
          className={`tile${selected.has(p.id) ? ' selected' : ''}${p.position === 'goalkeeper' ? ' keeper' : ''}`}
          onClick={() => toggle(p.id)}
          aria-pressed={selected.has(p.id)}
        >
          <span className="number">{p.number}</span>
          <span className="name">{p.displayName}</span>
        </button>
      ))}
    </div>
  );

  return (
    <form onSubmit={submit}>
      <h1>Neues Spiel</h1>
      <section className="card">
        <h2>Spieldaten</h2>
        <div className="grid-form">
          <div>
            <label htmlFor="opponent">Gegner</label>
            <input id="opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} required autoFocus />
          </div>
          <div>
            <label htmlFor="kickoff">Datum &amp; Uhrzeit</label>
            <input id="kickoff" type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="homeAway">Heim / Auswärts</label>
            <select id="homeAway" value={homeAway} onChange={(e) => setHomeAway(e.target.value as HomeAway)}>
              <option value="home">Heim</option>
              <option value="away">Auswärts</option>
            </select>
          </div>
          <div>
            <label htmlFor="season">Saison</label>
            <input id="season" value={season} onChange={(e) => setSeasonOverride(e.target.value)} />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Feldspieler ({selectedField})</h2>
          <div className="row">
            <button type="button" className="small ghost" onClick={() => selectAll(field, true)}>
              Alle
            </button>
            <button type="button" className="small ghost" onClick={() => selectAll(field, false)}>
              Keine
            </button>
          </div>
        </div>
        {field.length ? tiles(field) : <p className="muted">Keine aktiven Feldspieler im Kader.</p>}
      </section>

      <section className="card">
        <h2>Torhüter ({selectedKeepers})</h2>
        {keepers.length ? tiles(keepers) : <p className="muted">Keine aktiven Torhüter im Kader.</p>}
      </section>

      {error && <p className="error">{error}</p>}
      <button type="submit" className="primary" disabled={busy} style={{ minHeight: 56, fontSize: '1.1rem' }}>
        Spiel starten
      </button>
    </form>
  );
}
