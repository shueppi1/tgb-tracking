import { describe, expect, it } from 'vitest';
import {
  applyClock,
  correct,
  elapsedSeconds,
  endHalf,
  formatClock,
  newClock,
  parseClock,
  start,
  stop,
} from './clock';

const T0 = Date.parse('2026-09-06T17:00:00Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const ms = (s: number) => T0 + s * 1000;

describe('clock', () => {
  it('starts stopped at zero', () => {
    const c = newClock();
    expect(c).toEqual({ half: 1, running: false, baseSeconds: 0, startedAt: null });
    expect(elapsedSeconds(c, ms(100))).toBe(0);
  });

  it('accumulates across start/stop', () => {
    let c = start(newClock(), at(0));
    expect(elapsedSeconds(c, ms(90))).toBe(90);
    c = stop(c, at(90));
    expect(c.running).toBe(false);
    expect(c.baseSeconds).toBe(90);
    expect(elapsedSeconds(c, ms(500))).toBe(90);
    c = start(c, at(500));
    expect(elapsedSeconds(c, ms(560))).toBe(150);
  });

  it('treats repeated start/stop as no-ops', () => {
    const c = start(newClock(), at(0));
    expect(start(c, at(50))).toBe(c);
    const s = stop(c, at(50));
    expect(stop(s, at(80))).toBe(s);
  });

  it('ends half 1 at 30:00 stopped, and ignores a second end_half', () => {
    const c = endHalf(start(newClock(), at(0)));
    expect(c).toEqual({ half: 2, running: false, baseSeconds: 1800, startedAt: null });
    expect(endHalf(c)).toBe(c);
  });

  it('may run past the half length', () => {
    expect(elapsedSeconds(start(newClock(), at(0)), ms(1900))).toBe(1900);
  });

  it('corrects while running and keeps running', () => {
    const c = correct(start(newClock(), at(0)), at(100), 60);
    expect(c.running).toBe(true);
    expect(elapsedSeconds(c, ms(130))).toBe(90);
  });

  it('corrects half while stopped', () => {
    expect(correct(newClock(), at(0), 1850, 2)).toEqual({
      half: 2,
      running: false,
      baseSeconds: 1850,
      startedAt: null,
    });
  });

  it('dispatches actions', () => {
    let c = applyClock(newClock(), 'start', at(0));
    c = applyClock(c, 'stop', at(10));
    c = applyClock(c, 'correct', at(10), 42);
    c = applyClock(c, 'end_half', at(10));
    expect(c.half).toBe(2);
    expect(c.baseSeconds).toBe(1800);
    expect(() => applyClock(c, 'correct', at(10))).toThrow();
  });

  it('formats and parses mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3600)).toBe('60:00');
    expect(parseClock('12:34')).toBe(754);
    expect(parseClock('7')).toBe(420);
    expect(parseClock('12:99')).toBeNull();
    expect(parseClock('abc')).toBeNull();
  });
});
