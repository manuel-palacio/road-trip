/** Uniform-stride downsample for a polyline. Keeps the first and last points
 * so the line still touches the leg endpoints, otherwise picks every
 * (length / maxPoints)-th vertex. The Routes API can return paths with
 * thousands of vertices for a single leg; for visual rendering at the zoom
 * levels we care about, ~500 points is more than enough and keeps the
 * persisted trip well under Firestore's 1 MB document limit even with
 * 10+ legs. */
export function downsamplePath<T>(path: readonly T[], maxPoints: number): T[] {
  if (path.length <= maxPoints) return [...path];
  if (maxPoints <= 1) return path.length > 0 ? [path[0]] : [];
  const step = (path.length - 1) / (maxPoints - 1);
  const out: T[] = [];
  for (let i = 0; i < maxPoints - 1; i++) {
    out.push(path[Math.round(i * step)]);
  }
  // Always include the final point so the polyline lands on the destination
  // regardless of rounding.
  out.push(path[path.length - 1]);
  return out;
}

/** Number of polyline points we persist per leg. 500 covers ~1000 km at
 * 2 km granularity — visually indistinguishable from the raw path at any
 * sane zoom and ~30 bytes per point so a 10-leg trip stays around 150 KB. */
export const MAX_ROUTE_PATH_POINTS = 500;

type LatLng = { lat: number; lng: number };

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Does a persisted polyline path still belong to the current `from → to`
 * pair? Necessary because cache keys are id-based but the persisted path
 * only knows endpoints geographically — if a user reorders or removes a
 * stop, the surviving stop's `routePath` is stale w.r.t. its new
 * predecessor and must not be re-seeded into the route cache. Tolerance
 * accounts for the Routes API snapping endpoints to the nearest road
 * (typically <500 m offset). */
export function pathMatchesEndpoints(
  path: readonly LatLng[],
  from: LatLng,
  to: LatLng,
  toleranceKm: number = 1,
): boolean {
  if (!path || path.length < 2) return false;
  return (
    haversineKm(path[0], from) <= toleranceKm
    && haversineKm(path[path.length - 1], to) <= toleranceKm
  );
}
