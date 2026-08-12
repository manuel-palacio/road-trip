import { describe, expect, it } from 'vitest';
import { scheduleForStops } from '../../../../shared/schedule.js';
import type { Stop } from '../types';

function stop(overrides: Partial<Stop> & { id: string }): Stop {
  return {
    name: overrides.id,
    label: overrides.id,
    lat: 0,
    lng: 0,
    type: 'waypoint',
    dayNumber: 1,
    ...overrides,
  } as Stop;
}

const HOUR = 3600;

describe('scheduleForStops', () => {
  it('returns null entries when no drive start time is set — feature is opt-in', () => {
    const stops = [stop({ id: 'a' }), stop({ id: 'b', durationSecondsFromPrevious: HOUR })];
    expect(scheduleForStops(stops, undefined)).toEqual([null, null]);
    expect(scheduleForStops(stops, null)).toEqual([null, null]);
    expect(scheduleForStops(stops, 'not-a-time')).toEqual([null, null]);
  });

  it('walks the clock through legs and stays within a day', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', durationSecondsFromPrevious: HOUR, stayMinutes: 30 }),
      stop({ id: 'c', durationSecondsFromPrevious: HOUR / 2 }),
    ];
    const out = scheduleForStops(stops, '09:00');
    expect(out[0]).toEqual({ arrival: null, departure: '09:00' });
    expect(out[1]).toEqual({ arrival: '10:00', departure: '10:30' });
    expect(out[2]).toEqual({ arrival: '11:00', departure: null });
  });

  it('adding stayMinutes to a stop shifts every later arrival that day', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', durationSecondsFromPrevious: HOUR, stayMinutes: 90 }),
      stop({ id: 'c', durationSecondsFromPrevious: HOUR }),
    ];
    const out = scheduleForStops(stops, '09:00');
    expect(out[2]!.arrival).toBe('12:30');
  });

  it('resets the clock to the drive start time on each new day', () => {
    const stops = [
      stop({ id: 'a', type: 'start', dayNumber: 1 }),
      stop({ id: 'b', durationSecondsFromPrevious: HOUR, type: 'overnight', dayNumber: 1 }),
      stop({ id: 'c', durationSecondsFromPrevious: 2 * HOUR, dayNumber: 2 }),
    ];
    const out = scheduleForStops(stops, '09:00');
    expect(out[1]).toEqual({ arrival: '10:00', departure: null });
    expect(out[2]!.arrival).toBe('11:00');
  });

  it('omits departure for zero-stay stops — arrival alone tells the story', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', durationSecondsFromPrevious: HOUR }),
      stop({ id: 'c', durationSecondsFromPrevious: HOUR }),
    ];
    const out = scheduleForStops(stops, '09:00');
    expect(out[1]).toEqual({ arrival: '10:00', departure: null });
    expect(out[2]!.arrival).toBe('11:00');
  });

  it('wraps past midnight instead of producing 25:30', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', durationSecondsFromPrevious: 17 * HOUR }),
    ];
    const out = scheduleForStops(stops, '09:00');
    expect(out[1]!.arrival).toBe('02:00');
  });
});
