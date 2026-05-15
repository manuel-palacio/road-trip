import { useEffect, useRef, useState } from 'react';
import type { FuelSearchTarget } from '../../lib/fuel-stops';

export type FuelStopResult = {
  placeId: string;
  name: string;
  vicinity: string;
  rating?: number;
  lat: number;
  lng: number;
};

type Props = {
  target: FuelSearchTarget;
  // Google Maps SDK + a map instance for the legacy PlacesService.
  maps: typeof google.maps;
  map: google.maps.Map;
  onSelect: (r: FuelStopResult) => void;
  onClose: () => void;
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
 * longest-leg midpoint and lets the user pick a gas station to insert
 * as a new stop. Uses the legacy PlacesService API which is well-known
 * and stable; the newer Place.searchNearby() would also work. */
export function FuelStopFinder({ target, maps, map, onSelect, onClose }: Props) {
  const [results, setResults] = useState<FuelStopResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

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
    service.nearbySearch(
      {
        location: target.midpoint,
        radius: SEARCH_RADIUS_M,
        type: 'gas_station',
      },
      (raw, status) => {
        if (status !== maps.places.PlacesServiceStatus.OK || !raw) {
          setResults([]);
          if (status !== maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            setError(`Places search failed: ${status}`);
          }
          return;
        }
        const items: FuelStopResult[] = raw
          .filter((r) => r.geometry?.location)
          .map((r) => ({
            placeId: r.place_id || '',
            name: r.name || 'Gas station',
            vicinity: r.vicinity || '',
            rating: typeof r.rating === 'number' ? r.rating : undefined,
            lat: r.geometry!.location!.lat(),
            lng: r.geometry!.location!.lng(),
          }))
          // Closest first.
          .sort(
            (a, b) =>
              haversineKm(target.midpoint, { lat: a.lat, lng: a.lng })
              - haversineKm(target.midpoint, { lat: b.lat, lng: b.lng }),
          )
          .slice(0, 10);
        setResults(items);
      },
    );
  }, [maps, map, target.midpoint]);

  const startName = target.legStart.label || target.legStart.name || 'start';
  const endName = target.legEnd.label || target.legEnd.name || 'end';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Find a gas station along this leg"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-xl p-5 max-w-md w-full max-h-[85vh] flex flex-col shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="font-serif italic text-[20px] leading-tight text-paper">
              Add a fuel stop
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
            <p className="text-center font-serif italic text-[14px] text-paper-dim py-8">
              No gas stations within {SEARCH_RADIUS_M / 1000} km of the midpoint.
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
                      <span aria-hidden className="text-[18px] leading-none mt-0.5">⛽</span>
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
