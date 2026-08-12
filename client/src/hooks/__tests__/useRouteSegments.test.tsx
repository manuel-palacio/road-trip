import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRouteSegments } from '../useRouteSegments';
import type { Stop } from '../../lib/types';

// The hook's routes-library import is memoized module-wide, so every test
// shares this fake. Swap `computeRoutesImpl` per test to control outcomes.
let computeRoutesImpl: (req?: unknown) => Promise<{ routes?: unknown[] }>;
const fakeMaps = {
  importLibrary: () =>
    Promise.resolve({
      Route: { computeRoutes: (req: unknown) => computeRoutesImpl(req) },
    }),
} as unknown as NonNullable<Parameters<typeof useRouteSegments>[1]>;

function mkStop(id: string, lat: number, lng: number): Stop {
  return {
    id,
    name: id,
    label: id,
    lat,
    lng,
    type: 'waypoint',
    dayNumber: 1,
    kmFromPrevious: 0,
    durationFromPrevious: '',
    highlights: [],
  } as unknown as Stop;
}

function okRoute(km: number) {
  return {
    routes: [{
      distanceMeters: km * 1000,
      durationMillis: 60_000,
      path: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }],
    }],
  };
}

describe('useRouteSegments', () => {
  it('retries a failed leg on the next stops change instead of caching the failure forever', async () => {
    computeRoutesImpl = () => Promise.reject(new Error('quota'));
    const stops = [mkStop('retry-a', 0, 0), mkStop('retry-b', 1, 1)];

    const { result, rerender } = renderHook(
      ({ s }: { s: Stop[] }) => useRouteSegments(s, fakeMaps),
      { initialProps: { s: stops } },
    );
    await waitFor(() => expect(result.current.enriched[1].routingFailed).toBe(true));

    computeRoutesImpl = () => Promise.resolve(okRoute(100));
    rerender({ s: [...stops] });

    await waitFor(() => expect(result.current.enriched[1].kmFromPrevious).toBe(100));
    expect(result.current.enriched[1].routingFailed).toBe(false);
  });

  it('routes through via-points, caches per via signature, and restores the direct route on removal', async () => {
    const requests: { intermediates?: { lat: number; lng: number }[] }[] = [];
    computeRoutesImpl = (req) => {
      requests.push(req as (typeof requests)[0]);
      return Promise.resolve(okRoute(100));
    };
    const a = mkStop('via-a', 5, 5);
    const b = mkStop('via-b', 6, 6);

    const { result, rerender } = renderHook(
      ({ s }: { s: Stop[] }) => useRouteSegments(s, fakeMaps),
      { initialProps: { s: [a, b] } },
    );
    await waitFor(() => expect(result.current.enriched[1].kmFromPrevious).toBe(100));
    expect(requests).toHaveLength(1);
    expect(requests[0].intermediates).toBeUndefined();

    computeRoutesImpl = (req) => {
      requests.push(req as (typeof requests)[0]);
      return Promise.resolve(okRoute(150));
    };
    const via = { lat: 5.5, lng: 5.9 };
    rerender({ s: [a, { ...b, viaPoints: [via] }] });
    await waitFor(() => expect(result.current.enriched[1].kmFromPrevious).toBe(150));
    expect(requests).toHaveLength(2);
    expect(requests[1].intermediates).toEqual([via]);

    rerender({ s: [a, { ...b }] });
    await waitFor(() => expect(result.current.enriched[1].kmFromPrevious).toBe(100));
    expect(requests).toHaveLength(2);
  });

  it('does not refetch legs that already resolved successfully', async () => {
    let calls = 0;
    computeRoutesImpl = () => {
      calls++;
      return Promise.resolve(okRoute(50));
    };
    const stops = [mkStop('cache-a', 2, 2), mkStop('cache-b', 3, 3)];

    const { result, rerender } = renderHook(
      ({ s }: { s: Stop[] }) => useRouteSegments(s, fakeMaps),
      { initialProps: { s: stops } },
    );
    await waitFor(() => expect(result.current.enriched[1].kmFromPrevious).toBe(50));

    rerender({ s: [...stops] });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls).toBe(1);
  });
});
