import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, download } from '../api/client';
import EventLog from '../components/EventLog';
import SummaryTables from '../components/SummaryTables';
import { formatDateTime } from '../domain/season';
import type { Match, MatchSummary } from '../domain/types';

export default function Result() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [match, setMatch] = useState<Match | null>(null);
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api<{ match: Match }>(`/matches/${id}`),
      api<{ summary: MatchSummary }>(`/matches/${id}/summary`),
    ])
      .then(([m, s]) => {
        setMatch(m.match);
        setSummary(s.summary);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  async function exportFile(kind: string, path: string) {
    if (!id) return;
    setBusy(kind);
    setError(null);
    try {
      await download(`/matches/${id}${path}`, `${kind}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export fehlgeschlagen.');
    } finally {
      setBusy(null);
    }
  }

  async function reopen() {
    if (!id || !window.confirm('Spiel wieder öffnen und weiter erfassen?')) return;
    try {
      await api(`/matches/${id}/reopen`, { method: 'POST' });
      navigate(`/spiel/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler.');
    }
  }

  if (error && !match) return <p className="error">{error}</p>;
  if (!match || !summary) return <p className="muted">Lade …</p>;

  const home = match.homeAway === 'home';
  const left = home ? 'TGB' : match.opponent;
  const right = home ? match.opponent : 'TGB';
  const leftScore = home ? summary.score.own : summary.score.opponent;
  const rightScore = home ? summary.score.opponent : summary.score.own;

  return (
    <>
      <h1>Auswertung</h1>
      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>
              {left} {leftScore} : {rightScore} {right}
            </div>
            <div className="muted">
              {formatDateTime(match.kickoff)} · Saison {match.season} · {home ? 'Heimspiel' : 'Auswärtsspiel'}
              {match.status === 'running' && ' · läuft noch'}
            </div>
          </div>
          {match.status === 'running' ? (
            <Link to={`/spiel/${match.id}`}>
              <button type="button" className="primary">
                Weiter erfassen
              </button>
            </Link>
          ) : (
            <button type="button" className="ghost" onClick={reopen}>
              Spiel wieder öffnen
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2>CSV-Export</h2>
        <p className="muted">Semikolon-getrennt, UTF-8 mit BOM – öffnet direkt in Excel (deutsch).</p>
        <div className="row">
          <button type="button" disabled={busy !== null} onClick={() => exportFile('ereignisse', '/export/events.csv')}>
            Ereignisse (CSV)
          </button>
          <button type="button" disabled={busy !== null} onClick={() => exportFile('spieler', '/export/players.csv')}>
            Spieler (CSV)
          </button>
          <button type="button" disabled={busy !== null} onClick={() => exportFile('torhueter', '/export/goalkeepers.csv')}>
            Torhüter (CSV)
          </button>
          <button type="button" className="primary" disabled={busy !== null} onClick={() => exportFile('export', '/export.zip')}>
            Alle drei (ZIP)
          </button>
        </div>
        {error && <p className="error" style={{ marginTop: '0.5rem' }}>{error}</p>}
      </section>

      <section className="card">
        <SummaryTables players={summary.players} goalkeepers={summary.goalkeepers} team={summary.team} />
      </section>

      <section className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Verlauf ({match.events.length})</h2>
          <button type="button" className="small ghost" onClick={() => setShowLog((v) => !v)}>
            {showLog ? 'Ausblenden' : 'Anzeigen'}
          </button>
        </div>
        {showLog && <EventLog events={match.events} roster={match.roster} />}
      </section>

      <Link to="/archiv">← Zum Archiv</Link>
    </>
  );
}
