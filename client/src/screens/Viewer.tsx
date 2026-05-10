import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../hooks/useConfig';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import { useRouteSegments, getStopPath } from '../hooks/useRouteSegments';
import { getTrip } from '../lib/api';
import { applyDays, dayColor, formatDuration, groupByDay, tripTotals } from '../lib/compute';
import { flagEmoji } from '../lib/flags';
import { MAP_STYLE, makeMarkerIcon } from '../lib/google-maps';
import type { Stop } from '../lib/types';
import { DayCard } from '../components/viewer/DayCard';
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

export function Viewer() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const cfg = useConfig();
  const { maps } = useGoogleMaps(cfg.data?.mapsApiKey || null);

  const tripQuery = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => getTrip(tripId!),
    enabled: !!tripId,
  });

  const trip = tripQuery.data;
  const stops = useMemo<Stop[]>(() => trip?.stops || [], [trip]);

  const routes = useRouteSegments(stops, maps);
  const dayedStops = useMemo(
    () => applyDays(routes.enriched, trip?.maxKmPerDay || 600),
    [routes.enriched, trip?.maxKmPerDay],
  );
  const groups = useMemo(() => groupByDay(dayedStops), [dayedStops]);
  const totals = useMemo(() => tripTotals(dayedStops), [dayedStops]);
  const flagSet = useMemo(
    () => [...new Set(dayedStops.map((s) => flagEmoji(s.countryCode)).filter(Boolean))],
    [dayedStops],
  );

  // Per-day visibility (all visible by default)
  const [hiddenDays, setHiddenDays] = useState<Set<number>>(new Set());
  function toggleDay(day: number) {
    setHiddenDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // Init map
  useEffect(() => {
    if (!maps || !mapDivRef.current || mapRef.current) return;
    mapRef.current = new maps.Map(mapDivRef.current, {
      center: { lat: 60, lng: 18 },
      zoom: 4,
      styles: MAP_STYLE,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      backgroundColor: '#13151a',
      clickableIcons: false,
    });
    infoWindowRef.current = new maps.InfoWindow();
  }, [maps]);

  // Sync markers + polylines to dayedStops + hiddenDays
  useEffect(() => {
    if (!maps || !mapRef.current) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    const visibleStops = dayedStops.filter((s) => !hiddenDays.has(s.dayNumber || 1));

    visibleStops.forEach((stop) => {
      const originalIndex = dayedStops.findIndex((x) => x.id === stop.id);
      const marker = new maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map: mapRef.current,
        icon: makeMarkerIcon(originalIndex + 1, dayColor(stop.dayNumber)),
        title: stop.label || stop.name,
      });
      marker.addListener('click', () => {
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
        infoWindowRef.current.open({ map: mapRef.current!, anchor: marker });
      });
      markersRef.current.push(marker);
    });

    for (let i = 1; i < dayedStops.length; i++) {
      const stop = dayedStops[i];
      const prev = dayedStops[i - 1];
      // Only render polyline when both endpoints' days are visible
      if (hiddenDays.has(stop.dayNumber || 1) || hiddenDays.has(prev.dayNumber || 1)) continue;
      const path = getStopPath(stop);
      if (!path || path.length === 0) continue;
      const polyline = new maps.Polyline({
        path,
        map: mapRef.current,
        strokeColor: dayColor(stop.dayNumber),
        strokeOpacity: 0.85,
        strokeWeight: 4,
      });
      polylinesRef.current.push(polyline);
    }

    fitBounds(mapRef.current, visibleStops);
  }, [maps, dayedStops, hiddenDays]);

  // Cleanup
  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      infoWindowRef.current?.close();
    };
  }, []);

  if (tripQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted">Loading trip…</div>
      </div>
    );
  }

  if (tripQuery.error || !trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-8">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-accent">Trip not found</div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="bg-transparent border border-line text-paper-dim px-3.5 py-[7px] rounded text-[12px] hover:text-paper hover:border-paper-dim"
        >
          ← Back to trips
        </button>
      </div>
    );
  }

  return (
    <section className="grid grid-cols-[360px_1fr] h-screen overflow-hidden">
      <aside className="bg-canvas border-r border-line flex flex-col overflow-hidden">
        <header className="flex items-center gap-3 px-5 py-4 border-b border-line">
          <button
            type="button"
            aria-label="Back to dashboard"
            onClick={() => navigate('/')}
            className="bg-transparent border border-line text-paper-dim w-8 h-8 rounded text-base flex items-center justify-center transition-colors hover:text-paper hover:border-paper-dim"
          >
            ←
          </button>
          <span className="text-[24px] leading-none">{trip.coverEmoji || '🚗'}</span>
          <div className="flex-1 min-w-0">
            <h1 className="font-serif italic font-normal text-[20px] leading-[1.15] tracking-tight text-paper truncate">
              {trip.name || 'Untitled trip'}
            </h1>
          </div>
          <button
            type="button"
            aria-label="Share trip (coming in slice 10)"
            title="Sharing comes in Slice 10"
            disabled
            className="bg-transparent border border-line text-paper-muted px-2.5 py-[7px] rounded font-mono text-[9.5px] tracking-[0.18em] uppercase cursor-not-allowed opacity-60"
          >
            Share
          </button>
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
          <span className="ml-auto font-sans text-[14px] tracking-[0.06em]">{flagSet.join(' ')}</span>
        </div>

        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-4 py-3 flex flex-col gap-2.5">
          {groups.length === 0 ? (
            <p className="px-2 py-6 text-center font-serif italic text-[14px] text-paper-muted">
              This trip has no stops yet. <button onClick={() => navigate(`/builder/${trip.id}`)} className="underline text-accent">Open in builder</button>.
            </p>
          ) : (
            groups.map((g) => (
              <DayCard
                key={g.day}
                group={g}
                startDate={trip.startDate}
                visible={!hiddenDays.has(g.day)}
                onToggleVisibility={() => toggleDay(g.day)}
              />
            ))
          )}
        </div>
      </aside>

      <div className="relative w-full h-full bg-[#13151a]">
        {routes.loading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[rgba(231,111,81,0.06)] overflow-hidden pointer-events-none z-[5]">
            <div className="absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-accent to-transparent animate-drift" />
          </div>
        )}
        <div ref={mapDivRef} className="w-full h-full" />
      </div>

      <Toast
        message={routes.lastFailure ? `Couldn't route ${routes.lastFailure}` : null}
        onDismiss={routes.clearFailure}
      />
    </section>
  );
}
