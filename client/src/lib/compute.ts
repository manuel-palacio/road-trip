import type { FuelUnit, Stop } from './types';

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

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)}m`;
  return `~${hours.toFixed(1)}h`;
}

/** Computes dayNumber for each stop based on kmFromPrevious + max km/day + overnight markers
 * + per-stop forceDayStart flag. First stop is forced to Day 1.
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
    if (forced || prevOvernight || dayKm + seg > maxKm) {
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

/** Estimate fuel cost for a given distance + consumption + price.
 * Returns null when any input is missing/invalid (caller hides the chip).
 * MPG is converted to L/100km internally via 235.2146 / mpg. */
export function estimateFuelCost(
  km: number,
  consumption: number | undefined | null,
  unit: FuelUnit | undefined,
  pricePerUnit: number | undefined | null,
): number | null {
  if (!km || km < 0) return 0;
  if (consumption == null || !Number.isFinite(consumption) || consumption <= 0) return null;
  if (pricePerUnit == null || !Number.isFinite(pricePerUnit) || pricePerUnit <= 0) return null;
  if (unit === 'MPG') {
    // miles per US gallon → L/100km
    const lPer100 = 235.2146 / consumption;
    const litres = (km / 100) * lPer100;
    // price is per gallon when unit is MPG — convert litres back to gallons
    const gallons = litres / 3.785411784;
    return gallons * pricePerUnit;
  }
  // default: L/100km, price per litre
  const litres = (km / 100) * consumption;
  return litres * pricePerUnit;
}

/** Format a monetary amount using Intl.NumberFormat with the browser locale.
 * Falls back gracefully for invalid currency codes. */
export function formatCurrency(amount: number, currency: string | undefined): string {
  const code = (currency || 'EUR').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
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
