import type { DayGroup } from './compute';
import type { FuelSearchTarget } from './fuel-stops';

/** True when a day's last stop is somewhere you can't sleep — the Builder
 * shows a "suggest a hotel" chip for these days (issue #115). Days ending
 * on an overnight stop or the trip destination need nothing. */
export function dayNeedsOvernightSuggestion(group: DayGroup): boolean {
  if (group.stops.length === 0) return false;
  const last = group.stops[group.stops.length - 1].stop;
  return last.type !== 'overnight' && last.type !== 'destination';
}

/** NearbyFinder anchor at the day's END — where you actually are when the
 * driving day runs out. Mirrors dayStartTarget's zero-length pseudo-leg
 * shape ("Near X" subheading); the accepted hotel inserts after the day's
 * last stop. Returns null for empty days. Pure. */
export function dayEndTarget(group: DayGroup): FuelSearchTarget | null {
  if (group.stops.length === 0) return null;
  const last = group.stops[group.stops.length - 1];
  return {
    midpoint: { lat: last.stop.lat, lng: last.stop.lng },
    insertAtFlatIndex: last.index + 1,
    legStart: last.stop,
    legEnd: last.stop,
    legKm: 0,
  };
}
