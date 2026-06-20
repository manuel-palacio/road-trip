import { useEffect, useRef, useState } from 'react';
import { computeFuelTimeline } from '../lib/fuel-timeline';
import { pickFuelStation, type PlacesSearchFn } from '../lib/auto-fuel-pick';
import { spliceStopAt, removeStopById } from '../lib/stop-ops';
import { isFuelStop } from '../lib/compute';
import type { Stop } from '../lib/types';

const DEBOUNCE_MS = 600;

type Warning = { dayNumber: number; gapKm: number };

type Args = {
  enabled: boolean;
  tripId: string | null;
  stops: Stop[];
  enrichedStops: Stop[];
  tankRangeKm: number;
  placesSearch: PlacesSearchFn | null;
  onPropose: (next: Stop[], inserted: Stop[], removed: Stop[]) => void;
  onWarning: (warnings: Warning[]) => void;
};

/** An auto-inserted fuel stop without a routePath (or with an incomplete
 * polyline) means useRouteSegments hasn't fetched directions for the new
 * pair of legs yet. Running the engine in this window is harmful: the
 * baseline reconstruction can't reconstitute the original leg km because
 * the auto stop has km=0 and the successor was km-cleared by spliceStopAt,
 * so the timeline sees no gap and the engine removes the stop it just
 * added. Defer until routing catches up. */
function hasPendingAutoRoutes(stops: readonly Stop[]): boolean {
  for (const s of stops) {
    if (isFuelStop(s) && s.addedByAuto === true) {
      if (!s.routePath || s.routePath.length < 2) return true;
    }
  }
  return false;
}

function hashStops(stops: readonly Stop[]): string {
  return stops
    .map(s => `${s.id}|${s.lat.toFixed(5)}|${s.lng.toFixed(5)}|${s.type}|${s.addedByAuto ? 1 : 0}`)
    .join('::');
}

function cumulativeRouteKm(stops: readonly Stop[], targetIdx: number): number {
  let cum = 0;
  for (let i = 1; i <= targetIdx; i++) cum += stops[i].kmFromPrevious || 0;
  return cum;
}

/** Reconstruct the baseline route by removing auto-inserted fuel stops and
 * merging their km into the next non-auto stop, restoring the original
 * segment distances. Without the km merge the timeline would see 0-km legs
 * and never detect gaps. */
function baselineStops(stops: readonly Stop[]): Stop[] {
  const result: Stop[] = [];
  let pendingKm = 0;
  let pendingPolyline: { lat: number; lng: number }[] = [];

  for (const s of stops) {
    if (isFuelStop(s) && s.addedByAuto === true) {
      pendingKm += s.kmFromPrevious || 0;
      if (s.routePath) pendingPolyline = [...pendingPolyline, ...s.routePath];
    } else {
      if (pendingKm > 0) {
        const mergedKm = (s.kmFromPrevious || 0) + pendingKm;
        const mergedPath = pendingPolyline.length > 0
          ? [...pendingPolyline, ...(s.routePath ?? [])]
          : s.routePath;
        result.push({ ...s, kmFromPrevious: mergedKm, routePath: mergedPath });
        pendingKm = 0;
        pendingPolyline = [];
      } else {
        result.push(s);
      }
    }
  }
  return result;
}

