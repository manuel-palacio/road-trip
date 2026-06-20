import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  adminStats,
  adminListUsers,
  adminSetPlan,
  adminListTrips,
  adminDeleteTrip,
  ApiError,
} from '../lib/api';
import type { AdminUser, AdminTrip, AdminStats } from '../lib/api';
import type { AppConfig, MeResponse } from '../lib/types';

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-canvas-strong border border-line rounded-md px-5 py-4">
      <div className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted mb-1">{label}</div>
      <div className="text-[28px] font-serif italic text-paper">{value}</div>
    </div>
  );
}

function StatsSection() {
  const { data, isLoading } = useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: adminStats,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-canvas-strong border border-line rounded-md px-5 py-4 animate-pulse h-[80px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard label="Users" value={data.users} />
      <StatCard label="Pro users" value={data.proUsers} />
      <StatCard label="Free users" value={data.freeUsers} />
      <StatCard label="Trips" value={data.trips} />
      <StatCard label="Templates" value={data.templates} />
      <StatCard label="Favorites" value={data.favorites} />
    </div>
  );
}

function planBadge(plan: string) {
  const isPro = plan === 'pro';
  return (
    <span className={`font-mono text-[9px] tracking-[0.18em] uppercase px-[7px] py-[4px] rounded-full border ${
      isPro ? 'text-accent border-accent bg-accent-soft' : 'text-paper-dim border-line-strong'
    }`}>
      {plan}
    </span>
  );
}

type PlanFilter = 'all' | 'free' | 'pro';

