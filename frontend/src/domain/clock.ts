/**
 * Match clock model — mirror of backend/app/clock.py.
 *
 * `baseSeconds` accumulates time while stopped, `startedAt` is the wall-clock instant the
 * clock was last started. Half 1 starts at 0, half 2 at 1800 (30:00). The clock may run
 * past 30:00 / 60:00; a half only ends when the tracker says so. All timestamps are taken
 * on the tracking device, which makes it authoritative for match timing.
 */
import type { ClockState, Half } from './types';

export const HALF_LENGTH = 30 * 60;

export type ClockAction = 'start' | 'stop' | 'end_half' | 'correct';

export function newClock(): ClockState {
  return { half: 1, running: false, baseSeconds: 0, startedAt: null };
}

export function elapsedSeconds(clock: ClockState, nowMs: number): number {
  let base = clock.baseSeconds;
  if (clock.running && clock.startedAt) {
    base += (nowMs - Date.parse(clock.startedAt)) / 1000;
  }
  return Math.max(0, Math.floor(base));
}

export function start(clock: ClockState, atIso: string): ClockState {
  if (clock.running) return clock;
  return { ...clock, running: true, startedAt: atIso };
}

export function stop(clock: ClockState, atIso: string): ClockState {
  if (!clock.running) return clock;
  return {
    ...clock,
    running: false,
    baseSeconds: elapsedSeconds(clock, Date.parse(atIso)),
    startedAt: null,
  };
}

export function endHalf(clock: ClockState): ClockState {
  if (clock.half !== 1) return clock;
  return { half: 2, running: false, baseSeconds: HALF_LENGTH, startedAt: null };
}

export function correct(
  clock: ClockState,
  atIso: string,
  seconds: number,
  half?: Half,
): ClockState {
  const out: ClockState = { ...clock, baseSeconds: Math.max(0, Math.floor(seconds)) };
  if (half === 1 || half === 2) out.half = half;
  out.startedAt = clock.running ? atIso : null;
  return out;
}

export function applyClock(
  clock: ClockState,
  action: ClockAction,
  atIso: string,
  seconds?: number,
  half?: Half,
): ClockState {
  switch (action) {
    case 'start':
      return start(clock, atIso);
    case 'stop':
      return stop(clock, atIso);
    case 'end_half':
      return endHalf(clock);
    case 'correct':
      if (seconds === undefined) throw new Error('correct requires seconds');
      return correct(clock, atIso, seconds, half);
  }
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Parses "mm:ss" (or "m", "mm") into seconds; returns null when invalid. */
export function parseClock(text: string): number | null {
  const m = /^\s*(\d{1,3})(?::([0-5]?\d))?\s*$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

/** Seconds at which the current half nominally ends (30:00 or 60:00). */
export function halfEndSeconds(half: Half): number {
  return half * HALF_LENGTH;
}
