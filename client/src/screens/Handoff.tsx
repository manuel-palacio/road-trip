import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { applyDays, formatDayDate, formatDuration, groupByDay } from '../lib/compute';
import { flagEmoji } from '../lib/flags';
import { ANDROID_AUTO_MAX_STOPS_PER_DAY, aaStatus, buildDayMapsUrl } from '../lib/maps-deep-link';
import { phoneShare } from '../lib/phone-share';
import { getSharedTrip, getTrip } from '../lib/api';
import type { Stop, Trip } from '../lib/types';
import { QrModal } from '../components/QrModal';

type ResolvedTrip = {
  name: string;
  coverEmoji?: string;
  startDate?: string | null;
  maxKmPerDay?: number;
  stops: Stop[];
};

function resolveOwnerTrip(t: Trip): ResolvedTrip {
  return {
    name: t.name,
    coverEmoji: t.coverEmoji,
    startDate: t.startDate,
    maxKmPerDay: t.maxKmPerDay,
    stops: t.stops || [],
  };
}

/** Mobile-first handoff page. The user lands here on their phone (often
 * via a QR scanned from the Viewer) and sees just a list of days, each
 * one a big tap target that hands the route off to Google Maps + Android
 * Auto. No editing, no map, no chrome — just navigate. */
export function Handoff() {
  const { tripId, token } = useParams();
  const navigate = useNavigate();

  // Two entry modes share this screen:
  //   /handoff/:tripId      — owner-authed, hits getTrip
  //   /handoff/share/:token — public, hits getSharedTrip
  const isShared = !!token;
  const ownerQuery = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => getTrip(tripId!),
    enabled: !isShared && !!tripId,
  });
  const sharedQuery = useQuery({
    queryKey: ['share', token],
    queryFn: () => getSharedTrip(token!),
    enabled: isShared && !!token,
    retry: false,
  });

  const isLoading = isShared ? sharedQuery.isLoading : ownerQuery.isLoading;
  const error = isShared ? sharedQuery.error : ownerQuery.error;
  const resolved: ResolvedTrip | null = useMemo(() => {
    if (isShared) {
      const t = sharedQuery.data?.trip;
      if (!t) return null;
      return {
        name: t.name,
        coverEmoji: t.coverEmoji,
        startDate: t.startDate,
        maxKmPerDay: t.maxKmPerDay,
        stops: t.stops || [],
      };
    }
    return ownerQuery.data ? resolveOwnerTrip(ownerQuery.data) : null;
  }, [isShared, sharedQuery.data, ownerQuery.data]);

  const dayedStops = useMemo(
    () => (resolved ? applyDays(resolved.stops, resolved.maxKmPerDay || 600) : []),
    [resolved],
  );
  const groups = useMemo(() => groupByDay(dayedStops), [dayedStops]);

  const [qrFor, setQrFor] = useState<{ url: string; title: string; subtitle: string } | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted">Loading trip…</div>
      </main>
    );
  }
  if (error || !resolved) {
    return (
      <main className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="text-center">
          <div className="font-serif italic text-[24px] text-paper mb-2">Trip not found</div>
          <div className="text-paper-dim text-[14px] mb-6">This handoff link is invalid or has been revoked.</div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="bg-accent text-canvas rounded px-5 py-2.5 font-mono text-[11px] tracking-[0.16em] uppercase font-medium"
          >
            Go to dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas">
      <header className="px-5 pt-6 pb-4 border-b border-line bg-surface">
        <div className="flex items-center gap-3">
          <span className="text-[28px] leading-none">{resolved.coverEmoji || '🚗'}</span>
          <div className="min-w-0 flex-1">
            <h1 className="font-serif italic text-[22px] leading-tight text-paper truncate">{resolved.name || 'Untitled trip'}</h1>
            <p className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mt-1">
              Hand-off · tap to open in Google Maps
            </p>
          </div>
        </div>
      </header>

      {groups.length === 0 ? (
        <p className="px-6 py-12 text-center font-serif italic text-paper-muted">
          This trip has no stops yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3 px-4 py-4">
          {groups.map((g) => {
            const stopsOnly = g.stops.map((x) => x.stop);
            const url = buildDayMapsUrl(stopsOnly);
            const status = aaStatus(stopsOnly.length);
            const date = formatDayDate(g.day, resolved.startDate);
            const first = stopsOnly[0];
            const last = stopsOnly[stopsOnly.length - 1];
            const route = stopsOnly.length > 1
              ? `${first.label || first.name} → ${last.label || last.name}`
              : (first.label || first.name || '');
            const dayLabel = `Day ${g.day}${date ? ` · ${date}` : ''}`;
            return (
              <li key={g.day} className="bg-surface border border-line rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper font-medium">
                      Day {g.day}
                    </div>
                    {date && (
                      <div className="font-serif italic text-[14px] text-paper-dim mt-0.5">{date}</div>
                    )}
                  </div>
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-paper-dim text-right shrink-0">
                    <span className="text-paper font-medium">{g.km}</span> km
                    {g.durationSeconds > 0 && <> · {formatDuration(g.durationSeconds)}</>}
                  </div>
                </div>
                {route && (
                  <div className="text-paper text-[15px] leading-snug [overflow-wrap:anywhere]">
                    {route}
                    {' '}
                    {[...new Set(stopsOnly.map((s) => flagEmoji(s.countryCode)).filter(Boolean))].join(' ')}
                  </div>
                )}
                {url ? (
                  <div className="flex items-stretch gap-2">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-2 bg-accent text-canvas rounded-lg px-4 py-3 font-mono text-[11.5px] tracking-[0.14em] uppercase font-medium"
                    >
                      <span>↗</span> Open in Maps
                    </a>
                    <button
                      type="button"
                      onClick={() =>
                        setQrFor({
                          url,
                          title: dayLabel,
                          subtitle: route ? `${route} · ${g.km} km` : `${g.km} km`,
                        })
                      }
                      aria-label="Show QR code"
                      title="Show QR code"
                      className="bg-transparent border border-line text-paper-dim w-12 rounded-lg text-[16px] hover:border-paper-dim hover:text-paper transition-colors flex items-center justify-center"
                    >
                      <span aria-hidden>▦</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await phoneShare({ url, title: dayLabel, text: `${dayLabel} — ${route}` });
                        if (r.kind === 'shared' || r.kind === 'cancelled') return;
                        setShareToast(r.kind === 'copied' ? 'Link copied' : 'Could not share');
                        setTimeout(() => setShareToast(null), 1600);
                      }}
                      aria-label="Share this day's route"
                      title="Share route"
                      className="bg-transparent border border-line text-paper-dim w-12 rounded-lg text-[16px] hover:border-paper-dim hover:text-paper transition-colors flex items-center justify-center"
                    >
                      <span aria-hidden>⤴</span>
                    </button>
                  </div>
                ) : (
                  <div className="text-[#ec8e74] font-mono text-[10px] tracking-[0.14em] uppercase">
                    {status === 'over'
                      ? `Too many stops (${stopsOnly.length}/${ANDROID_AUTO_MAX_STOPS_PER_DAY}) — split this day in the builder`
                      : 'No route to open'}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {shareToast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-surface border border-line text-paper px-4 py-2 rounded-full font-mono text-[10px] tracking-[0.14em] uppercase shadow-lg">
          {shareToast}
        </div>
      )}

      {qrFor && (
        <QrModal url={qrFor.url} title={qrFor.title} subtitle={qrFor.subtitle} onClose={() => setQrFor(null)} />
      )}
    </main>
  );
}
