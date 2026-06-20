import type { NearbyResult } from '../components/builder/NearbyFinder';
import type { FuelGap } from './fuel-timeline';
import { measureDetour, pointAtRouteKm } from './route-detour';

type LatLng = { lat: number; lng: number };

export type StationCandidate = NearbyResult & {
  detourKm: number;
  routeKmFromStart: number;
};

export type PickError = { error: 'no-station' } | { error: 'places-failed' };

export type PlacesSearchFn = (location: LatLng, radiusMeters: number) => Promise<NearbyResult[]>;

const DEFAULT_DETOUR_CAP_KM = 5;
const TARGET_FRACTION_OF_TANK = 0.8;
const PLACES_SEARCH_RADIUS_M = 10_000;

/** Pick the best gas station for an auto-fuel gap. Returns the candidate or
 * a tagged error. `placesSearch` is injected so tests and the live caller
 * can supply their own (PlacesService wrapper, mock, etc.). */
export async function pickFuelStation(opts: {
  gap: FuelGap;
  tankRangeKm: number;
  legStartRouteKm: number;
  placesSearch: PlacesSearchFn;
  detourCapKm?: number;
}): Promise<StationCandidate | PickError> {
  const detourCap = opts.detourCapKm ?? DEFAULT_DETOUR_CAP_KM;
  const targetWithinLeg = TARGET_FRACTION_OF_TANK * opts.tankRangeKm;
  const targetPoint =
    pointAtRouteKm(opts.gap.legPolyline, targetWithinLeg) ??
    opts.gap.legPolyline[opts.gap.legPolyline.length - 1];

  let raw: NearbyResult[];
  try {
    raw = await opts.placesSearch(targetPoint, PLACES_SEARCH_RADIUS_M);
  } catch {
    return { error: 'places-failed' };
  }

  const candidates: StationCandidate[] = [];
  for (const r of raw) {
    const m = measureDetour({ lat: r.lat, lng: r.lng }, opts.gap.legPolyline);
    if (m.detourKm > detourCap) continue;
    candidates.push({ ...r, detourKm: m.detourKm, routeKmFromStart: m.routeKmFromStart });
  }
  if (candidates.length === 0) return { error: 'no-station' };

  // Score: lower is better. Detour dominates; rating pulls the score down;
  // distance from the target km gently disambiguates near-ties.
  const score = (c: StationCandidate) =>
    c.detourKm
    - 0.5 * (c.rating ?? 0)
    + 0.3 * Math.abs(c.routeKmFromStart - targetWithinLeg) / opts.tankRangeKm;

  candidates.sort((a, b) => score(a) - score(b));
  return candidates[0];
}
