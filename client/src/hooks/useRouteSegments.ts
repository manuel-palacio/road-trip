import { useEffect, useMemo, useRef, useState } from 'react';
import type { Stop, StopRouteMode } from '../lib/types';
import { formatDuration } from '../lib/compute';
import { pathMatchesEndpoints } from '../lib/route-path';

type Segment = {
  km: number;
  durationSeconds: number;
  path: { lat: number; lng: number }[];
  failed?: boolean;
};

/* Module-scoped cache survives across builder open/close on same browser tab.
   Cleared automatically by browser on full page refresh. */
const cache = new Map<string, Segment>();

function pairKey(fromId: string, toId: string, mode: StopRouteMode | undefined) {
  // Mode is part of the cache key so flipping a leg between fastest/scenic
  // triggers a fresh fetch with the right routeModifiers instead of
  // serving a stale path.
  return `${fromId}::${toId}::${mode || 'fastest'}`;
}

function routeModifiersFor(mode: StopRouteMode | undefined) {
  const avoidHighways = mode === 'scenic' || mode === 'scenic-no-tolls';
  const avoidTolls = mode === 'no-tolls' || mode === 'scenic-no-tolls';
  if (!avoidHighways && !avoidTolls) return undefined;
  return { avoidHighways, avoidTolls };
}

// Minimal types for the new Routes library — @types/google.maps may not carry
// them yet depending on version, so we describe just what we use.
type LatLngAltitudeLike = { lat: number; lng: number; altitude?: number };
type RouteResponse = {
  distanceMeters?: number;
  durationMillis?: number;
  path?: LatLngAltitudeLike[];
};
type RoutesLibrary = {
  Route: {
    computeRoutes: (req: {
      origin: { lat: number; lng: number };
      destination: { lat: number; lng: number };
      travelMode: string;
      fields: string[];
      routeModifiers?: { avoidHighways?: boolean; avoidTolls?: boolean; avoidFerries?: boolean };
    }) => Promise<{ routes?: RouteResponse[] }>;
  };
};

let routesLibPromise: Promise<RoutesLibrary> | null = null;
function loadRoutesLib(maps: typeof google.maps): Promise<RoutesLibrary> {
  if (routesLibPromise) return routesLibPromise;
  // importLibrary is part of the modern bootstrap loader. Our SDK is loaded
  // with `loading=async`, so this works without additional `libraries=routes`
  // in the script URL.
  const importer = (maps as unknown as { importLibrary: (n: string) => Promise<unknown> })
    .importLibrary;
  routesLibPromise = importer('routes').then((lib) => lib as RoutesLibrary);
  return routesLibPromise;
}

/** Seed the module-scoped cache from any persisted routePath on the stops.
 * Synchronous on purpose: lets the first paint of a freshly-loaded trip
 * render polylines + distances without waiting for a Routes API call.
 *
 * Guard: the persisted path lives on `to.routePath` but only knows its
 * endpoints geographically. If the user has inserted, removed, or
 * reordered stops since save, `to`'s actual predecessor changed and the
 * path is stale. pathMatchesEndpoints rejects that case so the fetch
 * loop below can re-route the leg from scratch. */
function seedCacheFromPersistedPaths(stops: readonly Stop[]): boolean {
  let seeded = false;
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1];
    const to = stops[i];
    const key = pairKey(from.id, to.id, to.routeMode);
    if (cache.has(key)) continue;
    const path = to.routePath;
    if (!path || path.length < 2) continue;
    if (!pathMatchesEndpoints(path, { lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng })) {
      continue;
    }
    cache.set(key, {
      km: to.kmFromPrevious || 0,
      durationSeconds: to.durationSecondsFromPrevious || 0,
      path,
    });
    seeded = true;
  }
  return seeded;
}

export function useRouteSegments(stops: Stop[], maps: typeof google.maps | null) {
  // Synchronous cache seeding — runs every render but cache.set is cheap and
  // idempotent. Mirrors the existing "cache is mutated freely from inside the
  // hook" pattern of the fetch loop below.
  seedCacheFromPersistedPaths(stops);

  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastFailure, setLastFailure] = useState<string | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!maps || stops.length < 2) return;
    const myReq = ++reqRef.current;
    let cancelled = false;

    // Determine which pairs are missing from the cache
    const missing: { from: Stop; to: Stop; key: string; mode: StopRouteMode | undefined }[] = [];
    for (let i = 1; i < stops.length; i++) {
      const from = stops[i - 1];
      const to = stops[i];
      const key = pairKey(from.id, to.id, to.routeMode);
      if (!cache.has(key)) missing.push({ from, to, key, mode: to.routeMode });
    }
    if (missing.length === 0) return;

    setLoading(true);
    (async () => {
      let Route: RoutesLibrary['Route'];
      try {
        ({ Route } = await loadRoutesLib(maps));
      } catch (err) {
        console.error('Failed to load routes library', err);
        setLoading(false);
        return;
      }
      for (const { from, to, key, mode } of missing) {
        if (cancelled || reqRef.current !== myReq) break;
        try {
          const modifiers = routeModifiersFor(mode);
          const { routes } = await Route.computeRoutes({
            origin: { lat: from.lat, lng: from.lng },
            destination: { lat: to.lat, lng: to.lng },
            travelMode: 'DRIVING',
            fields: ['distanceMeters', 'durationMillis', 'path'],
            ...(modifiers ? { routeModifiers: modifiers } : {}),
          });
          const route = routes?.[0];
          if (!route) throw new Error('No route returned');
          cache.set(key, {
            km: Math.round((route.distanceMeters || 0) / 1000),
            durationSeconds: Math.round((route.durationMillis || 0) / 1000),
            path: (route.path || []).map((p) => ({ lat: p.lat, lng: p.lng })),
          });
        } catch (err) {
          console.error('Routes computeRoutes failed', err);
          cache.set(key, { km: 0, durationSeconds: 0, path: [], failed: true });
          setLastFailure(`${from.label || 'stop'} → ${to.label || 'stop'}`);
        }
        if (!cancelled && reqRef.current === myReq) {
          // Bump version so consumers re-derive enriched stops
          setVersion((v) => v + 1);
        }
      }
      if (!cancelled && reqRef.current === myReq) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [maps, stops]);

  const enriched = useMemo<Stop[]>(() => {
    return stops.map((stop, i) => {
      if (i === 0) {
        return {
          ...stop,
          kmFromPrevious: 0,
          durationSecondsFromPrevious: 0,
          durationFromPrevious: '',
        };
      }
      const prev = stops[i - 1];
      const seg = cache.get(pairKey(prev.id, stop.id, stop.routeMode));
      if (!seg) return stop;
      return {
        ...stop,
        kmFromPrevious: seg.km,
        durationSecondsFromPrevious: seg.durationSeconds,
        durationFromPrevious: formatDuration(seg.durationSeconds),
        routePath: seg.path,
        routingFailed: !!seg.failed,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, version]);

  return { enriched, loading, lastFailure, clearFailure: () => setLastFailure(null) };
}

/** Convenience accessors — the underlying fields are typed but consumers
 * tend to ask "does this stop have a path / did routing fail" generically. */
export function getStopPath(stop: Stop): { lat: number; lng: number }[] | undefined {
  return stop.routePath;
}
export function getStopRoutingFailed(stop: Stop): boolean {
  return !!stop.routingFailed;
}