function UsersTable() {
  const qc = useQueryClient();
  const [planFilter, setPlanFilter] = useState<PlanFilter>('all');
  const [emailSearch, setEmailSearch] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', planFilter, cursor],
    queryFn: () => adminListUsers({ planFilter, cursor: cursor ?? undefined }),
  });

  const setPlan = useMutation({
    mutationFn: ({ uid, plan }: { uid: string; plan: 'free' | 'pro' }) =>
      adminSetPlan(uid, plan),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });

  const users: AdminUser[] = data?.users ?? [];
  const filtered = emailSearch
    ? users.filter((u) => u.email.toLowerCase().includes(emailSearch.toLowerCase()))
    : users;

  function changePlanFilter(f: PlanFilter) {
    setPlanFilter(f);
    setCursor(null);
    setCursorStack([]);
  }

  function nextPage() {
    if (!data?.nextCursor) return;
    setCursorStack((s) => [...s, cursor ?? '']);
    setCursor(data.nextCursor);
  }

  function prevPage() {
    const stack = [...cursorStack];
    const prev = stack.pop() ?? null;
    setCursorStack(stack);
    setCursor(prev || null);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3 className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted">Users</h3>
        <div className="flex gap-1">
          {(['all', 'free', 'pro'] as PlanFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => changePlanFilter(f)}
              className={`font-mono text-[9.5px] tracking-[0.18em] uppercase px-3 py-[5px] rounded border transition-colors ${
                planFilter === f
                  ? 'bg-accent text-canvas border-accent'
                  : 'bg-transparent text-paper-dim border-line hover:border-paper-dim hover:text-paper'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Filter by email…"
          value={emailSearch}
          onChange={(e) => setEmailSearch(e.target.value)}
          className="ml-auto bg-canvas-strong border border-line text-paper text-[12px] px-3 py-[5px] rounded w-48 focus:outline-none focus:border-accent placeholder:text-paper-muted"
        />
      </div>

      {isLoading ? (
        <div className="text-paper-dim text-[13px] py-6">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-mono text-[9px] tracking-[0.18em] uppercase text-paper-muted py-2 pr-4">Email</th>
                <th className="text-left font-mono text-[9px] tracking-[0.18em] uppercase text-paper-muted py-2 pr-4">Plan</th>
                <th className="text-left font-mono text-[9px] tracking-[0.18em] uppercase text-paper-muted py-2 pr-4">Trip limit</th>
                <th className="text-left font-mono text-[9px] tracking-[0.18em] uppercase text-paper-muted py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.uid} className="border-b border-line/50 hover:bg-surface/30">
                  <td className="py-2 pr-4 text-paper max-w-[260px] truncate">{u.email}</td>
                  <td className="py-2 pr-4">{planBadge(u.plan)}</td>
                  <td className="py-2 pr-4 text-paper-dim font-mono text-[11px]">{u.tripLimit ?? '—'}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      {u.plan !== 'pro' && (
                        <button
                          type="button"
                          disabled={setPlan.isPending}
                          onClick={() => setPlan.mutate({ uid: u.uid, plan: 'pro' })}
                          className="font-mono text-[9.5px] tracking-[0.14em] uppercase px-2 py-[4px] rounded border border-accent text-accent hover:bg-accent hover:text-canvas disabled:opacity-50 transition-colors"
                        >
                          Upgrade
                        </button>
                      )}
                      {u.plan !== 'free' && (
                        <button
                          type="button"
                          disabled={setPlan.isPending}
                          onClick={() => setPlan.mutate({ uid: u.uid, plan: 'free' })}
                          className="font-mono text-[9.5px] tracking-[0.14em] uppercase px-2 py-[4px] rounded border border-line text-paper-dim hover:border-paper-dim hover:text-paper disabled:opacity-50 transition-colors"
                        >
                          Downgrade
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-paper-muted text-center font-serif italic">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={prevPage}
          disabled={cursorStack.length === 0}
          className="font-mono text-[9.5px] tracking-[0.14em] uppercase px-3 py-[5px] rounded border border-line text-paper-dim hover:border-paper-dim hover:text-paper disabled:opacity-40 transition-colors"
        >
          ← Prev
        </button>
        <button
          type="button"
          onClick={nextPage}
          disabled={!data?.nextCursor}
          className="font-mono text-[9.5px] tracking-[0.14em] uppercase px-3 py-[5px] rounded border border-line text-paper-dim hover:border-paper-dim hover:text-paper disabled:opacity-40 transition-colors"
        >
          Next →
        </button>
      </div>
    </section>
  );
}

function TripsTable() {
  const qc = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'trips', cursor],
    queryFn: () => adminListTrips({ cursor: cursor ?? undefined }),
  });

  const del = useMutation({
    mutationFn: (id: string) => adminDeleteTrip(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'trips'] });
      qc.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setConfirmId(null);
    },
  });

  const trips: AdminTrip[] = data?.trips ?? [];

  function nextPage() {
    if (!data?.nextCursor) return;
    setCursorStack((s) => [...s, cursor ?? '']);
    setCursor(data.nextCursor);
  }

  function prevPage() {
    const stack = [...cursorStack];
    const prev = stack.pop() ?? null;
    setCursorStack(stack);
    setCursor(prev || null);
  }

  function formatDate(ts: unknown): string {
    if (!ts || typeof ts !== 'object') return '—';
    const secs = (ts as { seconds?: number }).seconds;
    if (!secs) return '—';
    return new Date(secs * 1000).toLocaleDateString();
  }

  return (
    <section>
      <h3 className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted mb-4">Recent trips</h3>

      {isLoading ? (
        <div className="text-paper-dim text-[13px] py-6">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left font-mono text-[9px] tracking-[0.18em] uppercase text-paper-muted py-2 pr-4">Name</th>
                <th className="text-left font-mono text-[9px] tracking-[0.18em] uppercase text-paper-muted py-2 pr-4">Owner UID</th>
                <th className="text-left font-mono text-[9px] tracking-[0.18em] uppercase text-paper-muted py-2 pr-4">Created</th>
                <th className="text-left font-mono text-[9px] tracking-[0.18em] uppercase text-paper-muted py-2 pr-4">Stops</th>
                <th className="text-left font-mono text-[9px] tracking-[0.18em] uppercase text-paper-muted py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id} className="border-b border-line/50 hover:bg-surface/30">
                  <td className="py-2 pr-4 text-paper max-w-[200px] truncate">
                    {t.name || <span className="text-paper-muted italic">Untitled</span>}
                    {t.isTemplate && (
                      <span className="ml-2 font-mono text-[8.5px] tracking-[0.14em] uppercase text-accent border border-accent rounded px-1 py-[2px]">tpl</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-paper-dim font-mono text-[10px] max-w-[140px] truncate">{t.ownerUid}</td>
                  <td className="py-2 pr-4 text-paper-dim font-mono text-[11px]">{formatDate(t.createdAt)}</td>
                  <td className="py-2 pr-4 text-paper-dim font-mono text-[11px]">
                    {Array.isArray(t.stops) ? t.stops.length : '—'}
                  </td>
                  <td className="py-2">
                    {confirmId === t.id ? (
                      <div className="flex gap-2 items-center">
                        <span className="text-[11px] text-paper-dim">Sure?</span>
                        <button
                          type="button"
                          disabled={del.isPending}
                          onClick={() => del.mutate(t.id)}
                          className="font-mono text-[9.5px] tracking-[0.14em] uppercase px-2 py-[4px] rounded border border-red-500 text-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="font-mono text-[9.5px] tracking-[0.14em] uppercase px-2 py-[4px] rounded border border-line text-paper-dim hover:border-paper-dim transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(t.id)}
                        className="font-mono text-[9.5px] tracking-[0.14em] uppercase px-2 py-[4px] rounded border border-line text-paper-dim hover:border-red-500 hover:text-red-500 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {trips.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-paper-muted text-center font-serif italic">No trips found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={prevPage}
          disabled={cursorStack.length === 0}
          className="font-mono text-[9.5px] tracking-[0.14em] uppercase px-3 py-[5px] rounded border border-line text-paper-dim hover:border-paper-dim hover:text-paper disabled:opacity-40 transition-colors"
        >
          ← Prev
        </button>
        <button
          type="button"
          onClick={nextPage}
          disabled={!data?.nextCursor}
          className="font-mono text-[9.5px] tracking-[0.14em] uppercase px-3 py-[5px] rounded border border-line text-paper-dim hover:border-paper-dim hover:text-paper disabled:opacity-40 transition-colors"
        >
          Next →
        </button>
      </div>
    </section>
  );
}

export function Admin({ me, config }: { me: MeResponse; config: AppConfig }) {
  const navigate = useNavigate();

  const isAdmin = me.email.toLowerCase() === (config.adminEmail || '').toLowerCase();
  if (!isAdmin) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen relative">
      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-4 md:px-9 py-4 md:py-5 border-b border-line bg-canvas/85 backdrop-blur-md gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="font-mono text-[10px] tracking-[0.18em] uppercase text-paper-dim hover:text-paper transition-colors"
          >
            ← Dashboard
          </button>
          <span className="text-line">·</span>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-accent">Admin</span>
        </div>
        <span className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-paper-muted">{me.email}</span>
      </header>

      <main className="max-w-[1200px] mx-auto pt-[100px] md:pt-[120px] px-4 md:px-9 pb-20 space-y-12">
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted mb-3.5">
            Admin <span className="text-accent mx-1.5">·</span> overview
          </div>
          <h2 className="font-serif italic font-normal text-[clamp(36px,5vw,56px)] tracking-tight leading-none mb-8">
            Dashboard
          </h2>
          <StatsSection />
        </div>

        <UsersTable />
        <TripsTable />
      </main>
    </div>
  );
}
