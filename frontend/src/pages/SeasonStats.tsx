import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import SummaryTables from '../components/SummaryTables';
import { formatDate, seasonFor } from '../domain/season';
import type { SeasonSummary } from '../domain/types';

export default function SeasonStats() {
  const [seasons, setSeasons] = useState<string[]>([]);
  const [season, setSeason] = useState<string>('');
  const [summary, setSummary] = useState<SeasonSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ seasons: string[] }>('/stats/seasons')
      .then((res) => {
        const current = seasonFor(new Date());
        const list = res.seasons.includes(current) ? res.seasons : [current, ...res.seasons];
        setSeasons(list);
        setSeason(list[0]);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!season) return;
    api<{ summary: SeasonSummary }>(`/stats/season?season=${encodeURIComponent(season)}`)
      .then((res) => setSummary(res.summary))
      .catch((err) => setError(err.message));
  }, [season]);

  // A summary for a different season than the one selected is stale → show loading.
  const current = summary && summary.season === season ? summary : null;

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Saisonstatistik</h1>
        <div style={{ minWidth: 160 }}>
          <select value={season} onChange={(e) => setSeason(e.target.value)} aria-label="Saison">
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {!current ? (
        <p className="muted">Lade …</p>
      ) : (
        <>
          <section className="card">
            <div className="stat-row">
              <div className="stat">
                <div className="value">{current.games}</div>
                <div className="label">Spiele</div>
              </div>
              <div className="stat">
                <div className="value">
                  {current.record.wins}-{current.record.draws}-{current.record.losses}
                </div>
                <div className="label">S-U-N</div>
              </div>
              <div className="stat">
                <div className="value">
                  {current.score.own} : {current.score.opponent}
                </div>
                <div className="label">Tore</div>
              </div>
            </div>
          </section>
          <section className="card">
            <SummaryTables players={current.players} goalkeepers={current.goalkeepers} team={current.team} showGames />
          </section>
          <section className="card">
            <h2>Spiele der Saison</h2>
            {current.matches.length === 0 ? (
              <p className="muted">Noch keine beendeten Spiele in dieser Saison.</p>
            ) : (
              <ul>
                {current.matches.map((m) => (
                  <li key={m.id}>
                    <Link to={`/spiel/${m.id}/auswertung`}>
                      {formatDate(m.kickoff)} – {m.opponent}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
