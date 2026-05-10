import { useEffect, useMemo, useRef, useState } from 'react';
import type { Stop } from '../lib/types';
import { formatDuration } from '../lib/compute';

type Segment = {
  km: number;
  durationSeconds: number;
  path: { lat: number; lng: number }[];
  failed?: boolean;
};

/* Module-scoped cache survives across builder open/close on same browser tab.
   Cleared automatically by browser on full page refresh. */
const cache = new Map<string, Segment>();

function pairKey(fromId: string, toId: string) {
  return `${fromId}::${toId}`;
}

export function useRouteSegments(stops: Stop[], maps: typeof google.maps | null) {
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastFailure, setLastFailure] = useState<string | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!maps || stops.length < 2) return;
    const myReq = ++reqRef.current;
    let cancelled = false;

    // Determine which pairs are missing from the cache
    const missing: { from: Stop; to: Stop; key: string }[] = [];
    for (let i = 1; i < stops.length; i++) {
      const from = stops[i - 1];
      const to = stops[i];
      const key = pairKey(from.id, to.id);
      if (!cache.has(key)) missing.push({ from, to, key });
    }
    if (missing.length === 0) return;

    setLoading(true);
    const directionsService = new maps.DirectionsService();
    (async () => {
      for (const { from, to, key } of missing) {
        if (cancelled || reqRef.current !== myReq) break;
        try {
          const result = await directionsService.route({
            origin: { lat: from.lat, lng: from.lng },
            destination: { lat: to.lat, lng: to.lng },
            travelMode: google.maps.TravelMode.DRIVING,
          });
          const leg = result.routes[0].legs[0];
          cache.set(key, {
            km: Math.round((leg.distance?.value || 0) / 1000),
            durationSeconds: leg.duration?.value || 0,
            path: result.routes[0].overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() })),
          });
        } catch (err) {
          console.error('Directions failed', err);
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
      const seg = cache.get(pairKey(prev.id, stop.id));
      if (!seg) return stop;
      return {
        ...stop,
        kmFromPrevious: seg.km,
        durationSecondsFromPrevious: seg.durationSeconds,
        durationFromPrevious: formatDuration(seg.durationSeconds),
        // path goes on a sibling field so it survives re-renders without persisting through save
        // @ts-expect-error — added at runtime, not in Stop type
        _path: seg.path,
        // @ts-expect-error — added at runtime
        _routingFailed: !!seg.failed,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, version]);

  return { enriched, loading, lastFailure, clearFailure: () => setLastFailure(null) };
}

/** Path data attached to enriched stops, kept off-type for cleaner Stop shape. */
export function getStopPath(stop: Stop): { lat: number; lng: number }[] | undefined {
  return (stop as unknown as { _path?: { lat: number; lng: number }[] })._path;
}
export function getStopRoutingFailed(stop: Stop): boolean {
  return !!(stop as unknown as { _routingFailed?: boolean })._routingFailed;
}
