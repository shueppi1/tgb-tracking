import { describe, expect, it } from 'vitest';
import fixture from '../../../shared/fixtures/sample-match.json';
import { buildSummary } from './stats';
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
