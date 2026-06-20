import { haversineKm } from './pin-attachment';
import type { Pin, Stop } from './types';

/**
 * Cheapest-insertion: pick the index in `stops` where inserting (lat,lng)
 * adds the least extra straight-line distance. O(n) — fine for trip-sized
 * stop counts (≤20 typically). Returns the index to splice at.
 */
export function findBestInsertIndex(
  stops: readonly Stop[],
  lat: number,
  lng: number,
): number {
  if (stops.length === 0) return 0;
  if (stops.length === 1) return 1;
  const point = { lat, lng };
  let bestIndex = stops.length;
  let bestIncrease = Infinity;
  for (let i = 0; i <= stops.length; i++) {
    let increase: number;
    if (i === 0) {
      increase = haversineKm(point, { lat: stops[0].lat, lng: stops[0].lng });
    } else if (i === stops.length) {
      const prev = stops[i - 1];
      increase = haversineKm({ lat: prev.lat, lng: prev.lng }, point);
    } else {
      const prev = stops[i - 1];
      const next = stops[i];
      const original = haversineKm(
        { lat: prev.lat, lng: prev.lng },
        { lat: next.lat, lng: next.lng },
      );
      const withInsert =
        haversineKm({ lat: prev.lat, lng: prev.lng }, point) +
        haversineKm(point, { lat: next.lat, lng: next.lng });
      increase = withInsert - original;
    }
    if (increase < bestIncrease) {
      bestIncrease = increase;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * After insert/remove, reassign types so the route's first stop is 'start',
 * the last is 'destination', middle stops keep 'overnight'/'fuel', and
 * everything else (including former start/destination) becomes 'waypoint'.
 */
export function reassignStopTypes(stops: readonly Stop[]): Stop[] {
  const n = stops.length;
  return stops.map((s, i) => {
    if (i === 0) return { ...s, type: 'start' };
    if (i === n - 1) return { ...s, type: 'destination' };
    if (s.type === 'overnight') return { ...s, type: 'overnight' };
    if (s.type === 'fuel') return { ...s, type: 'fuel' };
    return { ...s, type: 'waypoint' };
  });
}

/**
 * Convert a pin into a Stop. Carries category/priority/notes so demote can
 * round-trip losslessly. Type is set provisionally; reassignStopTypes will
 * fix start/destination based on position after insertion.
 */
export function pinToStop(pin: Pin): Stop {
  return {
    id: crypto.randomUUID(),
    name: pin.name,
    label: pin.name,
    lat: pin.lat,
    lng: pin.lng,
    // Fuel pins become first-class fuel stops — not the legacy
    // waypoint+category:'fuel' shape the v3 migration retired.
    type: pin.category === 'fuel' ? 'fuel' : 'waypoint',
    highlights: [],
    kmFromPrevious: 0,
    category: pin.category,
    priority: pin.priority,
    notes: pin.notes,
  };
}

/**
 * Convert a Stop back into a Pin draft (suitable for createPin). If the stop
 * carries category/priority metadata (because it was promoted from a pin),
 * those values are preserved. Otherwise a sensible default is used.
 */
export function stopToPinDraft(stop: Stop): Omit<Pin, 'id' | 'addedByUid' | 'createdAt' | 'updatedAt'> {
  return {
    name: stop.label || stop.name,
    category: stop.category || 'landmark',
    priority: stop.priority || 'want',
    notes: stop.notes || (stop.highlights?.length ? stop.highlights.join(' · ') : ''),
    lat: stop.lat,
    lng: stop.lng,
  };
}
