import { useState } from 'react';
import { dayColor, formatDayDate, formatDuration } from '../../lib/compute';
import { longestLegOverRange } from '../../lib/fuel-stops';
import type { DayGroup } from '../../lib/compute';
import type { PinCategory, Stop, StopRouteMode } from '../../lib/types';
import type { FuelTimeline } from '../../lib/fuel-timeline';
import { FuelRemainingBadge } from '../FuelRemainingBadge';
import { StopRow } from './StopRow';
import { CategoryMenuButton } from './CategoryMenuButton';

type Props = {
  group: DayGroup;
  startDate: string | null | undefined;
  fuelCost?: string | null;
  fuelVolume?: string | null;
  /** Partial fuel-config state (one of price/consumption set, not both).
   * When true the column header swaps the cost text for a nudge chip
   * that opens the trip-details modal. See issue #59. */
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
  /** User picked a POI category from the per-day Find menu (issue #72).
   * Builder routes to NearbyFinder with the right anchor for the category. */
  onPickCategory?: (category: PinCategory) => void;
  /** True when the day has no within-day leg to anchor a fuel search to
   * (single-stop day). Disables the Fuel menu entry without hiding the
   * whole Find menu — other categories anchor to the first stop and
   * stay available. */
  fuelDisabled?: boolean;
  tankRangeKm?: number;
  /** Trip's max-km-per-day target. Drives the "Long day" warning chip.
   * Optional — defaults to 800 when unset. */
  maxKmPerDay?: number;
  fuelTimeline?: FuelTimeline;
  autoFuelWarningKm?: number;
  onOpenManualPicker?: () => void;
};

