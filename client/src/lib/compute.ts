import type { Stop } from './types';

// Fuel cost helpers live in shared/ so the PDF export endpoint can use the same
// implementation. Re-exported here so the existing `from '../lib/compute'`
// import surface keeps working for every screen and test.
export {
  estimateFuelCost,
  estimateFuelVolume,
  fuelBreakdownForLegs,
  fuelVolumeForLegs,
  fuelConfigState,
  legCost,
  formatCurrency,
  formatBreakdown,
  formatVolume,
  formatFillUps,
} from '../../../shared/fuel';
export type { FuelBreakdown, LegCost, FuelConfigState } from '../../../shared/fuel';

/* Custom day color palette — muted inks matching the editorial cartography theme.
   Cycles past 10 days. */
export const DAY_COLORS = [
  '#e76f51', // terracotta — matches accent
  '#2a7484', // deep teal
  '#d4a44a', // ochre
  '#7a9a72', // sage
  '#b97a8a', // dusty rose
  '#5a76a3', // slate blue
  '#a47045', // caramel
  '#8a5d7e', // plum
  '#7a8a4a', // olive
  '#7a8a99', // steel
] as const;

export function dayColor(n: number | undefined): string {
  return DAY_COLORS[((n || 1) - 1) % DAY_COLORS.length];
}

/** A stop is treated as a fuel/refuel pit-stop when its type is 'fuel', or
 * when it's a legacy fuel waypoint (saved before issue #52 as type='waypoint'
 * + category='fuel'). Used wherever fuel stops need pit-stop treatment
 * (they count as real Android Auto waypoints since commit da583e7). */
export function isFuelStop(s: Stop): boolean {
  return s.type === 'fuel' || (s.type === 'waypoint' && s.category === 'fuel');
}

// Re-exported so the existing `from '../lib/compute'` import surface keeps
// working; the implementation is shared with pace + the PDF export.
export { formatDuration } from '../../../shared/duration';

/** Computes dayNumber for each stop based on explicit user intent only:
 *   - Stop's type === 'overnight'  → next stop starts a new day
 *   - Stop's forceDayStart === true → this stop starts a new day
 *   - First stop is always Day 1
 *
 * No auto-split by km. `maxKmPerDay` is a *warning threshold* now (see
 * dayExceedsMaxKm) — the user controls day boundaries explicitly via
 * overnight markers and drag-and-drop. This avoids the jarring "stops
 * jump around" behavior when reordering or adding mid-leg fuel stops.
 *
 * Migration for trips created under the old auto-split rule lives in
 * stampImplicitDayBoundaries: it runs once at hydration and bakes the
 * old km-overflow boundaries into forceDayStart so day numbers stay
 * stable across the rule change.
 *
 * Pure: returns a new array, doesn't mutate input. */
export function applyDays(stops: Stop[], _maxKm: number): Stop[] {
  if (stops.length === 0) return stops;
  const result: Stop[] = [];
  let day = 1;
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    if (i === 0) {
      result.push({ ...stop, dayNumber: 1 });
      continue;
    }
    const prev = stops[i - 1];
    const forced = stop.forceDayStart === true;
    if (prev.type === 'overnight') {
      // Multi-night stays (issue #114): 3 nights at a stop consume 3 day
      // numbers, so the next leg starts on the following calendar day.
      day += Math.max(1, Math.round(prev.nights || 1));
    } else if (forced) {
      day++;
    }
    result.push({ ...stop, dayNumber: day });
  }
  return result;
}


/** Format a day's calendar date relative to a trip's start date.
 * Returns "" if startDate is unset or invalid. */
export function formatDayDate(dayNum: number, startDate: string | null | undefined): string {
  if (!startDate) return '';
  const d = new Date(startDate + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + (dayNum - 1));
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday} · ${month} ${d.getDate()}`;
}

export type DayGroup = {
  day: number;
  stops: { stop: Stop; index: number }[];
  km: number;
  durationSeconds: number;
};

export function groupByDay(stops: Stop[]): DayGroup[] {
  const groups = new Map<number, DayGroup>();
  stops.forEach((stop, index) => {
    const day = stop.dayNumber || 1;
    let g = groups.get(day);
    if (!g) {
      g = { day, stops: [], km: 0, durationSeconds: 0 };
      groups.set(day, g);
    }
    g.stops.push({ stop, index });
    g.km += stop.kmFromPrevious || 0;
    g.durationSeconds += stop.durationSecondsFromPrevious || 0;
  });
  return [...groups.values()].sort((a, b) => a.day - b.day);
}

export function tripTotals(stops: Stop[]): {
  totalKm: number;
  totalDays: number;
  totalDurationSeconds: number;
} {
  const totalKm = stops.reduce((s, x) => s + (x.kmFromPrevious || 0), 0);
  const totalDays = stops.length === 0 ? 0 : Math.max(...stops.map((s) => s.dayNumber || 1));
  const totalDurationSeconds = stops.reduce((s, x) => s + (x.durationSecondsFromPrevious || 0), 0);
  return { totalKm, totalDays, totalDurationSeconds };
}

/** Clamp the user-dragged map-strip height to (min, 70% of viewport).
 * Pure helper so the resize bounds are testable independently of the
 * pointer-event mechanics in Builder.tsx. */
export function clampMapStripHeight(
  desired: number,
  viewportHeight: number,
  options: { min?: number; maxRatio?: number } = {},
): number {
  const min = options.min ?? 200;
  const maxRatio = options.maxRatio ?? 0.7;
  const max = Math.max(min, Math.round(viewportHeight * maxRatio));
  if (!Number.isFinite(desired)) return min;
  return Math.max(min, Math.min(max, desired));
}

/** Distinct ISO country codes appearing in the trip's stops, in the order
 * they're first visited. Powers the auto-populated per-country fuel
 * override rows (issue #57). Stops without a countryCode are skipped.
 * Pure: derives entirely from the input list, no side effects. */
export function tripCountriesFromStops(stops: readonly Stop[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of stops) {
    const cc = (s.countryCode || '').trim().toUpperCase();
    if (!cc) continue;
    if (seen.has(cc)) continue;
    seen.add(cc);
    out.push(cc);
  }
  return out;
}

/** Compile the Builder's free-form override drafts (string prices) into the
 * numeric shape the server stores. Filters out rows that aren't ready to
 * persist — issue #57 AC4: empty/zero/invalid rows are dropped, NOT sent.
 * Pure. Mirrors what fuelBreakdownForLegs would skip at compute time, so
 * what the UI doesn't dim is what the server doesn't see. */
export function compileFuelOverrides(
  drafts: ReadonlyArray<{ countryCode: string; price: string; currency: string }>,
): { countryCode: string; price: number; currency: string }[] {
  return drafts
    .map((d) => ({ countryCode: d.countryCode, price: parseFloat(d.price), currency: d.currency }))
    .filter((o) => !!o.countryCode && Number.isFinite(o.price) && o.price > 0 && !!o.currency);
}
