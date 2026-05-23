import { useEffect, useRef } from 'react';
import { formatCurrency, legCost } from '../lib/compute';
import { makeCostChipIcon } from '../lib/google-maps';
import { getStopPath } from './useRouteSegments';
import type { FuelOverride, FuelUnit, Stop } from '../lib/types';

/** Below this zoom level the country-scale map is too cluttered to host
 * per-leg chips — they collide with each other and with stop markers. */
const MIN_ZOOM = 5;

type FuelConfig = {
  consumption: number | undefined;
  unit: FuelUnit | undefined;
  defaultPrice: number | undefined;
  defaultCurrency: string | undefined;
  overrides: FuelOverride[] | undefined;
};

/** Renders a small cost chip ("€18") at the polyline midpoint of every routed
 * leg whose fuel cost can be computed. Self-managing — creates markers on
 * mount + when inputs change, removes them on unmount, and toggles visibility
 * on zoom. No-op when fuel isn't configured (consumption + defaultPrice
 * both required). */
export function useLegCostMarkers(
  maps: typeof google.maps | null,
  map: google.maps.Map | null,
  stops: readonly Stop[],
  fuel: FuelConfig,
): void {
  const markersRef = useRef<google.maps.Marker[]>([]);

  useEffect(() => {
    if (!maps || !map) return;

    // Tear down any markers from a previous run.
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // Acceptance: hidden when fuel isn't configured.
    if (!fuel.consumption || !fuel.defaultPrice) return;

    for (const stop of stops) {
      const cost = legCost(
        stop,
        fuel.consumption,
        fuel.unit,
        fuel.defaultPrice,
        fuel.defaultCurrency,
        fuel.overrides,
      );
      if (!cost) continue; // also covers km<=0 and unrouted legs
      const path = getStopPath(stop);
      // No polyline → no midpoint to anchor to. Geographic-midpoint fallback
      // would land off-route and look misleading on detours, so we just skip.
      if (!path || path.length < 2) continue;
      const mid = path[Math.floor(path.length / 2)];
      const label = formatCurrency(Math.round(cost.amount), cost.currency);
      const marker = new maps.Marker({
        position: mid,
        map,
        icon: makeCostChipIcon(label),
        clickable: false,
        // Below the stop markers (default 0) is the explicit requirement;
        // negative zIndex keeps them visually subordinate to route stops.
        zIndex: -1,
        title: `Est. fuel: ${label}`,
      });
      markersRef.current.push(marker);
    }

    const updateVisibility = () => {
      const zoom = map.getZoom() ?? 0;
      const visible = zoom >= MIN_ZOOM;
      markersRef.current.forEach((m) => m.setVisible(visible));
    };
    updateVisibility();
    const listener = map.addListener('zoom_changed', updateVisibility);

    return () => {
      maps.event.removeListener(listener);
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
    };
  }, [
    maps,
    map,
    stops,
    fuel.consumption,
    fuel.unit,
    fuel.defaultPrice,
    fuel.defaultCurrency,
    fuel.overrides,
  ]);
}
