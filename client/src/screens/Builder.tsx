import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useConfig } from '../hooks/useConfig';
import { useGoogleMaps } from '../hooks/useGoogleMaps';
import { useRouteSegments, getStopPath } from '../hooks/useRouteSegments';
import { useLegCostMarkers } from '../hooks/useLegCostMarkers';
import { usePinModal } from '../hooks/usePinModal';
import { useCreatePin, usePins } from '../hooks/usePins';
import { useDemoteStop, usePromotePin } from '../hooks/usePromoteAction';
import { useAutoFuel } from '../hooks/useAutoFuel';
import { useFavorites } from '../hooks/useFavorites';
import { useMe } from '../hooks/useMe';
import type { PlacesSearchFn } from '../lib/auto-fuel-pick';
import { ApiError, addCollaborator, claimNearbySearch, createTrip, getTrip, lookupUserByEmail, removeCollaborator, updateTrip } from '../lib/api';
import { extractCountryCode, flagEmoji } from '../lib/flags';
import { renderStopInfoHtml } from '../lib/stop-info-html';
import { lookupLocalityForPlace, makeMarkerContent, mapStyleForTheme, polylineOptionsFor, requestGeolocation } from '../lib/google-maps';
import { stopCategory } from '../lib/pin-meta';
import { guessCategoryFromTypes, isConcretePlace } from '../lib/place-to-category';
import { useTheme } from '../hooks/useTheme';
import { applyDays, clampMapStripHeight, compileFuelOverrides, dayColor, formatBreakdown, formatDuration, formatFillUps, formatVolume, fuelBreakdownForLegs, fuelConfigState, fuelVolumeForLegs, groupByDay, tripCountriesFromStops, tripTotals } from '../lib/compute';
import { clearableFuelFields } from '../lib/fuel-payload';
import { shouldHydrateTrip } from '../lib/trip-hydration';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { scheduleForStops } from '../../../shared/schedule';
import { dayEndTarget, dayNeedsOvernightSuggestion } from '../lib/overnight-suggest';
import { nearbySearchFilterFor } from '../lib/nearby-search';

const MAX_VIA_POINTS = 3;
import { dayStartTarget, findLongestLegTarget, type FuelSearchTarget } from '../lib/fuel-stops';
import { computeFuelTimeline } from '../lib/fuel-timeline';
import { downsamplePath, MAX_ROUTE_PATH_POINTS } from '../lib/route-path';
import { removeStopById, spliceStopAt } from '../lib/stop-ops';
import { defaultCurrencyForLocale } from '../lib/locale';
import type { FuelOverride, FuelType, FuelUnit, PinCategory, Stop, Trip } from '../lib/types';
import { CollaboratorList } from '../components/builder/CollaboratorList';
import { CountryOverrideRow } from '../components/builder/CountryOverrideRow';
import { FUEL_BOUNDS, validateConsumption, validatePrice, validateTankRange, validateTankSize } from '../lib/fuel-bounds';
import { DatePicker } from '../components/DatePicker';
import { EmojiPicker } from '../components/builder/EmojiPicker';
import { StopList } from '../components/builder/StopList';
import { DayColumn } from '../components/builder/DayColumn';
import { DayNav } from '../components/builder/DayNav';
import { NearbyFinder, type NearbyResult, type SelectMode } from '../components/builder/NearbyFinder';
import { PinMapLayer } from '../components/viewer/PinMapLayer';
import { Toast } from '../components/Toast';
import { useLayoutMode } from '../hooks/useLayoutMode';

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
  fuelType: FuelType;
  fuelPrice: string;
  fuelCurrency: string;
  fuelOverrides: FuelOverrideDraft[];
  tankRangeKm: number;
  tankSizeLitres: string;     // string for the same blank-vs-0 reason
  autoFuel: boolean;
  suggestHotels: boolean;
  driveStartTime: string;         // "HH:MM"; '' = scheduling off
  maxDriveMinutesPerDay: string;  // string for the blank-vs-0 reason
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
  fuelType: 'gasoline',
  fuelPrice: '',
  // New trips seed the fuel currency from the browser locale (sv-SE → SEK,
  // en-US → USD, etc.). Loaded trips keep their stored currency; trips
  // without one still fall back to EUR at the load site.
  fuelCurrency: defaultCurrencyForLocale(),
  fuelOverrides: [],
  tankRangeKm: 500,
  tankSizeLitres: '',
  autoFuel: true,
  suggestHotels: true,
  driveStartTime: '',
  maxDriveMinutesPerDay: '',
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

