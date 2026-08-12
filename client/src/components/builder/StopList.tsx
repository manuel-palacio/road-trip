import { Fragment } from 'react';
import { groupByDay } from '../../lib/compute';
import { longestLegOverRange } from '../../lib/fuel-stops';
import { dayNeedsOvernightSuggestion } from '../../lib/overnight-suggest';
import type { PinCategory, Stop, StopRouteMode } from '../../lib/types';
import { DayHeader } from './DayHeader';
import { StopRow } from './StopRow';

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
  onFavoriteAdd?: (stop: Stop) => void;
  onFavoriteRemove?: (favoriteId: string) => void;
  onDragStart: (id: string, ev: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (id: string, ev: React.DragEvent) => void;
  onDragLeave: (ev: React.DragEvent) => void;
  onDrop: (id: string, ev: React.DragEvent) => void;
  onDropAtDayStart?: (day: number) => void;
  // When set, each DayHeader gets a "+ Find ▾" menu. Builder receives
  // the (day, category) pick and routes it to NearbyFinder with the
  // right anchor. `canFindFuelForDay` continues to gate the Fuel entry
  // — single-stop days have no within-day leg, so Fuel disables there
  // but the other categories stay available (they anchor to the first
  // stop, not to a leg).
  onFindCategoryForDay?: (day: number, category: PinCategory) => void;
  canFindFuelForDay?: (day: number) => boolean;
  /** Tank range used to flag days with a long single leg. Defaults to 500
   * inside longestLegOverRange when undefined. */
  tankRangeKm?: number;
  /** Trip's max-km-per-day target. Forwarded to each DayHeader for the
   * "Long day" warning chip. Defaults to 800 in DayHeader if absent. */
  maxKmPerDay?: number;
  /** Per-stop arrival/departure times, indexed by global stop index (issue
   * #114). undefined = scheduling off. */
  schedule?: ({ arrival: string | null; departure: string | null } | null)[];
  onChangeStayMinutes?: (id: string, minutes: number) => void;
  onChangeNights?: (id: string, nights: number) => void;
  /** Drive-time warning threshold forwarded to DayHeader. */
  maxDriveMinutesPerDay?: number | null;
  /** Opens the hotel NearbyFinder at the given day's end (issue #115).
   * Builder passes it only when the trip's suggestHotels toggle is on;
   * the chip renders only for days that end without a sleepable stop. */
  onSuggestHotelForDay?: (day: number) => void;
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
            stopCount={g.stops.length}
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
            maxDriveMinutesPerDay={p.maxDriveMinutesPerDay}
            onDropAtStart={p.onDropAtDayStart && gi > 0 ? () => p.onDropAtDayStart!(g.day) : undefined}
            onPickCategory={p.onFindCategoryForDay ? (cat) => p.onFindCategoryForDay!(g.day, cat) : undefined}
            fuelDisabled={p.canFindFuelForDay ? !p.canFindFuelForDay(g.day) : false}
            onSuggestHotel={
              p.onSuggestHotelForDay && dayNeedsOvernightSuggestion(g)
                ? () => p.onSuggestHotelForDay!(g.day)
                : undefined
            }
          />
          {g.stops.map(({ stop, index }) => (
            <StopRow
              key={stop.id}
              stop={stop}
              index={index}
              isFirst={index === 0}
              schedule={p.schedule ? p.schedule[index] : undefined}
              onChangeStayMinutes={p.onChangeStayMinutes}
              onChangeNights={p.onChangeNights}
              onChangeType={p.onChangeType}
              onChangeRouteMode={p.onChangeRouteMode}
              onRemove={p.onRemove}
              onSetForceDayStart={p.onSetForceDayStart}
              onAddHighlight={p.onAddHighlight}
              onRemoveHighlight={p.onRemoveHighlight}
              onDemote={p.onDemote}
              demotingStopId={p.demotingStopId}
              onFavoriteAdd={p.onFavoriteAdd}
              onFavoriteRemove={p.onFavoriteRemove}
              onDragStart={p.onDragStart}
              onDragEnd={p.onDragEnd}
              onDragOver={p.onDragOver}
              onDragLeave={p.onDragLeave}
              onDrop={p.onDrop}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
