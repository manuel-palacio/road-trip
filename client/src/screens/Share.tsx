import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../hooks/useConfig';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import { useRouteSegments, getStopPath } from '../hooks/useRouteSegments';
import { useLegCostMarkers } from '../hooks/useLegCostMarkers';
import { getSharedTrip } from '../lib/api';
import { applyDays, dayColor, formatBreakdown, formatDuration, formatFillUps, formatVolume, fuelBreakdownForLegs, fuelVolumeForLegs, groupByDay, tripTotals } from '../lib/compute';
import { scheduleForStops } from '../../../shared/schedule';
import { longestLegOverRange } from '../lib/fuel-stops';
import { computeFuelTimeline } from '../lib/fuel-timeline';
import { flagEmoji } from '../lib/flags';
import { makeMarkerContent, makePinContent, mapStyleForTheme, polylineOptionsFor } from '../lib/google-maps';
import { useTheme } from '../hooks/useTheme';
import { PIN_CATEGORY_META, stopCategory } from '../lib/pin-meta';
import type { Pin, Stop } from '../lib/types';
import { Brand } from '../components/Brand';
import { DayCard } from '../components/viewer/DayCard';
import { PinList } from '../components/viewer/PinList';
import { SidebarTabs } from '../components/viewer/SidebarTabs';
import { Toast } from '../components/Toast';

