import { useState } from 'react';
import { formatDayDate, formatDuration } from '../../lib/compute';
import type { PinCategory } from '../../lib/types';
import { CategoryMenuButton } from './CategoryMenuButton';

type Props = {
  day: number;
  stopCount: number;
  km: number;
  durationSeconds: number;
  startDate: string | null | undefined;
  isFirst: boolean;
  fuelCost?: string | null;
  fuelVolume?: string | null;
  /** When true, the user has configured ONE of consumption/price but not the
   * other. The header renders a tiny nudge chip in place of the cost so the
   * user notices the half-set state and can finish it. Mutually exclusive
   * with a non-null fuelCost in practice (ready state). */
  fuelConfigPartial?: boolean;
  /** Click handler for the nudge chip — typically opens the trip-details
   * modal in Builder or navigates back to /builder in Viewer. */
  onConfigureFuel?: () => void;
  /** Longest single leg in the day that exceeds the trip's tank range, in km.
   * 0 means no leg crosses the threshold — chip is hidden. */
  longLegKm?: number;
  /** Trip's max-km-per-day target. Drives the "Long day" warning chip
   * when this day's total km exceeds it. Optional — defaults to 800
   * for trips that haven't set one. */
  maxKmPerDay?: number;
  // When set, the header becomes a drop target — a drop inserts the
  // dragged stop just before the first stop currently in this day.
  onDropAtStart?: () => void;
  // When set, renders the "+ Find ▾" menu that opens NearbyFinder for
  // a chosen POI category. Set only by the Builder; viewer/handoff omit.
  onPickCategory?: (category: PinCategory) => void;
  /** True when the day has no within-day leg to anchor a fuel search to.
   * Disables the Fuel entry in the menu without hiding the whole menu. */
  fuelDisabled?: boolean;
};

export function DayHeader(p: Props) {
  const { day, stopCount, km, durationSeconds, startDate, isFirst, fuelCost, fuelVolume, fuelConfigPartial, onConfigureFuel, longLegKm = 0, maxKmPerDay, onDropAtStart, onPickCategory, fuelDisabled } = p;
  const dayMaxKm = maxKmPerDay && maxKmPerDay > 0 ? maxKmPerDay : 800;
  const [over, setOver] = useState(false);
  const date = formatDayDate(day, startDate);
  let aaCls: string;
  let aaLabel: string;
  if (stopCount > 10) {
    aaCls = 'bg-[rgba(214,90,63,0.18)] border border-[rgba(214,90,63,0.5)] text-[#ec8e74]';
    aaLabel = `Android Auto: Too many stops (${stopCount}/10) · split this day`;
  } else if (stopCount >= 9) {
    aaCls = 'bg-[rgba(212,164,74,0.16)] border border-[rgba(212,164,74,0.4)] text-[#e0b86d]';
    aaLabel = `Android Auto: At limit (${stopCount}/10 stops)`;
  } else {
    aaCls = 'bg-[rgba(122,154,114,0.16)] border border-[rgba(122,154,114,0.4)] text-[#9bbf91]';
    aaLabel = `Android Auto: Ready (${stopCount}/10 stops)`;
  }
  const showKmWarning = km > dayMaxKm;

  return (
    <div
      className={`relative px-1 py-2.5 ${isFirst ? '' : 'pt-3.5 mt-1 border-t border-dashed border-line-strong'}`}
      onDragOver={(ev) => {
        if (!onDropAtStart) return;
        if (!ev.dataTransfer.types.includes('text/plain')) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        if (!over) setOver(true);
      }}
      onDragLeave={(ev) => {
        if (!onDropAtStart) return;
        const related = ev.relatedTarget as Node | null;
        if (related && (ev.currentTarget as HTMLDivElement).contains(related)) return;
        setOver(false);
      }}
      onDrop={(ev) => {
        if (!onDropAtStart) return;
        ev.preventDefault();
        setOver(false);
        onDropAtStart();
      }}
    >
      {over && (
        <div className="absolute -top-[3px] left-2 right-2 h-[3px] bg-accent rounded-sm pointer-events-none z-10 shadow-[0_0_14px_rgba(231,111,81,0.7)]" />
      )}
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper font-medium">
          Day {day}
        </span>
        {date && (
          <span className="font-serif italic text-[13px] text-paper-dim">{date}</span>
        )}
      </div>
      <div className="mt-1 font-mono text-[10px] tracking-[0.14em] uppercase text-paper-dim">
        <span className="text-paper font-medium">{km}</span> km
        {durationSeconds > 0 && <> · {formatDuration(durationSeconds)}</>}
        {fuelCost && (
          <>
            {' · '}
            <span className="text-paper font-medium tracking-normal normal-case">{fuelCost}</span>
          </>
        )}
        {fuelVolume && (
          <>
            {' · '}
            <span className="text-paper-dim tracking-normal normal-case">{fuelVolume}</span>
          </>
        )}
        {fuelConfigPartial && !fuelCost && (
          <>
            {' · '}
            <button
              type="button"
              onClick={onConfigureFuel}
              data-testid="fuel-config-nudge"
              className="inline-flex items-baseline gap-1 text-accent hover:text-paper tracking-normal normal-case font-sans text-[11px] underline decoration-dotted underline-offset-2 transition-colors"
            >
              <span aria-hidden>⛽</span>
              Set fuel price + consumption
            </button>
          </>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[9.5px] tracking-[0.14em] uppercase font-medium ${aaCls}`}>
          <span className="text-[11px]">🚗</span>
          {aaLabel}
        </span>
        {showKmWarning && (
          <span className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-[#ec8e74] px-2 py-[3px] rounded border border-dashed border-[rgba(214,90,63,0.5)]">
            Long day · {km} km over {dayMaxKm} limit
          </span>
        )}
        {longLegKm > 0 && (
          <span
            title="A single leg in this day exceeds your tank range — consider adding a fuel stop."
            className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-[#e0b86d] px-2 py-[3px] rounded border border-dashed border-[rgba(212,164,74,0.5)] inline-flex items-center gap-1"
          >
            <span aria-hidden>⛽</span>
            {longLegKm} km without refuel
          </span>
        )}
        {onPickCategory && (
          <div className="ml-auto">
            <CategoryMenuButton
              disabledCategories={fuelDisabled ? ['fuel'] : []}
              onPick={onPickCategory}
            />
          </div>
        )}
      </div>
    </div>
  );
}
