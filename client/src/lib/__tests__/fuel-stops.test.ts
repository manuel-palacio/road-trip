import { describe, expect, it } from 'vitest';
import { findFuelSearchTarget } from '../fuel-stops';
import type { DayGroup } from '../compute';
import type { Stop } from '../types';

function stop(overrides: Partial<Stop> & { id: string }): Stop {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    label: overrides.label ?? overrides.id,
    lat: overrides.lat ?? 0,
    lng: overrides.lng ?? 0,
    type: overrides.type ?? 'waypoint',
    ...overrides,
  };
}

function group(day: number, stops: { stop: Stop; index: number }[]): DayGroup {
  return {
    day,
    stops,
    km: stops.reduce((s, x) => s + (x.stop.kmFromPrevious || 0), 0),
    durationSeconds: 0,
  };
}

describe('findFuelSearchTarget', () => {
  it('returns null for a single-stop day', () => {
    const a = stop({ id: 'a', lat: 60, lng: 18 });
    const target = findFuelSearchTarget(group(1, [{ stop: a, index: 0 }]), [a], () => undefined);
    expect(target).toBeNull();
  });

  it('returns null when every leg is 0 km (unrouted)', () => {
    const a = stop({ id: 'a' });
    const b = stop({ id: 'b', kmFromPrevious: 0 });
    const target = findFuelSearchTarget(
      group(1, [{ stop: a, index: 0 }, { stop: b, index: 1 }]),
      [a, b],
      () => undefined,
    );
    expect(target).toBeNull();
  });

  it('picks the longest leg in the day', () => {
    const a = stop({ id: 'a', lat: 60, lng: 18 });
    const b = stop({ id: 'b', lat: 59, lng: 18, kmFromPrevious: 100 });
    const c = stop({ id: 'c', lat: 58, lng: 18, kmFromPrevious: 400 }); // ← longest
    const d = stop({ id: 'd', lat: 57, lng: 18, kmFromPrevious: 50 });
    const target = findFuelSearchTarget(
      group(1, [
        { stop: a, index: 0 },
        { stop: b, index: 1 },
        { stop: c, index: 2 },
        { stop: d, index: 3 },
      ]),
      [a, b, c, d],
      () => undefined,
    );
    expect(target).not.toBeNull();
    expect(target!.legKm).toBe(400);
    expect(target!.legStart.id).toBe('b');
    expect(target!.legEnd.id).toBe('c');
    expect(target!.insertAtFlatIndex).toBe(2);
  });

  it('uses the polyline midpoint when a path is available', () => {
    const a = stop({ id: 'a', lat: 60, lng: 18 });
    const b = stop({ id: 'b', lat: 50, lng: 18, kmFromPrevious: 1000 });
    // 5-point polyline. Index 2 = midpoint.
    const path = [
      { lat: 60, lng: 18 },
      { lat: 57.5, lng: 18 },
      { lat: 55, lng: 18 }, // expect this
      { lat: 52.5, lng: 18 },
      { lat: 50, lng: 18 },
    ];
    const target = findFuelSearchTarget(
      group(1, [{ stop: a, index: 0 }, { stop: b, index: 1 }]),
      [a, b],
      (s) => (s.id === 'b' ? path : undefined),
    );
    expect(target!.midpoint).toEqual({ lat: 55, lng: 18 });
  });

  it('falls back to the geometric midpoint when no polyline is available', () => {
    const a = stop({ id: 'a', lat: 60, lng: 18 });
    const b = stop({ id: 'b', lat: 50, lng: 20, kmFromPrevious: 1000 });
    const target = findFuelSearchTarget(
      group(1, [{ stop: a, index: 0 }, { stop: b, index: 1 }]),
      [a, b],
      () => undefined,
    );
    expect(target!.midpoint).toEqual({ lat: 55, lng: 19 });
  });

  it('considers the inbound leg from the previous day', () => {
    // Day 2's first stop is at flat index 2; its kmFromPrevious is the
    // leg from Day 1's last stop. That counts as part of Day 2's drive.
    const day1Last = stop({ id: 'a', lat: 60, lng: 18 });
    const day2First = stop({ id: 'b', lat: 50, lng: 18, kmFromPrevious: 800 });
    const day2Next = stop({ id: 'c', lat: 49, lng: 18, kmFromPrevious: 100 });
    const target = findFuelSearchTarget(
      group(2, [
        { stop: day2First, index: 1 }, // Day 1's stop is at index 0; Day 2 starts at 1
        { stop: day2Next, index: 2 },
      ]),
      [day1Last, day2First, day2Next],
      () => undefined,
    );
    expect(target!.legKm).toBe(800);
    expect(target!.legStart.id).toBe('a');
    expect(target!.legEnd.id).toBe('b');
    expect(target!.insertAtFlatIndex).toBe(1);
  });
});
