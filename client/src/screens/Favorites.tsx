import { Link } from 'react-router-dom';
import { useFavorites } from '../hooks/useFavorites';
import { flagEmoji } from '../lib/flags';
import { PIN_CATEGORY_META, DEFAULT_STOP_META } from '../lib/pin-meta';

export function Favorites() {
  const { favorites, isLoading, remove, removePending } = useFavorites();

  if (isLoading) return <main className="p-6 text-paper-dim">Loading favorites…</main>;

  if (favorites.length === 0) {
    return (
      <main className="p-6 max-w-3xl">
        <h2 className="text-paper text-[20px] mb-3">Your favorites</h2>
        <p className="text-paper-muted font-serif italic">
          No favorites yet. Star any stop in a trip to save it here.
        </p>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-4xl">
      <h2 className="text-paper text-[20px] mb-4">Your favorites · {favorites.length}</h2>
      <ul className="grid gap-2 grid-cols-1 sm:grid-cols-2">
        {favorites.map((f) => {
          const meta = f.category ? PIN_CATEGORY_META[f.category] : DEFAULT_STOP_META;
          return (
            <li key={f.id} className="bg-canvas-strong border border-line rounded-md p-3 flex gap-3 items-start">
              <span
                className="flex-none w-10 h-10 rounded-full flex items-center justify-center text-[18px]"
                style={{ backgroundColor: meta.tint }}
                aria-hidden
              >
                {meta.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-paper text-[14px] [overflow-wrap:anywhere]">{f.label || f.name}</span>
                  {f.countryCode && <span className="text-[14px] leading-none">{flagEmoji(f.countryCode)}</span>}
                </div>
                {f.sourceTripId && f.sourceTripName && (
                  <Link
                    to={`/viewer/${f.sourceTripId}`}
                    className="text-paper-muted text-[11.5px] hover:text-accent underline-offset-2 hover:underline"
                  >
                    from &ldquo;{f.sourceTripName}&rdquo;
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(f.id)}
                disabled={removePending}
                aria-label="Remove favorite"
                title="Remove favorite"
                className="bg-transparent border border-line text-paper-muted font-mono text-[10.5px] tracking-[0.18em] uppercase px-2 py-1 rounded hover:text-accent hover:border-accent disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
