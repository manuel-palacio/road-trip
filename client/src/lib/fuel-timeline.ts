import { isFuelStop } from './compute';
import type { Stop } from './types';

export type FuelEvent = { stopIndex: number; kind: 'start' | 'refuel' | 'overnight' };

export type FuelGap = {
  afterStopIndex: number;
  beforeStopIndex: number;
  /** Peak cumulative km reached within this refill segment — i.e. the
   * single-tank distance the driver would have to cover without refueling
   * if no fuel stop is inserted. Used by the engine to decide whether a
   * stop is needed AND as the user-visible "X km without refuel" warning. */
  gapKm: number;
  legPolyline: { lat: number; lng: number }[];
};

export type FuelTimeline = {
  cumulativeSinceLastFill: number[];
  events: FuelEvent[];
  gaps: FuelGap[];
};

const REFILL_THRESHOLD = 0.9;

function isRefillEvent(stop: Stop, index: number): { isEvent: true; kind: FuelEvent['kind'] } | { isEvent: false } {
  if (index === 0) return { isEvent: true, kind: 'start' };
  if (stop.type === 'overnight') return { isEvent: true, kind: 'overnight' };
  if (isFuelStop(stop)) return { isEvent: true, kind: 'refuel' };
  return { isEvent: false };
}

/** Walk stops forward, reset cumulative km at each refill event (trip start,
 * overnight, fuel stop), record gaps where the segment between two refill
 * events would have driven > 90% of `tankRangeKm` on a single tank.
 * Pure; no allocations beyond the returned object. */
export function computeFuelTimeline(stops: readonly Stop[], tankRangeKm: number): FuelTimeline {
  const cumulativeSinceLastFill: number[] = [];
  const events: FuelEvent[] = [];
  const gaps: FuelGap[] = [];

  let cumKm = 0;
  let segPeak = 0;
  let segStartIndex = 0;
  let segPolyline: { lat: number; lng: number }[] = [];

  function closeSegment(endIndex: number) {
    if (segPeak > REFILL_THRESHOLD * tankRangeKm) {
      gaps.push({
        afterStopIndex: segStartIndex,
        beforeStopIndex: endIndex,
        gapKm: segPeak,
        legPolyline: segPolyline,  // may be empty/short; consumer's responsibility
      });
    }
  }

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const ev = isRefillEvent(s, i);
    if (ev.isEvent) {
      closeSegment(i);
      events.push({ stopIndex: i, kind: ev.kind });
      cumulativeSinceLastFill.push(0);
      cumKm = 0;
      segPeak = 0;
      segStartIndex = i;
      segPolyline = [];
      continue;
    }
    const legKm = s.kmFromPrevious || 0;
    cumKm += legKm;
    cumulativeSinceLastFill.push(cumKm);
    if (cumKm > segPeak) segPeak = cumKm;
    if (s.routePath && s.routePath.length >= 2) {
      // Concatenate this leg's polyline. Skip the first vertex if the prior
      // leg ended at the same point (continuity), otherwise include all.
      const last = segPolyline.length ? segPolyline[segPolyline.length - 1] : null;
      const first = s.routePath[0];
      const start = last && Math.abs(last.lat - first.lat) < 1e-6 && Math.abs(last.lng - first.lng) < 1e-6 ? 1 : 0;
      for (let j = start; j < s.routePath.length; j++) segPolyline.push(s.routePath[j]);
    }
  }
  closeSegment(stops.length - 1);

  return { cumulativeSinceLastFill, events, gaps };
}
