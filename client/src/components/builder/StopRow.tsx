import { flagEmoji } from '../../lib/flags';
import { dayColor } from '../../lib/compute';
import { getStopRoutingFailed } from '../../hooks/useRouteSegments';
import type { Stop } from '../../lib/types';

type Props = {
  stop: Stop;
  index: number;
  onChangeType: (id: string, type: Stop['type']) => void;
  onRemove: (id: string) => void;
};

const TYPE_OPTIONS: { value: Stop['type']; label: string }[] = [
  { value: 'start', label: 'Start' },
  { value: 'overnight', label: 'Overnight' },
  { value: 'waypoint', label: 'Waypoint' },
  { value: 'destination', label: 'Destination' },
];

export function StopRow({ stop, index, onChangeType, onRemove }: Props) {
  const flag = flagEmoji(stop.countryCode);
  const accentBorder = {
    start: 'border-l-accent',
    destination: 'border-l-paper',
    waypoint: 'border-l-paper-muted',
    overnight: 'border-l-line',
  }[stop.type];
  const color = dayColor(stop.dayNumber);
  const routingFailed = getStopRoutingFailed(stop);

  return (
    <div
      className={`relative flex items-start gap-3 pl-3.5 pr-7 py-3 bg-canvas border border-line border-l-2 ${accentBorder} rounded-md transition-colors hover:border-line-strong`}
      data-stop-id={stop.id}
    >
      <span
        className="font-mono text-paper-muted text-[13px] cursor-grab pt-0.5 select-none"
        aria-hidden
        title="Drag to reorder (slice 18e)"
      >
        ⠿
      </span>
      <div
        className="w-[22px] h-[22px] font-mono text-[11px] font-semibold rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: color, color: '#0d0e11' }}
      >
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] text-paper [overflow-wrap:anywhere]">{stop.label || stop.name}</span>
          {flag && <span className="text-[14px] leading-none">{flag}</span>}
        </div>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <select
            value={stop.type}
            onChange={(e) => onChangeType(stop.id, e.target.value as Stop['type'])}
            className="bg-transparent border border-line rounded text-paper-dim font-mono text-[9.5px] tracking-[0.18em] uppercase px-1.5 py-[3px] pr-[18px] appearance-none cursor-pointer hover:border-paper-dim hover:text-paper focus:outline-none focus:border-accent"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'><path fill='%239b9080' d='M0 0l4 5 4-5z'/></svg>\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 6px center',
            }}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {index > 0 && routingFailed && (
            <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-accent">no route</span>
          )}
          {index > 0 && !routingFailed && stop.kmFromPrevious ? (
            <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-paper-dim">
              <span className="text-paper-muted mr-1">↗</span>
              <span className="text-paper font-medium mr-0.5">{stop.kmFromPrevious}</span>km
              {stop.durationFromPrevious ? <span> · {stop.durationFromPrevious}</span> : null}
            </span>
          ) : null}

          <span
            className="px-2 py-[3px] rounded-full font-mono text-[9.5px] tracking-[0.16em] uppercase font-medium whitespace-nowrap"
            style={{ backgroundColor: color, color: '#0d0e11' }}
          >
            Day {stop.dayNumber || 1}
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-label="Remove stop"
        onClick={() => onRemove(stop.id)}
        className="absolute top-1.5 right-1.5 w-[22px] h-[22px] bg-transparent border-0 text-paper-muted text-[16px] rounded flex items-center justify-center cursor-pointer hover:text-accent hover:bg-accent-soft"
      >
        ×
      </button>
    </div>
  );
}
