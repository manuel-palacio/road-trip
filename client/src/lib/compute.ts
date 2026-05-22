import type { Stop } from './types';

// Fuel cost helpers live in shared/ so the PDF export endpoint can use the same
// implementation. Re-exported here so the existing `from '../lib/compute'`
// import surface keeps working for every screen and test.
export {
  estimateFuelCost,
  fuelBreakdownForLegs,
  legCost,
  formatCurrency,
  formatBreakdown,
} from '../../../shared/fuel';
export type { FuelBreakdown, LegCost } from '../../../shared/fuel';

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
 * Pure: returns a new array, doesn't mutate input. */
export function applyDays(stops: Stop[], maxKm: number): Stop[] {
  if (stops.length === 0) return stops;
  const result: Stop[] = [];
  let day = 1;
  let dayKm = 0;
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
    if (forced || prevOvernight || (!isFuel && dayKm + seg > maxKm)) {
      day++;
      dayKm = seg;
    } else {
      dayKm += seg;
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
