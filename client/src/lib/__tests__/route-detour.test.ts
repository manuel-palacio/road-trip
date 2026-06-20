import { describe, expect, it } from 'vitest';
import { measureDetour, pointAtRouteKm } from '../route-detour';

const polyline = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 1 },
  { lat: 0, lng: 2 },
];

describe('measureDetour', () => {
  it('reports near-zero detour for a station on the polyline', () => {
    const r = measureDetour({ lat: 0, lng: 0.5 }, polyline);
    expect(r.detourKm).toBeLessThan(0.5);
    expect(r.segmentIdx).toBe(0);
  });

  it('reports a non-zero detour for a station perpendicular to a mid-segment', () => {
    const r = measureDetour({ lat: 0.05, lng: 0.5 }, polyline);
    expect(r.detourKm).toBeGreaterThan(1);
    expect(r.detourKm).toBeLessThan(10);
    expect(r.segmentIdx).toBe(0);
  });

  it('snaps to the start endpoint when the station projects before the polyline', () => {
    const r = measureDetour({ lat: 0, lng: -1 }, polyline);
    expect(r.routePoint).toEqual({ lat: 0, lng: 0 });
  });

  it('snaps to the end endpoint when the station projects past the polyline', () => {
    const r = measureDetour({ lat: 0, lng: 3 }, polyline);
    expect(r.routePoint).toEqual({ lat: 0, lng: 2 });
  });

  it('reports cumulative km from start to the projected point', () => {
    const r = measureDetour({ lat: 0, lng: 1.5 }, polyline);
    expect(r.routeKmFromStart).toBeGreaterThan(100);
    expect(r.routeKmFromStart).toBeLessThan(250);
  });

  it('handles a single-vertex polyline (returns sentinel)', () => {
    const r = measureDetour({ lat: 0, lng: 0 }, [{ lat: 0, lng: 0 }]);
    expect(r.segmentIdx).toBe(0);
    expect(r.detourKm).toBe(Infinity);
  });

  it('produces a correct closest-point at high latitude (lat ~60)', () => {
    // East-west segment at lat 60; station 0.05° north of the midpoint.
    // True perpendicular distance ≈ 5.55 km regardless of longitude scale.
    const highLatPolyline = [{ lat: 60, lng: 10 }, { lat: 60, lng: 12 }];
    const r = measureDetour({ lat: 60.05, lng: 11 }, highLatPolyline);
    expect(r.detourKm).toBeCloseTo(5.56, 0);
    // routePoint should snap near (60, 11), not skewed
    expect(r.routePoint.lat).toBeCloseTo(60, 4);
    expect(r.routePoint.lng).toBeCloseTo(11, 1);
  });
});

describe('pointAtRouteKm', () => {
  it('returns the first vertex when targetKm is 0', () => {
    expect(pointAtRouteKm(polyline, 0)).toEqual({ lat: 0, lng: 0 });
  });

  it('returns null when targetKm exceeds the total polyline length', () => {
    expect(pointAtRouteKm(polyline, 100000)).toBeNull();
  });

  it('interpolates a point mid-segment', () => {
    const p = pointAtRouteKm(polyline, 55);
    expect(p).not.toBeNull();
    expect(p!.lat).toBeCloseTo(0, 4);
    expect(p!.lng).toBeGreaterThan(0.3);
    expect(p!.lng).toBeLessThan(0.7);
  });
});
