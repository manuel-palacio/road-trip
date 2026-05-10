import type { Stop } from './types';

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

/** Computes dayNumber for each stop based on kmFromPrevious + max km/day + overnight markers.
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
    if (prevOvernight || dayKm + seg > maxKm) {
      day++;
      dayKm = seg;
    } else {
      dayKm += seg;
    }
    result.push({ ...stop, dayNumber: day });
  }
  return result;
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
