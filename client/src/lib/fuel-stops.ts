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

/** Find the longest leg in a day, unconditional on tank range. Used by the
 * manual "+ Fuel stop" button — when the user explicitly asks for a fuel
 * stop suggestion, we should always honour it regardless of refuel pressure. */
export function findLongestLegTarget(
  group: DayGroup,
  allStops: readonly Stop[],
  getPath: (stop: Stop) => { lat: number; lng: number }[] | undefined,
): FuelSearchTarget | null {
  let maxKm = 0;
  let endIdx = -1;
  for (const { stop, index } of group.stops) {
    // The first stop in the trip has no inbound leg; skip it. Boundary
    // legs (a day's first stop, whose kmFromPrevious is the leg from the
    // previous day) DO count — they're real driving distance and the
    // caller (onFuelStopSelected) handles the day-assignment via
    // forceDayStart so the new fuel stop lands in the user's intended day.
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

/** Anchor for non-fuel NearbyFinder categories (food / hotel / scenic,
 * issue #72). Uses the day's first stop as both the search midpoint and
 * the bookend of a zero-length pseudo-leg — when legStart === legEnd
 * the NearbyFinder modal can present a "Near X" subheading instead of
 * "Longest leg." Returns null for empty days. Pure. */
export function dayStartTarget(group: DayGroup): FuelSearchTarget | null {
  if (group.stops.length === 0) return null;
  const first = group.stops[0];
  return {
    midpoint: { lat: first.stop.lat, lng: first.stop.lng },
    insertAtFlatIndex: first.index + 1,
    legStart: first.stop,
    legEnd: first.stop,
    legKm: 0,
  };
}

/** Find the longest leg in a day that exceeds `tankRangeKm`. Returns null
 * when no leg crosses the threshold — i.e. the day has no real refuel
 * pressure. Drives the auto-suggestion / warning paths. The manual button
 * uses findLongestLegTarget instead so the user can always add a fuel stop. */
export function findFuelSearchTarget(
  group: DayGroup,
  allStops: readonly Stop[],
  getPath: (stop: Stop) => { lat: number; lng: number }[] | undefined,
  tankRangeKm: number = DEFAULT_TANK_RANGE_KM,
): FuelSearchTarget | null {
  const target = findLongestLegTarget(group, allStops, getPath);
  if (!target || target.legKm <= tankRangeKm) return null;
  return target;
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
