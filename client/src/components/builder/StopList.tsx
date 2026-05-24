import { Fragment } from 'react';
import { groupByDay, isFuelStop } from '../../lib/compute';
import { longestLegOverRange } from '../../lib/fuel-stops';
import type { Stop, StopRouteMode } from '../../lib/types';
import { DayHeader } from './DayHeader';
import { StopRow } from './StopRow';
import { FuelStopChip } from '../FuelStopChip';

type Props = {
  stops: Stop[];
  startDate: string | null | undefined;
  fuelCostFor?: (stops: Stop[]) => string | null;
  fuelVolumeFor?: (stops: Stop[]) => string | null;
  /** Forwards to each DayHeader's nudge chip. See issue #59. */
  fuelConfigPartial?: boolean;
  onConfigureFuel?: () => void;
  onChangeType: (id: string, type: Stop['type']) => void;
  onChangeRouteMode?: (id: string, mode: StopRouteMode) => void;
  onRemove: (id: string) => void;
  onSetForceDayStart: (id: string, value: boolean) => void;
  onAddHighlight: (id: string, text: string) => void;
  onRemoveHighlight: (id: string, text: string) => void;
  onDemote?: (stop: Stop) => void;
  demotingStopId?: string | null;
  onDragStart: (id: string, ev: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (id: string, ev: React.DragEvent) => void;
  onDragLeave: (ev: React.DragEvent) => void;
  onDrop: (id: string, ev: React.DragEvent) => void;
  onDropAtDayStart?: (day: number) => void;
  // When set, each DayHeader gets a "+ Fuel stop" button. Predicate
  // (canFindFuelForDay) hides the button on days with no targetable
  // leg (single-stop days, unrouted legs, etc.).
  onFindFuelForDay?: (day: number) => void;
  canFindFuelForDay?: (day: number) => boolean;
  /** Tank range used to flag days with a long single leg. Defaults to 500
   * inside longestLegOverRange when undefined. */
  tankRangeKm?: number;
  /** Trip's max-km-per-day target. Forwarded to each DayHeader for the
   * "Long day" warning chip. Defaults to 800 in DayHeader if absent. */
  maxKmPerDay?: number;
};

export function StopList(p: Props) {
  if (p.stops.length === 0) {
    return (
      <p className="px-6 py-5 text-center font-serif italic text-[14px] text-paper-muted leading-[1.5]">
        Search above to add your first stop.
      </p>
    );
  }
  const groups = groupByDay(p.stops);
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g, gi) => (
        <Fragment key={g.day}>
          <DayHeader
            day={g.day}
            stopCount={g.stops.filter((x) => !isFuelStop(x.stop)).length}
            km={g.km}
            durationSeconds={g.durationSeconds}
            startDate={p.startDate}
            isFirst={gi === 0}
            fuelCost={p.fuelCostFor ? p.fuelCostFor(g.stops.map((x) => x.stop)) : null}
            fuelVolume={p.fuelVolumeFor ? p.fuelVolumeFor(g.stops.map((x) => x.stop)) : null}
            fuelConfigPartial={p.fuelConfigPartial}
            onConfigureFuel={p.onConfigureFuel}
            longLegKm={longestLegOverRange(g, p.tankRangeKm)}
            maxKmPerDay={p.maxKmPerDay}
            onDropAtStart={p.onDropAtDayStart && gi > 0 ? () => p.onDropAtDayStart!(g.day) : undefined}
            onFindFuel={
              p.onFindFuelForDay && (!p.canFindFuelForDay || p.canFindFuelForDay(g.day))
                ? () => p.onFindFuelForDay!(g.day)
                : undefined
            }
          />
          {g.stops.map(({ stop, index }) => (
            isFuelStop(stop) ? (
              <FuelStopChip key={stop.id} stop={stop} onRemove={() => p.onRemove(stop.id)} />
            ) : (
              <StopRow
                key={stop.id}
                stop={stop}
                index={index}
                isFirst={index === 0}
                onChangeType={p.onChangeType}
                onChangeRouteMode={p.onChangeRouteMode}
                onRemove={p.onRemove}
                onSetForceDayStart={p.onSetForceDayStart}
                onAddHighlight={p.onAddHighlight}
                onRemoveHighlight={p.onRemoveHighlight}
                onDemote={p.onDemote}
                demotingStopId={p.demotingStopId}
                onDragStart={p.onDragStart}
                onDragEnd={p.onDragEnd}
                onDragOver={p.onDragOver}
                onDragLeave={p.onDragLeave}
                onDrop={p.onDrop}
              />
            )
          ))}
        </Fragment>
      ))}
    </div>
  );
}