function fitBounds(map: google.maps.Map, stops: Stop[]) {
  if (stops.length === 0) return;
  if (stops.length === 1) {
    map.setCenter({ lat: stops[0].lat, lng: stops[0].lng });
    map.setZoom(10);
    return;
  }
  const b = new google.maps.LatLngBounds();
  stops.forEach((s) => b.extend({ lat: s.lat, lng: s.lng }));
  map.fitBounds(b, 80);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function Share() {
  const { token } = useParams();
  const navigate = useNavigate();
  const cfg = useConfig();
  const theme = useTheme();
  const { maps } = useGoogleMaps(cfg.data?.mapsApiKey || null);

  const sharedQuery = useQuery({
    queryKey: ['share', token],
    queryFn: () => getSharedTrip(token!),
    enabled: !!token,
    retry: false,
  });

  const trip = sharedQuery.data?.trip;
  const pins: Pin[] = useMemo(() => sharedQuery.data?.pins || [], [sharedQuery.data]);
  const owner = sharedQuery.data?.owner;
  const stops = useMemo<Stop[]>(() => trip?.stops || [], [trip]);

  const [activeTab, setActiveTab] = useState<'days' | 'pins' | 'budget'>('days');
  const [hiddenDays, setHiddenDays] = useState<Set<number>>(new Set());
  function toggleDay(day: number) {
    setHiddenDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  const routes = useRouteSegments(stops, maps);
  const dayedStops = useMemo(
    () => applyDays(routes.enriched, trip?.maxKmPerDay || 600),
    [routes.enriched, trip?.maxKmPerDay],
  );
  const groups = useMemo(() => groupByDay(dayedStops), [dayedStops]);
  const stopSchedule = useMemo(
    () => (trip?.driveStartTime ? scheduleForStops(dayedStops, trip.driveStartTime) : undefined),
    [dayedStops, trip?.driveStartTime],
  );
  const fuelTimeline = useMemo(
    () => computeFuelTimeline(dayedStops, trip?.tankRangeKm || 0),
    [dayedStops, trip?.tankRangeKm],
  );
  const totals = useMemo(() => tripTotals(dayedStops), [dayedStops]);
  const totalFuelCostStr = useMemo(() => {
    const b = fuelBreakdownForLegs(
      dayedStops,
      trip?.fuelConsumption,
      trip?.fuelUnit,
      trip?.fuelPrice,
      trip?.fuelCurrency,
      trip?.fuelOverrides,
    );
    return formatBreakdown(b);
  }, [dayedStops, trip?.fuelConsumption, trip?.fuelUnit, trip?.fuelPrice, trip?.fuelCurrency, trip?.fuelOverrides]);
  function fuelCostFor(stopsForDay: Stop[]): string | null {
    const b = fuelBreakdownForLegs(
      stopsForDay,
      trip?.fuelConsumption,
      trip?.fuelUnit,
      trip?.fuelPrice,
      trip?.fuelCurrency,
      trip?.fuelOverrides,
    );
    return formatBreakdown(b);
  }
  function fuelVolumeFor(stopsForDay: Stop[]): string | null {
    const v = fuelVolumeForLegs(stopsForDay, trip?.fuelConsumption, trip?.fuelUnit);
    return formatVolume(v, trip?.fuelUnit, trip?.fuelType);
  }
  const totalFuelVolumeStr = useMemo(() => {
    const v = fuelVolumeForLegs(dayedStops, trip?.fuelConsumption, trip?.fuelUnit);
    return formatVolume(v, trip?.fuelUnit, trip?.fuelType);
  }, [dayedStops, trip?.fuelConsumption, trip?.fuelUnit]);
  const totalFillUpsStr = useMemo(() => {
    const v = fuelVolumeForLegs(dayedStops, trip?.fuelConsumption, trip?.fuelUnit);
    return formatFillUps(v, trip?.tankSizeLitres, trip?.fuelUnit, trip?.fuelType);
  }, [dayedStops, trip?.fuelConsumption, trip?.fuelUnit, trip?.tankSizeLitres]);
  const flagSet = useMemo(
    () => [...new Set(dayedStops.map((s) => flagEmoji(s.countryCode)).filter(Boolean))],
    [dayedStops],
  );

  // Ref callback → state, so the init effect re-runs *when the div mounts*
  // (not just when maps/map deps change). Without this, the SDK could load
  // before the success-render commits the div, the effect would early-return,
  // and the map would never initialize.
  const [mapDiv, setMapDiv] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const stopMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const pinMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  useLegCostMarkers(maps, map, dayedStops, {
    consumption: trip?.fuelConsumption,
    unit: trip?.fuelUnit,
    defaultPrice: trip?.fuelPrice,
    defaultCurrency: trip?.fuelCurrency,
    overrides: trip?.fuelOverrides,
  });

  useEffect(() => {
    if (!maps || !mapDiv || map) return;
    const m = new maps.Map(mapDiv, {
      center: { lat: 60, lng: 18 },
      zoom: 4,
      mapId: cfg.data?.mapId || 'DEMO_MAP_ID',
      styles: mapStyleForTheme(theme.resolved),
      disableDefaultUI: true,
      zoomControl: true,
      scaleControl: true,
      gestureHandling: 'greedy',
      backgroundColor: '#13151a',
      clickableIcons: false,
    });
    infoWindowRef.current = new maps.InfoWindow();
    setMap(m);
  }, [maps, mapDiv, map]);

  // Re-skin the map when the user flips themes.
  useEffect(() => {
    if (!map) return;
    map.setOptions({ styles: mapStyleForTheme(theme.resolved) });
  }, [map, theme.resolved]);

  // Stop markers + polylines
  useEffect(() => {
    if (!maps || !map) return;
    stopMarkersRef.current.forEach((m) => { m.map = null; });
    stopMarkersRef.current = [];
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    const visibleStops = dayedStops.filter((s) => !hiddenDays.has(s.dayNumber || 1));

    void (google.maps as any).importLibrary('marker').then(() => {
      const { AdvancedMarkerElement } = google.maps.marker;
      visibleStops.forEach((stop) => {
        const originalIndex = dayedStops.findIndex((x) => x.id === stop.id);
        const marker = new AdvancedMarkerElement({
          position: { lat: stop.lat, lng: stop.lng },
          map,
          content: makeMarkerContent(originalIndex + 1, dayColor(stop.dayNumber), stopCategory(stop)),
          title: stop.label || stop.name,
        });
        marker.addListener('gmp-click', () => {
          if (!infoWindowRef.current) return;
          const flag = flagEmoji(stop.countryCode);
          const km = stop.kmFromPrevious ? `${stop.kmFromPrevious} km` : '';
          const dur = stop.durationFromPrevious || '';
          const meta = [km, dur].filter(Boolean).join(' · ');
          const highlights = (stop.highlights || []).map((h) => escapeHtml(h)).join(' · ');
          const html = `
            <div style="font-family:Geist,sans-serif;color:#1a1a1a;max-width:240px;">
              <div style="font-family:'Geist Mono',monospace;font-size:9.5px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6358;">Day ${stop.dayNumber || 1}</div>
              <div style="font-family:Fraunces,serif;font-style:italic;font-size:18px;line-height:1.15;margin-top:2px;">${escapeHtml(stop.label || stop.name)}${flag ? ` ${flag}` : ''}</div>
              ${meta ? `<div style="font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:0.1em;color:#6b6358;margin-top:4px;text-transform:uppercase;">${meta}</div>` : ''}
              ${highlights ? `<div style="font-size:12px;color:#3d3633;margin-top:6px;line-height:1.5;font-style:italic;">${highlights}</div>` : ''}
            </div>
          `;
          infoWindowRef.current.setContent(html);
          infoWindowRef.current.open({ map, anchor: marker });
        });
        stopMarkersRef.current.push(marker);
      });
    });

    for (let i = 1; i < dayedStops.length; i++) {
      const stop = dayedStops[i];
      const prev = dayedStops[i - 1];
      if (hiddenDays.has(stop.dayNumber || 1) || hiddenDays.has(prev.dayNumber || 1)) continue;
      const path = getStopPath(stop);
      if (!path || path.length === 0) continue;
      const polyline = new maps.Polyline({
        path,
        map,
        ...polylineOptionsFor(stop.routeMode, dayColor(stop.dayNumber)),
      });
      polylinesRef.current.push(polyline);
    }

    fitBounds(map, visibleStops);
  }, [maps, map, dayedStops, hiddenDays]);

  // Pin markers — read-only (click shows info window without edit/delete)
  useEffect(() => {
    if (!maps || !map) return;
    pinMarkersRef.current.forEach((m) => { m.map = null; });
    void (google.maps as any).importLibrary('marker').then(() => {
      const { AdvancedMarkerElement } = google.maps.marker;
      pinMarkersRef.current = pins.map((pin) => {
        const meta = PIN_CATEGORY_META[pin.category];
        const marker = new AdvancedMarkerElement({
          position: { lat: pin.lat, lng: pin.lng },
          map,
          content: makePinContent(meta.emoji, meta.tint, pin.priority || 'want'),
          title: pin.name,
          zIndex: pin.priority === 'must' ? 60 : 50,
        });
        marker.addListener('gmp-click', () => {
          if (!infoWindowRef.current) return;
          const html = `
            <div style="font-family:Geist,sans-serif;color:#1a1a1a;max-width:240px;">
              <div style="display:flex;align-items:center;gap:6px;font-family:'Geist Mono',monospace;font-size:9.5px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6358;">
                <span style="font-size:13px;line-height:1;">${meta.emoji}</span>${meta.label}
              </div>
              <div style="font-family:Fraunces,serif;font-style:italic;font-size:18px;line-height:1.15;margin-top:3px;">${escapeHtml(pin.name)}</div>
              ${pin.notes ? `<div style="font-size:12px;color:#3d3633;margin-top:6px;line-height:1.5;font-style:italic;">${escapeHtml(pin.notes)}</div>` : ''}
            </div>
          `;
          infoWindowRef.current.setContent(html);
          infoWindowRef.current.open({ map, anchor: marker });
        });
        return marker;
      });
    });
  }, [maps, map, pins]);

  useEffect(() => {
    return () => {
      stopMarkersRef.current.forEach((m) => { m.map = null; });
      stopMarkersRef.current = [];
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      pinMarkersRef.current.forEach((m) => { m.map = null; });
      pinMarkersRef.current = [];
      infoWindowRef.current?.close();
    };
  }, []);

  if (sharedQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted">Loading shared trip…</div>
      </div>
    );
  }

  if (sharedQuery.error || !trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 px-8 text-center">
        <Brand size="md" />
        <div className="font-mono text-[10px] tracking-[0.28em] uppercase text-accent">Link not found</div>
        <p className="max-w-[420px] font-serif italic text-[16px] leading-[1.55] text-paper-dim">
          This share link has been revoked or never existed. Ask the trip owner for a fresh link.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="bg-transparent border border-line text-paper-dim px-4 py-[9px] rounded font-mono text-[10px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim transition-colors"
        >
          Build your own
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen md:h-screen">
      {/* Owner byline. The sign-up ask lives at the end of the itinerary
          (issue #122) — a recipient came here to read a trip, not to
          sign up, so the header stays quiet and the CTA follows the
          content it's selling. */}
      <div className="flex items-center justify-between gap-4 px-4 md:px-6 py-2.5 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          {owner?.photoURL ? (
            <img src={owner.photoURL} alt="" className="w-7 h-7 rounded-full object-cover border border-line shrink-0" />
          ) : (
            <span className="w-7 h-7 shrink-0 rounded-full bg-surface-2 border border-line inline-flex items-center justify-center font-mono text-[10px] text-paper-dim">
              {(owner?.displayName || 'A').slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="font-serif italic text-[15px] text-paper-dim truncate">
            <span className="text-paper">{owner?.displayName || 'A traveller'}</span>
            <span className="mx-1.5 text-paper-muted">·</span>
            <span>road trip</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="shrink-0 inline-flex items-center gap-1.5 bg-transparent border border-line-strong text-paper-dim rounded px-3 py-[7px] font-mono text-[10px] tracking-[0.18em] uppercase cursor-pointer transition-colors hover:text-paper hover:border-paper-dim"
        >
          Sign in <span aria-hidden>→</span>
        </button>
      </div>

      {/* Mobile stacks map over itinerary; md+ keeps the sidebar + map
          split. No drawer on phones — the itinerary is the point. */}
      <section className="relative flex flex-col md:flex-row flex-1 min-h-0 md:overflow-hidden">
        <aside
          className="order-2 md:order-none bg-canvas md:border-r border-line flex flex-col
            w-full md:w-[360px] md:shrink-0 md:overflow-hidden"
        >
          <header className="flex items-center gap-3 px-5 py-4 border-b border-line">
            <span className="text-[24px] leading-none">{trip.coverEmoji || '🚗'}</span>
            <div className="flex-1 min-w-0">
              <h1 className="font-serif italic font-normal text-[20px] leading-[1.15] tracking-tight text-paper truncate">
                {trip.name || 'Untitled trip'}
              </h1>
              {trip.description && (
                <p className="mt-0.5 font-serif italic text-[12.5px] text-paper-dim truncate">{trip.description}</p>
              )}
            </div>
          </header>

          <div className="flex items-center gap-4 px-5 py-3 border-b border-line font-mono text-[10px] tracking-[0.16em] uppercase text-paper-dim">
            <span className="inline-flex items-baseline gap-1">
              <span className="text-paper text-[14px] font-medium">{totals.totalKm.toLocaleString('en-US')}</span>
              <span>km</span>
            </span>
            <span className="inline-flex items-baseline gap-1">
              <span className="text-paper text-[14px] font-medium">{totals.totalDays}</span>
              <span>{totals.totalDays === 1 ? 'day' : 'days'}</span>
            </span>
            {totals.totalDurationSeconds > 0 && (
              <span className="inline-flex items-baseline gap-1">
                <span className="text-paper text-[14px] font-medium">{formatDuration(totals.totalDurationSeconds)}</span>
              </span>
            )}
            {totalFuelCostStr && (
              <span className="inline-flex items-baseline gap-1">
                <span className="text-paper text-[14px] font-medium tracking-normal normal-case">{totalFuelCostStr}</span>
              </span>
            )}
            {totalFuelVolumeStr && (
              <span
                className="inline-flex items-baseline gap-1"
                title={totalFillUpsStr ? `${totalFuelVolumeStr} · ${totalFillUpsStr}` : undefined}
              >
                <span className="text-paper-dim text-[14px] font-medium tracking-normal normal-case">{totalFuelVolumeStr}</span>
                {totalFillUpsStr && (
                  <span className="text-paper-muted text-[12px] tracking-normal normal-case">· {totalFillUpsStr}</span>
                )}
              </span>
            )}
            <span className="ml-auto font-sans text-[14px] tracking-[0.06em]">{flagSet.join(' ')}</span>
          </div>

          <SidebarTabs
            active={activeTab}
            daysCount={groups.length}
            pinsCount={pins.length}
            budgetCount={0}
            isPro={false}
            onChange={setActiveTab}
          />

          <div className="md:flex-1 md:overflow-y-auto [scrollbar-gutter:stable] px-4 py-3 flex flex-col gap-2.5">
            {activeTab === 'days' ? (
              groups.length === 0 ? (
                <p className="px-2 py-6 text-center font-serif italic text-[14px] text-paper-muted">
                  No stops on this trip yet.
                </p>
              ) : (
                groups.map((g) => (
                  <DayCard
                    key={g.day}
                    group={g}
                    startDate={trip.startDate}
                    visible={!hiddenDays.has(g.day)}
                    onToggleVisibility={() => toggleDay(g.day)}
                    fuelCost={fuelCostFor(g.stops.map((x) => x.stop))}
                    fuelVolume={fuelVolumeFor(g.stops.map((x) => x.stop))}
                    bookingAffiliateId={cfg.data?.bookingAffiliateId}
                    getYourGuidePartnerId={cfg.data?.getYourGuidePartnerId}
                    viatorPartnerId={cfg.data?.viatorPartnerId}
                    longLegKm={longestLegOverRange(g, trip.tankRangeKm)}
                    fuelTimeline={fuelTimeline}
                    tankRangeKm={trip.tankRangeKm}
                    schedule={stopSchedule}
                  />
                ))
              )
            ) : (
              <PinList pins={pins} />
            )}

            {/* The ask, after the goods. */}
            <div className="mt-2 mb-1 p-4 rounded-lg border border-line bg-surface/50 text-center">
              <p className="font-serif italic text-[14px] text-paper leading-[1.45]">
                Planning something like this?
              </p>
              <p className="mt-1 font-serif italic text-[12.5px] text-paper-dim leading-[1.45]">
                Map your own route, and let the days, fuel and stops work themselves out.
              </p>
              <button
                type="button"
                onClick={() => navigate('/')}
                data-testid="share-cta"
                className="mt-3 inline-flex items-center gap-2 bg-accent text-canvas border-0 rounded px-4 py-[9px] font-mono text-[10px] tracking-[0.18em] uppercase font-medium cursor-pointer transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-[0_6px_22px_-6px_rgba(231,111,81,0.5)]"
              >
                Build your own trip <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </aside>

        <div className="order-1 md:order-none relative h-[42vh] shrink-0 md:h-auto md:flex-1 min-w-0 bg-[#13151a] w-full">
          {routes.loading && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-[rgba(231,111,81,0.06)] overflow-hidden pointer-events-none z-[5]">
              <div className="absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-accent to-transparent animate-drift" />
            </div>
          )}
          {/* absolute inset-0 sidesteps any flex/grid height-propagation
              quirks — the map fills its positioned parent regardless. */}
          <div ref={setMapDiv} className="absolute inset-0" />
        </div>
      </section>

      <Toast
        message={routes.lastFailure ? `Couldn't route ${routes.lastFailure}` : null}
        onDismiss={routes.clearFailure}
      />
    </div>
  );
}
