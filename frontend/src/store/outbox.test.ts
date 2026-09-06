import { describe, expect, it } from 'vitest';
import { applyOp, applyOps, type Op } from '../domain/ops';
import type { Match } from '../domain/types';
import { Outbox } from './outbox';
import type { KeyValueStorage } from './storage';

function memory(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    keys: () => [...map.keys()],
  };
}

const baseMatch: Match = {
  id: 'm1',
  opponent: 'X',
  kickoff: '2026-09-06T17:00:00Z',
  season: '2026/27',
  homeAway: 'home',
  status: 'running',
  roster: [{ playerId: 'p1', displayName: 'Max', number: 7, position: 'field' }],
  clock: { half: 1, running: false, baseSeconds: 0, startedAt: null },
  events: [],
  createdAt: '',
  updatedAt: '',
  finishedAt: null,
};

const addTor: Op = {
  opId: 'op1',
  kind: 'add_event',
  event: {
    eventId: 'e1',
    type: 'TOR',
    half: 1,
    clockSeconds: 65,
    playerId: 'p1',
    recordedAt: '2026-09-06T17:01:05Z',
  },
};

describe('Outbox', () => {
  it('persists ops and survives a reload', () => {
    const storage = memory();
    const a = new Outbox('m1', storage);
    a.push(addTor);
    a.push({ opId: 'op2', kind: 'clock', action: 'start', at: '2026-09-06T17:00:00Z' });
    expect(a.size()).toBe(2);

    const b = new Outbox('m1', storage);
    expect(b.load().map((o) => o.opId)).toEqual(['op1', 'op2']);
    expect(b.peek(1).map((o) => o.opId)).toEqual(['op1']);
  });

  it('removes acknowledged ops only', () => {
    const storage = memory();
    const box = new Outbox('m1', storage);
    box.push(addTor);
    box.push({ opId: 'op2', kind: 'delete_event', eventId: 'e1' });
    box.ack(['op1', 'unknown']);
    expect(box.load().map((o) => o.opId)).toEqual(['op2']);
    box.ack(['op2']);
    expect(box.size()).toBe(0);
    expect(storage.keys()).toEqual([]);
  });

  it('is scoped per match', () => {
    const storage = memory();
    new Outbox('m1', storage).push(addTor);
    expect(new Outbox('m2', storage).size()).toBe(0);
  });
});

describe('applyOp', () => {
  it('adds an event once even when replayed', () => {
    const once = applyOp(baseMatch, addTor);
    const twice = applyOp(once, { ...addTor, opId: 'op1b' });
    expect(twice.events).toHaveLength(1);
  });

  it('deletes events and applies clock ops', () => {
    const m = applyOps(baseMatch, [
      addTor,
      { opId: 'c1', kind: 'clock', action: 'start', at: '2026-09-06T17:00:00Z' },
      { opId: 'c2', kind: 'clock', action: 'stop', at: '2026-09-06T17:01:30Z' },
      { opId: 'd1', kind: 'delete_event', eventId: 'e1' },
    ]);
    expect(m.events).toHaveLength(0);
    expect(m.clock).toEqual({ half: 1, running: false, baseSeconds: 90, startedAt: null });
  });
});
