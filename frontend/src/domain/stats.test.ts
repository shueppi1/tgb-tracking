import { describe, expect, it } from 'vitest';
import fixture from '../../../shared/fixtures/sample-match.json';
import { buildSummary, eventsInHalf } from './stats';
import type { Match } from './types';

const match = fixture.match as unknown as Match;
const expected = fixture.expected;

describe('buildSummary against the shared fixture', () => {
  const summary = buildSummary(match.roster, match.events);

  it('derives score and event count', () => {
    expect(summary.score).toEqual(expected.score);
    expect(summary.eventCount).toBe(expected.eventCount);
  });

  it('counts team events', () => {
    expect(summary.team).toEqual(expected.team);
  });

  it('counts player events for every roster member', () => {
    const byId = Object.fromEntries(summary.players.map((p) => [p.playerId, p.counts]));
    expect(byId).toEqual(expected.players);
  });

  it('counts goalkeeper events and totals', () => {
    const byId = Object.fromEntries(summary.goalkeepers.map((k) => [k.playerId, k]));
    expect(Object.keys(byId).sort()).toEqual(Object.keys(expected.goalkeepers).sort());
    for (const [pid, exp] of Object.entries(expected.goalkeepers)) {
      const got = byId[pid];
      const { saves, conceded, shots, savePct, ...counts } = exp;
      expect(got.counts).toEqual(counts);
      expect({ saves: got.saves, conceded: got.conceded, shots: got.shots, savePct: got.savePct })
        .toEqual({ saves, conceded, shots, savePct });
    }
  });

  it('has no percentage without shots', () => {
    const s = buildSummary(
      [{ playerId: 'g', displayName: 'G', number: 1, position: 'goalkeeper' }],
      [],
    );
    expect(s.goalkeepers[0].savePct).toBeNull();
    expect(s.goalkeepers[0].shots).toBe(0);
  });
});

describe('per-half aggregation (live tracking view)', () => {
  const first = buildSummary(match.roster, eventsInHalf(match.events, 1));
  const second = buildSummary(match.roster, eventsInHalf(match.events, 2));

  it('splits the events between the halves', () => {
    expect(first.eventCount + second.eventCount).toBe(expected.eventCount);
    expect(eventsInHalf(match.events, 2).every((ev) => ev.half === 2)).toBe(true);
  });

  it('counts goals per half instead of cumulatively', () => {
    expect(first.score).toEqual({ own: 1, opponent: 1 });
    expect(second.score).toEqual({ own: 2, opponent: 1 });
  });

  it('counts player, keeper and team events per half', () => {
    const firstById = Object.fromEntries(first.players.map((p) => [p.playerId, p.counts]));
    const secondById = Object.fromEntries(second.players.map((p) => [p.playerId, p.counts]));
    expect(firstById.p1.TOR).toBe(1);
    expect(secondById.p1.TOR).toBe(0);
    expect(secondById.p1.TECHNISCHER_FEHLER).toBe(1);

    const firstKeepers = Object.fromEntries(first.goalkeepers.map((k) => [k.playerId, k]));
    const secondKeepers = Object.fromEntries(second.goalkeepers.map((k) => [k.playerId, k]));
    expect(firstKeepers.p3.shots).toBe(2);
    expect(secondKeepers.p3.shots).toBe(0);
    expect(secondKeepers.p3.savePct).toBeNull();
    expect(secondKeepers.p4.shots).toBe(2);

    expect(first.team.ANGRIFF_PLUS).toBe(1);
    expect(second.team.ANGRIFF_PLUS).toBe(0);
    expect(second.team.ABWEHR_PLUS).toBe(1);
  });

  it('adds up to the whole-match summary', () => {
    const whole = buildSummary(match.roster, match.events);
    expect(first.score.own + second.score.own).toBe(whole.score.own);
    expect(first.score.opponent + second.score.opponent).toBe(whole.score.opponent);
    for (const id of Object.keys(whole.team)) {
      expect(first.team[id] + second.team[id]).toBe(whole.team[id]);
    }
  });
});
