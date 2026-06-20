import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutoFuel } from '../useAutoFuel';
import type { Stop } from '../../lib/types';
import type { PlacesSearchFn } from '../../lib/auto-fuel-pick';

const polyline = [
  { lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 },
  { lat: 0, lng: 3 }, { lat: 0, lng: 4 }, { lat: 0, lng: 5 },
];

const stop = (over: Partial<Stop>): Stop => ({
  id: over.id || Math.random().toString(),
  name: over.name || 'S',
  label: over.label || 'S',
  lat: over.lat ?? 0,
  lng: over.lng ?? 0,
  type: over.type || 'waypoint',
  ...over,
});

function tripWithLongLeg(): Stop[] {
  return [
    stop({ id: 'a', type: 'start' }),
    stop({ id: 'b', type: 'destination', kmFromPrevious: 600, routePath: polyline }),
  ];
}

const placesSearch: PlacesSearchFn = async () => [
  { placeId: 'P1', name: 'Pumps R Us', vicinity: '', rating: 4.5, lat: 0.001, lng: 3.6 },
];

describe('useAutoFuel', () => {
  it('does not propose when enabled is false', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    renderHook(() => useAutoFuel({
      enabled: false, tripId: 't', stops: tripWithLongLeg(), enrichedStops: tripWithLongLeg(),
      tankRangeKm: 500, placesSearch, onPropose, onWarning,
    }));
    await new Promise(r => setTimeout(r, 700));
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('proposes one insertion for a single long-leg gap', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    renderHook(() => useAutoFuel({
      enabled: true, tripId: 't', stops: tripWithLongLeg(), enrichedStops: tripWithLongLeg(),
      tankRangeKm: 500, placesSearch, onPropose, onWarning,
    }));
    await act(() => new Promise(r => setTimeout(r, 800)));
    expect(onPropose).toHaveBeenCalledTimes(1);
    const [next, inserted, removed] = onPropose.mock.calls[0];
    expect(inserted.length).toBe(1);
    expect(inserted[0].type).toBe('fuel');
    expect(inserted[0].addedByAuto).toBe(true);
    expect(removed.length).toBe(0);
    expect(next.length).toBe(3);
  });

  it('is idempotent on re-render with the same stops', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    const stops = tripWithLongLeg();
    const { rerender } = renderHook(({ s }) => useAutoFuel({
      enabled: true, tripId: 't', stops: s, enrichedStops: s,
      tankRangeKm: 500, placesSearch, onPropose, onWarning,
    }), { initialProps: { s: stops } });
    await act(() => new Promise(r => setTimeout(r, 800)));
    onPropose.mockClear();

    // Pretend the parent applied the proposal; the new stops include the auto stop.
    const withAuto: Stop[] = [
      stops[0],
      { ...stop({ id: 'auto1', type: 'fuel', addedByAuto: true, kmFromPrevious: 300, routePath: polyline.slice(0, 3) }) },
      { ...stops[1], kmFromPrevious: 300, routePath: polyline.slice(2) },
    ];
    rerender({ s: withAuto });
    await act(() => new Promise(r => setTimeout(r, 800)));
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('removes an obsolete auto stop when the trip no longer has a gap', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    const withAutoNoGap: Stop[] = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'auto1', type: 'fuel', addedByAuto: true, kmFromPrevious: 100, routePath: polyline.slice(0, 2) }),
      stop({ id: 'b', type: 'destination', kmFromPrevious: 100, routePath: polyline.slice(1, 3) }),
    ];
    renderHook(() => useAutoFuel({
      enabled: true, tripId: 't', stops: withAutoNoGap, enrichedStops: withAutoNoGap,
      tankRangeKm: 500, placesSearch, onPropose, onWarning,
    }));
    await act(() => new Promise(r => setTimeout(r, 800)));
    expect(onPropose).toHaveBeenCalledTimes(1);
    const [, inserted, removed] = onPropose.mock.calls[0];
    expect(removed.map((r: Stop) => r.id)).toEqual(['auto1']);
    expect(inserted.length).toBe(0);
  });

  it('does not remove a user-touched fuel stop (addedByAuto: false)', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    const userOwned: Stop[] = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'user1', type: 'fuel', addedByAuto: false, kmFromPrevious: 100, routePath: polyline.slice(0, 2) }),
      stop({ id: 'b', type: 'destination', kmFromPrevious: 100, routePath: polyline.slice(1, 3) }),
    ];
    renderHook(() => useAutoFuel({
      enabled: true, tripId: 't', stops: userOwned, enrichedStops: userOwned,
      tankRangeKm: 500, placesSearch, onPropose, onWarning,
    }));
    await act(() => new Promise(r => setTimeout(r, 800)));
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('defers when an auto stop is still awaiting its routePath (avoids insert/remove loop)', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    // Stops include an auto-inserted fuel stop with NO routePath yet — simulates
    // the window between spliceStopAt and useRouteSegments completing.
    const inFlight: Stop[] = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'auto1', type: 'fuel', addedByAuto: true, kmFromPrevious: 0 }), // no routePath
      stop({ id: 'b', type: 'destination', kmFromPrevious: 0 }),
    ];
    renderHook(() => useAutoFuel({
      enabled: true, tripId: 't', stops: inFlight, enrichedStops: inFlight,
      tankRangeKm: 500, placesSearch, onPropose, onWarning,
    }));
    await act(() => new Promise(r => setTimeout(r, 800)));
    // Engine must NOT remove the auto stop while its routing is in flight.
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('emits a warning when no station passes the detour cap', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    const noStation: PlacesSearchFn = async () => [{ placeId: 'F', name: '', vicinity: '', lat: 1, lng: 3.6 }];
    renderHook(() => useAutoFuel({
      enabled: true, tripId: 't', stops: tripWithLongLeg(), enrichedStops: tripWithLongLeg(),
      tankRangeKm: 500, placesSearch: noStation, onPropose, onWarning,
    }));
    await act(() => new Promise(r => setTimeout(r, 800)));
    expect(onWarning).toHaveBeenCalled();
    expect(onWarning.mock.calls[0][0][0].gapKm).toBeGreaterThan(450);
  });
});
