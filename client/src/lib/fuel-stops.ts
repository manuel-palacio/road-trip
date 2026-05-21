import type { Stop } from './types';
import type { DayGroup } from './compute';

/** Conservative default tank range when the user hasn't configured one.
 * Lets the suggester stay silent for short legs but kick in for genuinely
 * long ones. */
export const DEFAULT_TANK_RANGE_KM = 500;

export type FuelSearchTarget = {
  /** Place to centre the Places nearbySearch around — midpoint of the
   * day's longest leg (along the actual driven polyline when known,
   * geometric midpoint as fallback). */
  midpoint: { lat: number; lng: number };
  /** Flat-array index in the trip's stops where the new gas stop will
   * splice in. Equal to the leg's end-stop index, so the new stop
   * appears between legStart and legEnd. */
  insertAtFlatIndex: number;
  legStart: Stop;
  legEnd: Stop;
  legKm: number;
};

/** Find the longest leg in a day that exceeds `tankRangeKm`, plus enough
 * metadata to insert a new stop at the right position. Returns null when
 * no leg crosses the threshold — i.e. the day has no real refuel pressure.
 * tankRangeKm defaults to 500 km when omitted. */
export function findFuelSearchTarget(
  group: DayGroup,
  allStops: readonly Stop[],
  getPath: (stop: Stop) => { lat: number; lng: number }[] | undefined,
  tankRangeKm: number = DEFAULT_TANK_RANGE_KM,
): FuelSearchTarget | null {
  let maxKm = 0;
  let endIdx = -1;
  for (const { stop, index } of group.stops) {
    // The first stop in the trip has no inbound leg; skip it.
    if (index === 0) continue;
    const km = stop.kmFromPrevious || 0;
    // Only target legs that genuinely exceed the tank range. A 200 km leg
    // on a 500 km tank doesn't need a pit-stop suggestion.
    if (km > tankRangeKm && km > maxKm) {
      maxKm = km;
      endIdx = index;
    }
  }
  if (endIdx < 0) return null;
  const legStart = allStops[endIdx - 1];
  const legEnd = allStops[endIdx];
  if (!legStart || !legEnd) return null;
  const path = getPath(legEnd) || [];
  // Use the actual polyline midpoint when available — far more useful
  // than the straight-line midpoint when the route loops or detours.
  const midpoint = path.length >= 2
    ? path[Math.floor(path.length / 2)]
    : {
        lat: (legStart.lat + legEnd.lat) / 2,
        lng: (legStart.lng + legEnd.lng) / 2,
      };
  return { midpoint, insertAtFlatIndex: endIdx, legStart, legEnd, legKm: maxKm };
}

/** Returns the km of the longest single leg in a day that exceeds
 * tankRangeKm, or 0 if no leg crosses the threshold. Drives the per-day
 * "long leg, consider refuel" warning chip. */
export function longestLegOverRange(
  group: DayGroup,
  tankRangeKm: number = DEFAULT_TANK_RANGE_KM,
): number {
  let maxKm = 0;
  for (const { stop, index } of group.stops) {
    if (index === 0) continue;
    const km = stop.kmFromPrevious || 0;
    if (km > tankRangeKm && km > maxKm) maxKm = km;
  }
  return maxKm;
}
