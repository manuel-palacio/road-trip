import type { Stop } from './types';
import type { DayGroup } from './compute';

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

/** Find the midpoint of the longest leg in a single day group, plus
 * enough metadata to insert a new stop at the right position. Returns
 * null when the day has no targetable leg (single-stop day, or every
 * leg is 0 km / unrouted). */
export function findFuelSearchTarget(
  group: DayGroup,
  allStops: readonly Stop[],
  getPath: (stop: Stop) => { lat: number; lng: number }[] | undefined,
): FuelSearchTarget | null {
  let maxKm = 0;
  let endIdx = -1;
  for (const { stop, index } of group.stops) {
    // The first stop in the trip has no inbound leg; skip it.
    if (index === 0) continue;
    const km = stop.kmFromPrevious || 0;
    if (km > maxKm) {
      maxKm = km;
      endIdx = index;
    }
  }
  if (endIdx < 0 || maxKm <= 0) return null;
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
