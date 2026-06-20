import { describe, expect, it } from 'vitest';
import { computeFuelTimeline } from '../fuel-timeline';
import type { Stop } from '../types';

const stop = (overrides: Partial<Stop>): Stop => ({
  id: overrides.id || Math.random().toString(),
  name: overrides.name || 'Stop',
  label: overrides.label || overrides.name || 'Stop',
  lat: overrides.lat ?? 49,
  lng: overrides.lng ?? 4,
  type: overrides.type || 'waypoint',
  ...overrides,
});

describe('computeFuelTimeline', () => {
  it('returns empty arrays for an empty trip', () => {
    const r = computeFuelTimeline([], 500);
    expect(r.cumulativeSinceLastFill).toEqual([]);
    expect(r.events).toEqual([]);
    expect(r.gaps).toEqual([]);
  });

  it('records a start event for the first stop and 0 km cumulative', () => {
    const stops = [stop({ id: 'a', type: 'start' }), stop({ id: 'b', kmFromPrevious: 100 })];
    const r = computeFuelTimeline(stops, 500);
    expect(r.events[0]).toEqual({ stopIndex: 0, kind: 'start' });
    expect(r.cumulativeSinceLastFill).toEqual([0, 100]);
  });

  it('accumulates km between refill events', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', kmFromPrevious: 150 }),
      stop({ id: 'c', kmFromPrevious: 200 }),
    ];
    const r = computeFuelTimeline(stops, 500);
    expect(r.cumulativeSinceLastFill).toEqual([0, 150, 350]);
  });

  it('resets cumulative at an overnight stop', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', type: 'overnight', kmFromPrevious: 300 }),
      stop({ id: 'c', kmFromPrevious: 200 }),
    ];
    const r = computeFuelTimeline(stops, 500);
    expect(r.cumulativeSinceLastFill).toEqual([0, 0, 200]);
    expect(r.events.map(e => e.kind)).toEqual(['start', 'overnight']);
  });

  it('resets cumulative at a fuel stop (first-class type=fuel)', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', type: 'fuel', kmFromPrevious: 300 }),
      stop({ id: 'c', kmFromPrevious: 200 }),
    ];
    const r = computeFuelTimeline(stops, 500);
    expect(r.cumulativeSinceLastFill).toEqual([0, 0, 200]);
    expect(r.events.map(e => e.kind)).toEqual(['start', 'refuel']);
  });

  it('resets cumulative at a legacy fuel waypoint (type=waypoint + category=fuel)', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', type: 'waypoint', category: 'fuel', kmFromPrevious: 300 }),
      stop({ id: 'c', kmFromPrevious: 200 }),
    ];
    const r = computeFuelTimeline(stops, 500);
    expect(r.cumulativeSinceLastFill).toEqual([0, 0, 200]);
    expect(r.events[1].kind).toBe('refuel');
  });

  it('records no gap when peak cumulative is under 90% of tank range', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', kmFromPrevious: 400 }),
      stop({ id: 'c', type: 'destination', kmFromPrevious: 40 }),
    ];
    expect(computeFuelTimeline(stops, 500).gaps).toEqual([]);
  });

  it('records a gap when peak cumulative exceeds 90% of tank range', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', kmFromPrevious: 400, routePath: [{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }] }),
      stop({ id: 'c', type: 'destination', kmFromPrevious: 100, routePath: [{ lat: 1, lng: 0 }, { lat: 2, lng: 0 }] }),
    ];
    const r = computeFuelTimeline(stops, 500);
    expect(r.gaps.length).toBe(1);
    expect(r.gaps[0].gapKm).toBe(500);
    expect(r.gaps[0].afterStopIndex).toBe(0);
    expect(r.gaps[0].beforeStopIndex).toBe(2);
    expect(r.gaps[0].legPolyline.length).toBeGreaterThan(0);
  });

  it('still emits a gap when routePath is missing (consumer defers)', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', kmFromPrevious: 600 }),  // no routePath
      stop({ id: 'c', type: 'destination', kmFromPrevious: 100 }),
    ];
    const r = computeFuelTimeline(stops, 500);
    expect(r.gaps.length).toBe(1);
    expect(r.gaps[0].legPolyline).toEqual([]);
    expect(r.gaps[0].gapKm).toBe(700);
  });

  it('treats overnight as a refill — second day under range produces no gap', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', type: 'overnight', kmFromPrevious: 480 }),
      stop({ id: 'c', type: 'destination', kmFromPrevious: 200 }),
    ];
    expect(computeFuelTimeline(stops, 500).gaps).toEqual([]);
  });
});
