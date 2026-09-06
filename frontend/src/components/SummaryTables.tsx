import { eventLabel, KEEPER_EVENT_IDS, PLAYER_EVENT_IDS, TEAM_EVENT_IDS } from '../domain/events';
import type { Counts, KeeperSummaryRow, PlayerSummaryRow } from '../domain/types';

interface Props {
  players: (PlayerSummaryRow & { games?: number })[];
  goalkeepers: (KeeperSummaryRow & { games?: number })[];
  team: Counts;
  showGames?: boolean;
  compact?: boolean;
}

function pct(value: number | null): string {
  return value === null ? '–' : `${value.toLocaleString('de-DE')} %`;
}

export default function SummaryTables({ players, goalkeepers, team, showGames, compact }: Props) {
  return (
    <>
      <h2>Spieler</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="left">Nr</th>
              <th className="left">Name</th>
              {showGames && <th>Spiele</th>}
              {PLAYER_EVENT_IDS.map((id) => (
                <th key={id}>{compact ? shortLabel(id) : eventLabel(id)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.playerId}>
                <td className="left">{p.number}</td>
                <td className="left">
                  {p.displayName}
                  {p.position === 'goalkeeper' && <span className="muted"> (TW)</span>}
                </td>
                {showGames && <td>{p.games}</td>}
                {PLAYER_EVENT_IDS.map((id) => (
                  <td key={id}>{p.counts[id] || ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: '1rem' }}>Torhüter</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="left">Nr</th>
              <th className="left">Name</th>
              {showGames && <th>Spiele</th>}
              {KEEPER_EVENT_IDS.map((id) => (
                <th key={id}>{compact ? shortLabel(id) : eventLabel(id)}</th>
              ))}
              <th>Geh.</th>
              <th>Ggt.</th>
              <th>Quote</th>
            </tr>
          </thead>
          <tbody>
            {goalkeepers.map((k) => (
              <tr key={k.playerId}>
                <td className="left">{k.number}</td>
                <td className="left">{k.displayName}</td>
                {showGames && <td>{k.games}</td>}
                {KEEPER_EVENT_IDS.map((id) => (
                  <td key={id}>{k.counts[id] || ''}</td>
                ))}
                <td>{k.saves}</td>
                <td>{k.conceded}</td>
                <td>{pct(k.savePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: '1rem' }}>Team</h2>
      <div className="stat-row">
        {TEAM_EVENT_IDS.map((id) => (
          <div className="stat" key={id}>
            <div className="value">{team[id] ?? 0}</div>
            <div className="label">{eventLabel(id)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

const SHORT: Record<string, string> = {
  TOR: 'Tor',
  ASSIST: 'Ass.',
  FW: 'FW',
  FEHLPASS: 'Fehlp.',
  TECHNISCHER_FEHLER: 'TF',
  DEF_PLUS: 'Def+',
  DEF_MINUS: 'Def−',
  GEHALTEN_6M: 'G6',
  GEHALTEN_7M: 'G7',
  GEHALTEN_9M: 'G9',
  GGTOR_6M: 'T6',
  GGTOR_7M: 'T7',
  GGTOR_9M: 'T9',
};

function shortLabel(id: string): string {
  return SHORT[id] ?? eventLabel(id);
}
