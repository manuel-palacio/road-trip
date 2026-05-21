import { useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { dayColor, formatDayDate, formatDuration, isFuelStop } from '../../lib/compute';
import { flagEmoji } from '../../lib/flags';
import { aaStatus, buildDayMapsUrl } from '../../lib/maps-deep-link';
import { phoneShare } from '../../lib/phone-share';
import { accommodationLinks } from '../../lib/booking-links';
import type { DayGroup } from '../../lib/compute';
import type { StopRouteMode } from '../../lib/types';
import { FuelStopChip } from '../FuelStopChip';
import { QrModal } from '../QrModal';

const ROUTE_MODE_GLYPH: Record<StopRouteMode, { glyph: string; label: string }> = {
  fastest: { glyph: '⚡', label: 'Fastest leg' },
  scenic: { glyph: '🌲', label: 'Scenic leg (avoids highways)' },
  'no-tolls': { glyph: '🛣', label: 'No-tolls leg' },
  'scenic-no-tolls': { glyph: '🌲🛣', label: 'Scenic + no-tolls leg' },
};

type Props = {
  group: DayGroup;
  startDate: string | null | undefined;
  visible: boolean;
  onToggleVisibility: () => void;
  fuelCost?: string | null;
  bookingAffiliateId?: string | null;
  /** Longest single leg in the day that exceeds the trip's tank range, in km.
   * 0 (or omitted) hides the chip. */
  longLegKm?: number;
};

export function DayCard({ group, startDate, visible, onToggleVisibility, fuelCost, bookingAffiliateId, longLegKm = 0 }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [shareLabel, setShareLabel] = useState<string | null>(null);

  const stopsOnly = group.stops.map((x) => x.stop);
  // Fuel stops are pit-stop suggestions, not turn points — they don't count
  // toward the Android Auto 10-stop limit and don't appear in the Maps URL.
  const routableCount = stopsOnly.filter((s) => !isFuelStop(s)).length;
  const date = formatDayDate(group.day, startDate);
  const status = aaStatus(routableCount);
  const url = buildDayMapsUrl(stopsOnly);
  const color = dayColor(group.day);
  const dayLabel = `Day ${group.day}${date ? ` · ${date}` : ''}`;
  const routeBriefly = stopsOnly.length > 1
    ? `${stopsOnly[0].label || stopsOnly[0].name} → ${stopsOnly[stopsOnly.length - 1].label || stopsOnly[stopsOnly.length - 1].name}`
    : (stopsOnly[0]?.label || stopsOnly[0]?.name || '');

  async function onShareClick() {
    if (!url) return;
    const result = await phoneShare({
      url,
      title: dayLabel,
      text: routeBriefly ? `${dayLabel} — ${routeBriefly}` : dayLabel,
    });
    if (result.kind === 'shared' || result.kind === 'cancelled') return;
    setShareLabel(result.kind === 'copied' ? 'Link copied' : 'Could not share');
    setTimeout(() => setShareLabel(null), 1600);
  }

  const aaPalette = {
    ready: 'bg-[rgba(122,154,114,0.16)] border-[rgba(122,154,114,0.4)] text-[#9bbf91]',
    limit: 'bg-[rgba(212,164,74,0.16)] border-[rgba(212,164,74,0.4)] text-[#e0b86d]',
    over: 'bg-[rgba(214,90,63,0.18)] border-[rgba(214,90,63,0.5)] text-[#ec8e74]',
  }[status];
  const aaText = {
    ready: `Android Auto: Ready (${routableCount}/10 stops)`,
    limit: `Android Auto: At limit (${routableCount}/10 stops)`,
    over: `Android Auto: Too many stops (${routableCount}/10) · split this day`,
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
          {fuelCost && (
            <>
              {' · '}
              <span className="text-paper font-medium tracking-normal normal-case">{fuelCost}</span>
            </>
          )}
        </span>
        <Switch.Root
          checked={visible}
          onCheckedChange={onToggleVisibility}
          onClick={(e) => e.stopPropagation()}
          aria-label={visible ? 'Hide this day on the map' : 'Show this day on the map'}
          title={visible ? 'Hide this day on the map' : 'Show this day on the map'}
          className="ml-1 relative shrink-0 p-0 w-10 h-5 rounded-full border border-line-strong bg-surface-2 transition-colors duration-200 ease-out-soft data-[state=checked]:bg-accent data-[state=checked]:border-accent outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {/* Absolutely positioned so the thumb's box is decoupled from any
              residual button padding / line-height / flex behaviour. The
              translateY(-50%) keeps it vertically centred; translateX runs
              from 1px (off) to 21px (on) inside a 38px inner content box. */}
          <Switch.Thumb className="absolute top-1/2 left-0 block w-4 h-4 rounded-full bg-canvas shadow-sm -translate-y-1/2 translate-x-[1px] data-[state=checked]:translate-x-[21px] transition-transform duration-200 ease-out-soft will-change-transform" />
        </Switch.Root>
      </header>

      <div className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[9.5px] tracking-[0.14em] uppercase font-medium border ${aaPalette}`}
        >
          <span className="text-[11px]">🚗</span>
          {aaText}
        </span>
        {longLegKm > 0 && (
          <span
            title="A single leg in this day exceeds the trip's tank range — consider a fuel stop."
            className="inline-flex items-center gap-1 px-2 py-[3px] rounded font-mono text-[9.5px] tracking-[0.14em] uppercase text-[#e0b86d] border border-dashed border-[rgba(212,164,74,0.5)]"
          >
            <span aria-hidden>⛽</span>
            {longLegKm} km without refuel
          </span>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2.5">
          {stopsOnly.map((stop, i) => isFuelStop(stop) ? (
            <FuelStopChip key={stop.id} stop={stop} />
          ) : (
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
                  <div className="mt-0.5 font-mono text-[9.5px] tracking-[0.14em] uppercase text-paper-dim flex items-center gap-1.5 flex-wrap">
                    <span>
                      <span className="text-paper-muted mr-1">↗</span>
                      <span className="text-paper font-medium mr-0.5">{stop.kmFromPrevious || 0}</span>km
                      {stop.durationFromPrevious && <> · {stop.durationFromPrevious}</>}
                    </span>
                    {stop.routeMode && stop.routeMode !== 'fastest' && (
                      <span
                        title={ROUTE_MODE_GLYPH[stop.routeMode].label}
                        className="inline-flex items-center gap-0.5 text-[11px] tracking-normal normal-case text-paper-dim"
                      >
                        <span aria-hidden>{ROUTE_MODE_GLYPH[stop.routeMode].glyph}</span>
                      </span>
                    )}
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
                {(stop.type === 'overnight' || stop.type === 'destination') && (() => {
                  const links = accommodationLinks(stop, startDate, bookingAffiliateId);
                  return (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <a
                        href={links.booking}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={links.hasDates ? 'Booking.com — pre-filled with your stay date' : 'Booking.com — search by name'}
                        className="inline-flex items-center gap-1 px-2 py-[3px] bg-transparent border border-line rounded text-[11px] text-paper-dim hover:text-paper hover:border-paper-dim transition-colors"
                      >
                        <span aria-hidden>🏨</span> Booking.com
                      </a>
                      <a
                        href={links.googleHotels}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={links.hasDates ? 'Google Hotels — pre-filled with your stay date' : 'Google Hotels — search by name'}
                        className="inline-flex items-center gap-1 px-2 py-[3px] bg-transparent border border-line rounded text-[11px] text-paper-dim hover:text-paper hover:border-paper-dim transition-colors"
                      >
                        <span aria-hidden>🔍</span> Google Hotels
                      </a>
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}

          {url ? (
            <div className="mt-1 flex items-center gap-1.5">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open this day's route in Google Maps"
                title="Open in Google Maps"
                className="bg-accent text-canvas border border-accent w-8 h-7 rounded font-mono text-[13px] hover:opacity-90 transition-opacity flex items-center justify-center"
              >
                <span aria-hidden>↗</span>
              </a>
              <button
                type="button"
                onClick={() => setQrOpen(true)}
                aria-label="Show QR code for this day's Maps route"
                title="Show QR code — scan with phone camera"
                className="bg-transparent border border-line text-paper-dim w-8 h-7 rounded font-mono text-[13px] hover:border-paper-dim hover:text-paper transition-colors flex items-center justify-center"
              >
                <span aria-hidden>▦</span>
              </button>
              <button
                type="button"
                onClick={onShareClick}
                aria-label="Share this day's route"
                title="Share route — copies the Maps link or opens the OS share sheet"
                className="bg-transparent border border-line text-paper-dim w-8 h-7 rounded font-mono text-[13px] hover:border-paper-dim hover:text-paper transition-colors flex items-center justify-center"
              >
                <span aria-hidden>⤴</span>
              </button>
            </div>
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
          {shareLabel && (
            <div className="text-paper-muted font-mono text-[9.5px] tracking-[0.14em] uppercase mt-1">{shareLabel}</div>
          )}
        </div>
      )}
      {qrOpen && url && (
        <QrModal
          url={url}
          title={dayLabel}
          subtitle={routeBriefly ? `${routeBriefly} · ${group.km} km` : `${group.km} km`}
          onClose={() => setQrOpen(false)}
        />
      )}
    </article>
  );
}
