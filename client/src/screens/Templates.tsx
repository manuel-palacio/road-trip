import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, cloneTemplate, listTemplates } from '../lib/api';
import { getFirebaseAuth } from '../lib/firebase';
import type { TemplateCard } from '../lib/types';
import { Brand } from '../components/Brand';

/** Public templates library. Anyone can browse. Cloning requires login —
 * unauthenticated visitors get a "Sign in to clone" prompt. */
export function Templates() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tag, setTag] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const templates = useQuery({
    queryKey: ['templates', tag],
    queryFn: () => listTemplates(tag ? { tag } : {}),
    retry: false,
  });

  const cloneMut = useMutation({
    mutationFn: (id: string) => cloneTemplate(id),
    onSuccess: (trip) => {
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      navigate(`/builder/${trip.id}`);
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Could not clone template.');
      setCloningId(null);
    },
  });

  async function onClone(item: TemplateCard) {
    const user = getFirebaseAuth().currentUser;
    if (!user) {
      // Send the visitor through the auth flow then bring them back.
      // Login takes over the routing so the redirect happens via the
      // root-page render path; deep-linking back to /templates is enough.
      window.location.href = `/?next=${encodeURIComponent('/templates')}`;
      return;
    }
    setError(null);
    setCloningId(item.id);
    cloneMut.mutate(item.id);
  }

  // Collect all tags from the current results for the filter pills.
  const allTags = [...new Set((templates.data?.items || []).flatMap((t) => t.templateTags || []))]
    .sort();

  return (
    <div className="min-h-screen">
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-4 md:px-9 py-4 md:py-5 border-b border-line bg-canvas/85 backdrop-blur-md gap-3">
        <Brand size="sm" />
        <button
          type="button"
          onClick={() => navigate('/')}
          className="bg-transparent border border-line text-paper-dim px-3 md:px-[14px] py-[6px] md:py-[7px] rounded text-[11px] md:text-[12px] shrink-0 transition-colors hover:border-paper-dim hover:text-paper"
        >
          {getFirebaseAuth().currentUser ? '← Dashboard' : 'Sign in →'}
        </button>
      </header>

      <main className="max-w-[1100px] mx-auto pt-[100px] md:pt-[140px] px-4 md:px-9 pb-20">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted mb-3.5">
          Library
          <span className="text-accent mx-1.5">·</span>
          community templates
          {templates.data && (
            <>
              <span className="text-accent mx-1.5">·</span>
              {templates.data.items.length}
            </>
          )}
        </div>
        <h1 className="font-serif italic font-normal text-[clamp(48px,7vw,76px)] tracking-tight leading-none mb-3">
          Borrow a route
        </h1>
        <p className="font-serif italic text-[16px] leading-[1.55] text-paper-dim max-w-[640px] mb-7">
          Real road trips published by other travellers. Clone any of them into
          your own dashboard — the route comes across as a starting point, then
          you can rearrange stops, add pins, and pick your own start date.
        </p>

        {allTags.length > 0 && (
          <div className="mb-7 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTag(null)}
              className={`px-2.5 py-[5px] rounded-full font-mono text-[10px] tracking-[0.16em] uppercase border transition-colors ${
                tag === null
                  ? 'bg-accent-soft border-accent text-accent'
                  : 'bg-transparent border-line text-paper-dim hover:text-paper hover:border-paper-dim'
              }`}
            >
              All
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTag(t)}
                className={`px-2.5 py-[5px] rounded-full font-mono text-[10px] tracking-[0.16em] uppercase border transition-colors ${
                  tag === t
                    ? 'bg-accent-soft border-accent text-accent'
                    : 'bg-transparent border-line text-paper-dim hover:text-paper hover:border-paper-dim'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-6 px-4 py-2.5 rounded-md border border-[rgba(214,90,63,0.5)] bg-[rgba(214,90,63,0.12)] text-[#ec8e74] font-mono text-[11px] tracking-[0.14em] uppercase">
            {error}
          </div>
        )}

        {templates.isLoading ? (
          <p className="text-center font-serif italic text-paper-muted py-12">Loading templates…</p>
        ) : templates.error ? (
          <div className="text-center py-12 max-w-[480px] mx-auto">
            <p className="font-serif italic text-[18px] text-[#ec8e74] mb-2">
              Couldn't load templates
            </p>
            <p className="text-paper-dim text-[13px] leading-snug">
              {templates.error instanceof Error ? templates.error.message : String(templates.error)}
            </p>
            <button
              type="button"
              onClick={() => templates.refetch()}
              className="mt-4 bg-transparent border border-line text-paper-dim px-3 py-1.5 rounded font-mono text-[10.5px] tracking-[0.16em] uppercase hover:text-paper hover:border-paper-dim transition-colors"
            >
              Retry
            </button>
          </div>
        ) : templates.data && templates.data.items.length === 0 ? (
          <p className="text-center font-serif italic text-[16px] text-paper-dim py-12 max-w-[480px] mx-auto">
            {tag
              ? `No templates tagged "${tag}" yet.`
              : 'No templates published yet. Build a trip, then publish it from your dashboard to seed the library.'}
          </p>
        ) : (
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
            {(templates.data?.items || []).map((t) => (
              <TemplateCardItem
                key={t.id}
                item={t}
                busy={cloningId === t.id && cloneMut.isPending}
                onClone={() => onClone(t)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function TemplateCardItem({
  item,
  busy,
  onClone,
}: {
  item: TemplateCard;
  busy: boolean;
  onClone: () => void;
}) {
  const flags = (item.countries || []).join(' ');
  const days = item.totalDays || 0;
  return (
    <article className="relative flex flex-col gap-3 px-[26px] pt-[26px] pb-4 bg-surface border border-line rounded-lg min-h-[260px] transition-all duration-200 ease-out-soft hover:border-line-strong hover:-translate-y-px">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[40px] leading-none">{item.coverEmoji || '🚗'}</div>
        <span
          title={`${item.cloneCount ?? 0} clones`}
          className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-accent-soft border border-accent text-accent font-mono text-[9.5px] tracking-[0.14em] uppercase"
        >
          <span aria-hidden>★</span> {item.cloneCount ?? 0}
        </span>
      </div>
      <h3 className="font-serif italic font-normal text-[22px] leading-[1.15] tracking-tight text-paper [overflow-wrap:anywhere]">
        {item.name}
      </h3>
      {item.templateDescription && (
        <p className="text-paper-dim text-[13px] leading-snug line-clamp-3">
          {item.templateDescription}
        </p>
      )}
      <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.16em] uppercase text-paper-dim">
        <span><span className="text-paper font-medium mr-0.5">{item.totalKm ?? 0}</span>km</span>
        <span>
          <span className="text-paper font-medium mr-0.5">{days}</span>
          {days === 1 ? 'day' : 'days'}
        </span>
        {flags && <span className="text-[14px] tracking-wide normal-case">{flags}</span>}
      </div>
      {!!(item.templateTags && item.templateTags.length) && (
        <div className="flex flex-wrap gap-1">
          {item.templateTags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="px-2 py-[2px] bg-[rgba(243,236,222,0.06)] border border-line rounded-full text-[10.5px] text-paper-dim"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto pt-3 flex items-center justify-between gap-2">
        <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-paper-muted truncate">
          by {item.owner.displayName}
        </span>
        <button
          type="button"
          onClick={onClone}
          disabled={busy}
          className="bg-accent text-canvas border border-accent rounded px-3 py-[6px] font-mono text-[10px] tracking-[0.14em] uppercase font-medium transition-all hover:opacity-90 disabled:bg-surface-2 disabled:border-line disabled:text-paper-muted disabled:cursor-not-allowed"
        >
          {busy ? 'Cloning…' : 'Use this route'}
        </button>
      </div>
    </article>
  );
}
