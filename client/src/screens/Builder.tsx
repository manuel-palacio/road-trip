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
import { renderStopInfoHtml } from '../lib/stop-info-html';
import { mapStyleForTheme, makeMarkerIcon, polylineOptionsFor, requestGeolocation } from '../lib/google-maps';
import { useTheme } from '../hooks/useTheme';
import { applyDays, dayColor, formatBreakdown, formatDuration, fuelBreakdownForLegs, groupByDay, tripTotals } from '../lib/compute';
import { findFuelSearchTarget, type FuelSearchTarget } from '../lib/fuel-stops';
import type { FuelOverride, FuelUnit, Stop, Trip } from '../lib/types';
import { EmojiPicker } from '../components/builder/EmojiPicker';
import { StopList } from '../components/builder/StopList';
import { FuelStopFinder, type FuelStopResult } from '../components/builder/FuelStopFinder';
import { PinMapLayer } from '../components/viewer/PinMapLayer';
import { Toast } from '../components/Toast';

// Override row uses string fields so blank inputs don't collapse to 0
// before the user finishes typing. Converted to numbers only on save.
type FuelOverrideDraft = {
  id: string;
  countryCode: string;
  price: string;
  currency: string;
};

type BuilderState = {
  tripId: string | null;
  name: string;
  coverEmoji: string;
  startDate: string;
  maxKmPerDay: number;
  description: string;
  stops: Stop[];
  fuelConsumption: string;    // strings so blank fields don't collapse to 0
  fuelUnit: FuelUnit;
  fuelPrice: string;
  fuelCurrency: string;
  fuelOverrides: FuelOverrideDraft[];
  tankRangeKm: number;
};

// Curated currency dropdown — covers Europe + the usual road-trip suspects.
const FUEL_CURRENCIES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'EUR', label: 'EUR €' },
  { code: 'GBP', label: 'GBP £' },
  { code: 'USD', label: 'USD $' },
  { code: 'SEK', label: 'SEK kr' },
  { code: 'NOK', label: 'NOK kr' },
  { code: 'DKK', label: 'DKK kr' },
  { code: 'CHF', label: 'CHF' },
  { code: 'CAD', label: 'CAD $' },
  { code: 'AUD', label: 'AUD $' },
  { code: 'JPY', label: 'JPY ¥' },
  { code: 'PLN', label: 'PLN zł' },
  { code: 'CZK', label: 'CZK Kč' },
  { code: 'HUF', label: 'HUF Ft' },
  { code: 'ISK', label: 'ISK kr' },
];

// Curated country dropdown for per-country overrides. The defaultCurrency
// is used to preselect a sensible currency when the row is created.
const FUEL_COUNTRIES: ReadonlyArray<{ code: string; name: string; defaultCurrency: string }> = [
  { code: 'FR', name: 'France', defaultCurrency: 'EUR' },
  { code: 'DE', name: 'Germany', defaultCurrency: 'EUR' },
  { code: 'IT', name: 'Italy', defaultCurrency: 'EUR' },
  { code: 'ES', name: 'Spain', defaultCurrency: 'EUR' },
  { code: 'PT', name: 'Portugal', defaultCurrency: 'EUR' },
  { code: 'NL', name: 'Netherlands', defaultCurrency: 'EUR' },
  { code: 'BE', name: 'Belgium', defaultCurrency: 'EUR' },
  { code: 'LU', name: 'Luxembourg', defaultCurrency: 'EUR' },
  { code: 'CH', name: 'Switzerland', defaultCurrency: 'CHF' },
  { code: 'AT', name: 'Austria', defaultCurrency: 'EUR' },
  { code: 'GB', name: 'United Kingdom', defaultCurrency: 'GBP' },
  { code: 'IE', name: 'Ireland', defaultCurrency: 'EUR' },
  { code: 'DK', name: 'Denmark', defaultCurrency: 'DKK' },
  { code: 'SE', name: 'Sweden', defaultCurrency: 'SEK' },
  { code: 'NO', name: 'Norway', defaultCurrency: 'NOK' },
  { code: 'FI', name: 'Finland', defaultCurrency: 'EUR' },
  { code: 'IS', name: 'Iceland', defaultCurrency: 'ISK' },
  { code: 'PL', name: 'Poland', defaultCurrency: 'PLN' },
  { code: 'CZ', name: 'Czech Rep.', defaultCurrency: 'CZK' },
  { code: 'HU', name: 'Hungary', defaultCurrency: 'HUF' },
  { code: 'US', name: 'United States', defaultCurrency: 'USD' },
  { code: 'CA', name: 'Canada', defaultCurrency: 'CAD' },
];

