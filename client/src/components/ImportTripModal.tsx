import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, createPin, createTrip } from '../lib/api';
import { MAX_IMPORT_STOPS, importedPointsToStops, type ParsedTripFile } from '../lib/trip-import';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { ACCENT_BTN, SECONDARY_BTN } from '../lib/ui';

type Props = {
  parsed: ParsedTripFile;
  onClose: () => void;
};

/** Preview step for a parsed GPX/KML file (issue #116): shows the stops
 * about to be created, lets the user rename the trip, and offers points
 * beyond the stop cap as pins. Creation goes through the normal
 * POST /api/trips, so plan limits apply unchanged. */
export function ImportTripModal({ parsed, onClose }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { stops, extras } = importedPointsToStops(parsed.points);
  const [name, setName] = useState(parsed.name || 'Imported trip');
  const [extrasAsPins, setExtrasAsPins] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(() => { if (!busy) onClose(); });

  async function createFromImport() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const trip = await createTrip({ name: name.trim() || 'Imported trip', stops });
      if (extrasAsPins) {
        for (const p of extras) {
          await createPin(trip.id, {
            name: p.name,
            lat: p.lat,
            lng: p.lng,
            category: 'other',
            priority: 'want',
            notes: p.notes ? p.notes.slice(0, 500) : '',
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      navigate(`/builder/${trip.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'TRIP_LIMIT_REACHED'
          ? err.message
          : 'Could not import the trip. Try again.',
      );
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-trip-modal-title"
    >
      <div ref={trapRef} className="w-[520px] max-w-[calc(100vw-32px)] max-h-[85vh] flex flex-col bg-surface border border-line-strong rounded-lg shadow-modal animate-rise">
        <header className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line shrink-0">
          <span id="import-trip-modal-title" className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted">
            Import route
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="text-paper-muted hover:text-paper text-[18px] leading-none px-1"
          >
            ×
          </button>
        </header>
        <div className="px-5 pt-4 pb-5 flex flex-col gap-4 overflow-y-auto flex-1">
          <label className="block">
            <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">Trip name</span>
            <input
              type="text"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-transparent border-0 border-b border-line text-paper text-[14px] py-1 outline-none transition-colors focus:border-accent"
            />
          </label>
          <div>
            <span className="block font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1.5">
              {stops.length} stop{stops.length === 1 ? '' : 's'}
            </span>
            <ol className="max-h-[220px] overflow-y-auto flex flex-col gap-1" data-testid="import-preview-stops">
              {stops.map((s, i) => (
                <li key={s.id} className="flex items-baseline gap-2 text-[13px] text-paper">
                  <span className="font-mono text-[10px] text-paper-muted w-5 text-right shrink-0">{i + 1}</span>
                  <span className="[overflow-wrap:anywhere]">{s.name}</span>
                  <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-paper-muted">{s.type}</span>
                </li>
              ))}
            </ol>
          </div>
          {extras.length > 0 && (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={extrasAsPins}
                onChange={(e) => setExtrasAsPins(e.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <span className="flex-1 text-paper text-[13px]">
                Import the remaining {extras.length} point{extras.length === 1 ? '' : 's'} as pins
                <span className="block text-paper-muted text-[11.5px] mt-0.5">
                  Routes cap at {MAX_IMPORT_STOPS} stops; pins keep the rest on the map without affecting routing.
                </span>
              </span>
            </label>
          )}
          {error && <p className="text-red-400 text-[12px]">{error}</p>}
        </div>
        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-line shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={SECONDARY_BTN}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={createFromImport}
            disabled={busy}
            data-testid="import-create"
            className={ACCENT_BTN}
          >
            {busy ? 'Importing…' : 'Create trip'}
          </button>
        </footer>
      </div>
    </div>
  );
}
