import { describe, expect, it } from 'vitest';
import { removeStopById, spliceStopAt } from '../stop-ops';
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

  it('also wipes the successor stale routePath after insertion', () => {
    const stops = [
      s('a'),
      s('b', {
        kmFromPrevious: 400,
        routePath: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
      }),
    ];
    const out = spliceStopAt(stops, 1, s('fuel'));
    expect(out.find((x) => x.id === 'b')!.routePath).toBeUndefined();
  });
});

describe('removeStopById', () => {
  it('removes a stop by id', () => {
    const stops = [s('a'), s('b'), s('c')];
    expect(removeStopById(stops, 'b').map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('does not mutate the input', () => {
    const stops = [s('a'), s('b'), s('c')];
    const copy = stops.map((x) => ({ ...x }));
    removeStopById(stops, 'b');
    expect(stops.map((x) => x.id)).toEqual(copy.map((x) => x.id));
  });

  it("clears the new-successor's stale km/duration/routePath after removing a middle stop", () => {
    // [A, Fuel, B] → remove Fuel → B's predecessor becomes A, but B still
    // carries Fuel→B km / path. Must be wiped.
    const stops = [
      s('a'),
      s('fuel'),
      s('b', {
        kmFromPrevious: 200,
        durationFromPrevious: '~2h',
        durationSecondsFromPrevious: 7200,
        routePath: [{ lat: 5, lng: 5 }, { lat: 6, lng: 6 }],
      }),
    ];
    const out = removeStopById(stops, 'fuel');
    const successor = out.find((x) => x.id === 'b')!;
    expect(successor.kmFromPrevious).toBe(0);
    expect(successor.durationFromPrevious).toBe('');
    expect(successor.durationSecondsFromPrevious).toBe(0);
    expect(successor.routePath).toBeUndefined();
  });

  it('removing the last stop does not touch any other stop', () => {
    const stops = [s('a'), s('b', { kmFromPrevious: 300 })];
    const out = removeStopById(stops, 'b');
    expect(out.map((x) => x.id)).toEqual(['a']);
  });

  it('removing the first stop wipes the new-first stop inbound leg fields', () => {
    // After removal, the previous index-1 stop is now at index 0 and has no
    // inbound leg at all. Wiping is the right call.
    const stops = [s('a'), s('b', { kmFromPrevious: 100 })];
    const out = removeStopById(stops, 'a');
    expect(out[0].id).toBe('b');
    expect(out[0].kmFromPrevious).toBe(0);
  });

  it('no-op when id not found', () => {
    const stops = [s('a'), s('b')];
    expect(removeStopById(stops, 'missing').map((x) => x.id)).toEqual(['a', 'b']);
  });
});
