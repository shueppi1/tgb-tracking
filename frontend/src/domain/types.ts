export type Position = 'field' | 'goalkeeper';
export type Half = 1 | 2;
export type MatchStatus = 'running' | 'finished';
export type HomeAway = 'home' | 'away';

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  number: number;
  position: Position;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RosterEntry {
  playerId: string;
  displayName: string;
  number: number;
  position: Position;
}

export interface ClockState {
  half: Half;
  running: boolean;
  baseSeconds: number;
  startedAt: string | null;
}

export interface MatchEvent {
  eventId: string;
  type: string;
  half: Half;
  clockSeconds: number;
  playerId: string | null;
  recordedAt: string;
}

export interface Match {
  id: string;
  opponent: string;
  kickoff: string;
  season: string;
  homeAway: HomeAway;
  status: MatchStatus;
  roster: RosterEntry[];
  clock: ClockState;
  events: MatchEvent[];
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

/** Match as returned by the list endpoint: no events, but derived score. */
export interface MatchListing extends Omit<Match, 'events'> {
  eventCount: number;
  score: Score;
}

export interface Score {
  own: number;
  opponent: number;
}

export type Counts = Record<string, number>;

export interface PlayerSummaryRow {
  playerId: string;
  displayName: string;
  number: number;
  position: Position;
  counts: Counts;
}

export interface KeeperSummaryRow extends PlayerSummaryRow {
  saves: number;
  conceded: number;
  shots: number;
  savePct: number | null;
}

export interface MatchSummary {
  score: Score;
  team: Counts;
  players: PlayerSummaryRow[];
  goalkeepers: KeeperSummaryRow[];
  eventCount: number;
}

export interface SeasonPlayerRow extends PlayerSummaryRow {
  games: number;
}

export interface SeasonKeeperRow extends KeeperSummaryRow {
  games: number;
}

export interface SeasonSummary {
  season: string;
  games: number;
  record: { wins: number; draws: number; losses: number };
  score: Score;
  team: Counts;
  players: SeasonPlayerRow[];
  goalkeepers: SeasonKeeperRow[];
  matches: { id: string; opponent: string; kickoff: string }[];
}
