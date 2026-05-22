import { describe, expect, it } from 'vitest';
import { downsamplePath, pathMatchesEndpoints } from '../route-path';

describe('downsamplePath', () => {
  it('returns a copy untouched when path is already at or below maxPoints', () => {
    const path = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
    const out = downsamplePath(path, 5);
    expect(out).toEqual(path);
    expect(out).not.toBe(path); // new array, defensive copy
  });

  it('preserves the first and last point even when downsampling aggressively', () => {
    const path = Array.from({ length: 100 }, (_, i) => ({ lat: i, lng: i }));
    const out = downsamplePath(path, 5);
    expect(out[0]).toEqual({ lat: 0, lng: 0 });
    expect(out[out.length - 1]).toEqual({ lat: 99, lng: 99 });
  });

  it('produces approximately maxPoints output for a long input', () => {
    const path = Array.from({ length: 2000 }, (_, i) => ({ lat: i, lng: i }));
    const out = downsamplePath(path, 500);
    expect(out.length).toBe(500);
  });

  it('samples uniformly across the path', () => {
    const path = Array.from({ length: 11 }, (_, i) => ({ lat: i, lng: 0 }));
    const out = downsamplePath(path, 3);
    expect(out).toEqual([
      { lat: 0, lng: 0 },
      { lat: 5, lng: 0 },
      { lat: 10, lng: 0 },
    ]);
  });

  it('handles maxPoints=1 by returning the first point only', () => {
    const path = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }];
    expect(downsamplePath(path, 1)).toEqual([{ lat: 1, lng: 1 }]);
  });

  it('handles empty paths', () => {
    expect(downsamplePath([], 500)).toEqual([]);
    expect(downsamplePath([], 1)).toEqual([]);
  });

  it('handles a single-point path', () => {
    expect(downsamplePath([{ lat: 5, lng: 5 }], 500)).toEqual([{ lat: 5, lng: 5 }]);
  });
});

describe('pathMatchesEndpoints', () => {
  // Roughly Stockholm and Copenhagen — ~520 km apart, well within Routes API
  // snapping behaviour at sub-km distances.
  const stockholm = { lat: 59.3293, lng: 18.0686 };
  const copenhagen = { lat: 55.6761, lng: 12.5683 };
  const malmo = { lat: 55.6050, lng: 13.0038 };

  it('returns true when path[0]/path[-1] match the endpoints within tolerance', () => {
    const path = [
      { lat: 59.330, lng: 18.069 }, // ~100 m from Stockholm
      { lat: 57.0, lng: 15.0 },
      { lat: 55.676, lng: 12.569 }, // ~100 m from Copenhagen
    ];
    expect(pathMatchesEndpoints(path, stockholm, copenhagen)).toBe(true);
  });

  it('returns false when path[0] does not match the from stop (predecessor changed)', () => {
    // Path starts at Malmö — was originally a Malmö→Copenhagen leg. After
    // a re-order it lives under a Stockholm→Copenhagen key. Must be rejected.
    const path = [malmo, copenhagen];
    expect(pathMatchesEndpoints(path, stockholm, copenhagen)).toBe(false);
  });

  it('returns false when path[-1] does not match the to stop', () => {
    const path = [stockholm, malmo];
    expect(pathMatchesEndpoints(path, stockholm, copenhagen)).toBe(false);
  });

  it('returns false for empty / single-point paths', () => {
    expect(pathMatchesEndpoints([], stockholm, copenhagen)).toBe(false);
    expect(pathMatchesEndpoints([stockholm], stockholm, copenhagen)).toBe(false);
  });

  it('honors a custom tolerance', () => {
    // Endpoints offset by ~80 km from stockholm/copenhagen → outside the
    // default 1 km tolerance, but inside a generous 100 km tolerance.
    const offsetStart = { lat: 60.0, lng: 18.5 };
    const offsetEnd = { lat: 55.0, lng: 13.0 };
    const path = [offsetStart, offsetEnd];
    expect(pathMatchesEndpoints(path, stockholm, copenhagen)).toBe(false);
    expect(pathMatchesEndpoints(path, stockholm, copenhagen, 100)).toBe(true);
  });
});
