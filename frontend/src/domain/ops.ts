/**
 * Client operations on a match. Every mutation is expressed as an `Op` that is
 *  1. applied locally with `applyOp` (pure, mirrors the server's reducer), and
 *  2. queued in the outbox and sent to POST /api/matches/:id/ops.
 * Because the server applies ops idempotently by `opId`, a retried batch is harmless.
 */
import { applyClock, type ClockAction } from './clock';
import type { Half, Match, MatchEvent } from './types';

export interface AddEventOp {
  opId: string;
  kind: 'add_event';
  event: MatchEvent;
}

export interface DeleteEventOp {
  opId: string;
  kind: 'delete_event';
  eventId: string;
}

export interface ClockOp {
  opId: string;
  kind: 'clock';
  action: ClockAction;
  at: string;
  seconds?: number;
  half?: Half;
}

export type Op = AddEventOp | DeleteEventOp | ClockOp;

export function applyOp(match: Match, op: Op): Match {
  switch (op.kind) {
    case 'add_event':
      if (match.events.some((e) => e.eventId === op.event.eventId)) return match;
      return { ...match, events: [...match.events, op.event] };
    case 'delete_event':
      return { ...match, events: match.events.filter((e) => e.eventId !== op.eventId) };
    case 'clock':
      return { ...match, clock: applyClock(match.clock, op.action, op.at, op.seconds, op.half) };
  }
}

export function applyOps(match: Match, ops: Op[]): Match {
  return ops.reduce(applyOp, match);
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
