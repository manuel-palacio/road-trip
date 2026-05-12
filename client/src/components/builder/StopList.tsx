import { Fragment } from 'react';
import { groupByDay } from '../../lib/compute';
import type { Stop, StopRouteMode } from '../../lib/types';
import { DayHeader } from './DayHeader';
import { StopRow } from './StopRow';

type Props = {
  stops: Stop[];
  startDate: string | null | undefined;
  fuelCostFor?: (stops: Stop[]) => string | null;
  insertIndex?: number | null;
  onInsertAt?: (index: number) => void;
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
            onDropAtStart={p.onDropAtDayStart && gi > 0 ? () => p.onDropAtDayStart!(g.day) : undefined}
          />
          {g.stops.map(({ stop, index }, rowIdxInDay) => (
            <Fragment key={stop.id}>
              {/* "+ insert" affordance: render BEFORE every stop except the very
                  first one of the trip (the start). Insertion index in the flat
                  stops array is this stop's index. Across day boundaries the
                  DayHeader sits between, so we still need a button here so the
                  insert chip can land "between A (last of day N) and B (first
                  of day N+1)" exactly. */}
              {p.onInsertAt && (gi > 0 || rowIdxInDay > 0) && (
                <InsertHere active={p.insertIndex === index} onClick={() => p.onInsertAt!(index)} />
              )}
              <StopRow
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
            </Fragment>
          ))}
        </Fragment>
      ))}
      {/* Trailing "+ insert" so the user can target "after the last stop"
          explicitly (otherwise the main search box appends anyway). */}
      {p.onInsertAt && (
        <InsertHere
          active={p.insertIndex === p.stops.length}
          onClick={() => p.onInsertAt!(p.stops.length)}
        />
      )}
    </div>
  );
}

function InsertHere({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Insert a stop here"
      title="Insert a stop here"
      className={`group relative h-3 -my-0.5 flex items-center justify-center transition-opacity ${
        active ? 'opacity-100' : 'opacity-30 hover:opacity-100 focus-visible:opacity-100'
      }`}
    >
      <span
        className={`absolute inset-x-2 h-px transition-colors ${
          active ? 'bg-accent' : 'bg-line group-hover:bg-paper-dim'
        }`}
      />
      <span
        className={`relative bg-canvas px-1.5 font-mono text-[10px] tracking-[0.16em] uppercase rounded transition-colors ${
          active ? 'text-accent border border-accent' : 'text-paper-muted group-hover:text-accent'
        }`}
      >
        + insert
      </span>
    </button>
  );
}
