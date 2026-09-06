import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { formatDateTime } from '../domain/season';
import type { MatchListing } from '../domain/types';

export default function Archive() {
  const [matches, setMatches] = useState<MatchListing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    api<{ matches: MatchListing[] }>('/matches')
      .then((res) => setMatches(res.matches))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function remove(m: MatchListing) {
    if (!window.confirm(`Spiel gegen ${m.opponent} endgültig löschen?`)) return;
    try {
      await api(`/matches/${m.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  }

  return (
    <>
      <h1>Archiv</h1>
      {error && <p className="error">{error}</p>}
      <section className="card">
        {loading ? (
          <p className="muted">Lade …</p>
        ) : matches.length === 0 ? (
          <p className="muted">Noch keine Spiele.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="left">Datum</th>
                  <th className="left">Gegner</th>
                  <th className="left">Saison</th>
                  <th>Ergebnis</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.id}>
                    <td className="left">{formatDateTime(m.kickoff)}</td>
                    <td className="left">
                      <strong>{m.homeAway === 'home' ? `TGB – ${m.opponent}` : `${m.opponent} – TGB`}</strong>
                    </td>
                    <td className="left">{m.season}</td>
                    <td>
                      {m.score.own} : {m.score.opponent}
                    </td>
                    <td>{m.status === 'finished' ? 'beendet' : 'läuft'}</td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <Link to={m.status === 'finished' ? `/spiel/${m.id}/auswertung` : `/spiel/${m.id}`}>
                          <button type="button" className="small">
                            {m.status === 'finished' ? 'Auswertung' : 'Fortsetzen'}
                          </button>
                        </Link>
                        <button type="button" className="small danger" onClick={() => remove(m)}>
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
