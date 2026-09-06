import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isNetworkError } from '../api/client';
import { formatDateTime } from '../domain/season';
import type { Match, MatchListing } from '../domain/types';
import { localRunningMatches } from '../store/matchStore';

type Running = Pick<Match, 'id' | 'opponent' | 'kickoff' | 'homeAway'> & {
  score?: MatchListing['score'];
};

export default function Dashboard() {
  const [running, setRunning] = useState<Running[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<{ matches: MatchListing[] }>('/matches?status=running')
      .then((res) => {
        if (!cancelled) setRunning(res.matches);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isNetworkError(err)) {
          setOffline(true);
          setRunning(localRunningMatches());
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h1>Übersicht</h1>
      {offline && (
        <div className="notice">Keine Verbindung zum Server – lokal gespeicherte Spiele werden angezeigt.</div>
      )}
      <section className="card">
        <h2>Laufende Spiele</h2>
        {loading ? (
          <p className="muted">Lade …</p>
        ) : running.length === 0 ? (
          <p className="muted">Kein Spiel läuft gerade.</p>
        ) : (
          running.map((m) => (
            <div className="row" key={m.id} style={{ justifyContent: 'space-between', padding: '0.4rem 0' }}>
              <div>
                <strong>TGB – {m.opponent}</strong>
                {m.score && (
                  <span>
                    {' '}
                    {m.score.own} : {m.score.opponent}
                  </span>
                )}
                <div className="muted">{formatDateTime(m.kickoff)}</div>
              </div>
              <Link to={`/spiel/${m.id}`}>
                <button type="button" className="primary">
                  Fortsetzen
                </button>
              </Link>
            </div>
          ))
        )}
      </section>
      <div className="row">
        <Link to="/spiel/neu">
          <button type="button" className="primary">
            Neues Spiel
          </button>
        </Link>
        <Link to="/kader">
          <button type="button">Kader verwalten</button>
        </Link>
        <Link to="/archiv">
          <button type="button">Archiv</button>
        </Link>
        <Link to="/statistik">
          <button type="button">Saisonstatistik</button>
        </Link>
      </div>
    </>
  );
}
