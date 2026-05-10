import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfig } from '../hooks/useConfig';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import { useRouteSegments, getStopPath } from '../hooks/useRouteSegments';
import { usePinModal } from '../hooks/usePinModal';
import { usePins } from '../hooks/usePins';
import { useDemoteStop, usePromotePin } from '../hooks/usePromoteAction';
import { ApiError, createTrip, getTrip, updateTrip } from '../lib/api';
import { extractCountryCode, flagEmoji } from '../lib/flags';
import { MAP_STYLE, makeMarkerIcon, requestGeolocation } from '../lib/google-maps';
import { guessCategoryFromTypes, isConcretePlace } from '../lib/place-to-category';
import { applyDays, dayColor, formatDuration, tripTotals } from '../lib/compute';
import type { Stop, Trip } from '../lib/types';
import { EmojiPicker } from '../components/builder/EmojiPicker';
import { StopList } from '../components/builder/StopList';
import { PinMapLayer } from '../components/viewer/PinMapLayer';
import { Toast } from '../components/Toast';

type BuilderState = {
  tripId: string | null;
  name: string;
  coverEmoji: string;
  startDate: string;
  maxKmPerDay: number;
  description: string;
  stops: Stop[];
};

const empty = (): BuilderState => ({
  tripId: null,
  name: '',
  coverEmoji: '🚗',
  startDate: '',
  maxKmPerDay: 600,
  description: '',
  stops: [],
});

function reassignTypes(stops: Stop[]): Stop[] {
  const n = stops.length;
  return stops.map((s, i) => ({
    ...s,
    type: i === 0 ? 'start' : i === n - 1 ? 'destination' : (s.type === 'waypoint' ? 'waypoint' : 'overnight'),
  }));
}

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

