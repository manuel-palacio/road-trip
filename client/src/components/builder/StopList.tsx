import { Fragment } from 'react';
import { groupByDay } from '../../lib/compute';
import type { Stop } from '../../lib/types';
import { DayHeader } from './DayHeader';
import { StopRow } from './StopRow';

type Props = {
  stops: Stop[];
  startDate: string | null | undefined;
  onChangeType: (id: string, type: Stop['type']) => void;
  onRemove: (id: string) => void;
  onSetForceDayStart: (id: string, value: boolean) => void;
  onAddHighlight: (id: string, text: string) => void;
  onRemoveHighlight: (id: string, text: string) => void;
  onDragStart: (id: string, ev: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (id: string, ev: React.DragEvent) => void;
  onDragLeave: (ev: React.DragEvent) => void;
  onDrop: (id: string, ev: React.DragEvent) => void;
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
          />
          {g.stops.map(({ stop, index }) => (
            <StopRow
              key={stop.id}
              stop={stop}
              index={index}
              isFirst={index === 0}
              onChangeType={p.onChangeType}
              onRemove={p.onRemove}
              onSetForceDayStart={p.onSetForceDayStart}
              onAddHighlight={p.onAddHighlight}
              onRemoveHighlight={p.onRemoveHighlight}
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
