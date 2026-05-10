import { describe, expect, it } from 'vitest';
import {
  DAY_COLORS,
  applyDays,
  dayColor,
  formatDayDate,
  formatDuration,
  groupByDay,
  tripTotals,
} from '../compute';
import type { Stop } from '../types';

function stop(overrides: Partial<Stop> & { id: string }): Stop {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    label: overrides.label ?? overrides.id,
    lat: overrides.lat ?? 0,
    lng: overrides.lng ?? 0,
    // Default to 'waypoint' so the test stop doesn't accidentally trigger
    // the prev-was-overnight day-boundary rule. Tests opt in to overnight
    // explicitly when checking that rule.
    type: overrides.type ?? 'waypoint',
    ...overrides,
  };
}

describe('dayColor', () => {
  it('returns the first color for day 1 and undefined', () => {
    expect(dayColor(1)).toBe(DAY_COLORS[0]);
    expect(dayColor(undefined)).toBe(DAY_COLORS[0]);
  });
  it('cycles past 10', () => {
    expect(dayColor(11)).toBe(DAY_COLORS[0]);
    expect(dayColor(12)).toBe(DAY_COLORS[1]);
  });
});

describe('formatDuration', () => {
  it('returns empty for zero or negative', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(-30)).toBe('');
  });
  it('shows minutes for under an hour', () => {
    expect(formatDuration(1500)).toBe('25m');
  });
  it('shows decimal hours otherwise', () => {
    expect(formatDuration(3600 * 1.5)).toBe('~1.5h');
    expect(formatDuration(3600 * 4.7)).toBe('~4.7h');
  });
});

describe('applyDays', () => {
  it('first stop is always day 1', () => {
    const out = applyDays([stop({ id: 'a' })], 600);
    expect(out[0].dayNumber).toBe(1);
  });
  it('keeps single-day trip on day 1 under maxKm', () => {
    const stops = [
      stop({ id: 'a' }),
      stop({ id: 'b', kmFromPrevious: 250 }),
      stop({ id: 'c', kmFromPrevious: 300 }),
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 1]);
  });
  it('auto-splits to a new day when cumulative km exceeds maxKm', () => {
    const stops = [
      stop({ id: 'a' }),
      stop({ id: 'b', kmFromPrevious: 400 }),
      stop({ id: 'c', kmFromPrevious: 350 }), // 750 > 600 → day 2
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 2]);
  });
  it('overnight on previous stop forces a new day at next', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', kmFromPrevious: 100, type: 'overnight' }),
      stop({ id: 'c', kmFromPrevious: 100 }),
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 2]);
  });
  it('forceDayStart on a stop creates a boundary at it', () => {
    const stops = [
      stop({ id: 'a' }),
      stop({ id: 'b', kmFromPrevious: 100 }),
      stop({ id: 'c', kmFromPrevious: 100, forceDayStart: true }),
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 2]);
  });
  it('first stop forceDayStart is ignored (always day 1)', () => {
    const stops = [
      stop({ id: 'a', forceDayStart: true }),
      stop({ id: 'b', kmFromPrevious: 100 }),
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1]);
  });
  it('does not mutate input', () => {
    const stops = [stop({ id: 'a' }), stop({ id: 'b', kmFromPrevious: 100 })];
    const original = JSON.parse(JSON.stringify(stops));
    applyDays(stops, 600);
    expect(stops).toEqual(original);
  });
});

describe('groupByDay', () => {
  it('groups stops by dayNumber preserving original index', () => {
    const stops = [
      stop({ id: 'a', dayNumber: 1 }),
      stop({ id: 'b', dayNumber: 1, kmFromPrevious: 100 }),
      stop({ id: 'c', dayNumber: 2, kmFromPrevious: 700, durationSecondsFromPrevious: 7200 }),
    ];
    const groups = groupByDay(stops);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ day: 1, km: 100 });
    expect(groups[0].stops.map((x) => x.index)).toEqual([0, 1]);
    expect(groups[1]).toMatchObject({ day: 2, km: 700, durationSeconds: 7200 });
  });
});

describe('formatDayDate', () => {
  it('returns empty when startDate not set', () => {
    expect(formatDayDate(1, undefined)).toBe('');
    expect(formatDayDate(1, '')).toBe('');
  });
  it('formats Day 1 as the start date itself', () => {
    expect(formatDayDate(1, '2026-06-03')).toMatch(/^\w{3} · \w{3} 3$/);
  });
  it('adds days for later day numbers', () => {
    // 2026-06-03 + 4 days = 2026-06-07
    expect(formatDayDate(5, '2026-06-03')).toMatch(/^\w{3} · \w{3} 7$/);
  });
});

describe('tripTotals', () => {
  it('sums km, max day number, and durations', () => {
    const stops = [
      stop({ id: 'a', dayNumber: 1 }),
      stop({ id: 'b', dayNumber: 1, kmFromPrevious: 200, durationSecondsFromPrevious: 3600 }),
      stop({ id: 'c', dayNumber: 2, kmFromPrevious: 400, durationSecondsFromPrevious: 7200 }),
    ];
    expect(tripTotals(stops)).toEqual({ totalKm: 600, totalDays: 2, totalDurationSeconds: 10800 });
  });
  it('returns zeros for empty array', () => {
    expect(tripTotals([])).toEqual({ totalKm: 0, totalDays: 0, totalDurationSeconds: 0 });
  });
});