const empty = (): BuilderState => ({
  tripId: null,
  name: '',
  coverEmoji: '🚗',
  startDate: '',
  maxKmPerDay: 600,
  description: '',
  stops: [],
  fuelConsumption: '',
  fuelUnit: 'L/100km',
  fuelPrice: '',
  fuelCurrency: 'EUR',
  fuelOverrides: [],
  tankRangeKm: 500,
});

/** One-shot per-version migrations applied on read. v2 normalised legacy
 * type='overnight' defaults to 'waypoint' (pre-aa4674d those defaults were
 * unintentional). v3 promotes legacy fuel waypoints — saved as
 * type='waypoint' + category='fuel' before issue #52 — to first-class
 * type='fuel'. After save we stamp the current dataVersion so each
 * migration runs at most once per trip. */
function migrateLegacyStopTypes(rawStops: Stop[], dataVersion: number | undefined): Stop[] {
  const version = dataVersion ?? 1;
  let stops = rawStops.map((s) => ({ ...s }));
  if (version < 2) {
    const n = stops.length;
    stops = stops.map((s, i) => {
      if (i === 0) return { ...s, type: 'start' as const };
      if (i === n - 1) return { ...s, type: 'destination' as const };
      return { ...s, type: 'waypoint' as const };
    });
  }
  if (version < 3) {
    stops = stops.map((s) =>
      s.type === 'waypoint' && s.category === 'fuel' ? { ...s, type: 'fuel' as const } : s,
    );
  }
  return stops;
}

