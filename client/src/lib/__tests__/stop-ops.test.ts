import { describe, expect, it } from 'vitest';
import { spliceStopAt } from '../stop-ops';
import type { Stop } from '../types';

function s(id: string, overrides: Partial<Stop> = {}): Stop {
  return {
    id,
    name: id,
    label: id,
    lat: 0,
    lng: 0,
    type: 'waypoint',
    ...overrides,
  };
}

describe('spliceStopAt', () => {
  it('inserts the new stop at the requested index', () => {
    const stops = [s('a'), s('b'), s('c')];
    const inserted = s('new');
    const out = spliceStopAt(stops, 2, inserted);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'new', 'c']);
  });

  it('does not mutate the input array', () => {
    const stops = [s('a'), s('b', { kmFromPrevious: 400 })];
    const copy = [...stops];
    spliceStopAt(stops, 1, s('new'));
    expect(stops).toEqual(copy);
  });

  it("wipes the successor's stale kmFromPrevious / duration after insertion", () => {
    // Reproduces #61: inserting a fuel stop between A (idx 0) and B (idx 1)
    // means B's persisted A→B distance is now stale. The helper must clear it
    // so useRouteSegments can repopulate via the refetch without a stale save.
    const stops = [
      s('a', { kmFromPrevious: 0 }),
      s('b', { kmFromPrevious: 400, durationFromPrevious: '~4h', durationSecondsFromPrevious: 14400 }),
    ];
    const out = spliceStopAt(stops, 1, s('fuel', { kmFromPrevious: 0 }));
    const successor = out.find((x) => x.id === 'b')!;
    expect(successor.kmFromPrevious).toBe(0);
    expect(successor.durationFromPrevious).toBe('');
    expect(successor.durationSecondsFromPrevious).toBe(0);
  });

  it('preserves other fields on the successor', () => {
    const stops = [
      s('a'),
      s('b', { kmFromPrevious: 400, countryCode: 'FR', label: 'Lyon', highlights: ['food'] }),
    ];
    const out = spliceStopAt(stops, 1, s('fuel'));
    const successor = out.find((x) => x.id === 'b')!;
    expect(successor.countryCode).toBe('FR');
    expect(successor.label).toBe('Lyon');
    expect(successor.highlights).toEqual(['food']);
  });

  it('appending at the end does not touch any successor (no successor exists)', () => {
    const stops = [s('a'), s('b', { kmFromPrevious: 400 })];
    const out = spliceStopAt(stops, stops.length, s('end'));
    // B (now penultimate) still has its original km because its predecessor
    // didn't change.
    expect(out.find((x) => x.id === 'b')!.kmFromPrevious).toBe(400);
    // The new last stop comes in untouched.
    expect(out[out.length - 1].id).toBe('end');
  });

  it('clamps out-of-range indices to valid bounds', () => {
    const stops = [s('a'), s('b')];
    expect(spliceStopAt(stops, -10, s('first')).map((x) => x.id)).toEqual(['first', 'a', 'b']);
    expect(spliceStopAt(stops, 999, s('last')).map((x) => x.id)).toEqual(['a', 'b', 'last']);
  });
});