export function useAutoFuel(args: Args): { running: boolean } {
  const [running, setRunning] = useState(false);
  const reqRef = useRef(0);
  const hash = hashStops(args.enrichedStops);

  useEffect(() => {
    if (!args.enabled || !args.placesSearch) return;
    if (args.enrichedStops.length < 2) return;
    if (!(args.tankRangeKm > 0)) return;
    if (hasPendingAutoRoutes(args.enrichedStops)) return;

    const myReq = ++reqRef.current;
    let cancelled = false;

    const timer = setTimeout(async () => {
      setRunning(true);
      try {
        // Compute gaps on the baseline route (no auto stops) so the timeline
        // reflects what the driver would face without any insertions.
        const baseline = baselineStops(args.enrichedStops);
        const timeline = computeFuelTimeline(baseline, args.tankRangeKm);

        const existingAuto = args.enrichedStops
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => isFuelStop(s) && s.addedByAuto === true);

        const proposals = await Promise.all(
          timeline.gaps.map(async (gap) => {
            const legStartRouteKm = cumulativeRouteKm(baseline, gap.afterStopIndex);
            const result = await pickFuelStation({
              gap,
              tankRangeKm: args.tankRangeKm,
              legStartRouteKm,
              placesSearch: args.placesSearch!,
            });
            if ('error' in result) {
              return { gap, error: result.error, candidate: null as null };
            }
            return { gap, error: null as null, candidate: result };
          })
        );

        if (cancelled || reqRef.current !== myReq) return;

        const warnings: Warning[] = proposals
          .filter(p => p.error === 'no-station')
          .map(p => ({
            dayNumber: baseline[p.gap.beforeStopIndex]?.dayNumber || 0,
            gapKm: p.gap.gapKm,
          }));
        args.onWarning(warnings);

        type Hit = {
          gap: (typeof proposals)[number]['gap'];
          error: null;
          candidate: NonNullable<(typeof proposals)[number]['candidate']>;
        };
        const hits = proposals.filter((p): p is Hit => p.candidate !== null);

        // Match each hit against an existing auto stop by checking whether an
        // addedByAuto stop already sits between the gap's boundary stops in
        // the enriched array. This is more robust than route-km matching because
        // km values shift after routing recalculates around the inserted stop.
        const matchedAutoIds = new Set<string>();
        const insertions: { gap: Hit['gap']; candidate: Hit['candidate'] }[] = [];

        const afterIdByGap = (gap: Hit['gap']) => baseline[gap.afterStopIndex]?.id;
        const beforeIdByGap = (gap: Hit['gap']) => baseline[gap.beforeStopIndex]?.id;

        for (const h of hits) {
          const afterId = afterIdByGap(h.gap);
          const beforeId = beforeIdByGap(h.gap);
          const afterEnrichedIdx = afterId ? args.enrichedStops.findIndex(s => s.id === afterId) : -1;
          const beforeEnrichedIdx = beforeId ? args.enrichedStops.findIndex(s => s.id === beforeId) : -1;

          const match = afterEnrichedIdx >= 0 && beforeEnrichedIdx > afterEnrichedIdx
            ? existingAuto.find(({ s, i }) => {
                if (matchedAutoIds.has(s.id)) return false;
                return i > afterEnrichedIdx && i < beforeEnrichedIdx;
              })
            : undefined;

          if (match) {
            matchedAutoIds.add(match.s.id);
          } else {
            insertions.push(h);
          }
        }

        // Any existing auto stop not matched to a gap hit is obsolete.
        const removals = existingAuto
          .filter(({ s }) => !matchedAutoIds.has(s.id))
          .map(({ s }) => s);

        if (insertions.length === 0 && removals.length === 0) return;

        let next = [...args.enrichedStops];
        for (const r of removals) next = removeStopById(next, r.id);

        const insertSorted = [...insertions].sort(
          (a, b) => a.gap.beforeStopIndex - b.gap.beforeStopIndex
        );
        const insertedStops: Stop[] = [];
        for (const ins of insertSorted) {
          const newStop: Stop = {
            id: crypto.randomUUID(),
            name: ins.candidate.name,
            label: ins.candidate.name,
            lat: ins.candidate.lat,
            lng: ins.candidate.lng,
            type: 'fuel',
            category: 'fuel',
            addedByAuto: true,
            kmFromPrevious: 0,
            highlights: [],
          };
          // Re-resolve insert position by stop id from the baseline so prior
          // removals don't shift the index.
          const targetId = baseline[ins.gap.beforeStopIndex]?.id;
          const insertAt = targetId ? next.findIndex(s => s.id === targetId) : next.length;
          next = spliceStopAt(next, insertAt >= 0 ? insertAt : next.length, newStop);
          insertedStops.push(newStop);
        }

        if (cancelled || reqRef.current !== myReq) return;
        args.onPropose(next, insertedStops, removals);
      } finally {
        if (!cancelled && reqRef.current === myReq) setRunning(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.enabled, args.tankRangeKm, hash, args.placesSearch]);

  return { running };
}
