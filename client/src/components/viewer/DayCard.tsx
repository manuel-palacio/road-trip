import { useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { dayColor, formatDayDate, formatDuration } from '../../lib/compute';
import { flagEmoji } from '../../lib/flags';
import { aaStatus, buildDayMapsUrl } from '../../lib/maps-deep-link';
import { phoneShare } from '../../lib/phone-share';
import { accommodationLinks } from '../../lib/booking-links';
import { experienceLinks } from '../../lib/affiliate-links';
import type { DayGroup } from '../../lib/compute';
import type { StopRouteMode } from '../../lib/types';
import { StopIdentityBadge } from '../StopIdentityBadge';
import { FavoriteToggle } from '../FavoriteToggle';
import { useFavorites } from '../../hooks/useFavorites';
import { QrModal } from '../QrModal';
import type { FuelTimeline } from '../../lib/fuel-timeline';
import { FuelRemainingBadge } from '../FuelRemainingBadge';

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
  fuelVolume?: string | null;
  /** Partial fuel-config state — see issue #59. When true, the card swaps
   * the cost text for a nudge chip. In Viewer the chip navigates back to
   * Builder; in Share it's typically not passed (read-only context). */
  fuelConfigPartial?: boolean;
  onConfigureFuel?: () => void;
  bookingAffiliateId?: string | null;
  getYourGuidePartnerId?: string | null;
  viatorPartnerId?: string | null;
  /** Longest single leg in the day that exceeds the trip's tank range, in km.
   * 0 (or omitted) hides the chip. */
  longLegKm?: number;
  fuelTimeline?: FuelTimeline;
  tankRangeKm?: number;
  autoFuelWarningKm?: number;
  onOpenManualPicker?: () => void;
  trip?: { id?: string; name?: string };
};

export function DayCard({ group, startDate, visible, onToggleVisibility, fuelCost, fuelVolume, fuelConfigPartial, onConfigureFuel, bookingAffiliateId, getYourGuidePartnerId, viatorPartnerId, longLegKm = 0, fuelTimeline, tankRangeKm, autoFuelWarningKm, onOpenManualPicker, trip }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [shareLabel, setShareLabel] = useState<string | null>(null);
  const favorites = useFavorites();

  const stopsOnly = group.stops.map((x) => x.stop);
  // Every stop on the day counts toward the AA badge — fuel stops are
  // no longer treated as planner-side hints. The deep-link URL catches
  // up in a follow-up (routableStops is the next thing to flip).
  const routableCount = stopsOnly.length;
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
          {fuelVolume && (
            <>
              {' · '}
              <span className="text-paper-dim tracking-normal normal-case">{fuelVolume}</span>
            </>
          )}
          {fuelConfigPartial && !fuelCost && onConfigureFuel && (
            <>
              {' · '}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onConfigureFuel(); }}
                data-testid="fuel-config-nudge"
                className="inline-flex items-baseline gap-1 text-accent hover:text-paper tracking-normal normal-case font-sans text-[11px] underline decoration-dotted underline-offset-2 transition-colors"
              >
                <span aria-hidden>⛽</span>
                Set fuel
              </button>
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
        {fuelTimeline && tankRangeKm && (
          <FuelRemainingBadge
            timeline={fuelTimeline}
            lastStopIndex={group.stops[group.stops.length - 1].index}
            tankRangeKm={tankRangeKm}
          />
        )}
        {autoFuelWarningKm != null && (
          <button
            type="button"
            onClick={onOpenManualPicker}
            className="inline-flex items-center gap-1 px-2 py-[3px] rounded font-mono text-[9.5px] tracking-[0.16em] uppercase text-red-400 hover:text-paper hover:bg-accent-soft border border-red-400/30"
            title="No fuel station found within 5 km of the route — click to widen the search."
          >
            ⚠ No station within 5 km — add manually
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-2.5">
          {stopsOnly.map((stop, i) => (
            <div key={stop.id} className="flex items-start gap-2.5">
              <div className="mt-0.5">
                <StopIdentityBadge stop={stop} index={group.stops[i].index} variant="compact" />
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
                {(stop.category === 'landmark' || stop.category === 'scenic') && (() => {
                  const links = experienceLinks(
                    { name: stop.label || stop.name },
                    { getYourGuidePartnerId: getYourGuidePartnerId ?? undefined, viatorPartnerId: viatorPartnerId ?? undefined },
                  );
                  return (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {links.map((link) => (
                        <a
                          key={link.source}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Search experiences on ${link.label}`}
                          className="inline-flex items-center gap-1 px-2 py-[3px] bg-transparent border border-line rounded text-[11px] text-paper-dim hover:text-paper hover:border-paper-dim transition-colors"
                        >
                          <span aria-hidden>🎟</span> {link.label}
                        </a>
                      ))}
                    </div>
                  );
                })()}
              </div>
              {trip && (
                <div className="mt-0.5 shrink-0">
                  <FavoriteToggle
                    isFavorited={!!favorites.favoriteIdForStop(stop)}
                    pending={favorites.addPending || favorites.removePending}
                    onAdd={() => favorites.add({
                      name: stop.name,
                      label: stop.label,
                      lat: stop.lat,
                      lng: stop.lng,
                      countryCode: stop.countryCode,
                      category: stop.category,
                      sourceTripId: trip.id,
                      sourceTripName: trip.name,
                    })}
                    onRemove={() => {
                      const id = favorites.favoriteIdForStop(stop);
                      if (id) favorites.remove(id);
                    }}
                  />
                </div>
              )}
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
