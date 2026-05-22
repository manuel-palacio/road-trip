import type { Stop } from './types';

/** Clear the leg fields that became stale because this stop's predecessor
 * changed. Wipes km/duration AND the persisted routePath — the latter
 * matters since a save during the routing refetch window would otherwise
 * carry the OLD predecessor's polyline. */
function withClearedInboundLeg(stop: Stop): Stop {
  const { routePath: _routePath, ...rest } = stop;
  return {
    ...rest,
    kmFromPrevious: 0,
    durationFromPrevious: '',
    durationSecondsFromPrevious: 0,
  };
}

/** Splice a new stop into the trip at `at`, taking care to invalidate the
 * successor's persisted leg fields.
 *
 * When a stop is inserted mid-array, the stop that NOW follows it has a
 * different inbound leg (was prev→next, now newStop→next). Its persisted
 * km/duration and routePath belong to the OLD leg and would be misleading
 * until `useRouteSegments` refetches the directions for the new pair.
 * Clearing them lets the day totals fall to a low-but-honest preview
 * during the refetch window — far better than persisting the stale
 * pre-insertion data if the user saves before the routes arrive.
 *
 * The newly inserted stop is assumed to come with its own km=0 (the caller
 * controls its shape). Returns a new array; does not mutate the input. */
export function spliceStopAt(stops: readonly Stop[], at: number, newStop: Stop): Stop[] {
  const next = [...stops];
  const idx = Math.max(0, Math.min(at, next.length));
  next.splice(idx, 0, newStop);
  if (idx + 1 < next.length) {
    next[idx + 1] = withClearedInboundLeg(next[idx + 1]);
  }
  return next;
}

/** Remove a stop by id. Mirror of spliceStopAt: the stop now occupying the
 * removed slot has a new predecessor (or none, if the removed stop was
 * first) and its persisted km/duration/routePath are stale. Returns a new
 * array; does not mutate the input. */
export function removeStopById(stops: readonly Stop[], id: string): Stop[] {
  const idx = stops.findIndex((s) => s.id === id);
  if (idx < 0) return [...stops];
  const next = stops.filter((s) => s.id !== id);
  if (idx < next.length) {
    next[idx] = withClearedInboundLeg(next[idx]);
  }
  return next;
}
