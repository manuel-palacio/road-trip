import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRouteSegments } from '../useRouteSegments';
import type { Stop } from '../../lib/types';

// The hook's routes-library import is memoized module-wide, so every test
// shares this fake. Swap `computeRoutesImpl` per test to control outcomes.
let computeRoutesImpl: () => Promise<{ routes?: unknown[] }>;
const fakeMaps = {
  importLibrary: () =>
    Promise.resolve({
      Route: { computeRoutes: () => computeRoutesImpl() },
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
