import type { Stop } from './types';

/** Splice a new stop into the trip at `at`, taking care to invalidate the
 * successor's persisted leg fields.
 *
 * When a stop is inserted mid-array, the stop that NOW follows it has a
 * different inbound leg (was prev→next, now newStop→next). Its persisted
 * `kmFromPrevious` / `durationFromPrevious` belong to the OLD leg and would
 * be misleading until `useRouteSegments` refetches the directions for the
 * new pair. Clearing them lets the day totals fall to a low-but-honest
 * preview during the refetch window — far better than persisting the stale
 * pre-insertion distance if the user saves before the routes arrive.
 *
 * The newly inserted stop is assumed to come with its own km=0 (the caller
 * controls its shape). Returns a new array; does not mutate the input. */
export function spliceStopAt(stops: readonly Stop[], at: number, newStop: Stop): Stop[] {
  const next = [...stops];
  const idx = Math.max(0, Math.min(at, next.length));
  next.splice(idx, 0, newStop);
  if (idx + 1 < next.length) {
    next[idx + 1] = {
      ...next[idx + 1],
      kmFromPrevious: 0,
      durationFromPrevious: '',
      durationSecondsFromPrevious: 0,
    };
  }
  return next;
}
