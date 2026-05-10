import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfig } from '../hooks/useConfig';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import { createTrip, getTrip, updateTrip } from '../lib/api';
import { extractCountryCode, flagEmoji } from '../lib/flags';
import { MAP_STYLE, makeMarkerIcon, requestGeolocation } from '../lib/google-maps';
import type { Stop, Trip } from '../lib/types';
import { EmojiPicker } from '../components/builder/EmojiPicker';
import { StopRow } from '../components/builder/StopRow';

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

  // Hydrate from loaded trip
  useEffect(() => {
    if (!isEditing || !tripQuery.data) return;
    const t = tripQuery.data;
    setState({
      tripId: t.id,
      name: t.name || '',
      coverEmoji: t.coverEmoji || '🚗',
      startDate: t.startDate || '',
      maxKmPerDay: typeof t.maxKmPerDay === 'number' && t.maxKmPerDay > 0 ? t.maxKmPerDay : 600,
      description: t.description || '',
      stops: Array.isArray(t.stops) ? t.stops.map((s) => ({ ...s })) : [],
    });
    setHydrated(true);
  }, [isEditing, tripQuery.data]);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Init map + autocomplete once SDK ready
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
    if (searchInputRef.current) {
      autocompleteRef.current = new maps.places.Autocomplete(searchInputRef.current, {
        fields: ['name', 'formatted_address', 'geometry.location', 'address_components'],
        // No `types` restriction — geocoded places + establishments (hotels, POIs)
      });
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current?.getPlace();
        if (!place?.geometry?.location) return;
        const newStop: Stop = {
          id: crypto.randomUUID(),
          name: place.formatted_address || place.name || '',
          label: place.name || place.formatted_address || '',
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          countryCode: extractCountryCode(place.address_components),
          type: 'overnight',
          highlights: [],
          kmFromPrevious: 0,
        };
        setState((s) => ({ ...s, stops: reassignTypes([...s.stops, newStop]) }));
        if (searchInputRef.current) searchInputRef.current.value = '';
      });
    }
  }, [maps]);

  // Geolocation centering for new trips (once map is ready)
  useEffect(() => {
    if (!maps || !mapRef.current || isEditing) return;
    let alive = true;
    requestGeolocation().then((loc) => {
      if (!alive || !mapRef.current) return;
      if (loc) {
        mapRef.current.setCenter(loc);
        mapRef.current.setZoom(10);
      }
    });
    return () => { alive = false; };
  }, [maps, isEditing]);

  // Sync markers to state.stops
  useEffect(() => {
    if (!maps || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = state.stops.map((stop, i) =>
      new maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map: mapRef.current,
        icon: makeMarkerIcon(i + 1),
        title: stop.label || stop.name,
      }),
    );
    fitBounds(mapRef.current, state.stops);
  }, [maps, state.stops]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
    };
  }, []);

  function setStopType(id: string, type: Stop['type']) {
    setState((s) => ({ ...s, stops: s.stops.map((x) => (x.id === id ? { ...x, type } : x)) }));
  }
  function removeStop(id: string) {
    setState((s) => ({ ...s, stops: reassignTypes(s.stops.filter((x) => x.id !== id)) }));
  }

  async function onSave() {
    if (saving) return;
    setSaving(true);
    try {
      const stops = state.stops;
      const countries = [...new Set(stops.map((s) => flagEmoji(s.countryCode)).filter(Boolean))];
      const totalKm = stops.reduce((sum, s) => sum + (s.kmFromPrevious || 0), 0);
      const totalDays = stops.length === 0 ? 0 : Math.max(...stops.map((s) => s.dayNumber || 1));
      const payload: Partial<Trip> = {
        name: (state.name || '').trim() || 'Untitled trip',
        coverEmoji: state.coverEmoji || '🚗',
        startDate: state.startDate || null,
        maxKmPerDay: state.maxKmPerDay || 600,
        description: state.description || '',
        countries,
        totalKm,
        totalDays,
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
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 1800);
    } catch (err) {
      console.error('Save failed', err);
      alert('Could not save trip.');
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
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
          <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-6 pb-3 flex flex-col gap-2">
            {state.stops.map((stop, i) => (
              <StopRow
                key={stop.id}
                stop={stop}
                index={i}
                onChangeType={setStopType}
                onRemove={removeStop}
              />
            ))}
            {state.stops.length === 0 && (
              <p className="px-6 py-5 text-center font-serif italic text-[14px] text-paper-muted leading-[1.5]">
                Search above to add your first stop.
              </p>
            )}
          </div>
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
        <div ref={mapDivRef} className="w-full h-full" />
      </div>

      {savedToast && (
        <div className="fixed bottom-6 right-6 z-[200] bg-surface border border-accent rounded-md px-4 py-2.5 font-mono text-[11px] tracking-wide text-accent max-w-[360px] shadow-[0_12px_30px_-8px_rgba(0,0,0,0.5)]">
          Saved
        </div>
      )}
    </section>
  );
}