export function DayColumn(p: Props) {
  const { group: g } = p;
  const [over, setOver] = useState(false);
  const color = dayColor(g.day);
  const date = formatDayDate(g.day, p.startDate);
  const aaCount = g.stops.length;
  const longLegKm = longestLegOverRange(g, p.tankRangeKm);
  const dayMaxKm = p.maxKmPerDay && p.maxKmPerDay > 0 ? p.maxKmPerDay : 800;
  const showKmWarning = g.km > dayMaxKm;

  let aaCls: string;
  let aaLabel: string;
  if (aaCount > 10) {
    aaCls = 'bg-[rgba(214,90,63,0.18)] border border-[rgba(214,90,63,0.5)] text-[#ec8e74]';
    aaLabel = `${aaCount}/10`;
  } else if (aaCount >= 9) {
    aaCls = 'bg-[rgba(212,164,74,0.16)] border border-[rgba(212,164,74,0.4)] text-[#e0b86d]';
    aaLabel = `${aaCount}/10`;
  } else {
    aaCls = 'bg-[rgba(122,154,114,0.16)] border border-[rgba(122,154,114,0.4)] text-[#9bbf91]';
    aaLabel = `${aaCount}/10`;
  }

  return (
    <article
      id={`day-col-${g.day}`}
      data-day={g.day}
      data-testid="day-column"
      className="relative flex flex-col bg-canvas border border-line rounded-lg overflow-hidden w-[340px] shrink-0 shadow-[0_2px_18px_-12px_rgba(0,0,0,0.25)]"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      {/* Sticky inner header — pins to top of the column when its
          internal stop list scrolls. The whole header (date + meta +
          chips) lives here so the user always sees which day they're
          editing. */}
      <header className="sticky top-0 z-10 bg-canvas border-b border-line px-3.5 pt-3 pb-2.5">
        <div
          className={`relative ${over ? 'after:absolute after:inset-x-1 after:-bottom-1 after:h-[3px] after:bg-accent after:rounded-sm after:shadow-[0_0_14px_rgba(231,111,81,0.7)]' : ''}`}
          onDragOver={(ev) => {
            if (!p.onDropAtDayStart) return;
            if (!ev.dataTransfer.types.includes('text/plain')) return;
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
            if (!over) setOver(true);
          }}
          onDragLeave={(ev) => {
            if (!p.onDropAtDayStart) return;
            const related = ev.relatedTarget as Node | null;
            if (related && (ev.currentTarget as HTMLDivElement).contains(related)) return;
            setOver(false);
          }}
          onDrop={(ev) => {
            if (!p.onDropAtDayStart) return;
            ev.preventDefault();
            setOver(false);
            p.onDropAtDayStart(g.day);
          }}
        >
          <div className="flex items-baseline gap-2.5">
            <span
              className="font-mono text-[10px] tracking-[0.22em] uppercase font-medium"
              style={{ color }}
            >
              Day {g.day}
            </span>
            {date && (
              <span className="font-serif italic text-[13px] text-paper-dim">{date}</span>
            )}
          </div>
          <div className="mt-1 font-mono text-[10px] tracking-[0.14em] uppercase text-paper-dim">
            <span className="text-paper font-medium">{g.km}</span> km
            {g.durationSeconds > 0 && <> · {formatDuration(g.durationSeconds)}</>}
            {p.fuelCost && (
              <>
                {' · '}
                <span className="text-paper font-medium tracking-normal normal-case">{p.fuelCost}</span>
              </>
            )}
            {p.fuelVolume && (
              <>
                {' · '}
                <span className="text-paper-dim tracking-normal normal-case">{p.fuelVolume}</span>
              </>
            )}
            {p.fuelConfigPartial && !p.fuelCost && (
              <>
                {' · '}
                <button
                  type="button"
                  onClick={p.onConfigureFuel}
                  data-testid="fuel-config-nudge"
                  className="inline-flex items-baseline gap-1 text-accent hover:text-paper tracking-normal normal-case font-sans text-[11px] underline decoration-dotted underline-offset-2 transition-colors"
                >
                  <span aria-hidden>⛽</span>
                  Set fuel
                </button>
              </>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span
              title={`Android Auto: ${aaCount}/10 stops`}
              className={`inline-flex items-center gap-1 px-2 py-[2px] rounded-full font-mono text-[9px] tracking-[0.12em] uppercase font-medium ${aaCls}`}
            >
              <span className="text-[10px]">🚗</span>
              {aaLabel}
            </span>
            {showKmWarning && (
              <span
                title={`Long day — ${g.km} km over ${dayMaxKm} limit`}
                className="font-mono text-[9px] tracking-[0.12em] uppercase text-[#ec8e74] px-1.5 py-[2px] rounded border border-dashed border-[rgba(214,90,63,0.5)]"
              >
                Long day
              </span>
            )}
            {longLegKm > 0 && (
              <span
                title="A single leg in this day exceeds your tank range — consider adding a fuel stop."
                className="font-mono text-[9px] tracking-[0.12em] uppercase text-[#e0b86d] px-1.5 py-[2px] rounded border border-dashed border-[rgba(212,164,74,0.5)] inline-flex items-center gap-1"
              >
                <span aria-hidden>⛽</span>
                {longLegKm}km
              </span>
            )}
            {p.fuelTimeline && p.tankRangeKm && (
              <FuelRemainingBadge
                timeline={p.fuelTimeline}
                lastStopIndex={g.stops[g.stops.length - 1].index}
                tankRangeKm={p.tankRangeKm}
              />
            )}
            {p.autoFuelWarningKm != null && (
              <button
                type="button"
                onClick={p.onOpenManualPicker}
                className="inline-flex items-center gap-1 px-2 py-[3px] rounded font-mono text-[9px] tracking-[0.12em] uppercase text-red-400 hover:text-paper hover:bg-accent-soft border border-red-400/30"
                title="No fuel station found within 5 km of the route — click to widen the search."
              >
                ⚠ No station within 5 km — add manually
              </button>
            )}
            {p.onPickCategory && (
              <div className="ml-auto" data-day={g.day}>
                <CategoryMenuButton
                  disabledCategories={p.fuelDisabled ? ['fuel'] : []}
                  onPick={p.onPickCategory}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Stop list — flows vertically; the column's own overflow lets
          the sticky header above stay pinned while the body scrolls. */}
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-3 flex flex-col gap-2">
        {g.stops.map(({ stop, index }) => (
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
        ))}
      </div>
    </article>
  );
}
