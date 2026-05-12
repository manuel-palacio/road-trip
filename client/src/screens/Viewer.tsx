import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfig } from '../hooks/useConfig';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import { useRouteSegments, getStopPath } from '../hooks/useRouteSegments';
import { usePins } from '../hooks/usePins';
import { usePinModal } from '../hooks/usePinModal';
import { usePromotePin } from '../hooks/usePromoteAction';
import { downloadAuthed, enableShare, getTrip, revokeShare } from '../lib/api';
import { applyDays, dayColor, formatBreakdown, formatDuration, fuelBreakdownForLegs, groupByDay, tripTotals } from '../lib/compute';
import { flagEmoji } from '../lib/flags';
import { MAP_STYLE, makeMarkerIcon, polylineOptionsFor } from '../lib/google-maps';
import type { Stop } from '../lib/types';
import { DayCard } from '../components/viewer/DayCard';
import { PinList } from '../components/viewer/PinList';
import { QrModal } from '../components/QrModal';
import { PinMapLayer, type PinMapLayerHandle } from '../components/viewer/PinMapLayer';
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

  const pinsQuery = usePins(tripId);
  const pins = useMemo(() => pinsQuery.data || [], [pinsQuery.data]);

  const [activeTab, setActiveTab] = useState<'days' | 'pins'>('days');
  // Mobile drawer state — sidebar slides in from left below md (768px).
  // Open by default on desktop (where it's static); closed on mobile.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pinModal = usePinModal(tripId || '', { onCreated: () => setActiveTab('pins') });
  const promotePin = usePromotePin(tripId || '', stops);

  const queryClient = useQueryClient();
  const [shareToast, setShareToast] = useState<string | null>(null);
  const isShared = !!trip?.isShared;
  const enableShareMut = useMutation({
    mutationFn: () => enableShare(tripId!),
    onSuccess: ({ shareToken }) => {
      const url = `${window.location.origin}/share/${shareToken}`;
      navigator.clipboard?.writeText(url).catch(() => { /* ignore — toast still shown */ });
      setShareToast('Link copied');
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
    onError: () => setShareToast('Could not enable sharing'),
  });
  const revokeShareMut = useMutation({
    mutationFn: () => revokeShare(tripId!),
    onSuccess: () => {
      setShareToast('Share link revoked');
      queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    },
    onError: () => setShareToast('Could not revoke link'),
  });
  function copyExistingShare() {
    if (!trip?.shareToken) return;
    const url = `${window.location.origin}/share/${trip.shareToken}`;
    navigator.clipboard?.writeText(url).catch(() => { /* ignore */ });
    setShareToast('Link copied');
  }

  const [exporting, setExporting] = useState<'pdf' | 'gpx' | null>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  async function exportTrip(kind: 'pdf' | 'gpx') {
    if (!tripId || exporting) return;
    setExporting(kind);
    try {
      const path = `/api/trips/${encodeURIComponent(tripId)}/export/${kind}`;
      const fallback = `${(trip?.name || 'road-trip').replace(/[^A-Za-z0-9\-_]+/g, '-')}.${kind}`;
      await downloadAuthed(path, fallback);
    } catch (err) {
      console.error('Export failed', err);
      setShareToast(`Could not export ${kind.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  }

  const routes = useRouteSegments(stops, maps);
  const dayedStops = useMemo(
    () => applyDays(routes.enriched, trip?.maxKmPerDay || 600),
    [routes.enriched, trip?.maxKmPerDay],
  );
  const groups = useMemo(() => groupByDay(dayedStops), [dayedStops]);
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

  // Ref-callback → state so the init effect re-runs when the div mounts,
  // not just when maps/map change. Otherwise the SDK could load before the
  // success render attaches the div, the init effect would early-return,
  // and the map would never construct.
  const [mapDiv, setMapDiv] = useState<HTMLDivElement | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const stopMarkersRef = useRef<google.maps.Marker[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const stopInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const pinLayerRef = useRef<PinMapLayerHandle>(null);

  // Init map
  useEffect(() => {
    if (!maps || !mapDiv || map) return;
    const m = new maps.Map(mapDiv, {
      center: { lat: 60, lng: 18 },
      zoom: 4,
      styles: MAP_STYLE,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'greedy',
      backgroundColor: '#13151a',
      clickableIcons: false,
    });
    stopInfoWindowRef.current = new maps.InfoWindow();
    setMap(m);
  }, [maps, mapDiv, map]);

  // Sync stop markers + polylines to dayedStops + hiddenDays
  useEffect(() => {
    if (!maps || !map) return;

    stopMarkersRef.current.forEach((m) => m.setMap(null));
    stopMarkersRef.current = [];
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    const visibleStops = dayedStops.filter((s) => !hiddenDays.has(s.dayNumber || 1));

    visibleStops.forEach((stop) => {
      const originalIndex = dayedStops.findIndex((x) => x.id === stop.id);
      const marker = new maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map,
        icon: makeMarkerIcon(originalIndex + 1, dayColor(stop.dayNumber)),
        title: stop.label || stop.name,
      });
      marker.addListener('click', () => {
        if (!stopInfoWindowRef.current) return;
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
        stopInfoWindowRef.current.setContent(html);
        stopInfoWindowRef.current.open({ map, anchor: marker });
      });
      stopMarkersRef.current.push(marker);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMarkersRef.current.forEach((m) => m.setMap(null));
      stopMarkersRef.current = [];
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      stopInfoWindowRef.current?.close();
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
    <section className="relative h-screen overflow-hidden md:grid md:grid-cols-[360px_1fr]">
      {/* Backdrop overlay (mobile only) — tap to close drawer */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/55 z-30 backdrop-blur-sm transition-opacity"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`bg-canvas border-r border-line flex flex-col overflow-hidden
          fixed md:relative inset-y-0 left-0 z-40
          w-[85vw] max-w-[360px] md:w-auto md:max-w-none
          transition-transform duration-300 ease-out-soft
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
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
            onClick={() => navigate(`/builder/${trip.id}`)}
            aria-label="Edit trip in builder"
            title="Edit this trip"
            className="bg-transparent border border-line text-paper-dim px-2.5 py-[7px] rounded font-mono text-[9.5px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim transition-colors inline-flex items-center gap-1.5"
          >
            <span aria-hidden>✎</span>
            Edit
          </button>
          <button
            type="button"
            onClick={() => setHandoffOpen(true)}
            aria-label="Send to phone"
            title="Send to phone — scan with your phone camera to open the hand-off page"
            className="bg-transparent border border-line text-paper-dim px-2.5 py-[7px] rounded font-mono text-[9.5px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim transition-colors inline-flex items-center gap-1.5"
          >
            <span aria-hidden>▦</span>
            Phone
          </button>
          {isShared ? (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={copyExistingShare}
                aria-label="Copy share link"
                title="Copy share link"
                className="bg-accent-soft border border-accent text-accent px-2.5 py-[7px] rounded font-mono text-[9.5px] tracking-[0.18em] uppercase hover:bg-accent hover:text-canvas transition-colors"
              >
                Copy link
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Revoke this share link? Anyone with the URL will see a 404.')) {
                    revokeShareMut.mutate();
                  }
                }}
                disabled={revokeShareMut.isPending}
                aria-label="Revoke share link"
                title="Revoke share link"
                className="bg-transparent border border-line text-paper-muted px-2 py-[7px] rounded font-mono text-[12px] hover:text-accent hover:border-accent disabled:opacity-50 transition-colors"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => enableShareMut.mutate()}
              disabled={enableShareMut.isPending}
              aria-label="Create share link"
              title="Create a public read-only link"
              className="bg-transparent border border-line text-paper-dim px-2.5 py-[7px] rounded font-mono text-[9.5px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim disabled:opacity-50 transition-colors"
            >
              {enableShareMut.isPending ? 'Sharing…' : 'Share'}
            </button>
          )}
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
          <span className="ml-auto font-sans text-[14px] tracking-[0.06em]">{flagSet.join(' ')}</span>
        </div>

        <SidebarTabs
          active={activeTab}
          daysCount={groups.length}
          pinsCount={pins.length}
          onChange={setActiveTab}
        />

        <div
          id={`tab-panel-${activeTab}`}
          role="tabpanel"
          className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-4 py-3 flex flex-col gap-2.5"
        >
          {activeTab === 'days' ? (
            groups.length === 0 ? (
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
                  fuelCost={fuelCostFor(g.stops.map((x) => x.stop))}
                />
              ))
            )
          ) : (
            <PinList
              pins={pins}
              onEdit={pinModal.openEdit}
              onDelete={pinModal.deletePin}
              onFocus={(p) => pinLayerRef.current?.focusPin(p)}
              onPromote={(p) => promotePin.mutate(p)}
              promotingPinId={promotePin.isPending ? promotePin.variables?.id ?? null : null}
            />
          )}
        </div>

        <footer className="border-t border-line px-5 py-2.5 flex items-center justify-between gap-3 bg-canvas">
          <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted">
            Export
          </span>
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => exportTrip('pdf')}
              disabled={exporting !== null}
              title="Download a printable PDF of this trip"
              className="bg-transparent border border-line text-paper-dim px-2.5 py-[5px] rounded font-mono text-[9.5px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {exporting === 'pdf' ? '…' : 'PDF'}
            </button>
            <button
              type="button"
              onClick={() => exportTrip('gpx')}
              disabled={exporting !== null}
              title="Download a GPX file for Google Maps, Garmin, etc."
              className="bg-transparent border border-line text-paper-dim px-2.5 py-[5px] rounded font-mono text-[9.5px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {exporting === 'gpx' ? '…' : 'GPX'}
            </button>
          </div>
        </footer>
      </aside>

      <div className="relative w-full h-full bg-[#13151a]">
        {routes.loading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[rgba(231,111,81,0.06)] overflow-hidden pointer-events-none z-[5]">
            <div className="absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-accent to-transparent animate-drift" />
          </div>
        )}
        {/* Hamburger — mobile only, opens drawer */}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="md:hidden absolute top-3 left-3 z-20 bg-canvas/85 backdrop-blur border border-line text-paper-dim w-10 h-10 rounded-md text-[18px] flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:text-paper hover:border-paper-dim transition-colors"
        >
          ☰
        </button>
        <div ref={setMapDiv} className="w-full h-full" />
        {tripId && (
          <PinMapLayer
            ref={pinLayerRef}
            map={map}
            maps={maps}
            pins={pins}
            onRequestCreate={pinModal.openCreate}
            onRequestEdit={pinModal.openEdit}
            onRequestDelete={pinModal.deletePin}
          />
        )}
      </div>

      {pinModal.modalElement}

      <Toast
        message={routes.lastFailure ? `Couldn't route ${routes.lastFailure}` : null}
        onDismiss={routes.clearFailure}
      />
      <Toast message={shareToast} variant="success" onDismiss={() => setShareToast(null)} durationMs={2200} />
      {handoffOpen && trip && (
        <QrModal
          url={
            trip.isShared && trip.shareToken
              ? `${window.location.origin}/handoff/share/${trip.shareToken}`
              : `${window.location.origin}/handoff/${trip.id}`
          }
          title="Send to phone"
          subtitle={
            trip.isShared
              ? 'Public link · works on any device, no login needed'
              : 'Owner link · sign in on the phone with the same account'
          }
          onClose={() => setHandoffOpen(false)}
        />
      )}
    </section>
  );
}
