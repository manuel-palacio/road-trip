import { isFuelStop } from './compute';
import type { Stop } from './types';

/** Google Maps URL routing accepts 1 origin + ≤9 waypoints + 1 destination per URL.
 * We cap at 10 stops per day with a 1-stop safety buffer below the actual 11-place limit. */
export const ANDROID_AUTO_MAX_STOPS_PER_DAY = 10;

export type AaStatus = 'ready' | 'limit' | 'over';

export function aaStatus(stopCount: number): AaStatus {
  if (stopCount > ANDROID_AUTO_MAX_STOPS_PER_DAY) return 'over';
  if (stopCount >= 9) return 'limit';
  return 'ready';
}

/** Stops that count toward the Android Auto / Maps URL 10-stop limit. Fuel
 * stops are pit-stop suggestions, not turn points, so they're filtered out. */
export function routableStops(stops: readonly Stop[]): Stop[] {
  return stops.filter((s) => !isFuelStop(s));
}

/** Builds a Google Maps directions URL for a single day's stops.
 * Returns null when the day has no stops or > ANDROID_AUTO_MAX_STOPS_PER_DAY (button disabled). */
export function buildDayMapsUrl(stops: Stop[]): string | null {
  const routable = routableStops(stops);
  if (routable.length === 0) return null;
  if (routable.length > ANDROID_AUTO_MAX_STOPS_PER_DAY) return null;
  const fmt = (s: Stop) => `${s.lat},${s.lng}`;
  if (routable.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fmt(routable[0]))}&travelmode=driving`;
  }
  const origin = encodeURIComponent(fmt(routable[0]));
  const destination = encodeURIComponent(fmt(routable[routable.length - 1]));
  const waypoints = routable.slice(1, -1).map(fmt).join('|');
  const waypointsParam = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '';
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsParam}&travelmode=driving`;
}
