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

export function makeMarkerIcon(num: number, ringColor = '#f3ecde'): google.maps.Icon {
  // Cream center with day-color outer ring, dark number — keeps numbers
  // legible across all day color hues
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'><circle cx='22' cy='22' r='15' fill='${ringColor}'/><circle cx='22' cy='22' r='11' fill='#f3ecde'/><text x='22' y='26.5' text-anchor='middle' font-family='ui-monospace,monospace' font-size='12' font-weight='600' fill='#0d0e11'>${num}</text></svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    anchor: new google.maps.Point(22, 22),
    scaledSize: new google.maps.Size(44, 44),
  };
}

export function makePinIcon(emoji: string, tint: string): google.maps.Icon {
  // Smaller, darker disc than the cream route markers — pins read as
  // secondary annotations layered on top of the day spine.
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'><circle cx='17' cy='17' r='13.5' fill='#0d0e11' stroke='${tint}' stroke-width='2'/><text x='17' y='17' text-anchor='middle' dominant-baseline='central' font-size='15'>${emoji}</text></svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    anchor: new google.maps.Point(17, 17),
    scaledSize: new google.maps.Size(34, 34),
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
