import type { FuelTimeline } from '../lib/fuel-timeline';
import { fuelRemaining } from '../lib/fuel-remaining';

type Props = {
  timeline: FuelTimeline;
  lastStopIndex: number;
  tankRangeKm: number;
};

/** Range left on the current tank at the end of a day. Reads like a fuel
 * gauge — counts down, never past full (issue #125). Used in Viewer
 * DayCard, Builder DayColumn and Share, all sourced from
 * computeFuelTimeline at the parent screen. */
export function FuelRemainingBadge({ timeline, lastStopIndex, tankRangeKm }: Props) {
  const km = timeline.cumulativeSinceLastFill[lastStopIndex] ?? 0;
  const fuel = fuelRemaining(km, tankRangeKm);
  if (!fuel) return null;

  const color =
    fuel.level === 'empty' ? 'text-danger' :
    fuel.level === 'low' ? 'text-warn' :
    'text-success';

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[9.5px] tracking-[0.16em] uppercase ${color}`}
      title={
        fuel.level === 'empty'
          ? `Out of range — ${km} km driven on a ${tankRangeKm} km tank. Add a fuel stop.`
          : `${fuel.remainingKm} km of range left (${km} km driven since the last fill-up)`
      }
    >
      <span aria-hidden>⛽</span>
      <span>
        {fuel.level === 'empty' ? 'Refuel needed' : `${fuel.remainingKm} km left · ${fuel.percent}%`}
      </span>
    </span>
  );
}
