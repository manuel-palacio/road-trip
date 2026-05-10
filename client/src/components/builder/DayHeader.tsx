import { formatDayDate, formatDuration } from '../../lib/compute';

type Props = {
  day: number;
  stopCount: number;
  km: number;
  durationSeconds: number;
  startDate: string | null | undefined;
  isFirst: boolean;
};

export function DayHeader({ day, stopCount, km, durationSeconds, startDate, isFirst }: Props) {
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
  const showKmWarning = km > 800;

  return (
    <div className={`px-1 py-2.5 ${isFirst ? '' : 'pt-3.5 mt-1 border-t border-dashed border-line-strong'}`}>
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper font-medium">
          Day {day}
        </span>
        {date && (
          <span className="font-serif italic text-[13px] text-paper-dim">{date}</span>
        )}
        <span className="flex-1" />
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-paper-dim">
          <span className="text-paper font-medium">{km}</span> km
          {durationSeconds > 0 && <> · {formatDuration(durationSeconds)}</>}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[9.5px] tracking-[0.14em] uppercase font-medium ${aaCls}`}>
          <span className="text-[11px]">🚗</span>
          {aaLabel}
        </span>
        {showKmWarning && (
          <span className="font-mono text-[9.5px] tracking-[0.14em] uppercase text-[#ec8e74] px-2 py-[3px] rounded border border-dashed border-[rgba(214,90,63,0.5)]">
            Over 800 km · long day
          </span>
        )}
      </div>
    </div>
  );
}
