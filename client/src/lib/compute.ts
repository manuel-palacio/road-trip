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
 * + category='fuel'). Used wherever fuel stops are visually compacted or
 * excluded from Android Auto stop counts. */
export function isFuelStop(s: Stop): boolean {
  return s.type === 'fuel' || (s.type === 'waypoint' && s.category === 'fuel');
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)}m`;
  return `~${hours.toFixed(1)}h`;
}

/** Computes dayNumber for each stop based on kmFromPrevious + max km/day + overnight markers
 * + per-stop forceDayStart flag. First stop is forced to Day 1. Fuel stops
 * are transparent to day planning: they never trigger a boundary themselves,
 * so a 600 km day with a refuel in the middle stays on one day.
 *
 * Special case for fuel-on-boundary-leg insertion: when a fuel stop
 * carries forceDayStart=true (set by onFuelStopSelected when the user
 * adds a fuel stop on a leg that spans a day boundary), the km-overflow
 * check is suppressed for the next non-fuel stop in that forced day.
 * Without this, a 780 km Hamburg→Reims leg split as NewFuel(400) +
 * Reims(380) would trip the maxKm check at Reims and push it into yet
 * another day — even though the original single leg sat in one day.
 *
 * Pure: returns a new array, doesn't mutate input. */
export function applyDays(stops: Stop[], maxKm: number): Stop[] {
  if (stops.length === 0) return stops;
  const result: Stop[] = [];
  let day = 1;
  let dayKm = 0;
  // True while inside a day opened by a fuel stop's forceDayStart. The
  // first non-fuel stop after that bypasses the km check (it's the
  // continuation of one intended drive). Reset once consumed, OR when
  // an explicit overnight / forceDayStart on a non-fuel stop opens a
  // fresh day.
  let softFuelDay = false;
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    if (i === 0) {
      dayKm = 0;
      result.push({ ...stop, dayNumber: 1 });
      continue;
    }
    const seg = stop.kmFromPrevious || 0;
    const prevOvernight = stops[i - 1].type === 'overnight';
    const forced = stop.forceDayStart === true;
    const isFuel = stop.type === 'fuel';
    const kmOverflow = !softFuelDay && !isFuel && dayKm + seg > maxKm;
    if (forced || prevOvernight || kmOverflow) {
      day++;
      dayKm = seg;
      // Only fuel-forced day starts opt into the soft window.
      // forceDayStart on a regular stop is a hard boundary that resets it.
      softFuelDay = forced && isFuel;
    } else {
      dayKm += seg;
      if (!isFuel) softFuelDay = false;
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
