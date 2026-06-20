import { DEFAULT_STOP_META, PIN_CATEGORY_META } from './pin-meta';
import type { PinCategory } from './types';

let loadPromise: Promise<typeof google.maps> | null = null;

export function loadMapsSdk(apiKey: string): Promise<typeof google.maps> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (!apiKey) {
      reject(new Error('Maps API key missing'));
      return;
    }
    const cbName = '__mapsCb' + Date.now();
    (window as unknown as Record<string, unknown>)[cbName] = () => {
      delete (window as unknown as Record<string, unknown>)[cbName];
      resolve(window.google.maps);
    };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${cbName}&loading=async&language=en`;
    s.async = true;
    s.onerror = () => reject(new Error('Failed to load Google Maps SDK'));
    document.body.appendChild(s);
  });
  // A failed load must not poison the cache — clearing it lets a later
  // call (e.g. a remount after a network blip) retry instead of replaying
  // the same rejection until full page reload.
  loadPromise.catch(() => {
    loadPromise = null;
  });
  return loadPromise;
}

const BASE_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#15171c' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d0e11' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9b9080' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#3d3e44' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#a89e8a' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c1f25' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1c1f25' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#5d564d' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#272a32' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#3d3e44' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#9b9080' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a0c10' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5d564d' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#13151a' }] },
];

const POI_HIDE: google.maps.MapTypeStyle = {
  featureType: 'poi',
  stylers: [{ visibility: 'off' }],
};

const POI_SHOW_LABELS: google.maps.MapTypeStyle[] = [
  // POI text labels visible in a muted paper tone; icons stay off via the
  // global labels.icon rule in BASE_STYLE so the map keeps its editorial feel.
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#a89e8a' }] },
  { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#0d0e11' }] },
  { featureType: 'poi.business', elementType: 'labels.text.fill', stylers: [{ color: '#a89e8a' }] },
];

export const MAP_STYLE: google.maps.MapTypeStyle[] = [...BASE_STYLE, POI_HIDE];

export function mapStyleForDropMode(): google.maps.MapTypeStyle[] {
  return [...BASE_STYLE, ...POI_SHOW_LABELS];
}

// Light-theme map palette — warm cream paper background, ink labels, soft
// olive water/landscape. Tuned to sit alongside the editorial light theme
// without the clinical white/grey look most "default" Maps styles have.
const BASE_STYLE_LIGHT: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#efe8d4' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f4eede' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#5b5446' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#bcb39f' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#3a3429' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#fbf6e7' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#dccfa8' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#857c69' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fff8df' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#c8b88a' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#3d3629' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c2d4cf' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5b5446' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#e7dfca' }] },
];

const POI_SHOW_LABELS_LIGHT: google.maps.MapTypeStyle[] = [
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#5b5446' }] },
  { featureType: 'poi', elementType: 'labels.text.stroke', stylers: [{ color: '#f4eede' }] },
  { featureType: 'poi.business', elementType: 'labels.text.fill', stylers: [{ color: '#5b5446' }] },
];

export const MAP_STYLE_LIGHT: google.maps.MapTypeStyle[] = [...BASE_STYLE_LIGHT, POI_HIDE];

export function mapStyleForDropMode_light(): google.maps.MapTypeStyle[] {
  return [...BASE_STYLE_LIGHT, ...POI_SHOW_LABELS_LIGHT];
}

/** Resolve the appropriate base map style for the active theme. Pass the
 * theme value from `useTheme().resolved`. */
export function mapStyleForTheme(theme: 'light' | 'dark'): google.maps.MapTypeStyle[] {
  return theme === 'light' ? MAP_STYLE_LIGHT : MAP_STYLE;
}

export function mapStyleForDropModeForTheme(theme: 'light' | 'dark'): google.maps.MapTypeStyle[] {
  return theme === 'light' ? mapStyleForDropMode_light() : mapStyleForDropMode();
}

/** Small pill-shaped label rendered at a polyline midpoint to show the fuel
 * cost of a leg ("€18", "£12", "158 kr"). Dynamically sized in width to fit
 * the label text — Google Maps anchors at the centre so the chip floats
 * over the route without obscuring stop markers. */
export function makeCostChipIcon(text: string): google.maps.Icon {
  // ~7.5px per char in 11px mono is a decent approximation. Floor on chars,
  // pad horizontally for the rounded ends.
  const charW = 7.5;
  const padX = 8;
  const w = Math.max(36, Math.round(text.length * charW + padX * 2));
  const h = 22;
  const cy = h / 2 + 4; // baseline tweak for the 11px text
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>` +
    `<rect x='0.5' y='0.5' width='${w - 1}' height='${h - 1}' rx='${h / 2}' fill='#f3ecde' stroke='#6b6358' stroke-width='1'/>` +
    `<text x='${w / 2}' y='${cy}' text-anchor='middle' font-family='ui-monospace,Menlo,monospace' font-size='11' font-weight='600' fill='#0d0e11'>${text}</text>` +
    `</svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    anchor: new google.maps.Point(w / 2, h / 2),
    scaledSize: new google.maps.Size(w, h),
  };
}

export function makeMarkerIcon(
  num: number,
  ringColor: string = '#f3ecde',
  category?: PinCategory,
): google.maps.Icon {
  // Every marker is iconified: category-tinted inner disc + day-color ring
  // + category emoji + small day-color corner pip with the sequence number.
  // Card and map stay in lockstep via StopIdentityBadge.
  const meta = category ? PIN_CATEGORY_META[category] : DEFAULT_STOP_META;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'>` +
      `<circle cx='22' cy='22' r='15' fill='${ringColor}'/>` +
      `<circle cx='22' cy='22' r='12' fill='${meta.tint}'/>` +
      `<text x='22' y='27' text-anchor='middle' font-size='15'>${meta.emoji}</text>` +
      `<circle cx='34' cy='34' r='7.5' fill='${ringColor}' stroke='#f3ecde' stroke-width='1'/>` +
      `<text x='34' y='37.5' text-anchor='middle' font-family='ui-monospace,monospace' font-size='9' font-weight='600' fill='#0d0e11'>${num}</text>` +
    `</svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    anchor: new google.maps.Point(22, 22),
    scaledSize: new google.maps.Size(44, 44),
  };
}

type PinIconStyle = { ringColor: string; ringWidth: number; haloOpacity: number };

const PRIORITY_ICON_STYLE: Record<'must' | 'want' | 'maybe', (tint: string) => PinIconStyle> = {
  // Must-visit pins get the terra-cotta accent ring + a soft halo so they
  // stand out across the editorial palette regardless of category color.
  must:  () =>     ({ ringColor: '#e76f51', ringWidth: 2.5, haloOpacity: 0.32 }),
  want:  (tint) => ({ ringColor: tint,      ringWidth: 2,   haloOpacity: 0 }),
  maybe: (tint) => ({ ringColor: tint,      ringWidth: 1.5, haloOpacity: 0 }),
};

// Classic teardrop "map pin" silhouette (44x56, point at bottom center).
// Distinct shape from the circular numbered stop markers — pins read as
// dropped highlights, stops read as route beads.
const PIN_PATH = 'M22 2 C10.4 2 1 11.4 1 23 C1 38 22 54 22 54 C22 54 43 38 43 23 C43 11.4 33.6 2 22 2 Z';

export function makePinIcon(emoji: string, tint: string, priority: 'must' | 'want' | 'maybe' = 'want'): google.maps.Icon {
  const { ringColor, ringWidth, haloOpacity } = PRIORITY_ICON_STYLE[priority](tint);
  const halo = haloOpacity > 0
    ? `<ellipse cx='22' cy='23' rx='22' ry='22' fill='${ringColor}' fill-opacity='${haloOpacity}'/>`
    : '';
  const opacity = priority === 'maybe' ? 0.78 : 1;
  // Emoji centered in the bulb (around y=23). Text-shadow via filter for legibility.
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='56' viewBox='0 0 44 56'><g opacity='${opacity}'>${halo}<path d='${PIN_PATH}' fill='#0d0e11' stroke='${ringColor}' stroke-width='${ringWidth}' stroke-linejoin='round'/><text x='22' y='23' text-anchor='middle' dominant-baseline='central' font-size='17'>${emoji}</text></g></svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    // Anchor at the tip of the teardrop (bottom center) so the pin "drops" on the location.
    anchor: new google.maps.Point(22, 54),
    scaledSize: new google.maps.Size(44, 56),
  };
}

// Polyline options for a given leg's routeMode. Scenic legs (which avoid
// highways) render as a dashed pattern of short vertical segments along
// the path; solid legs use the standard accent stroke. The function only
// returns the *style* fields — caller still has to provide path + map.
export function polylineOptionsFor(routeMode: import('./types').StopRouteMode | undefined, color: string): {
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  icons?: google.maps.IconSequence[];
} {
  const scenic = routeMode === 'scenic' || routeMode === 'scenic-no-tolls';
  if (scenic) {
    return {
      // Hide the continuous stroke so only the dash icons render.
      strokeOpacity: 0,
      icons: [
        {
          icon: {
            path: 'M 0,-1 0,1',
            strokeColor: color,
            strokeOpacity: 0.95,
            strokeWeight: 4,
            scale: 2,
          },
          offset: '0',
          repeat: '14px',
        },
      ],
    };
  }
  return {
    strokeColor: color,
    strokeOpacity: 0.85,
    strokeWeight: 4,
  };
}

export function requestGeolocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 5 * 60 * 1000 },
    );
  });
}

/** Minimal shape of a Google Maps address component — enough to extract a
 * locality without pulling in the global google namespace types. */
export type AddressComponent = {
  types: string[];
  long_name?: string;
  short_name?: string;
};

/** Pick the best locality-like label from a list of address components.
 * Prefers 'locality' (most countries), falls back to 'postal_town' (UK), then
 * the smaller administrative areas. Returns null when nothing usable is found
 * so the caller can apply its own default (e.g. "Fuel stop"). */
export function localityFromAddressComponents(
  components: readonly AddressComponent[] | undefined,
): string | null {
  if (!components || components.length === 0) return null;
  const pick = (...wanted: string[]) =>
    components.find((c) => wanted.some((w) => c.types.includes(w)));
  const candidate =
    pick('locality') ||
    pick('postal_town') ||
    pick('administrative_area_level_3') ||
    pick('administrative_area_level_2');
  if (!candidate) return null;
  return candidate.short_name || candidate.long_name || null;
}

/** Look up the locality (city) for a Google Places place_id via the legacy
 * PlacesService. Resolves to null on any error so callers can fall back. */
export function lookupLocalityForPlace(
  maps: typeof google.maps,
  map: google.maps.Map,
  placeId: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!placeId) return resolve(null);
    const service = new maps.places.PlacesService(map);
    service.getDetails({ placeId, fields: ['address_components'] }, (place, status) => {
      if (status !== maps.places.PlacesServiceStatus.OK || !place) return resolve(null);
      resolve(localityFromAddressComponents(place.address_components as AddressComponent[] | undefined));
    });
  });
}
