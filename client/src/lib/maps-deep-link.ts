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

/** Builds a Google Maps directions URL for a single day's stops.
 * Returns null when the day has no stops or > ANDROID_AUTO_MAX_STOPS_PER_DAY (button disabled). */
export function buildDayMapsUrl(stops: Stop[]): string | null {
  if (stops.length === 0) return null;
  if (stops.length > ANDROID_AUTO_MAX_STOPS_PER_DAY) return null;
  const fmt = (s: Stop) => `${s.lat},${s.lng}`;
  if (stops.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fmt(stops[0]))}&travelmode=driving`;
  }
  const origin = encodeURIComponent(fmt(stops[0]));
  const destination = encodeURIComponent(fmt(stops[stops.length - 1]));
  const waypoints = stops.slice(1, -1).map(fmt).join('|');
  const waypointsParam = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '';
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsParam}&travelmode=driving`;
}
