import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useConfig } from '../hooks/useConfig';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import { useRouteSegments, getStopPath } from '../hooks/useRouteSegments';
import { useCreatePin, useDeletePin, usePins, useUpdatePin } from '../hooks/usePins';
import { getTrip } from '../lib/api';
import { applyDays, dayColor, formatDuration, groupByDay, tripTotals } from '../lib/compute';
import { flagEmoji } from '../lib/flags';
import { MAP_STYLE, makeMarkerIcon, makePinIcon } from '../lib/google-maps';
import { PIN_CATEGORY_META } from '../lib/pin-meta';
import type { Pin, Stop } from '../lib/types';
import { DayCard } from '../components/viewer/DayCard';
import { DropModeBanner } from '../components/viewer/DropModeBanner';
import { PinFab } from '../components/viewer/PinFab';
import { PinList } from '../components/viewer/PinList';
import { PinModal, type PinDraft } from '../components/viewer/PinModal';
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

type PinModalState =
  | { kind: 'closed' }
  | { kind: 'create'; lat: number; lng: number }
  | { kind: 'edit'; pin: Pin };

function pinInfoHtml(pin: Pin): string {
  const meta = PIN_CATEGORY_META[pin.category];
  return `
    <div style="font-family:Geist,sans-serif;color:#1a1a1a;max-width:240px;">
      <div style="display:flex;align-items:center;gap:6px;font-family:'Geist Mono',monospace;font-size:9.5px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6358;">
        <span style="font-size:13px;line-height:1;">${meta.emoji}</span>${meta.label}
      </div>
      <div style="font-family:Fraunces,serif;font-style:italic;font-size:18px;line-height:1.15;margin-top:3px;">${escapeHtml(pin.name)}</div>
      ${pin.notes ? `<div style="font-size:12px;color:#3d3633;margin-top:6px;line-height:1.5;font-style:italic;">${escapeHtml(pin.notes)}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button id="pin-edit-${pin.id}" type="button" style="font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;background:transparent;border:1px solid #c9bfa9;color:#3d3633;padding:4px 9px;border-radius:4px;cursor:pointer;">Edit</button>
        <button id="pin-delete-${pin.id}" type="button" style="font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;background:transparent;border:1px solid #e0a99a;color:#c54f31;padding:4px 9px;border-radius:4px;cursor:pointer;">Delete</button>
      </div>
    </div>
  `;
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
  const pins = useMemo<Pin[]>(() => pinsQuery.data || [], [pinsQuery.data]);
  const createPin = useCreatePin(tripId || '');
  const updatePin = useUpdatePin(tripId || '');
  const deletePin = useDeletePin(tripId || '');

  const [activeTab, setActiveTab] = useState<'days' | 'pins'>('days');
  const [dropMode, setDropMode] = useState(false);
  const [modal, setModal] = useState<PinModalState>({ kind: 'closed' });

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
  const pinMarkersRef = useRef<Map<string, google.maps.Marker>>(new globalThis.Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);

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

  // Sync pin markers
  useEffect(() => {
    if (!maps || !mapRef.current) return;
    const liveIds = new Set(pins.map((p) => p.id));

    // Remove stale
    pinMarkersRef.current.forEach((marker, id) => {
      if (!liveIds.has(id)) {
        marker.setMap(null);
        pinMarkersRef.current.delete(id);
      }
    });

    // Add or update
    pins.forEach((pin) => {
      const meta = PIN_CATEGORY_META[pin.category];
      const existing = pinMarkersRef.current.get(pin.id);
      if (existing) {
        existing.setPosition({ lat: pin.lat, lng: pin.lng });
        existing.setIcon(makePinIcon(meta.emoji, meta.tint));
        existing.setTitle(pin.name);
        return;
      }
      const marker = new maps.Marker({
        position: { lat: pin.lat, lng: pin.lng },
        map: mapRef.current,
        icon: makePinIcon(meta.emoji, meta.tint),
        title: pin.name,
        zIndex: 50,
      });
      marker.addListener('click', () => {
        if (!infoWindowRef.current || !mapRef.current) return;
        const html = pinInfoHtml(pin);
        infoWindowRef.current.setContent(html);
        infoWindowRef.current.open({ map: mapRef.current, anchor: marker });
        // Wire info window buttons after open
        google.maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
          document.getElementById(`pin-edit-${pin.id}`)?.addEventListener('click', () => {
            infoWindowRef.current?.close();
            setModal({ kind: 'edit', pin });
          });
          document.getElementById(`pin-delete-${pin.id}`)?.addEventListener('click', () => {
            infoWindowRef.current?.close();
            handleDeletePin(pin);
          });
        });
      });
      pinMarkersRef.current.set(pin.id, marker);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, pins]);

  // Drop-mode: cursor + map click → open create modal
  useEffect(() => {
    if (!maps || !mapRef.current) return;
    mapRef.current.setOptions({ draggableCursor: dropMode ? 'crosshair' : undefined });
    if (mapClickListenerRef.current) {
      mapClickListenerRef.current.remove();
      mapClickListenerRef.current = null;
    }
    if (dropMode) {
      mapClickListenerRef.current = mapRef.current.addListener('click', (ev: google.maps.MapMouseEvent) => {
        if (!ev.latLng) return;
        setModal({ kind: 'create', lat: ev.latLng.lat(), lng: ev.latLng.lng() });
        setDropMode(false);
      });
    }
    return () => {
      mapClickListenerRef.current?.remove();
      mapClickListenerRef.current = null;
    };
  }, [maps, dropMode]);

  // Esc cancels drop mode
  useEffect(() => {
    if (!dropMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDropMode(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dropMode]);

  function handleSavePin(draft: PinDraft) {
    if (modal.kind === 'edit') {
      updatePin.mutate(
        { pinId: modal.pin.id, body: draft },
        { onSuccess: () => setModal({ kind: 'closed' }) },
      );
    } else if (modal.kind === 'create') {
      createPin.mutate(draft, {
        onSuccess: () => {
          setModal({ kind: 'closed' });
          setActiveTab('pins');
        },
      });
    }
  }

  function handleDeletePin(pin: Pin) {
    if (!window.confirm(`Delete pin "${pin.name}"?`)) return;
    deletePin.mutate(pin.id);
  }

  function focusPin(pin: Pin) {
    if (!mapRef.current) return;
    mapRef.current.panTo({ lat: pin.lat, lng: pin.lng });
    if (mapRef.current.getZoom()! < 10) mapRef.current.setZoom(11);
    const marker = pinMarkersRef.current.get(pin.id);
    if (marker && infoWindowRef.current) {
      infoWindowRef.current.setContent(pinInfoHtml(pin));
      infoWindowRef.current.open({ map: mapRef.current, anchor: marker });
      google.maps.event.addListenerOnce(infoWindowRef.current, 'domready', () => {
        document.getElementById(`pin-edit-${pin.id}`)?.addEventListener('click', () => {
          infoWindowRef.current?.close();
          setModal({ kind: 'edit', pin });
        });
        document.getElementById(`pin-delete-${pin.id}`)?.addEventListener('click', () => {
          infoWindowRef.current?.close();
          handleDeletePin(pin);
        });
      });
    }
  }

  // Cleanup
  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      pinMarkersRef.current.forEach((m) => m.setMap(null));
      pinMarkersRef.current.clear();
      mapClickListenerRef.current?.remove();
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
                />
              ))
            )
          ) : (
            <PinList
              pins={pins}
              onEdit={(p) => setModal({ kind: 'edit', pin: p })}
              onDelete={handleDeletePin}
              onFocus={focusPin}
            />
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
        {dropMode && <DropModeBanner onCancel={() => setDropMode(false)} />}
        <PinFab active={dropMode} onToggle={() => setDropMode((d) => !d)} />
      </div>

      {modal.kind !== 'closed' && (
        <PinModal
          initial={modal.kind === 'edit' ? modal.pin : null}
          lat={modal.kind === 'edit' ? modal.pin.lat : modal.lat}
          lng={modal.kind === 'edit' ? modal.pin.lng : modal.lng}
          saving={createPin.isPending || updatePin.isPending}
          onCancel={() => setModal({ kind: 'closed' })}
          onSave={handleSavePin}
        />
      )}

      <Toast
        message={routes.lastFailure ? `Couldn't route ${routes.lastFailure}` : null}
        onDismiss={routes.clearFailure}
      />
    </section>
  );
}
