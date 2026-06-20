import { useEffect, useRef, useState } from 'react';
import type { FuelSearchTarget } from '../../lib/fuel-stops';
import { PIN_CATEGORY_META } from '../../lib/pin-meta';
import { placeTypeForCategory } from '../../lib/nearby-search';
import { measureDetour } from '../../lib/route-detour';
import type { PinCategory } from '../../lib/types';

export type NearbyResult = {
  placeId: string;
  name: string;
  vicinity: string;
  rating?: number;
  lat: number;
  lng: number;
};

type Props = {
  /** Which kind of POI to look for. Determines the Google Places `type`
   * filter, the modal heading + button labels, and the empty-state
   * copy. The legacy fuel-stop flow passes 'fuel'. */
  category: PinCategory;
  target: FuelSearchTarget;
  // Google Maps SDK + a map instance for the legacy PlacesService.
  maps: typeof google.maps;
  map: google.maps.Map;
  onSelect: (r: NearbyResult) => void;
  onClose: () => void;
  /** When set, each result's perpendicular distance to legPolyline is
   * computed via measureDetour and results beyond the cap are dropped
   * before display. Auto-fuel passes 5 km for the manual fuel category;
   * the manual fuel button after a "no-station" warning passes 10 km. */
  detourCapKm?: number;
  legPolyline?: { lat: number; lng: number }[];
};

const SEARCH_RADIUS_M = 10000;

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Modal that runs Google Places nearbySearch around the day's
 * longest-leg midpoint and lets the user pick a place to insert as a
 * new stop. Generalised from the original FuelStopFinder (issue #71):
 * the `category` prop swaps the Google Place `type` filter and the
 * surrounding UI copy so the same component handles fuel / food /
 * hotel / scenic etc. Uses the legacy PlacesService API which is
 * stable; Place.searchNearby() would also work. */
export function NearbyFinder({ category, target, maps, map, onSelect, onClose, detourCapKm, legPolyline }: Props) {
  const [results, setResults] = useState<NearbyResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const meta = PIN_CATEGORY_META[category];
  const placeType = placeTypeForCategory(category);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const service = new maps.places.PlacesService(map);
    const request: google.maps.places.PlaceSearchRequest = {
      location: target.midpoint,
      radius: SEARCH_RADIUS_M,
      ...(placeType ? { type: placeType } : {}),
    };
    service.nearbySearch(request, (raw, status) => {
      if (status !== maps.places.PlacesServiceStatus.OK || !raw) {
        setResults([]);
        if (status !== maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          setError(`Places search failed: ${status}`);
        }
        return;
      }
      const mapped: NearbyResult[] = raw
        .filter((r) => r.geometry?.location)
        .map((r) => ({
          placeId: r.place_id || '',
          name: r.name || meta.label,
          vicinity: r.vicinity || '',
          rating: typeof r.rating === 'number' ? r.rating : undefined,
          lat: r.geometry!.location!.lat(),
          lng: r.geometry!.location!.lng(),
        }));
      const useDetour = detourCapKm != null && legPolyline != null && legPolyline.length >= 2;
      let filtered = useDetour
        ? mapped.filter((r) => measureDetour({ lat: r.lat, lng: r.lng }, legPolyline!).detourKm <= detourCapKm!)
        : mapped;
      filtered = filtered
        .sort((a, b) =>
          useDetour
            ? measureDetour({ lat: a.lat, lng: a.lng }, legPolyline!).detourKm
              - measureDetour({ lat: b.lat, lng: b.lng }, legPolyline!).detourKm
            : haversineKm(target.midpoint, { lat: a.lat, lng: a.lng })
              - haversineKm(target.midpoint, { lat: b.lat, lng: b.lng }),
        )
        .slice(0, 10);
      setResults(filtered);
    });
  }, [maps, map, target.midpoint, placeType, meta.label]);

  const startName = target.legStart.label || target.legStart.name || 'start';
  const endName = target.legEnd.label || target.legEnd.name || 'end';
  const headingNoun = category === 'fuel' ? 'fuel stop' : meta.label.toLowerCase();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Find a ${headingNoun} along this leg`}
      data-testid="nearby-finder"
      data-category={category}
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-xl p-5 max-w-md w-full max-h-[85vh] flex flex-col shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="font-serif italic text-[20px] leading-tight text-paper" data-testid="nearby-finder-heading">
              Add a {headingNoun}
            </h2>
            <p className="text-paper-dim text-[12px] mt-1 leading-snug truncate">
              Longest leg: <span className="text-paper">{startName}</span>
              {' → '}
              <span className="text-paper">{endName}</span>
              {' · '}
              <span className="text-paper">{target.legKm} km</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="bg-transparent border border-line text-paper-dim w-7 h-7 rounded text-base flex items-center justify-center hover:border-paper-dim hover:text-paper transition-colors shrink-0"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {results === null ? (
            <p className="text-center font-serif italic text-paper-muted py-8">Searching nearby…</p>
          ) : error ? (
            <p className="text-[#ec8e74] font-mono text-[10px] tracking-[0.14em] uppercase py-8 text-center">
              {error}
            </p>
          ) : results.length === 0 ? (
            <p className="text-center font-serif italic text-[14px] text-paper-dim py-8" data-testid="nearby-finder-empty">
              No {meta.label.toLowerCase()} found within {SEARCH_RADIUS_M / 1000} km of the midpoint.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {results.map((r) => {
                const distKm = haversineKm(target.midpoint, { lat: r.lat, lng: r.lng });
                return (
                  <li key={r.placeId || `${r.lat},${r.lng}`}>
                    <button
                      type="button"
                      onClick={() => onSelect(r)}
                      className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-md border border-line bg-canvas hover:border-accent hover:bg-accent-soft transition-colors"
                    >
                      <span aria-hidden className="text-[18px] leading-none mt-0.5">{meta.emoji}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-paper text-[14px] truncate">{r.name}</span>
                        {r.vicinity && (
                          <span className="block text-paper-dim text-[11.5px] truncate">{r.vicinity}</span>
                        )}
                      </span>
                      <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-paper-muted shrink-0 mt-0.5 text-right">
                        <span className="block text-paper">{distKm.toFixed(1)} km</span>
                        {typeof r.rating === 'number' && (
                          <span className="block">★ {r.rating.toFixed(1)}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
