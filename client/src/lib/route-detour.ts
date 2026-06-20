import { haversineKm } from './pin-attachment';

type LatLng = { lat: number; lng: number };

export type DetourMeasurement = {
  detourKm: number;
  routePoint: LatLng;
  segmentIdx: number;
  routeKmFromStart: number;
};

/** Closest-point projection of `p` onto the segment `a → b` in an equirectangular
 * approximation. Scales longitudes by cos(midLat) so a 1° step east-west covers
 * the same metric distance as a 1° step north-south at this latitude — without
 * this, `t` is skewed up to 2× at lat 60°. Returns the projected point and the
 * parametric t in [0,1] along the segment. */
function projectOntoSegment(p: LatLng, a: LatLng, b: LatLng): { point: LatLng; t: number } {
  const midLatRad = ((a.lat + b.lat) / 2) * Math.PI / 180;
  const lngScale = Math.cos(midLatRad);
  const ax = a.lng * lngScale, ay = a.lat;
  const bx = b.lng * lngScale, by = b.lat;
  const px = p.lng * lngScale, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: a, t: 0 };
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return { point: { lat: ay + dy * t, lng: (ax + dx * t) / lngScale }, t };
}

export function measureDetour(station: LatLng, polyline: readonly LatLng[]): DetourMeasurement {
  if (polyline.length === 0) {
    return { detourKm: Infinity, routePoint: station, segmentIdx: -1, routeKmFromStart: 0 };
  }
  let best: DetourMeasurement = {
    detourKm: Infinity,
    routePoint: polyline[0],
    segmentIdx: 0,
    routeKmFromStart: 0,
  };
  let cumKm = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const segLen = haversineKm(a, b);
    const { point, t } = projectOntoSegment(station, a, b);
    const detour = haversineKm(station, point);
    if (detour < best.detourKm) {
      best = {
        detourKm: detour,
        routePoint: point,
        segmentIdx: i,
        routeKmFromStart: cumKm + segLen * t,
      };
    }
    cumKm += segLen;
  }
  return best;
}

export function pointAtRouteKm(polyline: readonly LatLng[], targetKm: number): LatLng | null {
  if (polyline.length === 0) return null;
  if (targetKm <= 0) return polyline[0];
  let cumKm = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const segLen = haversineKm(a, b);
    if (cumKm + segLen >= targetKm) {
      const t = segLen === 0 ? 0 : (targetKm - cumKm) / segLen;
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    cumKm += segLen;
  }
  return null;
}
