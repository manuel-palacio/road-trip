import { useState } from 'react';
import { dayColor, formatDayDate, formatDuration } from '../../lib/compute';
import { flagEmoji } from '../../lib/flags';
import { aaStatus, buildDayMapsUrl } from '../../lib/maps-deep-link';
import type { DayGroup } from '../../lib/compute';

type Props = {
  group: DayGroup;
  startDate: string | null | undefined;
  visible: boolean;
  onToggleVisibility: () => void;
};

export function DayCard({ group, startDate, visible, onToggleVisibility }: Props) {
  const [expanded, setExpanded] = useState(true);

  const stopsOnly = group.stops.map((x) => x.stop);
  const date = formatDayDate(group.day, startDate);
  const status = aaStatus(group.stops.length);
  const url = buildDayMapsUrl(stopsOnly);
  const color = dayColor(group.day);

  const aaPalette = {
    ready: 'bg-[rgba(122,154,114,0.16)] border-[rgba(122,154,114,0.4)] text-[#9bbf91]',
    limit: 'bg-[rgba(212,164,74,0.16)] border-[rgba(212,164,74,0.4)] text-[#e0b86d]',
    over: 'bg-[rgba(214,90,63,0.18)] border-[rgba(214,90,63,0.5)] text-[#ec8e74]',
  }[status];
  const aaText = {
    ready: `Android Auto: Ready (${group.stops.length}/10 stops)`,
    limit: `Android Auto: At limit (${group.stops.length}/10 stops)`,
    over: `Android Auto: Too many stops (${group.stops.length}/10) · split this day`,
  }[status];

  return (
    <article
      className={`border border-line rounded-lg bg-surface transition-opacity ${
        visible ? '' : 'opacity-50'
      }`}
    >
      <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-3 cursor-pointer select-none" onClick={() => setExpanded((e) => !e)}>
        <span
          className="w-1.5 h-6 rounded-full shrink-0"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper font-medium">
          Day {group.day}
        </span>
        {date && <span className="font-serif italic text-[13px] text-paper-dim">{date}</span>}
        <span className="flex-1" />
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-paper-dim">
          <span className="text-paper font-medium">{group.km}</span> km
          {group.durationSeconds > 0 && <> · {formatDuration(group.durationSeconds)}</>}
        </span>
        <button
          type="button"
          aria-label={visible ? 'Hide this day on the map' : 'Show this day on the map'}
          title={visible ? 'Hide this day on the map' : 'Show this day on the map'}
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
          className={`ml-1 w-9 h-5 rounded-full relative transition-colors ${
            visible ? 'bg-accent' : 'bg-surface-2 border border-line-strong'
          }`}
        >
          <span
            className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-canvas transition-transform ${
              visible ? 'translate-x-[18px]' : 'translate-x-[2px]'
            }`}
          />
        </button>
      </header>

      <div className="px-4 pb-3 -mt-1">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[9.5px] tracking-[0.14em] uppercase font-medium border ${aaPalette}`}
        >
          <span className="text-[11px]">🚗</span>
          {aaText}
        </span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2.5">
          {stopsOnly.map((stop, i) => (
            <div key={stop.id} className="flex items-start gap-2.5">
              <div
                className="w-[20px] h-[20px] font-mono text-[10px] font-semibold rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ backgroundColor: color, color: '#0d0e11' }}
              >
                {group.stops[i].index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] text-paper [overflow-wrap:anywhere]">{stop.label || stop.name}</span>
                  {flagEmoji(stop.countryCode) && (
                    <span className="text-[13px] leading-none">{flagEmoji(stop.countryCode)}</span>
                  )}
                </div>
                {(stop.kmFromPrevious || stop.durationFromPrevious) && i > 0 && (
                  <div className="mt-0.5 font-mono text-[9.5px] tracking-[0.14em] uppercase text-paper-dim">
                    <span className="text-paper-muted mr-1">↗</span>
                    <span className="text-paper font-medium mr-0.5">{stop.kmFromPrevious || 0}</span>km
                    {stop.durationFromPrevious && <> · {stop.durationFromPrevious}</>}
                  </div>
                )}
                {stop.highlights && stop.highlights.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {stop.highlights.map((h) => (
                      <span
                        key={h}
                        className="px-2 py-[2px] bg-[rgba(243,236,222,0.06)] border border-line rounded-full text-[11px] text-paper"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center justify-center gap-2 bg-accent text-canvas rounded px-3.5 py-2 font-mono text-[10.5px] tracking-[0.14em] uppercase font-medium transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-[0_6px_22px_-6px_rgba(231,111,81,0.5)] active:translate-y-0"
            >
              <span>↗</span> Open this day in Google Maps
            </a>
          ) : (
            <button
              type="button"
              disabled
              title={status === 'over' ? 'Too many stops for one Maps route — split this day in the builder' : 'No stops to route'}
              className="mt-1 inline-flex items-center justify-center gap-2 bg-surface-2 text-paper-muted rounded px-3.5 py-2 font-mono text-[10.5px] tracking-[0.14em] uppercase font-medium cursor-not-allowed"
            >
              {status === 'over' ? 'Too many stops · split this day' : 'No route to open'}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
