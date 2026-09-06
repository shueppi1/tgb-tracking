/**
 * Live aggregation of match events — mirror of backend/app/stats.py.
 * Both sides are asserted against shared/fixtures/sample-match.json.
 */
import { CONCEDED_IDS, KEEPER_EVENT_IDS, PLAYER_EVENT_IDS, SAVE_IDS, TEAM_EVENT_IDS } from './events';
import type {
  Counts,
  Half,
  KeeperSummaryRow,
  MatchEvent,
  MatchSummary,
  PlayerSummaryRow,
  RosterEntry,
  Score,
} from './types';

export const TEAM_KEY = '__team__';

/** Events recorded in one half — the live tracking view aggregates per half. */
export function eventsInHalf(events: MatchEvent[], half: Half): MatchEvent[] {
  return events.filter((ev) => ev.half === half);
}

/** {playerId | TEAM_KEY: {eventType: count}} */
export function countMatrix(events: MatchEvent[]): Map<string, Counts> {
  const matrix = new Map<string, Counts>();
  for (const ev of events) {
    const key = ev.playerId ?? TEAM_KEY;
    const counts = matrix.get(key) ?? {};
    counts[ev.type] = (counts[ev.type] ?? 0) + 1;
    matrix.set(key, counts);
  }
  return matrix;
}

function zeroCounts(ids: string[], counts: Counts | undefined): Counts {
  const out: Counts = {};
  for (const id of ids) out[id] = counts?.[id] ?? 0;
  return out;
}

export function keeperTotals(counts: Counts) {
  const saves = SAVE_IDS.reduce((n, id) => n + (counts[id] ?? 0), 0);
  const conceded = CONCEDED_IDS.reduce((n, id) => n + (counts[id] ?? 0), 0);
  const shots = saves + conceded;
  const savePct = shots ? Math.round((saves * 1000) / shots) / 10 : null;
  return { saves, conceded, shots, savePct };
}

export function score(matrix: Map<string, Counts>): Score {
  let own = 0;
  let opponent = 0;
  for (const counts of matrix.values()) {
    own += counts.TOR ?? 0;
    for (const id of CONCEDED_IDS) opponent += counts[id] ?? 0;
  }
  return { own, opponent };
}

export function buildSummary(roster: RosterEntry[], events: MatchEvent[]): MatchSummary {
  const matrix = countMatrix(events);
  const players: PlayerSummaryRow[] = [];
  const goalkeepers: KeeperSummaryRow[] = [];
  for (const member of roster) {
    const counts = matrix.get(member.playerId);
    const base = {
      playerId: member.playerId,
      displayName: member.displayName,
      number: member.number,
      position: member.position,
    };
    players.push({ ...base, counts: zeroCounts(PLAYER_EVENT_IDS, counts) });
    if (member.position === 'goalkeeper') {
      const kc = zeroCounts(KEEPER_EVENT_IDS, counts);
      goalkeepers.push({ ...base, counts: kc, ...keeperTotals(kc) });
    }
  }
  return {
    score: score(matrix),
    team: zeroCounts(TEAM_EVENT_IDS, matrix.get(TEAM_KEY)),
    players,
    goalkeepers,
    eventCount: events.length,
  };
}
