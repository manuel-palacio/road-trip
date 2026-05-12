import { useNavigate } from 'react-router-dom';
import { signOutFirebase } from '../lib/firebase';
import type { MeResponse, Trip } from '../lib/types';
import { Brand } from '../components/Brand';
import { TripCard } from '../components/TripCard';
import { NewTripTile } from '../components/NewTripTile';
import { useDeleteTrip, useTrips } from '../hooks/useTrips';

function initials(name: string) {
  if (!name) return '··';
  const parts = name.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '··';
}

function showUpgradeAlert() {
  // Slice 12 will wire this to Paddle. For now, a friendly placeholder.
  alert('Upgrade to Pro is coming soon — Paddle integration ships in Slice 12.');
}

export function Dashboard({ me }: { me: MeResponse }) {
  const navigate = useNavigate();
  const trips = useTrips(true);
  const del = useDeleteTrip();

  const list: Trip[] = trips.data?.trips ?? [];
  const isEmpty = !trips.isLoading && list.length === 0;
  const isFree = me.plan === 'free';
  const atLimit = isFree && me.tripCount >= me.tripLimit;

  return (
    <div className="min-h-screen relative">
      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-4 md:px-9 py-4 md:py-5 border-b border-line bg-canvas/85 backdrop-blur-md gap-3">
        <Brand size="sm" />
        <div className="flex items-center gap-2 md:gap-[18px] min-w-0">
          <span className={`hidden sm:inline-block font-mono text-[9.5px] tracking-[0.18em] uppercase px-[9px] py-[5px] rounded-full border shrink-0 ${
            me.plan === 'pro'
              ? 'text-accent border-accent bg-accent-soft'
              : 'text-paper-dim border-line-strong'
          }`}>
            {me.plan}
          </span>
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-[34px] h-[34px] rounded-full overflow-hidden bg-surface-2 flex items-center justify-center border border-line shrink-0">
              {me.photoURL ? (
                <img src={me.photoURL} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-mono text-[11px] tracking-wide text-paper-dim">{initials(me.displayName || me.email)}</span>
              )}
            </div>
            {/* Hide name on phones — avatar carries the identity */}
            <span className="hidden md:inline-block text-[14px] max-w-[180px] truncate">{me.displayName || me.email}</span>
          </div>
          <button
            type="button"
            onClick={() => signOutFirebase()}
            className="bg-transparent border border-line text-paper-dim px-3 md:px-[14px] py-[6px] md:py-[7px] rounded text-[11px] md:text-[12px] shrink-0 transition-colors duration-200 ease-out-soft hover:border-paper-dim hover:text-paper"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-[1100px] mx-auto pt-[100px] md:pt-[140px] px-4 md:px-9 pb-20">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted mb-3.5">
          Workspace <span className="text-accent mx-1.5">·</span> trips <span className="text-accent mx-1.5">·</span> {list.length}
        </div>
        <h2 className="font-serif italic font-normal text-[clamp(48px,7vw,76px)] tracking-tight leading-none">
          Your trips
        </h2>

        {isFree && (
          atLimit ? (
            <div className="mt-7 flex flex-wrap items-center gap-4 px-5 py-3.5 rounded-md border border-accent bg-accent-soft">
              <div className="flex-1 min-w-[260px]">
                <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-accent mb-1">
                  Free plan · limit reached
                </div>
                <p className="font-serif italic text-[14.5px] text-paper">
                  You've used all {me.tripLimit} of your free trips. Upgrade to Pro to keep building.
                </p>
              </div>
              <button
                type="button"
                onClick={showUpgradeAlert}
                className="bg-accent text-canvas border-0 rounded px-4 py-2 font-mono text-[10.5px] tracking-[0.18em] uppercase font-medium cursor-pointer transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-[0_8px_24px_-6px_rgba(231,111,81,0.5)]"
              >
                Subscribe → Pro
              </button>
            </div>
          ) : (
            <div className="mt-7 flex items-center justify-between gap-4 px-4 py-2.5 rounded-md border border-line bg-surface/40">
              <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-paper-dim">
                <span className="text-paper-muted">Free plan</span>
                <span className="mx-2 text-paper-muted">·</span>
                <span className="text-paper font-medium">{me.tripCount}</span>
                <span className="text-paper-muted"> of {me.tripLimit} trips used</span>
              </div>
              <button
                type="button"
                onClick={showUpgradeAlert}
                className="bg-transparent border border-line-strong text-paper-dim px-3 py-[5px] rounded font-mono text-[9.5px] tracking-[0.18em] uppercase hover:text-accent hover:border-accent transition-colors"
              >
                Upgrade for unlimited trips, PDF export &amp; collaboration <span aria-hidden>→</span>
              </button>
            </div>
          )
        )}

        <div className="mt-10 grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
          {list.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onEdit={(id) => navigate(`/builder/${id}`)}
              onView={(id) => navigate(`/viewer/${id}`)}
              onDelete={(id) => del.mutateAsync(id)}
            />
          ))}
          <NewTripTile
            hero={isEmpty}
            disabled={atLimit}
            onClick={() => navigate('/builder')}
            onUpgrade={showUpgradeAlert}
          />
        </div>

        {isEmpty && (
          <p className="mt-7 mx-auto max-w-[560px] text-center font-serif italic text-[16px] leading-[1.55] text-paper-dim">
            Your road trips will live here. Start by plotting your first route — pick a starting point, add stops along the way, and the days will sort themselves out.
          </p>
        )}
      </main>
    </div>
  );
}