export function Builder() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const cfg = useConfig();
  const { maps } = useGoogleMaps(cfg.data?.mapsApiKey || null);
  const queryClient = useQueryClient();

  const isEditing = !!tripId;
  const tripQuery = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => getTrip(tripId!),
    enabled: isEditing,
  });

  const [state, setState] = useState<BuilderState>(empty);
  const [hydrated, setHydrated] = useState(!isEditing);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const snapshotRef = useRef<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);

  // Hydrate from loaded trip
  useEffect(() => {
    if (!isEditing || !tripQuery.data) return;
    const t = tripQuery.data;
    const next: BuilderState = {
      tripId: t.id,
      name: t.name || '',
      coverEmoji: t.coverEmoji || '🚗',
      startDate: t.startDate || '',
      maxKmPerDay: typeof t.maxKmPerDay === 'number' && t.maxKmPerDay > 0 ? t.maxKmPerDay : 600,
      description: t.description || '',
      stops: Array.isArray(t.stops) ? t.stops.map((s) => ({ ...s })) : [],
    };
    setState(next);
    snapshotRef.current = serializeSnapshot(next);
    setHydrated(true);
  }, [isEditing, tripQuery.data]);

  // Take initial snapshot for new trips
  useEffect(() => {
    if (!isEditing && snapshotRef.current === null) {
      snapshotRef.current = serializeSnapshot(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  // Ref-callback → state so the init effect re-runs when the div mounts.
  const [mapDiv, setMapDiv] = useState<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const pinModal = usePinModal(state.tripId || '', {
    onSaveAsStop: (draft) => {
      // The user picked "Add as stop" in the pin modal — create a route stop
      // from the same form data instead of saving as a pin. Carries the
      // category/priority/notes so demote round-trips losslessly.
      const newStop: Stop = {
        id: crypto.randomUUID(),
        name: draft.name,
        label: draft.name,
        lat: draft.lat,
        lng: draft.lng,
        type: 'overnight',
        highlights: draft.notes ? [draft.notes] : [],
        kmFromPrevious: 0,
        category: draft.category,
        priority: draft.priority,
        notes: draft.notes,
      };
      setState((s) => ({ ...s, stops: reassignTypes([...s.stops, newStop]) }));
    },
  });
  const pinModalRef = useRef(pinModal);
  pinModalRef.current = pinModal;
  const pinsQuery = usePins(state.tripId || undefined);
  // Builder is the planning surface — show ALL pins (no in-town suppression).
  // Suppression only applies to the Viewer where the map serves driving.
  const builderPins = useMemo(() => pinsQuery.data || [], [pinsQuery.data]);
  // Promote/demote use the *current edit-state* stops, not the saved ones,
  // because the Builder works on a draft. Promote/demote write to the server
  // immediately, then the trip query reload pulls fresh state.
  const promotePin = usePromotePin(state.tripId || '', state.stops);
  const demoteStop = useDemoteStop(state.tripId || '', state.stops);

  // Enrich stops with km/duration/path from Directions API
  const routes = useRouteSegments(state.stops, maps);
  // Compute day numbers based on enriched km + max km/day setting
  const dayedStops = useMemo(
    () => applyDays(routes.enriched, state.maxKmPerDay || 600),
    [routes.enriched, state.maxKmPerDay],
  );
  const totals = useMemo(() => tripTotals(dayedStops), [dayedStops]);
  const flagSet = useMemo(
    () => [...new Set(dayedStops.map((s) => flagEmoji(s.countryCode)).filter(Boolean))],
    [dayedStops],
  );

  // Init map + autocomplete once SDK ready
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
    setMap(m);
    if (searchInputRef.current) {
      autocompleteRef.current = new maps.places.Autocomplete(searchInputRef.current, {
        fields: ['name', 'formatted_address', 'geometry.location', 'address_components', 'types'],
        // No `types` restriction on the request — we want geocoded areas AND
        // establishments. We dispatch on the response's types[] below.
      });
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current?.getPlace();
        if (!place?.geometry?.location) return;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        // Concrete POI (Hilton Reims, Eiffel Tower, BP) → open the pin modal
        // prefilled. The user confirms category/priority/notes and saves.
        if (isConcretePlace(place.types)) {
          if (stateRef.current.tripId) {
            const cat = guessCategoryFromTypes(place.types);
            // Hotels are almost always navigation destinations (you drive to
            // the hotel, you sleep there). Prefill priority=must and make
            // "Add as stop" the primary action. Other POIs default to want+pin.
            const isHotel = cat === 'hotel';
            pinModalRef.current.openCreate({
              lat,
              lng,
              defaultName: place.name || place.formatted_address || '',
              defaultCategory: cat,
              defaultPriority: isHotel ? 'must' : 'want',
              primaryAction: isHotel ? 'stop' : 'pin',
            });
            if (searchInputRef.current) searchInputRef.current.value = '';
            return;
          }
          // No saved trip yet — fall through and add as a stop so the user
          // isn't blocked. We'll surface a toast later about saving first.
        }

        // City / area / region → add as a route stop (current behavior).
        const newStop: Stop = {
          id: crypto.randomUUID(),
          name: place.formatted_address || place.name || '',
          label: place.name || place.formatted_address || '',
          lat,
          lng,
          countryCode: extractCountryCode(place.address_components),
          type: 'overnight',
          highlights: [],
          kmFromPrevious: 0,
        };
        setState((s) => ({ ...s, stops: reassignTypes([...s.stops, newStop]) }));
        if (searchInputRef.current) searchInputRef.current.value = '';
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, mapDiv]);

  // Geolocation centering for new trips (once map is ready)
  useEffect(() => {
    if (!maps || !map || isEditing) return;
    let alive = true;
    requestGeolocation().then((loc) => {
      if (!alive) return;
      if (loc) {
        map.setCenter(loc);
        map.setZoom(10);
      }
    });
    return () => { alive = false; };
  }, [maps, map, isEditing]);

  // Sync markers to dayedStops (so colors reflect day numbers)
  useEffect(() => {
    if (!maps || !map) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = dayedStops.map((stop, i) =>
      new maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map,
        icon: makeMarkerIcon(i + 1, dayColor(stop.dayNumber)),
        title: stop.label || stop.name,
      }),
    );
    fitBounds(map, dayedStops);
  }, [maps, map, dayedStops]);

  // Sync polylines per segment in day color
  useEffect(() => {
    if (!maps || !map) return;
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    for (let i = 1; i < dayedStops.length; i++) {
      const path = getStopPath(dayedStops[i]);
      if (!path || path.length === 0) continue;
      const polyline = new maps.Polyline({
        path,
        map,
        strokeColor: dayColor(dayedStops[i].dayNumber),
        strokeOpacity: 0.85,
        strokeWeight: 4,
      });
      polylinesRef.current.push(polyline);
    }
  }, [maps, map, dayedStops]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, []);

  function setStopType(id: string, type: Stop['type']) {
    setState((s) => ({ ...s, stops: s.stops.map((x) => (x.id === id ? { ...x, type } : x)) }));
  }
  function removeStop(id: string) {
    setState((s) => ({ ...s, stops: reassignTypes(s.stops.filter((x) => x.id !== id)) }));
  }
  function setForceDayStart(id: string, value: boolean) {
    setState((s) => ({
      ...s,
      stops: s.stops.map((x) => (x.id === id ? { ...x, forceDayStart: value } : x)),
    }));
  }
  function addHighlight(id: string, text: string) {
    setState((s) => ({
      ...s,
      stops: s.stops.map((x) =>
        x.id === id
          ? { ...x, highlights: [...(x.highlights || []), text].filter((v, i, a) => a.indexOf(v) === i) }
          : x,
      ),
    }));
  }
  function removeHighlight(id: string, text: string) {
    setState((s) => ({
      ...s,
      stops: s.stops.map((x) =>
        x.id === id ? { ...x, highlights: (x.highlights || []).filter((h) => h !== text) } : x,
      ),
    }));
  }

  function reorder(targetId: string, ev: React.DragEvent) {
    const sourceId = draggedIdRef.current;
    if (!sourceId || sourceId === targetId) return;
    setState((s) => {
      const stops = [...s.stops];
      const fromIdx = stops.findIndex((x) => x.id === sourceId);
      if (fromIdx < 0) return s;
      const [moved] = stops.splice(fromIdx, 1);
      const targetIdx = stops.findIndex((x) => x.id === targetId);
      if (targetIdx < 0) {
        stops.splice(fromIdx, 0, moved);
        return s;
      }
      // Determine above/below by current Y in the row
      const row = (ev.currentTarget as HTMLDivElement);
      const rect = row.getBoundingClientRect();
      const above = ev.clientY < rect.top + rect.height / 2;
      const insertAt = above ? targetIdx : targetIdx + 1;
      stops.splice(insertAt, 0, moved);
      return { ...s, stops: reassignTypes(stops) };
    });
  }

  function serializeSnapshot(s: BuilderState): string {
    return JSON.stringify({
      name: s.name || '',
      coverEmoji: s.coverEmoji || '',
      startDate: s.startDate || '',
      description: s.description || '',
      maxKmPerDay: s.maxKmPerDay || 600,
      stops: (s.stops || []).map((x) => ({
        id: x.id, name: x.name, label: x.label,
        lat: x.lat, lng: x.lng,
        countryCode: x.countryCode || '',
        type: x.type,
        forceDayStart: x.forceDayStart === true,
        highlights: x.highlights || [],
      })),
    });
  }
  function isDirty() {
    if (!snapshotRef.current) return false;
    return serializeSnapshot(state) !== snapshotRef.current;
  }

  async function onSave() {
    if (saving) return;
    setSaving(true);
    try {
      // Use the enriched + dayed stops so saved data includes km/duration/dayNumber
      const stops = dayedStops;
      const payload: Partial<Trip> = {
        name: (state.name || '').trim() || 'Untitled trip',
        coverEmoji: state.coverEmoji || '🚗',
        startDate: state.startDate || null,
        maxKmPerDay: state.maxKmPerDay || 600,
        description: state.description || '',
        countries: flagSet,
        totalKm: totals.totalKm,
        totalDays: totals.totalDays,
        stops: stops.map((s) => ({
          id: s.id, name: s.name, label: s.label,
          lat: s.lat, lng: s.lng,
          countryCode: s.countryCode || '',
          type: s.type,
          dayNumber: s.dayNumber || 1,
          highlights: s.highlights || [],
          kmFromPrevious: s.kmFromPrevious || 0,
          durationFromPrevious: s.durationFromPrevious || '',
          durationSecondsFromPrevious: s.durationSecondsFromPrevious || 0,
        })),
      };
      let saved: Trip;
      if (state.tripId) {
        saved = await updateTrip(state.tripId, payload);
      } else {
        saved = await createTrip(payload);
        setState((s) => ({ ...s, tripId: saved.id }));
        navigate(`/builder/${saved.id}`, { replace: true });
      }
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.setQueryData(['trip', saved.id], saved);
      // Reset snapshot so the dirty check is clean — Cancel won't prompt
      snapshotRef.current = serializeSnapshot({ ...state, tripId: state.tripId || saved.id });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 1800);
    } catch (err) {
      console.error('Save failed', err);
      if (err instanceof ApiError && err.code === 'TRIP_LIMIT_REACHED') {
        alert(`${err.message}\n\nUpgrade to Pro to keep building new trips. (Paddle integration ships in Slice 12.)`);
        navigate('/');
      } else {
        alert('Could not save trip.');
      }
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    if (isDirty()) {
      const ok = window.confirm('Discard unsaved changes?');
      if (!ok) return;
    }
    navigate('/');
  }

  if (isEditing && !hydrated && tripQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted">
          Loading trip…
        </div>
      </div>
    );
  }

  return (
    <section className="grid grid-cols-[420px_1fr] h-screen overflow-hidden">
      <aside className="bg-surface border-r border-line flex flex-col overflow-hidden relative">
        <div className="flex items-start gap-3 px-6 pt-[22px] pb-[18px] border-b border-line">
          <button
            type="button"
            aria-label="Back to dashboard"
            onClick={onCancel}
            className="bg-transparent border border-line text-paper-dim w-8 h-8 rounded text-base flex items-center justify-center mt-[6px] transition-colors hover:text-paper hover:border-paper-dim"
          >
            ←
          </button>
          <EmojiPicker value={state.coverEmoji} onChange={(e) => setState((s) => ({ ...s, coverEmoji: e }))} />
          <input
            type="text"
            value={state.name}
            placeholder="Untitled trip"
            maxLength={80}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
            className="flex-1 bg-transparent border-0 text-paper font-serif italic text-[26px] leading-[1.15] tracking-tight py-1 outline-none min-w-0 placeholder:text-paper-muted placeholder:italic"
          />
        </div>

        <div className="px-6 pt-[18px] pb-1.5 border-b border-line flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-[18px]">
            <label className="block min-w-0">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">Start date</span>
              <input
                type="date"
                value={state.startDate}
                onChange={(e) => setState((s) => ({ ...s, startDate: e.target.value }))}
                className="w-full bg-transparent border-0 border-b border-line text-paper text-[14px] py-1 outline-none transition-colors focus:border-accent [color-scheme:dark]"
              />
            </label>
            <label className="block min-w-0 relative">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">Max / day</span>
              <input
                type="number"
                min={100}
                max={2000}
                step={50}
                inputMode="numeric"
                value={state.maxKmPerDay}
                onChange={(e) => setState((s) => ({ ...s, maxKmPerDay: parseInt(e.target.value, 10) || 600 }))}
                className="w-full bg-transparent border-0 border-b border-line text-paper text-[14px] py-1 pr-7 outline-none transition-colors focus:border-accent [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-0 bottom-2 font-mono text-[10px] tracking-[0.16em] uppercase text-paper-muted pointer-events-none">km</span>
            </label>
          </div>
          <label className="block">
            <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">Description</span>
            <textarea
              rows={2}
              value={state.description}
              placeholder="A note for yourself…"
              onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
              className="w-full bg-transparent border-0 border-b border-line text-paper-dim font-serif italic text-[14px] py-1 outline-none resize-none min-h-[38px] transition-colors focus:border-accent placeholder:text-paper-muted placeholder:italic"
            />
          </label>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden pt-[18px]">
          <div className="px-6 pb-3 font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted flex items-center gap-3">
            <span>Stops</span>
            <span className="text-paper font-medium">{state.stops.length}</span>
          </div>
          <div className="relative px-6 pb-3.5">
            <span className="absolute left-[38px] top-1/2 -translate-y-[7px] text-paper-muted text-[14px] pointer-events-none">⌕</span>
            <input
              ref={searchInputRef}
              type="text"
              autoComplete="off"
              placeholder="Search for a city or place…"
              className="w-full bg-transparent border border-line rounded-md text-paper text-[14px] pl-[38px] pr-3.5 py-[11px] outline-none transition-colors focus:border-accent placeholder:text-paper-muted"
            />
          </div>
          <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-6 pb-3">
            <StopList
              stops={dayedStops}
              startDate={state.startDate}
              onChangeType={setStopType}
              onRemove={removeStop}
              onSetForceDayStart={setForceDayStart}
              onAddHighlight={addHighlight}
              onRemoveHighlight={removeHighlight}
              onDemote={state.tripId ? (s) => demoteStop.mutate(s) : undefined}
              demotingStopId={demoteStop.isPending ? demoteStop.variables?.id ?? null : null}
              onDragStart={(id) => { draggedIdRef.current = id; }}
              onDragEnd={() => { draggedIdRef.current = null; }}
              onDragOver={() => { /* handled in StopRow */ }}
              onDragLeave={() => { /* handled in StopRow */ }}
              onDrop={(id, ev) => reorder(id, ev)}
            />
          </div>
        </div>

        {/* Summary bar */}
        <div className="border-t border-line px-6 pt-3 pb-2.5 flex items-center gap-4 font-mono text-[10px] tracking-[0.16em] uppercase text-paper-dim bg-surface">
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

        <footer className="border-t border-line px-6 py-3.5 flex justify-between items-center gap-3 bg-surface">
          <button
            type="button"
            onClick={onCancel}
            className="bg-transparent border border-line text-paper-dim px-3.5 py-[7px] rounded text-[12px] tracking-wide transition-colors hover:border-paper-dim hover:text-paper"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="bg-accent text-canvas border-0 rounded px-5 py-2.5 font-mono text-[11px] tracking-[0.16em] uppercase font-medium cursor-pointer transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-[0_6px_22px_-6px_rgba(231,111,81,0.5)] active:translate-y-0 disabled:bg-surface-2 disabled:text-paper-muted disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
          >
            {saving ? 'Saving…' : 'Save trip'}
          </button>
        </footer>
      </aside>

      <div className="relative w-full h-full bg-[#13151a]">
        {routes.loading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[rgba(231,111,81,0.06)] overflow-hidden pointer-events-none z-[5]">
            <div className="absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-accent to-transparent animate-drift" />
          </div>
        )}
        <div ref={setMapDiv} className="w-full h-full" />
        {state.tripId && (
          <PinMapLayer
            map={map}
            maps={maps}
            pins={builderPins}
            onRequestCreate={pinModal.openCreate}
            onRequestEdit={pinModal.openEdit}
            onRequestDelete={pinModal.deletePin}
          />
        )}
      </div>

      {pinModal.modalElement}

      {savedToast && (
        <Toast message="Saved" variant="success" onDismiss={() => setSavedToast(false)} durationMs={1800} />
      )}
      <Toast
        message={routes.lastFailure ? `Couldn't route ${routes.lastFailure}` : null}
        onDismiss={routes.clearFailure}
      />
    </section>
  );
}