function markUserTouched(stop: Stop): Stop {
  if (!stop.addedByAuto) return stop;
  const { addedByAuto: _ignored, ...rest } = stop;
  return rest as Stop;
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
  // Padding scales to container height — Plan mode renders the map as a
  // 240px-tall strip, where padding=80 leaves only 80px of vertical fit
  // area and forces Google Maps to clamp the zoom to "show the globe."
  // 8% of the shorter dimension works for both the full-height Map mode
  // viewport and the compact Plan mode strip.
  const div = map.getDiv();
  const padding = Math.max(16, Math.round(Math.min(div.clientWidth, div.clientHeight) * 0.08));
  map.fitBounds(b, padding);
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

  const me = useMe(true);

  const [state, setState] = useState<BuilderState>(empty);
  const [hydrated, setHydrated] = useState(!isEditing);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  // Collaborator invite state — only used when the trip details modal is open
  // and the current user is the owner.
  const [inviteEmail, setInviteEmail] = useState('');
  const [collabError, setCollabError] = useState<string | null>(null);
  const [collabPending, setCollabPending] = useState(false);
  const [collaboratorProfiles, setCollaboratorProfiles] = useState<Record<string, { displayName: string; photoURL: string }>>({});
  const [autoFuelWarnings, setAutoFuelWarnings] = useState<Record<number, number>>({});
  const [autoFuelToast, setAutoFuelToast] = useState<{ message: string } | null>(null);
  const undoSnapshotRef = useRef<Stop[] | null>(null);
  // Trip-details disclosure — closed by default, including for brand-new
  // trips (issue #121). Opening a config form before a single stop exists
  // asks questions the user can't answer yet (max km/day, tank range);
  // the day-header "Set fuel" nudges pull people back here once there's a
  // route to price.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Focus management for the trip-details modal lives in useFocusTrap
  // (Escape, Tab containment, focus restore) — see issue #123.
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
  // Builder layout mode — `map` is the original sidebar + map grid;
  // `plan` is the day-as-column kanban with the map shrunk to a strip.
  // Persisted in localStorage by useLayoutMode; the default below only
  // applies the first time a user lands here.
  const layout = useLayoutMode('map');
  // Resizable Plan-mode map strip — user drags the handle below the map
  // to claim more or less vertical space. Persists via localStorage so
  // their preference survives reloads. null = use the default clamp().
  const [mapStripHeight, setMapStripHeight] = useState<number | null>(() => {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem('roadtrip:planMapHeight');
    const n = raw ? parseFloat(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const [resizingMap, setResizingMap] = useState(false);
  const mapStripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mapStripHeight === null) return;
    try { localStorage.setItem('roadtrip:planMapHeight', String(mapStripHeight)); } catch { /* quota */ }
  }, [mapStripHeight]);
  function startMapResize(e: React.PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    // Snap to the current rendered height so the drag delta is meaningful
    // even on first resize (when mapStripHeight is still null and the
    // strip is sized via CSS clamp).
    const startHeight = mapStripRef.current?.clientHeight
      ?? mapStripHeight
      ?? 320;
    setResizingMap(true);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    function onMove(ev: PointerEvent) {
      setMapStripHeight(clampMapStripHeight(startHeight + (ev.clientY - startY), window.innerHeight));
    }
    function onUp() {
      setResizingMap(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }
  // Pending NearbyFinder open. category drives the Google Places type
  // filter + the modal copy; target is the leg-midpoint (fuel) or the
  // day's first stop (other categories) as the search anchor.
  const [nearbyOpen, setNearbyOpen] = useState<
    | { category: PinCategory; target: FuelSearchTarget; widened?: boolean; legPolyline?: { lat: number; lng: number }[] }
    | null
  >(null);
  const snapshotRef = useRef<string | null>(null);
  const draggedIdRef = useRef<string | null>(null);
  const hydratedTripIdRef = useRef<string | null>(null);
  const detailsTrapRef = useFocusTrap<HTMLDivElement>(() => setDetailsOpen(false));

  // Hydrate from loaded trip — once per trip. tripQuery.data also changes on
  // refetches and on the post-save cache write; re-hydrating then would
  // overwrite edits made while the save was in flight.
  useEffect(() => {
    if (!isEditing || !shouldHydrateTrip(hydratedTripIdRef.current, tripQuery.data)) return;
    const t = tripQuery.data!;
    hydratedTripIdRef.current = t.id;
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
      fuelType: t.fuelType === 'ev' || t.fuelType === 'diesel' ? t.fuelType : 'gasoline',
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
      tankSizeLitres: typeof t.tankSizeLitres === 'number' && t.tankSizeLitres > 0
        ? String(t.tankSizeLitres)
        : '',
      autoFuel: t.autoFuel ?? true,
      suggestHotels: t.suggestHotels ?? true,
      driveStartTime: t.driveStartTime || '',
      maxDriveMinutesPerDay:
        typeof t.maxDriveMinutesPerDay === 'number' && t.maxDriveMinutesPerDay > 0
          ? String(t.maxDriveMinutesPerDay)
          : '',
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
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const autoFuelPausedRef = useRef(false);
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

  const favorites = useFavorites();

  const handleFavoriteAdd = (stop: Stop) => {
    favorites.add({
      name: stop.name,
      label: stop.label,
      lat: stop.lat,
      lng: stop.lng,
      countryCode: stop.countryCode,
      category: stop.category,
      sourceTripId: state.tripId || undefined,
      sourceTripName: state.name || undefined,
    });
  };

  const handleFavoriteRemove = (id: string) => favorites.remove(id);

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
  const createPin = useCreatePin(state.tripId || '');

  // Enrich stops with km/duration/path from Directions API
  const routes = useRouteSegments(state.stops, maps);
  // Compute day numbers based on enriched km + max km/day setting
  const dayedStops = useMemo(
    () => applyDays(routes.enriched, state.maxKmPerDay || 600),
    [routes.enriched, state.maxKmPerDay],
  );
  const totals = useMemo(() => tripTotals(dayedStops), [dayedStops]);
  // Arrival/departure clock times (issue #114) — undefined when the trip has
  // no drive start time, which hides the time chips + stay editors entirely.
  const stopSchedule = useMemo(
    () => (state.driveStartTime ? scheduleForStops(dayedStops, state.driveStartTime) : undefined),
    [dayedStops, state.driveStartTime],
  );
  const maxDriveMinutes = useMemo(() => {
    const minutes = parseFloat(state.maxDriveMinutesPerDay);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
  }, [state.maxDriveMinutesPerDay]);
  // Per-day groupings — used by the StopList's render path AND by the
  // gas-station picker to find the longest leg of a given day.
  const dayGroups = useMemo(() => groupByDay(dayedStops), [dayedStops]);
  const fuelTimeline = useMemo(
    () => computeFuelTimeline(dayedStops, state.tankRangeKm || 0),
    [dayedStops, state.tankRangeKm],
  );
  // Distinct ISO country codes in visit order. Drives the auto-populated
  // per-country fuel-override rows in the trip-details modal (issue #57).
  const tripCountries = useMemo(() => tripCountriesFromStops(dayedStops), [dayedStops]);

  const placesSearch: PlacesSearchFn | null = useMemo(() => {
    if (!maps || !map) return null;
    return async (location, radiusMeters) => {
      if (autoFuelPausedRef.current) return [];
      try {
        await claimNearbySearch();
      } catch (err) {
        if ((err as { code?: string }).code === 'NEARBY_SEARCH_LIMIT') {
          if (!autoFuelPausedRef.current) {
            autoFuelPausedRef.current = true;
            setAutoFuelToast({ message: 'Daily map limit reached — auto-fuel paused until tomorrow.' });
          }
          return [];
        }
        // Fail open on any other error — proceed with the search.
      }
      return new Promise<import('../components/builder/NearbyFinder').NearbyResult[]>((resolve) => {
        const svc = new maps.places.PlacesService(map);
        svc.nearbySearch(
          { location, radius: radiusMeters, ...nearbySearchFilterFor('fuel', state.fuelType) },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (raw: any, status: any) => {
            if (status !== maps.places.PlacesServiceStatus.OK || !raw) return resolve([]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolve(raw.filter((r: any) => r.geometry?.location).map((r: any) => ({
              placeId: r.place_id || '',
              name: r.name || 'Fuel stop',
              vicinity: r.vicinity || '',
              rating: typeof r.rating === 'number' ? r.rating : undefined,
              lat: r.geometry!.location!.lat(),
              lng: r.geometry!.location!.lng(),
            })));
          }
        );
      });
    };
  }, [maps, map]);

  useAutoFuel({
    enabled: state.autoFuel !== false,
    tripId: state.tripId,
    stops: state.stops,
    enrichedStops: dayedStops,
    tankRangeKm: state.tankRangeKm || 0,
    placesSearch,
    onPropose: (next, inserted, _removed) => {
      if (!undoSnapshotRef.current) undoSnapshotRef.current = state.stops;
      setState((s) => ({ ...s, stops: next }));
      const msg = inserted.length === 1
        ? `Added fuel stop near ${inserted[0].label} · Undo`
        : `Added ${inserted.length} fuel stops · Undo`;
      setAutoFuelToast({ message: msg });
    },
    onWarning: (warnings) => {
      const warningMap: Record<number, number> = {};
      for (const w of warnings) if (w.dayNumber) warningMap[w.dayNumber] = w.gapKm;
      setAutoFuelWarnings(warningMap);
    },
  });
  function fuelTargetForDay(day: number): FuelSearchTarget | null {
    const g = dayGroups.find((x) => x.day === day);
    if (!g) return null;
    // Manual "+ Fuel" pick: target the day's longest leg unconditionally.
    // tankRangeKm gates the WARNING chip (longestLegOverRange) but should not
    // block the user from explicitly adding a fuel stop on a short-leg day.
    return findLongestLegTarget(g, dayedStops, getStopPath);
  }
  function openCategoryForDay(day: number, category: PinCategory) {
    const g = dayGroups.find((x) => x.day === day);
    if (!g) return;
    const target = category === 'fuel'
      ? findLongestLegTarget(g, dayedStops, getStopPath)
      : dayStartTarget(g);
    if (!target) return;
    setNearbyOpen({ category, target });
  }
  function openHotelSuggestForDay(day: number) {
    const g = dayGroups.find((x) => x.day === day);
    if (!g) return;
    const target = dayEndTarget(g);
    if (!target) return;
    setNearbyOpen({ category: 'hotel', target });
  }
  async function onNearbyResultSelected(result: NearbyResult, mode: SelectMode) {
    if (!nearbyOpen) return;
    const { category, target } = nearbyOpen;
    setNearbyOpen(null);

    if (mode === 'pin') {
      createPin.mutate({
        name: result.name,
        lat: result.lat,
        lng: result.lng,
        category,
        priority: 'want',
        notes: '',
      });
      return;
    }

    const insertAt = target.insertAtFlatIndex;
    // Look up the locality so the chip reads "Grenoble" instead of
    // "Circle K Grenoble Autoroute A48". Falls back to the result name
    // when the Places Details call can't resolve a usable locality.
    const locality = maps && map
      ? await lookupLocalityForPlace(maps, map, result.placeId).catch(() => null)
      : null;
    // Every category inserts as a routed stop — that's the whole point
    // of picking somewhere to go. Type varies by category so day-boundary
    // semantics + the visual treatment match user intent:
    //   fuel  → 'fuel'      (pit-stop chip, transparent to AA's 10-stop limit)
    //   hotel → 'overnight' (triggers a day boundary at the next stop —
    //                        "I'm sleeping here")
    //   food  → 'waypoint'  (regular routing stop)
    //   scenic→ 'waypoint'
    const stopType: Stop['type'] =
      category === 'fuel' ? 'fuel'
      : category === 'hotel' ? 'overnight'
      : 'waypoint';
    const fallbackLabel = category === 'fuel' ? 'Fuel stop' : result.name;
    const newStop: Stop = {
      id: crypto.randomUUID(),
      name: result.name,
      label: locality ?? fallbackLabel,
      lat: result.lat,
      lng: result.lng,
      type: stopType,
      category,
      highlights: [],
      kmFromPrevious: 0,
    };
    setState((s) => ({ ...s, stops: reassignTypes(spliceStopAt(s.stops, insertAt, newStop)) }));
  }
  // Fuel cost — multi-currency breakdown. Each leg is priced by its
  // destination's countryCode against fuelOverrides, falling back to the
  // trip-level default. Returns null when consumption + price aren't set.
  const fuelConsumptionNum = parseFloat(state.fuelConsumption);
  const fuelPriceNum = parseFloat(state.fuelPrice);
  const compiledOverrides = useMemo<FuelOverride[]>(
    () => compileFuelOverrides(state.fuelOverrides),
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
  const totalFuelVolumeStr = useMemo(() => {
    const v = fuelVolumeForLegs(dayedStops, fuelConsumptionNum, state.fuelUnit);
    return formatVolume(v, state.fuelUnit, state.fuelType);
  }, [dayedStops, fuelConsumptionNum, state.fuelUnit]);
  const totalFillUpsStr = useMemo(() => {
    const v = fuelVolumeForLegs(dayedStops, fuelConsumptionNum, state.fuelUnit);
    const tank = parseFloat(state.tankSizeLitres);
    return formatFillUps(v, Number.isFinite(tank) ? tank : null, state.fuelUnit, state.fuelType);
  }, [dayedStops, fuelConsumptionNum, state.fuelUnit, state.tankSizeLitres]);
  // Compact "× N" form for the summary chip — the verbose
  // "approx. N fill-ups" is preserved for the title (tooltip), the day
  // headers, and the PDF where horizontal space isn't a constraint.
  const totalFillUpsCompact = useMemo(() => {
    const match = totalFillUpsStr?.match(/\d+/);
    return match ? `× ${match[0]}` : null;
  }, [totalFillUpsStr]);
  useLegCostMarkers(maps, map, dayedStops, {
    consumption: Number.isFinite(fuelConsumptionNum) && fuelConsumptionNum > 0 ? fuelConsumptionNum : undefined,
    unit: state.fuelUnit,
    defaultPrice: Number.isFinite(fuelPriceNum) && fuelPriceNum > 0 ? fuelPriceNum : undefined,
    defaultCurrency: state.fuelCurrency,
    overrides: compiledOverrides,
  });
  // Issue #59: distinguish unconfigured (silent) from partial (nudge).
  // Drives the small "Set fuel" chip in day headers + the summary bar.
  const fuelPartial = fuelConfigState(fuelConsumptionNum, fuelPriceNum).status === 'partial';
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
  function fuelVolumeForStops(stops: Stop[]): string | null {
    const v = fuelVolumeForLegs(stops, fuelConsumptionNum, state.fuelUnit);
    return formatVolume(v, state.fuelUnit, state.fuelType);
  }
  const flagSet = useMemo(
    () => [...new Set(dayedStops.map((s) => flagEmoji(s.countryCode)).filter(Boolean))],
    [dayedStops],
  );

  function removeFuelOverride(id: string) {
    setState((s) => ({ ...s, fuelOverrides: s.fuelOverrides.filter((o) => o.id !== id) }));
  }

  async function handleCollaboratorInvite(e: React.FormEvent) {
    e.preventDefault();
    setCollabError(null);
    setCollabPending(true);
    try {
      const email = inviteEmail.trim().toLowerCase();
      const result = await addCollaborator(state.tripId!, email);
      setInviteEmail('');
      // Fetch display name for the newly added collaborator and cache it.
      const profile = await lookupUserByEmail(email);
      if (profile) {
        setCollaboratorProfiles((p) => ({ ...p, [result.uid]: { displayName: profile.displayName, photoURL: profile.photoURL } }));
      }
      queryClient.invalidateQueries({ queryKey: ['trip', state.tripId] });
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr.code === 'COLLABORATOR_LIMIT_REACHED') {
        setCollabError(apiErr.message + ' Upgrade to Pro to invite more.');
      } else if (apiErr.status === 404) {
        setCollabError(`No user found with email ${inviteEmail}`);
      } else {
        setCollabError(apiErr.message || 'Failed to invite');
      }
    } finally {
      setCollabPending(false);
    }
  }

  async function handleCollaboratorRemove(uid: string) {
    await removeCollaborator(state.tripId!, uid);
    queryClient.invalidateQueries({ queryKey: ['trip', state.tripId] });
  }
  /** Upsert a per-country fuel override by countryCode (not by row id).
   * Powers the auto-populated rows in the trip-details modal: each row
   * may not have a corresponding override in state yet, in which case
   * the first edit creates one. Existing rows update in place. */
  function setCountryOverride(
    countryCode: string,
    defaultCurrency: string,
    patch: { price?: string; currency?: string },
  ) {
    setState((s) => {
      const idx = s.fuelOverrides.findIndex((o) => o.countryCode === countryCode);
      if (idx === -1) {
        return {
          ...s,
          fuelOverrides: [
            ...s.fuelOverrides,
            {
              id: crypto.randomUUID(),
              countryCode,
              price: patch.price ?? '',
              currency: patch.currency ?? defaultCurrency,
            },
          ],
        };
      }
      return {
        ...s,
        fuelOverrides: s.fuelOverrides.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
      };
    });
  }

  // Init map + autocomplete once SDK ready. Re-runs when mapDiv changes:
  // each layout mode (plan/map) mounts its own map container + search input,
  // so toggling layouts must re-create the Map and re-bind the Autocomplete —
  // otherwise both stay attached to unmounted DOM nodes. Center/zoom carry
  // over from the previous instance; marker/polyline effects re-sync because
  // they depend on `map`.
  useEffect(() => {
    if (!maps || !mapDiv) return;
    const m = new maps.Map(mapDiv, {
      center: map?.getCenter() ?? { lat: 60, lng: 18 },
      zoom: map?.getZoom() ?? 4,
      mapId: cfg.data?.mapId || 'DEMO_MAP_ID',
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
      // A brand-new trip starts in the one place the user can act:
      // naming their first stop (issue #121).
      if (!isEditing) searchInputRef.current.focus();
      if (autocompleteRef.current) {
        maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      autocompleteRef.current = new maps.places.Autocomplete(searchInputRef.current, {
        fields: ['name', 'formatted_address', 'geometry.location', 'address_components', 'types'],
      });
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current?.getPlace();
        if (!place?.geometry?.location) return;
        // When the picked result is a concrete POI (hotel, restaurant, gas
        // station, attraction…) carry its inferred category onto the stop
        // so the identity badge reflects what the user picked. Cities and
        // administrative areas don't get a category — they keep the city
        // default. Category drives the default `type` so a picked hotel
        // becomes an overnight and a picked gas station becomes a fuel stop,
        // matching the NearbyFinder dispatch.
        const category = isConcretePlace(place.types)
          ? guessCategoryFromTypes(place.types)
          : undefined;
        const type: Stop['type'] =
          category === 'fuel' ? 'fuel'
          : category === 'hotel' ? 'overnight'
          : 'waypoint';
        const newStop: Stop = {
          id: crypto.randomUUID(),
          name: place.formatted_address || place.name || '',
          label: place.name || place.formatted_address || '',
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          countryCode: extractCountryCode(place.address_components),
          type,
          ...(category ? { category } : {}),
          highlights: [],
          kmFromPrevious: 0,
        };
        setState((s) => ({ ...s, stops: reassignTypes([...s.stops, newStop]) }));
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

  // Geolocation centering for new trips (once map is ready). The ref guard
  // keeps a layout-toggle map re-creation from re-centering mid-session.
  const geolocatedRef = useRef(false);
  useEffect(() => {
    if (!maps || !map || isEditing || geolocatedRef.current) return;
    geolocatedRef.current = true;
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
    markersRef.current.forEach((m) => { m.map = null; });
    if (!infoWindowRef.current) {
      infoWindowRef.current = new maps.InfoWindow({ disableAutoPan: true });
    }
    const iw = infoWindowRef.current;
    // Click outside any marker closes a pinned InfoWindow.
    const mapClickListener = map.addListener('click', () => {
      pinnedMarkerIdRef.current = null;
      iw.close();
    });
    void (google.maps as any).importLibrary('marker').then(() => {
      const { AdvancedMarkerElement } = google.maps.marker;
      markersRef.current = dayedStops.map((stop, i) => {
        const marker = new AdvancedMarkerElement({
          position: { lat: stop.lat, lng: stop.lng },
          map,
          content: makeMarkerContent(i + 1, dayColor(stop.dayNumber), stopCategory(stop)),
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
        marker.addListener('gmp-click', () => {
          pinnedMarkerIdRef.current = stop.id;
          showInfo();
        });
        return marker;
      });
      fitBounds(map, dayedStops);
    });
    return () => {
      maps.event.removeListener(mapClickListener);
    };
  }, [maps, map, dayedStops]);

  // Sync polylines per segment in day color. Each leg polyline is a drag
  // surface: mousedown starts a via-point drag (issue #117) — a ghost
  // marker follows the cursor and the drop point becomes an intermediate
  // on that leg's route.
  useEffect(() => {
    if (!maps || !map) return;
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    const listeners: google.maps.MapsEventListener[] = [];

    function beginViaDrag(stop: Stop, startAt: google.maps.LatLng) {
      if ((stop.viaPoints || []).length >= MAX_VIA_POINTS) return;
      map!.setOptions({ draggable: false });
      polylinesRef.current.forEach((p) => p.setOptions({ clickable: false }));
      const ghost = new maps!.Marker({
        position: startAt,
        map,
        zIndex: 60,
        icon: {
          path: maps!.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: '#e76f51',
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });
      let last = startAt;
      const moveListener = map!.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          last = e.latLng;
          ghost.setPosition(e.latLng);
        }
      });
      function finish() {
        window.removeEventListener('mouseup', finish);
        moveListener.remove();
        ghost.setMap(null);
        map!.setOptions({ draggable: true });
        polylinesRef.current.forEach((p) => p.setOptions({ clickable: true }));
        addViaPoint(stop.id, { lat: last.lat(), lng: last.lng() });
      }
      window.addEventListener('mouseup', finish);
    }

    for (let i = 1; i < dayedStops.length; i++) {
      const stop = dayedStops[i];
      const path = getStopPath(stop);
      if (!path || path.length === 0) continue;
      const polyline = new maps.Polyline({
        path,
        map,
        ...polylineOptionsFor(stop.routeMode, dayColor(stop.dayNumber)),
      });
      listeners.push(
        polyline.addListener('mousedown', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) beginViaDrag(stop, e.latLng);
        }),
      );
      polylinesRef.current.push(polyline);
    }
    return () => {
      listeners.forEach((l) => l.remove());
    };
  }, [maps, map, dayedStops]);

  // Via-point markers — draggable beads on the route. Drag moves the via;
  // a plain click (no drag) removes it. Click, not right-click, so the
  // control works on touch and without a context menu.
  const viaMarkersRef = useRef<google.maps.Marker[]>([]);
  useEffect(() => {
    if (!maps || !map) return;
    viaMarkersRef.current.forEach((m) => m.setMap(null));
    viaMarkersRef.current = [];
    for (const stop of dayedStops) {
      (stop.viaPoints || []).forEach((point, index) => {
        const marker = new maps.Marker({
          position: point,
          map,
          draggable: true,
          zIndex: 55,
          title: 'Via point — drag to move, tap to remove',
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#e76f51',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });
        // A drag fires click on release in some browsers; the flag keeps a
        // move from also deleting the point.
        let dragged = false;
        marker.addListener('dragstart', () => { dragged = true; });
        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (pos) moveViaPoint(stop.id, index, { lat: pos.lat(), lng: pos.lng() });
          setTimeout(() => { dragged = false; }, 0);
        });
        marker.addListener('click', () => {
          if (!dragged) removeViaPoint(stop.id, index);
        });
        marker.addListener('rightclick', () => removeViaPoint(stop.id, index));
        viaMarkersRef.current.push(marker);
      });
    }
    return () => {
      viaMarkersRef.current.forEach((m) => m.setMap(null));
      viaMarkersRef.current = [];
    };
  }, [maps, map, dayedStops]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => { m.map = null; });
      markersRef.current = [];
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      if (autoScrollRafRef.current != null) cancelAnimationFrame(autoScrollRafRef.current);
    };
  }, []);

  function setStopRouteMode(id: string, mode: import('../lib/types').StopRouteMode) {
    setState((s) => ({ ...s, stops: s.stops.map((x) => (x.id === id ? markUserTouched({ ...x, routeMode: mode }) : x)) }));
  }
  function setStopType(id: string, type: Stop['type']) {
    setState((s) => ({ ...s, stops: s.stops.map((x) => (x.id === id ? markUserTouched({ ...x, type }) : x)) }));
  }
  function removeStop(id: string) {
    setState((s) => ({ ...s, stops: reassignTypes(removeStopById(s.stops, id)) }));
  }
  // Via-point editing (issue #117). Editing strips the stop's persisted
  // routePath — it describes the OLD geometry and would otherwise be
  // seeded into the segment cache under the new via signature.
  function addViaPoint(id: string, point: { lat: number; lng: number }) {
    setState((s) => ({
      ...s,
      stops: s.stops.map((x) => {
        if (x.id !== id) return x;
        const existing = x.viaPoints || [];
        if (existing.length >= MAX_VIA_POINTS) return x;
        return markUserTouched({ ...x, viaPoints: [...existing, point], routePath: undefined });
      }),
    }));
  }
  function moveViaPoint(id: string, index: number, point: { lat: number; lng: number }) {
    setState((s) => ({
      ...s,
      stops: s.stops.map((x) =>
        x.id === id
          ? markUserTouched({
              ...x,
              viaPoints: (x.viaPoints || []).map((v, i) => (i === index ? point : v)),
              routePath: undefined,
            })
          : x,
      ),
    }));
  }
  function removeViaPoint(id: string, index: number) {
    setState((s) => ({
      ...s,
      stops: s.stops.map((x) =>
        x.id === id
          ? markUserTouched({
              ...x,
              viaPoints: (x.viaPoints || []).filter((_, i) => i !== index),
              routePath: undefined,
            })
          : x,
      ),
    }));
  }
  function setStopStayMinutes(id: string, minutes: number) {
    setState((s) => ({ ...s, stops: s.stops.map((x) => (x.id === id ? markUserTouched({ ...x, stayMinutes: minutes || undefined }) : x)) }));
  }
  function setStopNights(id: string, nights: number) {
    setState((s) => ({ ...s, stops: s.stops.map((x) => (x.id === id ? markUserTouched({ ...x, nights: nights > 1 ? nights : undefined }) : x)) }));
  }
  function setForceDayStart(id: string, value: boolean) {
    setState((s) => ({
      ...s,
      stops: s.stops.map((x) => (x.id === id ? markUserTouched({ ...x, forceDayStart: value }) : x)),
    }));
  }
  function addHighlight(id: string, text: string) {
    setState((s) => ({
      ...s,
      stops: s.stops.map((x) =>
        x.id === id
          ? markUserTouched({ ...x, highlights: [...(x.highlights || []), text].filter((v, i, a) => a.indexOf(v) === i) })
          : x,
      ),
    }));
  }
  function removeHighlight(id: string, text: string) {
    setState((s) => ({
      ...s,
      stops: s.stops.map((x) =>
        x.id === id ? markUserTouched({ ...x, highlights: (x.highlights || []).filter((h) => h !== text) }) : x,
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
      const [rawMoved] = stops.splice(fromIdx, 1);
      const moved = markUserTouched(rawMoved);
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
      fuelType: s.fuelType || 'gasoline',
      fuelPrice: s.fuelPrice || '',
      fuelCurrency: s.fuelCurrency || 'EUR',
      fuelOverrides: (s.fuelOverrides || []).map((o) => ({
        countryCode: o.countryCode || '',
        price: o.price || '',
        currency: o.currency || '',
      })),
      tankRangeKm: s.tankRangeKm || 500,
      tankSizeLitres: s.tankSizeLitres || '',
      autoFuel: s.autoFuel ?? true,
      suggestHotels: s.suggestHotels ?? true,
      driveStartTime: s.driveStartTime || '',
      maxDriveMinutesPerDay: s.maxDriveMinutesPerDay || '',
      stops: (s.stops || []).map((x) => ({
        id: x.id, name: x.name, label: x.label,
        lat: x.lat, lng: x.lng,
        countryCode: x.countryCode || '',
        type: x.type,
        forceDayStart: x.forceDayStart === true,
        highlights: x.highlights || [],
        routeMode: x.routeMode || 'fastest',
        viaPoints: x.viaPoints || [],
        category: x.category || '',
        priority: x.priority || '',
        notes: x.notes || '',
        stayMinutes: x.stayMinutes || 0,
        nights: x.nights || 1,
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
        // Blank fuel inputs become explicit nulls so the server clears the
        // stored values — undefined would be dropped by JSON.stringify and
        // the old values would survive the save.
        // state.tankSizeLitres is the canonical litres value (string for
        // blank-vs-0 reasons). The input form converts to/from gallons
        // for MPG users at the boundary; here it's already in litres.
        ...clearableFuelFields({
          fuelConsumption: fuelConsumptionNum,
          fuelPrice: fuelPriceNum,
          fuelOverrides: compiledOverrides,
          tankRangeKm: state.tankRangeKm,
          tankSizeLitres: parseFloat(state.tankSizeLitres),
        }),
        fuelUnit: state.fuelUnit,
        fuelType: state.fuelType,
        fuelCurrency: state.fuelCurrency || 'EUR',
        autoFuel: state.autoFuel,
        suggestHotels: state.suggestHotels,
        driveStartTime: state.driveStartTime || null,
        maxDriveMinutesPerDay: (() => {
          const minutes = parseFloat(state.maxDriveMinutesPerDay);
          return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
        })(),
        dataVersion: 3,
        stops: stops.map((s) => {
          // Persist the polyline path so viewer / share / next-builder-open
          // can re-render the route without re-hitting the Routes API. The
          // raw path can be 1000+ points for long legs; downsample to keep
          // the Firestore document modest.
          const path = s.routePath;
          const persistablePath = path && path.length >= 2
            ? downsamplePath(path, MAX_ROUTE_PATH_POINTS)
            : null;
          return {
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
            ...(s.viaPoints && s.viaPoints.length > 0 ? { viaPoints: s.viaPoints } : {}),
            ...(s.category ? { category: s.category } : {}),
            ...(s.priority ? { priority: s.priority } : {}),
            ...(s.notes ? { notes: s.notes } : {}),
            ...(s.stayMinutes && s.stayMinutes > 0 ? { stayMinutes: s.stayMinutes } : {}),
            ...(s.nights && s.nights > 1 ? { nights: s.nights } : {}),
            ...(s.forceDayStart ? { forceDayStart: true } : {}),
            ...(persistablePath ? { routePath: persistablePath } : {}),
          };
        }),
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
      // Mark as hydrated before the cache write lands in tripQuery.data —
      // on the create path the hydration effect would otherwise fire and
      // reset local state.
      hydratedTripIdRef.current = saved.id;
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

  // Fuel input validation — inline errors + save-button guard.
  const consumptionErr = validateConsumption(parseFloat(state.fuelConsumption), state.fuelUnit);
  const priceErr = validatePrice(parseFloat(state.fuelPrice));
  const tankSizeErr = validateTankSize(parseFloat(state.tankSizeLitres));
  const tankRangeErr = validateTankRange(state.tankRangeKm);
  const overrideErrs = state.fuelOverrides.map((o) => validatePrice(parseFloat(o.price)));
  const fuelHasErrors = !!(consumptionErr || priceErr || tankSizeErr || tankRangeErr || overrideErrs.some((e) => e));

  // Trip details modal — shared between Plan and Map modes. Both modes
  // render this same JSX node and trigger it via setDetailsOpen(true).
  // Closes on backdrop click, Escape, or the × button. The closure
  // captures state + setState directly so we don't need to thread dozens
  // of props through a separate component for a single-use surface.
  const tripDetailsModal = detailsOpen ? (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setDetailsOpen(false); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="trip-details-modal-title"
    >
      <div ref={detailsTrapRef} className="w-[640px] max-w-[calc(100vw-32px)] max-h-[85vh] flex flex-col bg-surface border border-line-strong rounded-lg shadow-modal animate-rise">
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line bg-surface shrink-0">
          <span id="trip-details-modal-title" className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted">
            Trip details
          </span>
          <button
            type="button"
            onClick={() => setDetailsOpen(false)}
            aria-label="Close"
            className="text-paper-muted hover:text-paper text-[18px] leading-none px-1"
          >
            ×
          </button>
        </header>
        <div id="trip-details-panel" className="px-5 pt-4 pb-5 flex flex-col gap-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-3 gap-[18px]">
            <div className="block min-w-0">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">Start date</span>
              <DatePicker
                value={state.startDate}
                onChange={(next) => setState((s) => ({ ...s, startDate: next }))}
                placeholder="Pick a date"
                label="Trip start date"
              />
            </div>
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
                min={FUEL_BOUNDS.tankRangeKm.min}
                max={FUEL_BOUNDS.tankRangeKm.max}
                step={FUEL_BOUNDS.tankRangeKm.step}
                inputMode="numeric"
                value={state.tankRangeKm}
                onChange={(e) => setState((s) => ({ ...s, tankRangeKm: parseInt(e.target.value, 10) || 500 }))}
                className="w-full bg-transparent border-0 border-b border-line text-paper text-[14px] py-1 pr-7 outline-none transition-colors focus:border-accent [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-0 bottom-2 font-mono text-[10px] tracking-[0.16em] uppercase text-paper-muted pointer-events-none">km</span>
              {tankRangeErr && <p className="text-red-400 text-[11.5px] mt-0.5">{tankRangeErr}</p>}
            </label>
          </div>
          <label className={`flex items-start gap-2 -mt-1 ${state.tankRangeKm ? '' : 'opacity-50 cursor-not-allowed'}`}>
            <input
              type="checkbox"
              checked={state.autoFuel !== false}
              disabled={!state.tankRangeKm}
              onChange={(e) => setState((s) => ({ ...s, autoFuel: e.target.checked }))}
              className="mt-0.5 accent-accent"
            />
            <span className="flex-1">
              <span className="text-paper text-[13px]">Auto-fuel this trip</span>
              <span className="block text-paper-muted text-[11.5px] mt-0.5">
                {state.tankRangeKm
                  ? 'Insert fuel stops where the tank would run low. You can undo each addition.'
                  : 'Set tank range to enable.'}
              </span>
            </span>
          </label>
          <div className="grid grid-cols-3 gap-[18px]">
            <label className="block min-w-0">
              <span
                className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5"
                title="When you usually hit the road each morning. Setting this shows arrival times on every stop."
              >
                Drive start
              </span>
              <input
                type="time"
                value={state.driveStartTime}
                onChange={(e) => setState((s) => ({ ...s, driveStartTime: e.target.value }))}
                className="w-full bg-transparent border-0 border-b border-line text-paper text-[14px] py-1 outline-none transition-colors focus:border-accent [color-scheme:dark]"
              />
            </label>
            <label className="block min-w-0 relative">
              <span
                className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5"
                title="Warning threshold — days with more driving than this get a 'Long drive' chip. Never moves stops around."
              >
                Drive / day
              </span>
              <input
                type="number"
                min={1}
                max={16}
                step={0.5}
                inputMode="decimal"
                placeholder="—"
                value={state.maxDriveMinutesPerDay ? String(parseFloat(state.maxDriveMinutesPerDay) / 60) : ''}
                onChange={(e) => {
                  const hours = parseFloat(e.target.value);
                  setState((s) => ({
                    ...s,
                    maxDriveMinutesPerDay: Number.isFinite(hours) && hours > 0 ? String(Math.round(hours * 60)) : '',
                  }));
                }}
                className="w-full bg-transparent border-0 border-b border-line text-paper text-[14px] py-1 pr-7 outline-none transition-colors focus:border-accent [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-paper-muted"
              />
              <span className="absolute right-0 bottom-2 font-mono text-[10px] tracking-[0.16em] uppercase text-paper-muted pointer-events-none">h</span>
            </label>
          </div>
          <label className="flex items-start gap-2 -mt-1">
            <input
              type="checkbox"
              checked={state.suggestHotels !== false}
              onChange={(e) => setState((s) => ({ ...s, suggestHotels: e.target.checked }))}
              className="mt-0.5 accent-accent"
            />
            <span className="flex-1">
              <span className="text-paper text-[13px]">Suggest overnight stops</span>
              <span className="block text-paper-muted text-[11.5px] mt-0.5">
                Days that end without a place to sleep get a "find hotel" chip. Nothing is added without your pick.
              </span>
            </span>
          </label>
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
          <label className="block max-w-[180px]">
            <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">Vehicle</span>
            <select
              value={state.fuelType}
              onChange={(e) => {
                const fuelType = e.target.value as FuelType;
                // EV consumption reuses the L/100km math as kWh/100km — MPG
                // conversions would corrupt the number, so pin the unit.
                setState((s) => ({ ...s, fuelType, ...(fuelType === 'ev' ? { fuelUnit: 'L/100km' as FuelUnit } : {}) }));
              }}
              className="w-full bg-transparent border-0 border-b border-line text-paper text-[13px] py-1 outline-none cursor-pointer transition-colors focus:border-accent"
            >
              <option value="gasoline">Petrol</option>
              <option value="diesel">Diesel</option>
              <option value="ev">Electric (EV)</option>
            </select>
          </label>
          <div className="grid grid-cols-[1fr_auto_1fr_1fr] gap-3 items-end">
            <label className="block min-w-0 relative">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">{state.fuelType === 'ev' ? 'Consumption' : 'Fuel'}</span>
              <input
                type="number"
                min={state.fuelUnit === 'MPG' ? FUEL_BOUNDS.consumptionMpg.min : FUEL_BOUNDS.consumptionL.min}
                max={state.fuelUnit === 'MPG' ? FUEL_BOUNDS.consumptionMpg.max : FUEL_BOUNDS.consumptionL.max}
                step={state.fuelUnit === 'MPG' ? FUEL_BOUNDS.consumptionMpg.step : FUEL_BOUNDS.consumptionL.step}
                inputMode="decimal"
                placeholder="—"
                value={state.fuelConsumption}
                onChange={(e) => setState((s) => ({ ...s, fuelConsumption: e.target.value }))}
                className="w-full bg-transparent border-0 border-b border-line text-paper text-[14px] py-1 outline-none transition-colors focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-paper-muted"
              />
              {consumptionErr && <p className="text-red-400 text-[11.5px] mt-0.5">{consumptionErr}</p>}
            </label>
            <label className="block">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5 invisible">.</span>
              {state.fuelType === 'ev' ? (
                <span className="block text-paper-dim text-[12px] py-1">kWh/100km</span>
              ) : (
                <select
                  value={state.fuelUnit}
                  onChange={(e) => setState((s) => ({ ...s, fuelUnit: e.target.value as FuelUnit }))}
                  className="bg-transparent border-0 border-b border-line text-paper text-[12px] py-1 pr-3 outline-none cursor-pointer transition-colors focus:border-accent"
                >
                  <option value="L/100km">L/100km</option>
                  <option value="MPG">MPG</option>
                </select>
              )}
            </label>
            <label className="block min-w-0 relative">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">{state.fuelType === 'ev' ? 'Price / kWh' : 'Price'}</span>
              <input
                type="number"
                min={FUEL_BOUNDS.price.min}
                max={FUEL_BOUNDS.price.max}
                step={FUEL_BOUNDS.price.step}
                inputMode="decimal"
                placeholder="—"
                value={state.fuelPrice}
                onChange={(e) => setState((s) => ({ ...s, fuelPrice: e.target.value }))}
                className="w-full bg-transparent border-0 border-b border-line text-paper text-[14px] py-1 outline-none transition-colors focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-paper-muted"
              />
              {priceErr && <p className="text-red-400 text-[11.5px] mt-0.5">{priceErr}</p>}
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
          <label className="block min-w-0 relative max-w-[180px]">
            <span
              className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5"
              title={state.fuelType === 'ev'
                ? "Battery capacity in kWh — used for the 'approx. N charges' estimate. Optional."
                : "Tank capacity — used for the 'approx. N fill-ups' estimate. Optional."}
            >
              {state.fuelType === 'ev' ? 'Battery' : 'Tank size'}
            </span>
            <input
              type="number"
              min={state.fuelUnit === 'MPG' ? Math.ceil(FUEL_BOUNDS.tankSizeLitres.min / 3.785411784) : FUEL_BOUNDS.tankSizeLitres.min}
              max={state.fuelUnit === 'MPG' ? Math.floor(FUEL_BOUNDS.tankSizeLitres.max / 3.785411784) : FUEL_BOUNDS.tankSizeLitres.max}
              step={FUEL_BOUNDS.tankSizeLitres.step}
              inputMode="decimal"
              placeholder="—"
              value={(() => {
                const litres = parseFloat(state.tankSizeLitres);
                if (!Number.isFinite(litres) || litres <= 0) return '';
                return state.fuelUnit === 'MPG'
                  ? String(Math.round(litres / 3.785411784))
                  : String(Math.round(litres));
              })()}
              onChange={(e) => {
                const raw = parseFloat(e.target.value);
                if (!Number.isFinite(raw) || raw <= 0) {
                  setState((s) => ({ ...s, tankSizeLitres: '' }));
                  return;
                }
                const litres = state.fuelUnit === 'MPG' ? raw * 3.785411784 : raw;
                setState((s) => ({ ...s, tankSizeLitres: String(litres) }));
              }}
              className="w-full bg-transparent border-0 border-b border-line text-paper text-[14px] py-1 pr-8 outline-none transition-colors focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-paper-muted"
            />
            <span className="absolute right-0 bottom-2 font-mono text-[10px] tracking-[0.16em] uppercase text-paper-muted pointer-events-none">
              {state.fuelType === 'ev' ? 'kWh' : state.fuelUnit === 'MPG' ? 'gal' : 'L'}
            </span>
            {tankSizeErr && <p className="text-red-400 text-[11.5px] mt-0.5">{tankSizeErr}</p>}
          </label>
          {/* Per-country prices — auto-populated from the trip's visited
              countries (issue #57). Pre-filled with the global defaults so
              the user only sees what they need to edit. Empty rows aren't
              saved (compiledOverrides filters them out before PUT). */}
          {tripCountries.length > 0 && (
            <div className="flex flex-col gap-2" data-testid="country-overrides">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted">
                Per-country prices
              </span>
              {tripCountries.map((code) => {
                const country = FUEL_COUNTRIES.find((c) => c.code === code);
                const name = country?.name || code;
                const defaultCurrency = country?.defaultCurrency || state.fuelCurrency || 'EUR';
                const override = state.fuelOverrides.find((o) => o.countryCode === code);
                const price = override?.price ?? '';
                const currency = override?.currency ?? defaultCurrency;
                // A row is "same as default" when no override row exists OR
                // its price is empty/zero. compiledOverrides won't ship it
                // to the server in either case, so visual treatment matches
                // persistence behavior.
                const matchesDefault = !override
                  || override.price === ''
                  || parseFloat(override.price) <= 0;
                return (
                  <CountryOverrideRow
                    key={code}
                    code={code}
                    name={name}
                    defaultCurrency={defaultCurrency}
                    price={price}
                    currency={currency}
                    matchesDefault={matchesDefault}
                    globalPrice={state.fuelPrice}
                    globalCurrency={state.fuelCurrency || 'EUR'}
                    currencies={FUEL_CURRENCIES}
                    onChange={(patch) => setCountryOverride(code, defaultCurrency, patch)}
                    priceError={validatePrice(parseFloat(price))}
                  />
                );
              })}
            </div>
          )}
          {/* Orphan overrides — entries in state.fuelOverrides for countries
              the user no longer visits (legacy data, or stops removed after
              setting). Render below with a remove control so they're not
              silently held in state. */}
          {state.fuelOverrides.filter((o) => !tripCountries.includes(o.countryCode)).length > 0 && (
            <div className="flex flex-col gap-2" data-testid="orphan-overrides">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted">
                Other countries (not in this trip)
              </span>
              {state.fuelOverrides
                .filter((o) => !tripCountries.includes(o.countryCode))
                .map((o) => {
                  const country = FUEL_COUNTRIES.find((c) => c.code === o.countryCode);
                  const name = country?.name || o.countryCode;
                  return (
                    <div key={o.id} className="grid grid-cols-[auto_1.2fr_1fr_1fr_auto] gap-2 items-center opacity-70">
                      <span className="text-[16px]" aria-hidden>{flagEmoji(o.countryCode)}</span>
                      <span className="font-serif italic text-[13px] text-paper-dim truncate" title={name}>{name}</span>
                      <span className="font-mono text-[12px] text-paper-dim">{o.price || '—'}</span>
                      <span className="font-mono text-[12px] text-paper-dim">{o.currency}</span>
                      <button
                        type="button"
                        onClick={() => removeFuelOverride(o.id)}
                        aria-label={`Remove ${name} override`}
                        title="Remove"
                        className="bg-transparent border border-line text-paper-dim w-7 h-7 rounded text-[14px] flex items-center justify-center transition-colors hover:text-paper hover:border-paper-dim"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
          {/* Collaborators — only for saved trips where the current user is the owner. */}
          {state.tripId && tripQuery.data?.ownerUid === me.data?.uid && (
            <div className="border-t border-line pt-4">
              <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-3">
                Collaborators
              </span>
              <form onSubmit={handleCollaboratorInvite} className="flex gap-1.5 mb-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="friend@example.com"
                  className="flex-1 bg-canvas border border-line rounded px-2.5 py-1.5 text-paper text-[13px] outline-none transition-colors focus:border-accent placeholder:text-paper-muted"
                  required
                />
                <button
                  type="submit"
                  disabled={collabPending || !inviteEmail.trim()}
                  className="px-3 py-1.5 bg-accent text-canvas text-[11px] font-mono uppercase tracking-[0.16em] rounded disabled:opacity-50 transition-opacity"
                >
                  {collabPending ? '…' : 'Invite'}
                </button>
              </form>
              {collabError && (
                <p className="text-red-400 text-[11.5px] mb-3">{collabError}</p>
              )}
              <CollaboratorList
                collaborators={tripQuery.data?.collaborators || []}
                collaboratorProfiles={collaboratorProfiles}
                onRemove={handleCollaboratorRemove}
              />
            </div>
          )}
        </div>
        <footer className="flex justify-end items-center gap-2 px-5 py-3 border-t border-line bg-surface shrink-0">
          <button
            type="button"
            onClick={() => setDetailsOpen(false)}
            className="bg-transparent border border-line text-paper-dim px-3 py-[5px] rounded text-[12px] tracking-wide transition-colors hover:border-paper-dim hover:text-paper"
          >
            Close
          </button>
          <button
            type="button"
            data-testid="modal-save-trip"
            onClick={() => { void onSave(); setDetailsOpen(false); }}
            disabled={saving || fuelHasErrors}
            className="bg-accent text-canvas border border-accent rounded px-3 py-[5px] text-[12px] tracking-wide font-medium cursor-pointer transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-accent-lift active:translate-y-0 disabled:bg-surface-2 disabled:border-line disabled:text-paper-muted disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  ) : null;

  const sharedOverlays = (
    <>
      {pinModal.modalElement}
      {tripDetailsModal}
      {nearbyOpen && maps && map && (
        <NearbyFinder
          category={nearbyOpen.category}
          fuelType={state.fuelType}
          target={nearbyOpen.target}
          maps={maps}
          map={map}
          onSelect={onNearbyResultSelected}
          onClose={() => setNearbyOpen(null)}
          detourCapKm={nearbyOpen.category === 'fuel' ? (nearbyOpen.widened ? 10 : 5) : undefined}
          legPolyline={nearbyOpen.legPolyline}
        />
      )}
      {savedToast && (
        <Toast message="Saved" variant="success" onDismiss={() => setSavedToast(false)} durationMs={1800} />
      )}
      {autoFuelToast && (
        <Toast
          message={autoFuelToast.message.replace(' · Undo', '')}
          variant="auto-fuel"
          durationMs={8000}
          actionLabel="Undo"
          onAction={() => {
            if (undoSnapshotRef.current) {
              setState((s) => ({ ...s, stops: undoSnapshotRef.current! }));
              undoSnapshotRef.current = null;
            }
            setAutoFuelToast(null);
          }}
          onDismiss={() => {
            // Don't null undoSnapshotRef here — see comment in onPropose.
            // The next auto-fuel run will keep using the SAME snapshot (the
            // !undoSnapshotRef.current guard skips re-snapshotting), which is
            // what we want: stacked auto-adds inside a single session undo
            // back to BEFORE the first one. The snapshot resets to null
            // when the user explicitly undoes via onAction above.
            setAutoFuelToast(null);
          }}
        />
      )}
      <Toast
        message={routes.lastFailure ? `Couldn't route ${routes.lastFailure}` : null}
        onDismiss={routes.clearFailure}
      />
    </>
  );

  if (layout.mode === 'plan') {
    return (
      <section className="relative h-screen overflow-hidden flex flex-col bg-surface">
        {/* Map strip with a floating header overlay. The previous separate
            top nav bar took ~48px; folding it into the map (Google-Maps-
            style chips) reclaims that for the editing surface below.
            Height is resizable via the drag handle below — user's choice
            (mapStripHeight) wins over the default clamp(). */}
        <div
          ref={mapStripRef}
          style={mapStripHeight !== null ? { height: mapStripHeight } : undefined}
          className={`relative w-full ${mapStripHeight === null ? 'h-[clamp(280px,32dvh,420px)]' : ''} shrink-0 bg-canvas border-b border-line`}
        >
          {routes.loading && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent/[0.06] overflow-hidden pointer-events-none z-[5]">
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
          {/* Floating top-left chip: back + emoji + title */}
          <div className="absolute top-3 left-3 z-[10] flex items-center gap-2 max-w-[60%] bg-canvas/90 backdrop-blur-sm border border-line-strong rounded-lg pl-2 pr-3 py-1.5 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              aria-label="Back to dashboard"
              onClick={onCancel}
              className="bg-transparent border border-line text-paper-dim w-6 h-6 rounded text-[12px] flex items-center justify-center transition-colors hover:text-paper hover:border-paper-dim shrink-0"
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
              className="flex-1 bg-transparent border-0 text-paper font-serif italic text-[16px] leading-[1.2] tracking-tight py-0 outline-none min-w-0 placeholder:text-paper-muted placeholder:italic"
            />
          </div>
          {/* Floating top-right chip: trip details + mode toggle */}
          <div className="absolute top-3 right-3 z-[10] flex items-center gap-2 bg-canvas/90 backdrop-blur-sm border border-line-strong rounded-lg px-2 py-1.5 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              data-testid="open-trip-details"
              title="Edit trip details (fuel, dates, tank…)"
              className="hidden md:inline font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted hover:text-paper transition-colors shrink-0 px-1"
            >
              Trip details
            </button>
            <div className="inline-flex items-stretch border border-line rounded overflow-hidden shrink-0 h-6" role="group" aria-label="Layout mode">
              <button
                type="button"
                onClick={() => layout.setMode('plan')}
                aria-pressed={true}
                data-testid="layout-mode-plan"
                className="px-2.5 font-mono text-[9.5px] tracking-[0.18em] uppercase bg-accent text-canvas"
              >
                Plan
              </button>
              <button
                type="button"
                onClick={() => layout.setMode('map')}
                aria-pressed={false}
                data-testid="layout-mode-map"
                className="px-2.5 font-mono text-[9.5px] tracking-[0.18em] uppercase border-l border-line bg-transparent text-paper-dim hover:text-paper transition-colors"
              >
                Map
              </button>
            </div>
          </div>
        </div>

        {/* Drag handle — user resizes the map strip vertically. The
            -mt-1.5 overlap lets the handle visually straddle the map's
            bottom border so it reads as the separator itself. */}
        <div
          onPointerDown={startMapResize}
          data-testid="map-resize-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize map height"
          className={`group relative h-1.5 -mt-px cursor-ns-resize shrink-0 transition-colors ${resizingMap ? 'bg-accent' : 'bg-transparent hover:bg-accent/30'}`}
        >
          <span
            aria-hidden
            className={`absolute inset-x-0 top-1/2 -translate-y-1/2 mx-auto w-10 h-0.5 rounded-full transition-colors ${resizingMap ? 'bg-canvas' : 'bg-line-strong group-hover:bg-accent'}`}
          />
        </div>

        {/* Day navigator with trip totals inlined on the right. Folding
            the totals here eliminates a dedicated summary row at the
            bottom — same data, one fewer row of chrome. */}
        <DayNav
          groups={dayGroups}
          onJump={(day) => {
            const el = document.getElementById(`day-col-${day}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
          }}
          rightSlot={(
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] tracking-[0.16em] uppercase text-paper-dim">
              <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                <span className="text-paper text-[12px] font-medium">{totals.totalKm.toLocaleString('en-US')}</span>
                <span>km</span>
              </span>
              <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                <span className="text-paper text-[12px] font-medium">{totals.totalDays}</span>
                <span>{totals.totalDays === 1 ? 'day' : 'days'}</span>
              </span>
              {totals.totalDurationSeconds > 0 && (
                <span className="text-paper text-[12px] font-medium whitespace-nowrap">{formatDuration(totals.totalDurationSeconds)}</span>
              )}
              {totalFuelCostStr && (
                <span className="text-paper text-[12px] font-medium tracking-normal normal-case whitespace-nowrap">{totalFuelCostStr}</span>
              )}
              {fuelPartial && (
                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  data-testid="fuel-config-nudge-summary"
                  className="inline-flex items-baseline gap-1 text-accent hover:text-paper tracking-normal normal-case font-sans text-[11px] underline decoration-dotted underline-offset-2 transition-colors whitespace-nowrap"
                >
                  <span aria-hidden>⛽</span>
                  Add a fuel price
                </button>
              )}
              {totalFuelVolumeStr && (
                <span
                  className="inline-flex items-baseline gap-1 whitespace-nowrap"
                  title={totalFillUpsStr ? `${totalFuelVolumeStr} · ${totalFillUpsStr}` : undefined}
                >
                  <span className="text-paper-dim text-[12px] font-medium tracking-normal normal-case">{totalFuelVolumeStr}</span>
                  {totalFillUpsCompact && (
                    <span className="text-paper-muted text-[11px] tracking-normal normal-case">· {totalFillUpsCompact}</span>
                  )}
                </span>
              )}
              {flagSet.length > 0 && (
                <span className="font-sans text-[13px] tracking-[0.06em] whitespace-nowrap">{flagSet.join(' ')}</span>
              )}
            </div>
          )}
        />

        {/* Search row — sits directly above the day columns so the user's
            intent ("add a stop") visually connects to where the stop will
            land. Insert chip appears here when an inline "+ insert" target
            is selected within a column below. */}
        <div className="px-6 py-2.5 flex items-center gap-3 border-b border-line shrink-0 bg-canvas">
          <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted shrink-0">
            Stops <span className="text-paper font-medium ml-1">{state.stops.length}</span>
          </span>
          <div className="relative flex-1 max-w-[520px]">
            <span className="absolute left-[12px] top-1/2 -translate-y-[7px] text-paper-muted text-[14px] pointer-events-none">⌕</span>
            <input
              ref={searchInputRef}
              type="text"
              autoComplete="off"
              placeholder="Search for a city or place…"
              aria-label="Search for a place to add as a stop"
              className="w-full bg-transparent border border-line rounded-md text-paper text-[14px] pl-[38px] pr-3.5 py-[7px] outline-none transition-colors focus:border-accent placeholder:text-paper-muted"
            />
          </div>
          {/* Save/Cancel live here in Plan mode (instead of a separate
              footer row) so the editing surface keeps its tall card area. */}
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              data-testid="cancel-trip"
              className="bg-transparent border border-line text-paper-dim px-3 py-[5px] rounded text-[12px] tracking-wide transition-colors hover:border-paper-dim hover:text-paper"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              data-testid="save-trip"
              className="bg-accent text-canvas border border-accent rounded px-3 py-[5px] text-[12px] tracking-wide font-medium cursor-pointer transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-accent-lift active:translate-y-0 disabled:bg-surface-2 disabled:border-line disabled:text-paper-muted disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Day-columns track — flex-1 fills remaining vertical space.
            Horizontal scroll handles overflow when there are more days
            than fit on the screen. */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-canvas">
          {dayGroups.length === 0 ? (
            <div className="text-center py-12 px-6">
              <p className="font-serif italic text-paper-dim text-[15px]">
                Search for where the trip starts.
              </p>
              <p className="mt-2 font-serif italic text-paper-muted text-[13px]">
                Days appear here as you add stops.
              </p>
            </div>
          ) : (
            <div className={`flex gap-3 px-6 py-4 h-full items-stretch ${dayGroups.length <= 3 ? 'justify-center' : ''}`}>
              {/* Short trips centre their columns instead of hugging the
                  left edge with a screen of empty canvas beside them
                  (issue #125). Centring is only applied while the row
                  can't overflow, hence the day-count gate above. */}
              {dayGroups.map((g, gi) => (
                <DayColumn
                  key={g.day}
                  group={g}
                  startDate={state.startDate}
                  fuelCost={fuelCostForStops(g.stops.map((x) => x.stop))}
                  fuelVolume={fuelVolumeForStops(g.stops.map((x) => x.stop))}
                  fuelConfigPartial={fuelPartial}
                  onConfigureFuel={() => setDetailsOpen(true)}
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
                  onFavoriteAdd={handleFavoriteAdd}
                  onFavoriteRemove={handleFavoriteRemove}
                  onDragStart={(id) => { draggedIdRef.current = id; }}
                  onDragEnd={() => { draggedIdRef.current = null; }}
                  onDragOver={() => { /* handled in StopRow */ }}
                  onDragLeave={() => { /* handled in StopRow */ }}
                  onDrop={(id, ev) => reorder(id, ev)}
                  onDropAtDayStart={gi > 0 ? reorderToDayStart : undefined}
                  onPickCategory={(cat) => openCategoryForDay(g.day, cat)}
                  fuelDisabled={fuelTargetForDay(g.day) === null}
                  tankRangeKm={state.tankRangeKm}
                  maxKmPerDay={state.maxKmPerDay}
                  maxDriveMinutesPerDay={maxDriveMinutes}
                  schedule={stopSchedule}
                  onChangeStayMinutes={setStopStayMinutes}
                  onChangeNights={setStopNights}
                  onRemoveViaPoint={removeViaPoint}
                  onSuggestHotel={
                    state.suggestHotels !== false && dayNeedsOvernightSuggestion(g)
                      ? () => openHotelSuggestForDay(g.day)
                      : undefined
                  }
                  fuelTimeline={fuelTimeline}
                  autoFuelWarningKm={autoFuelWarnings[g.day]}
                  onOpenManualPicker={() => {
                    const gap = fuelTimeline.gaps.find(gp =>
                      (dayedStops[gp.beforeStopIndex]?.dayNumber || 0) === g.day
                    );
                    setNearbyOpen({
                      category: 'fuel',
                      target: findLongestLegTarget(g, dayedStops, getStopPath)!,
                      widened: true,
                      legPolyline: gap?.legPolyline,
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {sharedOverlays}
      </section>
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
          {/* Mode toggle — this render path is Map mode (Plan mode early-returns
              above), so the styles are hardcoded rather than driven off layout.mode. */}
          <div className="inline-flex items-stretch border border-line rounded overflow-hidden shrink-0 h-8 mt-[6px]" role="group" aria-label="Layout mode">
            <button
              type="button"
              onClick={() => layout.setMode('plan')}
              aria-pressed={false}
              title="Plan mode — days side-by-side as columns"
              className="px-2.5 font-mono text-[9.5px] tracking-[0.18em] uppercase transition-colors bg-transparent text-paper-dim hover:text-paper"
            >
              Plan
            </button>
            <button
              type="button"
              onClick={() => layout.setMode('map')}
              aria-pressed={true}
              title="Map mode — sidebar + full map"
              className="px-2.5 font-mono text-[9.5px] tracking-[0.18em] uppercase border-l border-line transition-colors bg-accent text-canvas"
            >
              Map
            </button>
          </div>
        </div>

        <div className="border-b border-line">
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            data-testid="open-trip-details"
            className="w-full flex items-center justify-between px-6 py-2.5 font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted hover:text-paper transition-colors"
          >
            <span>Trip details</span>
            <span aria-hidden className="text-[12px]">↗</span>
          </button>
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
              aria-label="Search for a place to add as a stop"
              onFocus={() => setSheetState('full')}
              className="w-full bg-transparent border border-line rounded-md text-paper text-[14px] pl-[38px] pr-3.5 py-[11px] outline-none transition-colors focus:border-accent placeholder:text-paper-muted"
            />
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
              fuelVolumeFor={fuelVolumeForStops}
              fuelConfigPartial={fuelPartial}
              onConfigureFuel={() => setDetailsOpen(true)}
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
              onFavoriteAdd={handleFavoriteAdd}
              onFavoriteRemove={handleFavoriteRemove}
              onDragStart={(id) => { draggedIdRef.current = id; }}
              onDragEnd={() => { draggedIdRef.current = null; stopAutoScroll(); }}
              onDragOver={() => { /* handled in StopRow */ }}
              onDragLeave={() => { /* handled in StopRow */ }}
              onDrop={(id, ev) => reorder(id, ev)}
              onDropAtDayStart={reorderToDayStart}
              onFindCategoryForDay={openCategoryForDay}
              canFindFuelForDay={(day) => fuelTargetForDay(day) !== null}
              tankRangeKm={state.tankRangeKm}
              maxKmPerDay={state.maxKmPerDay}
              maxDriveMinutesPerDay={maxDriveMinutes}
              schedule={stopSchedule}
              onChangeStayMinutes={setStopStayMinutes}
              onChangeNights={setStopNights}
              onRemoveViaPoint={removeViaPoint}
              onSuggestHotelForDay={state.suggestHotels !== false ? openHotelSuggestForDay : undefined}
            />
          </div>
        </div>

        {/* Summary bar */}
        <div className="border-t border-line px-6 pt-3 pb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10px] tracking-[0.16em] uppercase text-paper-dim bg-surface">
          <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-paper text-[14px] font-medium">{totals.totalKm.toLocaleString('en-US')}</span>
            <span>km</span>
          </span>
          <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-paper text-[14px] font-medium">{totals.totalDays}</span>
            <span>{totals.totalDays === 1 ? 'day' : 'days'}</span>
          </span>
          {totals.totalDurationSeconds > 0 && (
            <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
              <span className="text-paper text-[14px] font-medium">{formatDuration(totals.totalDurationSeconds)}</span>
            </span>
          )}
          {totalFuelCostStr && (
            <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
              <span className="text-paper text-[14px] font-medium tracking-normal normal-case">{totalFuelCostStr}</span>
            </span>
          )}
          {fuelPartial && (
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              data-testid="fuel-config-nudge-summary"
              className="inline-flex items-baseline gap-1 text-accent hover:text-paper tracking-normal normal-case font-sans text-[12px] underline decoration-dotted underline-offset-2 transition-colors whitespace-nowrap"
            >
              <span aria-hidden>⛽</span>
              Add a fuel price to see cost estimates
            </button>
          )}
          {totalFuelVolumeStr && (
            <span
              className="inline-flex items-baseline gap-1 whitespace-nowrap"
              title={totalFillUpsStr ? `${totalFuelVolumeStr} · ${totalFillUpsStr}` : undefined}
            >
              <span className="text-paper-dim text-[14px] font-medium tracking-normal normal-case">{totalFuelVolumeStr}</span>
              {totalFillUpsCompact && (
                <span className="text-paper-muted text-[12px] tracking-normal normal-case">· {totalFillUpsCompact}</span>
              )}
            </span>
          )}
          <span className="ml-auto font-sans text-[14px] tracking-[0.06em] whitespace-nowrap">{flagSet.join(' ')}</span>
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
            className="bg-accent text-canvas border border-accent rounded px-3.5 py-[7px] text-[12px] tracking-wide font-medium cursor-pointer transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-accent-lift active:translate-y-0 disabled:bg-surface-2 disabled:border-line disabled:text-paper-muted disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </aside>

      <div className="relative w-full h-full bg-canvas">
        {routes.loading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent/[0.06] overflow-hidden pointer-events-none z-[5]">
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

      {sharedOverlays}
    </section>
  );
}
