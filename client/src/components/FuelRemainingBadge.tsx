import type { FuelTimeline } from '../lib/fuel-timeline';

type Props = {
  timeline: FuelTimeline;
  lastStopIndex: number;
  tankRangeKm: number;
};

/** Small chip showing cumulative km since the last refill event. Used in
 * Viewer DayCard, Builder DayColumn, and Share (read-only) — identical math
 * everywhere, sourced from computeFuelTimeline at the parent screen. */
export function FuelRemainingBadge({ timeline, lastStopIndex, tankRangeKm }: Props) {
  if (!(tankRangeKm > 0)) return null;
  const km = timeline.cumulativeSinceLastFill[lastStopIndex] ?? 0;
  const pct = Math.round((km / tankRangeKm) * 100);
  const color =
    pct >= 90 ? 'text-red-400' :
    pct >= 70 ? 'text-amber-400' :
    'text-emerald-400';
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[9.5px] tracking-[0.16em] uppercase ${color}`}
      title={`${km} of ${tankRangeKm} km since last fill-up`}
    >
      <span aria-hidden>⛽</span>
      <span>{km}/{tankRangeKm} km · {pct}%</span>
    </span>
  );
}