function reassignTypes(stops: Stop[]): Stop[] {
  const n = stops.length;
  return stops.map((s, i) => {
    if (i === 0) return { ...s, type: 'start' as const };
    if (i === n - 1) return { ...s, type: 'destination' as const };
    // Preserve EXPLICIT overnights and fuel stops in the middle; everything
    // else (including stale 'destination'/'start' types from a stop that
    // was reordered) collapses to 'waypoint' so it doesn't force a day
    // boundary or get re-rendered as something it isn't.
    if (s.type === 'overnight') return { ...s, type: 'overnight' as const };
    if (s.type === 'fuel') return { ...s, type: 'fuel' as const };
    return { ...s, type: 'waypoint' as const };
  });
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
  const theme = useTheme();
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
  // Trip-details disclosure. Expanded by default for brand-new trips so
  // first-time users see all the fields; collapsed by default when
  // editing an existing trip so the stop list gets more vertical room.
  const [detailsOpen, setDetailsOpen] = useState(!isEditing);
  // Mobile bottom-sheet snap state. Below md (768px) the sidebar lives
  // at the bottom of the screen with three heights: peek (only the
  // handle + summary visible), normal (~55dvh, both map and stops
  // visible), full (~92dvh). Ignored on desktop where md: classes win.
  const [sheetState, setSheetState] = useState<'peek' | 'normal' | 'full'>('normal');
  function cycleSheetUp() {
    setSheetState((s) => (s === 'peek' ? 'normal' : 'full'));
  }
  function cycleSheetDown() {
    setSheetState((s) => (s === 'full' ? 'normal' : 'peek'));
  }
  // When non-null, the next stop added via the search box splices at this
  // flat index instead of appending. Set by the inline "+ insert" button
  // between rows; cleared on add or by the user's × on the chip.
  const [insertIndex, setInsertIndex] = useState<number | null>(null);
  const insertIndexRef = useRef<number | null>(null);
  insertIndexRef.current = insertIndex;
  // Resolved gas-station search target (longest leg of a day) when the
  // user opens the FuelStopFinder. Null = modal closed.
  const [fuelTarget, setFuelTarget] = useState<FuelSearchTarget | null>(null);
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
      stops: Array.isArray(t.stops) ? migrateLegacyStopTypes(t.stops, t.dataVersion) : [],
      fuelConsumption: typeof t.fuelConsumption === 'number' ? String(t.fuelConsumption) : '',
      fuelUnit: t.fuelUnit === 'MPG' ? 'MPG' : 'L/100km',
      fuelPrice: typeof t.fuelPrice === 'number' ? String(t.fuelPrice) : '',
      fuelCurrency: t.fuelCurrency || 'EUR',
      fuelOverrides: Array.isArray(t.fuelOverrides)
        ? t.fuelOverrides.map((o) => ({
            id: crypto.randomUUID(),
            countryCode: (o.countryCode || '').toUpperCase(),
            price: typeof o.price === 'number' ? String(o.price) : '',
            currency: (o.currency || 'EUR').toUpperCase(),
          }))
        : [],
      tankRangeKm: typeof t.tankRangeKm === 'number' && t.tankRangeKm > 0 ? t.tankRangeKm : 500,
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
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  // Stop id whose InfoWindow is pinned-open by a click. Mouseover/out on
  // other markers won't override it; map background click clears it.
  const pinnedMarkerIdRef = useRef<string | null>(null);
  // Scroll container holding the stop list — used for auto-scroll while
  // the user drags a stop near the top/bottom edge.
  const stopScrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const autoScrollVelRef = useRef<number>(0);
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
        // Default to 'waypoint' — overnight stops force a day boundary
        // for the next stop in applyDays, which surprises users who
        // expect new stops to land on the same day. The user can flip
        // a stop to 'overnight' explicitly via the per-row select.
        type: 'waypoint',
        highlights: draft.notes ? [draft.notes] : [],
        kmFromPrevious: 0,
        category: draft.category,
        priority: draft.priority,
        notes: draft.notes,
      };
      setState((s) => ({ ...s, stops: reassignTypes([...s.stops, newStop]) }));
    },
    onDemoted: (draft, stop) => {
      // The user clicked Pin on a stop card and confirmed in the modal.
      // Run the demote mutation with the edited draft (so any tweaks to
      // category/priority/notes the user made in the modal are kept).
      demoteStop.mutate({
        stop,
        draft: {
          name: draft.name,
          category: draft.category,
          priority: draft.priority,
          notes: draft.notes,
          lat: draft.lat,
          lng: draft.lng,
        },
      });
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
  // Per-day groupings — used by the StopList's render path AND by the
  // gas-station picker to find the longest leg of a given day.
  const dayGroups = useMemo(() => groupByDay(dayedStops), [dayedStops]);
  function fuelTargetForDay(day: number): FuelSearchTarget | null {
    const g = dayGroups.find((x) => x.day === day);
    if (!g) return null;
    return findFuelSearchTarget(g, dayedStops, getStopPath, state.tankRangeKm);
  }
  function openFuelForDay(day: number) {
    const target = fuelTargetForDay(day);
    if (!target) return;
    setFuelTarget(target);
  }
  function onFuelStopSelected(result: FuelStopResult) {
    if (!fuelTarget) return;
    const newStop: Stop = {
      id: crypto.randomUUID(),
      name: result.name,
      label: result.name,
      lat: result.lat,
      lng: result.lng,
      type: 'fuel',
      category: 'fuel',
      highlights: [],
      kmFromPrevious: 0,
    };
    setState((s) => {
      const stops = [...s.stops];
      const idx = Math.max(0, Math.min(fuelTarget.insertAtFlatIndex, stops.length));
      stops.splice(idx, 0, newStop);
      return { ...s, stops: reassignTypes(stops) };
    });
    setFuelTarget(null);
  }
  // Fuel cost — multi-currency breakdown. Each leg is priced by its
  // destination's countryCode against fuelOverrides, falling back to the
  // trip-level default. Returns null when consumption + price aren't set.
  const fuelConsumptionNum = parseFloat(state.fuelConsumption);
  const fuelPriceNum = parseFloat(state.fuelPrice);
  const compiledOverrides = useMemo<FuelOverride[]>(
    () =>
      state.fuelOverrides
        .map((o) => ({ countryCode: o.countryCode, price: parseFloat(o.price), currency: o.currency }))
        .filter((o) => o.countryCode && Number.isFinite(o.price) && o.price > 0 && o.currency),
    [state.fuelOverrides],
  );
  const totalFuelCostStr = useMemo(() => {
    const b = fuelBreakdownForLegs(
      dayedStops,
      fuelConsumptionNum,
      state.fuelUnit,
      fuelPriceNum,
      state.fuelCurrency,
      compiledOverrides,
    );
    return formatBreakdown(b);
  }, [dayedStops, fuelConsumptionNum, fuelPriceNum, state.fuelUnit, state.fuelCurrency, compiledOverrides]);
  function fuelCostForStops(stops: Stop[]): string | null {
    const b = fuelBreakdownForLegs(
      stops,
      fuelConsumptionNum,
      state.fuelUnit,
      fuelPriceNum,
      state.fuelCurrency,
      compiledOverrides,
    );
    return formatBreakdown(b);
  }
  const flagSet = useMemo(
    () => [...new Set(dayedStops.map((s) => flagEmoji(s.countryCode)).filter(Boolean))],
    [dayedStops],
  );

  function addFuelOverride() {
    // Pre-select the first country that isn't already overridden, falling
    // back to the first in the list. Currency follows the country default.
    const used = new Set(state.fuelOverrides.map((o) => o.countryCode));
    const pick = FUEL_COUNTRIES.find((c) => !used.has(c.code)) || FUEL_COUNTRIES[0];
    setState((s) => ({
      ...s,
      fuelOverrides: [
        ...s.fuelOverrides,
        { id: crypto.randomUUID(), countryCode: pick.code, price: '', currency: pick.defaultCurrency },
      ],
    }));
  }
  function updateFuelOverride(id: string, patch: Partial<FuelOverrideDraft>) {
    setState((s) => ({
      ...s,
      fuelOverrides: s.fuelOverrides.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));
  }
  function removeFuelOverride(id: string) {
    setState((s) => ({ ...s, fuelOverrides: s.fuelOverrides.filter((o) => o.id !== id) }));
  }

  // Init map + autocomplete once SDK ready
  useEffect(() => {
    if (!maps || !mapDiv || map) return;
    const m = new maps.Map(mapDiv, {
      center: { lat: 60, lng: 18 },
      zoom: 4,
      styles: mapStyleForTheme(theme.resolved),
      disableDefaultUI: true,
      zoomControl: true,
      scaleControl: true,
      gestureHandling: 'greedy',
      backgroundColor: theme.resolved === 'light' ? '#efe8d4' : '#13151a',
      clickableIcons: false,
    });
    setMap(m);
    if (searchInputRef.current) {
      autocompleteRef.current = new maps.places.Autocomplete(searchInputRef.current, {
        fields: ['name', 'formatted_address', 'geometry.location', 'address_components'],
      });
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current?.getPlace();
        if (!place?.geometry?.location) return;
        // Search input is a navigation gesture — always add as a route stop.
        // POI metadata (category, priority, notes) lives on pins, which the
        // user adds via the map FAB or by demoting a stop with the Pin
        // button (which opens a modal for details).
        const newStop: Stop = {
          id: crypto.randomUUID(),
          name: place.formatted_address || place.name || '',
          label: place.name || place.formatted_address || '',
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          countryCode: extractCountryCode(place.address_components),
          // 'waypoint' instead of 'overnight' — see the comment on the
          // pin→stop conversion above. New stops land on the same day
          // by default; users mark overnight ones explicitly.
          type: 'waypoint',
          highlights: [],
          kmFromPrevious: 0,
        };
        const idx = insertIndexRef.current;
        setState((s) => {
          const stops = [...s.stops];
          if (idx == null || idx >= stops.length) stops.push(newStop);
          else stops.splice(Math.max(0, idx), 0, newStop);
          return { ...s, stops: reassignTypes(stops) };
        });
        setInsertIndex(null);
        if (searchInputRef.current) searchInputRef.current.value = '';
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, mapDiv]);

  // Re-skin the map when the user flips themes. Setting `styles` is
  // cheap — just swaps the in-memory style array; tiles re-paint on the
  // next interaction.
  useEffect(() => {
    if (!map) return;
    map.setOptions({ styles: mapStyleForTheme(theme.resolved) });
  }, [map, theme.resolved]);

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
    if (!infoWindowRef.current) {
      infoWindowRef.current = new maps.InfoWindow({ disableAutoPan: true });
    }
    const iw = infoWindowRef.current;
    // Click outside any marker closes a pinned InfoWindow.
    const mapClickListener = map.addListener('click', () => {
      pinnedMarkerIdRef.current = null;
      iw.close();
    });
    markersRef.current = dayedStops.map((stop, i) => {
      const marker = new maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map,
        icon: makeMarkerIcon(i + 1, dayColor(stop.dayNumber), stop.type === 'fuel' || stop.category === 'fuel'),
        title: stop.label || stop.name,
      });
      const showInfo = () => {
        iw.setContent(renderStopInfoHtml(stop, i + 1));
        iw.open({ map, anchor: marker });
      };
      marker.addListener('mouseover', () => {
        // While another marker is pinned, hover doesn't take over.
        if (pinnedMarkerIdRef.current && pinnedMarkerIdRef.current !== stop.id) return;
        showInfo();
      });
      marker.addListener('mouseout', () => {
        if (pinnedMarkerIdRef.current === stop.id) return;
        iw.close();
      });
      marker.addListener('click', () => {
        pinnedMarkerIdRef.current = stop.id;
        showInfo();
      });
      return marker;
    });
    fitBounds(map, dayedStops);
    return () => {
      maps.event.removeListener(mapClickListener);
    };
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
        ...polylineOptionsFor(dayedStops[i].routeMode, dayColor(dayedStops[i].dayNumber)),
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
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      if (autoScrollRafRef.current != null) cancelAnimationFrame(autoScrollRafRef.current);
    };
  }, []);

  function setStopRouteMode(id: string, mode: import('../lib/types').StopRouteMode) {
    setState((s) => ({ ...s, stops: s.stops.map((x) => (x.id === id ? { ...x, routeMode: mode } : x)) }));
  }
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

  // Drop on a DayHeader = insert the dragged stop just before the first
  // stop currently assigned to that day. dayedStops is in render order, so
  // its first-of-day stop id maps directly into the flat state.stops list.
  function reorderToDayStart(day: number) {
    const sourceId = draggedIdRef.current;
    if (!sourceId) return;
    const firstOfDay = dayedStops.find((x) => x.dayNumber === day);
    if (!firstOfDay) return;
    setState((s) => {
      const stops = [...s.stops];
      const fromIdx = stops.findIndex((x) => x.id === sourceId);
      if (fromIdx < 0) return s;
      let targetIdx = stops.findIndex((x) => x.id === firstOfDay.id);
      if (targetIdx < 0) return s;
      if (sourceId === firstOfDay.id) return s;
      const [moved] = stops.splice(fromIdx, 1);
      if (fromIdx < targetIdx) targetIdx -= 1;
      stops.splice(targetIdx, 0, moved);
      return { ...s, stops: reassignTypes(stops) };
    });
  }

  function startInsertAt(index: number) {
    setInsertIndex(index);
    setSheetState('full');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Auto-scroll the stop list while a drag is in progress. Triggered when
  // the cursor approaches the top or bottom edge of the scroll container —
  // velocity ramps with proximity to the edge (0 outside the 60px zone).
  function pumpAutoScroll() {
    const el = stopScrollRef.current;
    const vel = autoScrollVelRef.current;
    if (!el || vel === 0) {
      autoScrollRafRef.current = null;
      return;
    }
    el.scrollTop += vel;
    autoScrollRafRef.current = requestAnimationFrame(pumpAutoScroll);
  }
  function onDragOverScroll(ev: React.DragEvent) {
    if (!draggedIdRef.current) return;
    const el = stopScrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const edge = 60;
    let vel = 0;
    if (ev.clientY < rect.top + edge) {
      vel = -Math.ceil(((rect.top + edge - ev.clientY) / edge) * 14);
    } else if (ev.clientY > rect.bottom - edge) {
      vel = Math.ceil(((ev.clientY - (rect.bottom - edge)) / edge) * 14);
    }
    autoScrollVelRef.current = vel;
    if (vel !== 0 && autoScrollRafRef.current == null) {
      autoScrollRafRef.current = requestAnimationFrame(pumpAutoScroll);
    }
  }
  function stopAutoScroll() {
    autoScrollVelRef.current = 0;
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }

  function serializeSnapshot(s: BuilderState): string {
    return JSON.stringify({
      name: s.name || '',
      coverEmoji: s.coverEmoji || '',
      startDate: s.startDate || '',
      description: s.description || '',
      maxKmPerDay: s.maxKmPerDay || 600,
      fuelConsumption: s.fuelConsumption || '',
      fuelUnit: s.fuelUnit || 'L/100km',
      fuelPrice: s.fuelPrice || '',
      fuelCurrency: s.fuelCurrency || 'EUR',
      fuelOverrides: (s.fuelOverrides || []).map((o) => ({
        countryCode: o.countryCode || '',
        price: o.price || '',
        currency: o.currency || '',
      })),
      tankRangeKm: s.tankRangeKm || 500,
      stops: (s.stops || []).map((x) => ({
        id: x.id, name: x.name, label: x.label,
        lat: x.lat, lng: x.lng,
        countryCode: x.countryCode || '',
        type: x.type,
        forceDayStart: x.forceDayStart === true,
        highlights: x.highlights || [],
        routeMode: x.routeMode || 'fastest',
        category: x.category || '',
        priority: x.priority || '',
        notes: x.notes || '',
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
        fuelConsumption: Number.isFinite(fuelConsumptionNum) && fuelConsumptionNum > 0 ? fuelConsumptionNum : undefined,
        fuelUnit: state.fuelUnit,
        fuelPrice: Number.isFinite(fuelPriceNum) && fuelPriceNum > 0 ? fuelPriceNum : undefined,
        fuelCurrency: state.fuelCurrency || 'EUR',
        fuelOverrides: compiledOverrides.length > 0 ? compiledOverrides : undefined,
        tankRangeKm: state.tankRangeKm > 0 ? state.tankRangeKm : undefined,
        dataVersion: 3,
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
          ...(s.routeMode ? { routeMode: s.routeMode } : {}),
          ...(s.category ? { category: s.category } : {}),
          ...(s.priority ? { priority: s.priority } : {}),
          ...(s.notes ? { notes: s.notes } : {}),
          ...(s.forceDayStart ? { forceDayStart: true } : {}),
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
        // Server message is plan-aware (different copy for free vs pro)
        alert(err.message);
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
    <section className="relative h-screen overflow-hidden md:grid md:grid-cols-[360px_1fr]">
      <aside
        className={`bg-surface border-line flex flex-col overflow-hidden
          fixed left-0 right-0 bottom-0 z-40
          border-t rounded-t-2xl shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.55)]
          transition-[height] duration-300 ease-out-soft
          ${sheetState === 'peek' ? 'h-[64px]' : sheetState === 'normal' ? 'h-[55dvh]' : 'h-[92dvh]'}
          md:relative md:left-auto md:right-auto md:bottom-auto md:h-auto
          md:rounded-none md:border-t-0 md:border-r md:shadow-none md:transition-none
          md:max-w-none md:w-auto
        `}
      >
        {/* Mobile-only sheet handle. Two small chevrons flank a drag pill;
            tap the pill to cycle up. The chevrons appear only when the
            corresponding direction is available. */}
        <div className="md:hidden flex items-center justify-center gap-3 pt-2 pb-0.5 shrink-0">
          {sheetState !== 'peek' && (
            <button
              type="button"
              onClick={cycleSheetDown}
              aria-label="Collapse stop sheet"
              className="text-paper-muted hover:text-paper text-[11px] leading-none px-1"
            >
              ▼
            </button>
          )}
          <button
            type="button"
            onClick={cycleSheetUp}
            aria-label={sheetState === 'full' ? 'Sheet at maximum height' : 'Expand stop sheet'}
            className="block w-12 h-1.5 bg-line-strong rounded-full hover:bg-paper-muted transition-colors"
          />
          {sheetState !== 'full' && (
            <button
              type="button"
              onClick={cycleSheetUp}
              aria-label="Expand stop sheet"
              className="text-paper-muted hover:text-paper text-[11px] leading-none px-1"
            >
              ▲
            </button>
          )}
        </div>
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

        <div className="border-b border-line">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
            aria-controls="trip-details-panel"
            className="w-full flex items-center justify-between px-6 py-2.5 font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted hover:text-paper transition-colors"
          >
            <span>Trip details</span>
            <span aria-hidden className="text-[12px]">{detailsOpen ? '▾' : '▸'}</span>
          </button>
        </div>
        {detailsOpen && (
        <div id="trip-details-panel" className="px-6 pt-1 pb-3 border-b border-line flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-[18px]">
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
            <label className="block min-w-0 relative">
              <span
                className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5"
                title="Approximate distance the car covers on a full tank. Days with a single leg longer than this surface a refuel warning + the 'Find fuel stop' suggester."
              >
                Tank range
              </span>
              <input
                type="number"
                min={100}
                max={1500}
                step={50}
                inputMode="numeric"
                value={state.tankRangeKm}
                onChange={(e) => setState((s) => ({ ...s, tankRangeKm: parseInt(e.target.value, 10) || 500 }))}
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

          {/* Fuel cost estimator — all four fields optional. The summary bar
              and day headers only render a cost when consumption+price are set. */}
          <div className="grid grid-cols-[1fr_auto_1fr_1fr] gap-3 items-end">
            <label className="block min-w-0 relative">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">Fuel</span>
              <input
                type="number"
                min={0}
                step={0.1}
                inputMode="decimal"
                placeholder="—"
                value={state.fuelConsumption}
                onChange={(e) => setState((s) => ({ ...s, fuelConsumption: e.target.value }))}
                className="w-full bg-transparent border-0 border-b border-line text-paper text-[14px] py-1 outline-none transition-colors focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-paper-muted"
              />
            </label>
            <label className="block">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5 invisible">.</span>
              <select
                value={state.fuelUnit}
                onChange={(e) => setState((s) => ({ ...s, fuelUnit: e.target.value as FuelUnit }))}
                className="bg-transparent border-0 border-b border-line text-paper text-[12px] py-1 pr-3 outline-none cursor-pointer transition-colors focus:border-accent"
              >
                <option value="L/100km">L/100km</option>
                <option value="MPG">MPG</option>
              </select>
            </label>
            <label className="block min-w-0 relative">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">Price</span>
              <input
                type="number"
                min={0}
                step={0.01}
                inputMode="decimal"
                placeholder="—"
                value={state.fuelPrice}
                onChange={(e) => setState((s) => ({ ...s, fuelPrice: e.target.value }))}
                className="w-full bg-transparent border-0 border-b border-line text-paper text-[14px] py-1 outline-none transition-colors focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-paper-muted"
              />
            </label>
            <label className="block min-w-0">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">Cur.</span>
              <select
                value={state.fuelCurrency}
                onChange={(e) => setState((s) => ({ ...s, fuelCurrency: e.target.value }))}
                className="w-full bg-transparent border-0 border-b border-line text-paper text-[13px] py-1 outline-none cursor-pointer transition-colors focus:border-accent"
              >
                {FUEL_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Per-country fuel overrides. When a leg's destination has a
              matching countryCode, its (price, currency) replaces the trip
              defaults. Used in the breakdown shown in summary + day rows. */}
          {state.fuelOverrides.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted">
                Per-country prices
              </span>
              {state.fuelOverrides.map((o) => (
                <div key={o.id} className="grid grid-cols-[1.2fr_1fr_1fr_auto] gap-2 items-center">
                  <select
                    value={o.countryCode}
                    onChange={(e) => {
                      const nextCc = e.target.value;
                      const country = FUEL_COUNTRIES.find((c) => c.code === nextCc);
                      // Bump currency to the country's default when the user
                      // switches country — but only if they haven't yet set
                      // a price (less likely they intend the same currency).
                      const nextCur = !o.price && country ? country.defaultCurrency : o.currency;
                      updateFuelOverride(o.id, { countryCode: nextCc, currency: nextCur });
                    }}
                    className="bg-transparent border-0 border-b border-line text-paper text-[13px] py-1 outline-none cursor-pointer transition-colors focus:border-accent min-w-0"
                    aria-label="Country"
                  >
                    {FUEL_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    inputMode="decimal"
                    placeholder="Price"
                    value={o.price}
                    onChange={(e) => updateFuelOverride(o.id, { price: e.target.value })}
                    className="bg-transparent border-0 border-b border-line text-paper text-[13px] py-1 outline-none transition-colors focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-paper-muted min-w-0"
                    aria-label="Price"
                  />
                  <select
                    value={o.currency}
                    onChange={(e) => updateFuelOverride(o.id, { currency: e.target.value })}
                    className="bg-transparent border-0 border-b border-line text-paper text-[13px] py-1 outline-none cursor-pointer transition-colors focus:border-accent min-w-0"
                    aria-label="Currency"
                  >
                    {FUEL_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeFuelOverride(o.id)}
                    aria-label="Remove override"
                    title="Remove override"
                    className="bg-transparent border border-line text-paper-dim w-7 h-7 rounded text-[14px] flex items-center justify-center transition-colors hover:text-paper hover:border-paper-dim"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={addFuelOverride}
            className="self-start bg-transparent border border-line text-paper-dim px-2.5 py-[5px] rounded font-mono text-[10px] tracking-[0.16em] uppercase transition-colors hover:text-paper hover:border-paper-dim"
          >
            + Country override
          </button>
        </div>
        )}

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
              placeholder={insertIndex == null ? 'Search for a city or place…' : 'Search the place to insert…'}
              onFocus={() => setSheetState('full')}
              className="w-full bg-transparent border border-line rounded-md text-paper text-[14px] pl-[38px] pr-3.5 py-[11px] outline-none transition-colors focus:border-accent placeholder:text-paper-muted"
            />
            {insertIndex != null && (() => {
              const before = insertIndex > 0 ? dayedStops[insertIndex - 1] : null;
              const after = insertIndex < dayedStops.length ? dayedStops[insertIndex] : null;
              let label: string;
              if (before && after) label = `Insert between ${before.label || before.name} and ${after.label || after.name}`;
              else if (before) label = `Insert after ${before.label || before.name}`;
              else if (after) label = `Insert before ${after.label || after.name}`;
              else label = 'Insert as first stop';
              return (
                <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent-soft border border-accent text-accent font-mono text-[10px] tracking-[0.14em] uppercase max-w-full">
                  <span className="truncate normal-case tracking-normal font-sans text-[11.5px]">{label}</span>
                  <button
                    type="button"
                    onClick={() => setInsertIndex(null)}
                    aria-label="Cancel insert"
                    title="Cancel insert"
                    className="text-accent hover:text-paper text-[13px] leading-none -mr-1 px-1"
                  >
                    ×
                  </button>
                </div>
              );
            })()}
          </div>
          <div
            ref={stopScrollRef}
            className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-6 pb-3"
            onDragOver={onDragOverScroll}
            onDragLeave={stopAutoScroll}
            onDrop={stopAutoScroll}
          >
            <StopList
              stops={dayedStops}
              startDate={state.startDate}
              fuelCostFor={fuelCostForStops}
              insertIndex={insertIndex}
              onInsertAt={startInsertAt}
              onChangeType={setStopType}
              onChangeRouteMode={setStopRouteMode}
              onRemove={removeStop}
              onSetForceDayStart={setForceDayStart}
              onAddHighlight={addHighlight}
              onRemoveHighlight={removeHighlight}
              onDemote={state.tripId ? (s) => pinModal.openDemote(s) : undefined}
              demotingStopId={
                demoteStop.isPending && demoteStop.variables
                  ? ('stop' in demoteStop.variables
                      ? demoteStop.variables.stop.id
                      : demoteStop.variables.id)
                  : null
              }
              onDragStart={(id) => { draggedIdRef.current = id; }}
              onDragEnd={() => { draggedIdRef.current = null; stopAutoScroll(); }}
              onDragOver={() => { /* handled in StopRow */ }}
              onDragLeave={() => { /* handled in StopRow */ }}
              onDrop={(id, ev) => reorder(id, ev)}
              onDropAtDayStart={reorderToDayStart}
              onFindFuelForDay={openFuelForDay}
              canFindFuelForDay={(day) => fuelTargetForDay(day) !== null}
              tankRangeKm={state.tankRangeKm}
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
          {totalFuelCostStr && (
            <span className="inline-flex items-baseline gap-1">
              <span className="text-paper text-[14px] font-medium tracking-normal normal-case">{totalFuelCostStr}</span>
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
            className="bg-accent text-canvas border border-accent rounded px-3.5 py-[7px] text-[12px] tracking-wide font-medium cursor-pointer transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-[0_6px_22px_-6px_rgba(231,111,81,0.5)] active:translate-y-0 disabled:bg-surface-2 disabled:border-line disabled:text-paper-muted disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
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

      {fuelTarget && maps && map && (
        <FuelStopFinder
          target={fuelTarget}
          maps={maps}
          map={map}
          onSelect={onFuelStopSelected}
          onClose={() => setFuelTarget(null)}
        />
      )}

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
