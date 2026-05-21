import type { Stop } from '../lib/types';

type Props = {
  stop: Stop;
  /** When provided, renders a small × button to delete the fuel stop.
   * Omitted in read-only viewer/share contexts. */
  onRemove?: () => void;
};

/** Inline pit-stop chip for fuel stops — much smaller than a full StopRow
 * card. Fuel stops are auto-inserted by the gas-station picker, so they
 * don't surface the usual editor (type, highlights, accommodation). */
export function FuelStopChip({ stop, onRemove }: Props) {
  const km = stop.kmFromPrevious || 0;
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-[rgba(244,211,94,0.08)] border border-[rgba(244,211,94,0.25)]">
      <span
        aria-label="Fuel stop"
        className="inline-flex items-center justify-center w-[20px] h-[20px] rounded bg-[rgba(244,211,94,0.18)] border border-[rgba(244,211,94,0.5)] text-[12px] leading-none shrink-0"
      >
        <span aria-hidden>⛽</span>
      </span>
      <span className="flex-1 min-w-0 truncate text-[12px] text-paper-dim font-serif italic">
        {stop.label || stop.name}
      </span>
      {km > 0 && (
        <span className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-paper-muted shrink-0">
          +{km} km
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove fuel stop"
          title="Remove fuel stop"
          className="bg-transparent border border-line text-paper-muted w-5 h-5 rounded text-[12px] flex items-center justify-center shrink-0 hover:text-accent hover:border-accent transition-colors"
        >
          ×
        </button>
      )}
    </div>
  );
}
