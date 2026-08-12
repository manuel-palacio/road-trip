import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, publishTemplate, unpublishTemplate } from '../lib/api';
import { signOutFirebase } from '../lib/firebase';
import type { AppConfig, MeResponse, Trip } from '../lib/types';
import { Brand } from '../components/Brand';
import { InstallAppButton } from '../components/InstallAppButton';
import { ThemeToggle } from '../components/ThemeToggle';
import { PublishTemplateModal } from '../components/PublishTemplateModal';
import { TripCard } from '../components/TripCard';
import { NewTripTile } from '../components/NewTripTile';
import { HeaderNav } from '../components/HeaderNav';
import { ImportTripModal } from '../components/ImportTripModal';
import { parseTripFile, type ParsedTripFile } from '../lib/trip-import';
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

export function Dashboard({ me, config }: { me: MeResponse; config: AppConfig }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trips = useTrips(true);
  const del = useDeleteTrip();

  const list: Trip[] = trips.data?.trips ?? [];
  const isEmpty = !trips.isLoading && list.length === 0;
  const isFree = me.plan === 'free';
  const isPro = me.plan === 'pro';
  const atLimit = me.tripCount >= me.tripLimit;

  const [importPreview, setImportPreview] = useState<ParsedTripFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  async function onImportFile(file: File | undefined) {
    if (!file) return;
    setImportError(null);
    try {
      setImportPreview(parseTripFile(await file.text()));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  }

  const [templateTrip, setTemplateTrip] = useState<Trip | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const publishMut = useMutation({
    mutationFn: (vars: { tripId: string; templateDescription: string; templateTags: string[]; templateVisibility: 'public' | 'unlisted' }) =>
      publishTemplate(vars.tripId, {
        templateDescription: vars.templateDescription,
        templateTags: vars.templateTags,
        templateVisibility: vars.templateVisibility,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setTemplateTrip(null);
      setTemplateError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) setTemplateError(err.message);
      else setTemplateError('Could not publish template.');
    },
  });
  const unpublishMut = useMutation({
    mutationFn: (tripId: string) => unpublishTemplate(tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      setTemplateTrip(null);
      setTemplateError(null);
    },
    onError: (err: unknown) => {
      setTemplateError(err instanceof ApiError ? err.message : 'Could not unpublish.');
    },
  });

  return (
    <div className="min-h-screen relative">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-3 focus:py-2 focus:rounded focus:border focus:border-accent focus:bg-canvas-strong focus:text-paper focus:font-mono focus:text-[11px]"
      >
        Skip to content
      </a>
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
          <HeaderNav>
          <button
            type="button"
            onClick={() => navigate('/templates')}
            className="bg-transparent border border-line text-paper-dim px-3 md:px-[14px] py-[6px] md:py-[7px] rounded text-[11px] md:text-[12px] shrink-0 transition-colors duration-200 ease-out-soft hover:border-paper-dim hover:text-paper"
          >
            Templates
          </button>
          <button
            type="button"
            onClick={() => navigate('/favorites')}
            className="bg-transparent border border-line text-paper-dim px-3 md:px-[14px] py-[6px] md:py-[7px] rounded text-[11px] md:text-[12px] shrink-0 transition-colors duration-200 ease-out-soft hover:border-paper-dim hover:text-paper"
          >
            Favorites
          </button>
          {me.email.toLowerCase() === (config.adminEmail || '').toLowerCase() && (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="bg-transparent border border-accent text-accent px-3 md:px-[14px] py-[6px] md:py-[7px] rounded text-[11px] md:text-[12px] shrink-0 transition-colors duration-200 ease-out-soft hover:bg-accent hover:text-canvas"
            >
              Admin
            </button>
          )}
          <ThemeToggle />
          <InstallAppButton />
          <button
            type="button"
            onClick={() => signOutFirebase()}
            className="bg-transparent border border-line text-paper-dim px-3 md:px-[14px] py-[6px] md:py-[7px] rounded text-[11px] md:text-[12px] shrink-0 transition-colors duration-200 ease-out-soft hover:border-paper-dim hover:text-paper"
          >
            Sign out
          </button>
          </HeaderNav>
        </div>
      </header>
      <main id="main" className="max-w-[1100px] mx-auto pt-[100px] md:pt-[140px] px-4 md:px-9 pb-20">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted mb-3.5">
          Workspace <span className="text-accent mx-1.5">·</span> trips <span className="text-accent mx-1.5">·</span> {list.length}
        </div>
        <h1 className="font-serif italic font-normal text-[clamp(48px,7vw,76px)] tracking-tight leading-none">
          Your trips
        </h1>

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
              onTemplate={(t) => { setTemplateError(null); setTemplateTrip(t); }}
            />
          ))}
          <NewTripTile
            hero={isEmpty}
            disabled={atLimit}
            onClick={() => navigate('/builder')}
            onUpgrade={showUpgradeAlert}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <label
            className={`inline-flex items-center gap-1.5 px-3 py-[6px] rounded border border-line font-mono text-[9.5px] tracking-[0.18em] uppercase transition-colors ${
              atLimit ? 'text-paper-muted opacity-50 cursor-not-allowed' : 'text-paper-dim hover:text-paper hover:border-paper-dim cursor-pointer'
            }`}
          >
            <span aria-hidden>⇪</span>
            Import GPX / KML
            <input
              type="file"
              accept=".gpx,.kml,application/gpx+xml,application/vnd.google-earth.kml+xml"
              disabled={atLimit}
              className="hidden"
              data-testid="import-file-input"
              onChange={(e) => {
                void onImportFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {importError && <span className="text-red-400 text-[12px]">{importError}</span>}
        </div>

        {isEmpty && (
          <p className="mt-7 mx-auto max-w-[560px] text-center font-serif italic text-[16px] leading-[1.55] text-paper-dim">
            Your road trips will live here. Start by plotting your first route — pick a starting point, add stops along the way, and the days will sort themselves out.
          </p>
        )}
      </main>
      {importPreview && (
        <ImportTripModal parsed={importPreview} onClose={() => setImportPreview(null)} />
      )}
      {templateTrip && (
        <PublishTemplateModal
          trip={templateTrip}
          isPro={isPro}
          busy={publishMut.isPending || unpublishMut.isPending}
          errorMessage={templateError}
          onPublish={(input) =>
            publishMut.mutate({
              tripId: templateTrip.id,
              templateDescription: input.templateDescription,
              templateTags: input.templateTags,
              templateVisibility: input.templateVisibility,
            })
          }
          onUnpublish={() => unpublishMut.mutate(templateTrip.id)}
          onClose={() => { setTemplateTrip(null); setTemplateError(null); }}
        />
      )}
    </div>
  );
}
