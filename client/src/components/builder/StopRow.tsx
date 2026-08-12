import { useState } from 'react';
import { flagEmoji } from '../../lib/flags';
import { dayColor } from '../../lib/compute';
import { getStopRoutingFailed } from '../../hooks/useRouteSegments';
import { StopIdentityBadge } from '../StopIdentityBadge';
import { FavoriteToggle } from '../FavoriteToggle';
import { useFavorites } from '../../hooks/useFavorites';
import type { Stop, StopRouteMode } from '../../lib/types';

type Props = {
  stop: Stop;
  index: number;
  isFirst: boolean;
  /** Arrival/departure clock times for this stop (issue #114). undefined =
   * scheduling off for the trip (no drive start time set) — the stay editor
   * and time chip stay hidden. */
  schedule?: { arrival: string | null; departure: string | null } | null;
  onChangeStayMinutes?: (id: string, minutes: number) => void;
  onChangeNights?: (id: string, nights: number) => void;
  /** Removes the via-point at `index` from the leg ending at this stop
   * (issue #120). The map beads are mouse-only; this chip is the touch +
   * keyboard path. */
  onRemoveViaPoint?: (id: string, index: number) => void;
  onChangeType: (id: string, type: Stop['type']) => void;
  onChangeRouteMode?: (id: string, mode: StopRouteMode) => void;
  onRemove: (id: string) => void;
  onSetForceDayStart: (id: string, value: boolean) => void;
  onAddHighlight: (id: string, text: string) => void;
  onRemoveHighlight: (id: string, text: string) => void;
  onDemote?: (stop: Stop) => void;
  demotingStopId?: string | null;
  onFavoriteAdd?: (stop: Stop) => void;
  onFavoriteRemove?: (favoriteId: string) => void;
  // DnD
  onDragStart: (id: string, ev: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (id: string, ev: React.DragEvent) => void;
  onDragLeave: (ev: React.DragEvent) => void;
  onDrop: (id: string, ev: React.DragEvent) => void;
};

const ROUTE_MODE_OPTIONS: { value: StopRouteMode; label: string; glyph: string }[] = [
  { value: 'fastest',         label: 'Fastest',          glyph: '⚡' },
  { value: 'scenic',          label: 'Scenic',           glyph: '🌲' },
  { value: 'no-tolls',        label: 'No tolls',         glyph: '🛣' },
  { value: 'scenic-no-tolls', label: 'Scenic · no tolls', glyph: '🌲🛣' },
];

const STAY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'no stay' },
  { value: 15, label: '15m stay' },
  { value: 30, label: '30m stay' },
  { value: 45, label: '45m stay' },
  { value: 60, label: '1h stay' },
  { value: 90, label: '1.5h stay' },
  { value: 120, label: '2h stay' },
  { value: 180, label: '3h stay' },
  { value: 240, label: '4h stay' },
  { value: 360, label: '6h stay' },
];

const NIGHTS_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

const TYPE_OPTIONS: { value: Stop['type']; label: string }[] = [
  { value: 'start', label: 'Start' },
  { value: 'overnight', label: 'Overnight' },
  { value: 'waypoint', label: 'Waypoint' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'destination', label: 'Destination' },
];

export function StopRow(p: Props) {
  const { stop, index, isFirst } = p;
  const [chipDraft, setChipDraft] = useState('');
  const [dropZone, setDropZone] = useState<'above' | 'below' | null>(null);
  const [dragging, setDragging] = useState(false);
  const { favoriteIdForStop, addPending, removePending } = useFavorites();
  const favoriteId = favoriteIdForStop(stop);

  const flag = flagEmoji(stop.countryCode);
  const accentBorder = ({
    start: 'border-l-accent',
    destination: 'border-l-paper',
    waypoint: 'border-l-paper-muted',
    overnight: 'border-l-line',
    fuel: 'border-l-paper-muted',
  } satisfies Record<Stop['type'], string>)[stop.type];
  const color = dayColor(stop.dayNumber);
  const routingFailed = getStopRoutingFailed(stop);
  const isForced = stop.forceDayStart === true;
  const highlights = stop.highlights || [];

  function commitHighlight() {
    const v = chipDraft.trim();
    if (!v) return;
    p.onAddHighlight(stop.id, v);
    setChipDraft('');
  }

  return (
    <div
      data-stop-id={stop.id}
      data-testid="stop-card"
      draggable={false}
      onDragOver={(ev) => {
        if (!ev.dataTransfer.types.includes('text/plain')) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        const rect = (ev.currentTarget as HTMLDivElement).getBoundingClientRect();
        const above = ev.clientY < rect.top + rect.height / 2;
        setDropZone(above ? 'above' : 'below');
        p.onDragOver(stop.id, ev);
      }}
      onDragLeave={(ev) => {
        const related = ev.relatedTarget as Node | null;
        if (related && (ev.currentTarget as HTMLDivElement).contains(related)) return;
        setDropZone(null);
        p.onDragLeave(ev);
      }}
      onDrop={(ev) => {
        ev.preventDefault();
        setDropZone(null);
        p.onDrop(stop.id, ev);
      }}
      className={`relative flex items-start gap-3 pl-3.5 pr-7 py-3 bg-canvas border border-line border-l-2 ${accentBorder} rounded-md transition-all hover:border-line-strong ${
        dragging ? 'opacity-30 scale-[0.98]' : ''
      }`}
    >
      {dropZone === 'above' && (
        <div className="absolute -top-1.5 left-2 right-2 h-[3px] bg-accent rounded-sm pointer-events-none z-10 shadow-[0_0_14px_rgba(231,111,81,0.7)]" />
      )}
      {dropZone === 'below' && (
        <div className="absolute -bottom-1.5 left-2 right-2 h-[3px] bg-accent rounded-sm pointer-events-none z-10 shadow-[0_0_14px_rgba(231,111,81,0.7)]" />
      )}

      <span
        className="font-mono text-paper-muted text-[13px] cursor-grab pt-0.5 select-none hover:text-accent active:cursor-grabbing"
        aria-hidden
        title="Drag to reorder"
        draggable
        onDragStart={(ev) => {
          ev.dataTransfer.effectAllowed = 'move';
          ev.dataTransfer.setData('text/plain', stop.id);
          if (ev.dataTransfer.setDragImage) {
            const row = (ev.currentTarget as HTMLElement).parentElement;
            if (row) ev.dataTransfer.setDragImage(row, 24, 18);
          }
          setTimeout(() => setDragging(true), 0);
          p.onDragStart(stop.id, ev);
        }}
        onDragEnd={() => {
          setDragging(false);
          setDropZone(null);
          p.onDragEnd();
        }}
      >
        ⠿
      </span>

      <StopIdentityBadge stop={stop} index={index} variant="card" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] text-paper [overflow-wrap:anywhere]">{stop.label || stop.name}</span>
          {flag && <span className="text-[14px] leading-none">{flag}</span>}
        </div>

        <div className="mt-2 flex items-center flex-wrap gap-y-1.5 gap-x-2">
          <select
            value={stop.type}
            aria-label={`Stop type for ${stop.label || stop.name}`}
            onChange={(e) => p.onChangeType(stop.id, e.target.value as Stop['type'])}
            className="bg-transparent border border-line rounded text-paper-dim font-mono text-[9.5px] tracking-[0.18em] uppercase px-1.5 py-[3px] pr-[18px] appearance-none cursor-pointer hover:border-paper-dim hover:text-paper focus:outline-none focus:border-accent"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'><path fill='%239b9080' d='M0 0l4 5 4-5z'/></svg>\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 6px center',
            }}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {index > 0 && routingFailed && (
            <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-accent">no route</span>
          )}
          {index > 0 && !routingFailed && stop.kmFromPrevious ? (
            <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-paper-dim">
              <span className="text-paper-muted mr-1">↗</span>
              <span className="text-paper font-medium mr-0.5">{stop.kmFromPrevious}</span>km
              {stop.durationFromPrevious ? <span> · {stop.durationFromPrevious}</span> : null}
            </span>
          ) : null}
          {p.onRemoveViaPoint && (stop.viaPoints || []).map((_, viaIndex) => (
            <button
              key={viaIndex}
              type="button"
              data-testid="via-chip"
              onClick={() => p.onRemoveViaPoint!(stop.id, viaIndex)}
              title="Remove this via-point and restore the direct route"
              className="inline-flex items-center gap-1 px-1.5 py-[3px] rounded border border-line text-paper-muted font-mono text-[9.5px] tracking-[0.16em] uppercase hover:text-accent hover:border-accent transition-colors"
            >
              <span aria-hidden>⟿</span>
              Via {(stop.viaPoints || []).length > 1 ? viaIndex + 1 : ''}
              <span aria-hidden>×</span>
            </button>
          ))}
          {p.schedule?.arrival && (
            <span
              data-testid="stop-eta"
              title={`Arrives ${p.schedule.arrival}${p.schedule.departure ? ` · leaves ${p.schedule.departure}` : ''}`}
              className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-paper-dim"
            >
              @ <span className="text-paper font-medium">{p.schedule.arrival}</span>
              {p.schedule.departure ? <span>–{p.schedule.departure}</span> : null}
            </span>
          )}
          {index > 0 && p.onChangeRouteMode && (
            <select
              value={stop.routeMode || 'fastest'}
              onChange={(e) => p.onChangeRouteMode!(stop.id, e.target.value as StopRouteMode)}
              title="Routing strategy for the leg from the previous stop"
              className="bg-transparent border border-line rounded text-paper-dim font-mono text-[9.5px] tracking-[0.16em] uppercase px-1.5 py-[3px] pr-[18px] appearance-none cursor-pointer hover:border-paper-dim hover:text-paper focus:outline-none focus:border-accent"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'><path fill='%239b9080' d='M0 0l4 5 4-5z'/></svg>\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center',
              }}
            >
              {ROUTE_MODE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.glyph} {o.label}</option>
              ))}
            </select>
          )}

          {p.onChangeStayMinutes && p.schedule !== undefined && index > 0 && stop.type !== 'overnight' && (
            <select
              value={stop.stayMinutes || 0}
              onChange={(e) => p.onChangeStayMinutes!(stop.id, parseInt(e.target.value, 10) || 0)}
              title="How long you plan to spend here — shifts later arrival times"
              className="bg-transparent border border-line rounded text-paper-dim font-mono text-[9.5px] tracking-[0.16em] uppercase px-1.5 py-[3px] pr-[18px] appearance-none cursor-pointer hover:border-paper-dim hover:text-paper focus:outline-none focus:border-accent"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'><path fill='%239b9080' d='M0 0l4 5 4-5z'/></svg>\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center',
              }}
            >
              {STAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          {p.onChangeNights && stop.type === 'overnight' && (
            <select
              value={stop.nights || 1}
              onChange={(e) => p.onChangeNights!(stop.id, parseInt(e.target.value, 10) || 1)}
              title="Nights spent here — each night consumes a trip day"
              className="bg-transparent border border-line rounded text-paper-dim font-mono text-[9.5px] tracking-[0.16em] uppercase px-1.5 py-[3px] pr-[18px] appearance-none cursor-pointer hover:border-paper-dim hover:text-paper focus:outline-none focus:border-accent"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'><path fill='%239b9080' d='M0 0l4 5 4-5z'/></svg>\")",
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 6px center',
              }}
            >
              {NIGHTS_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} night{n === 1 ? '' : 's'}</option>
              ))}
            </select>
          )}

          <span
            className="px-2 py-[3px] rounded-full font-mono text-[9.5px] tracking-[0.16em] uppercase font-medium whitespace-nowrap"
            style={{ backgroundColor: color, color: '#0d0e11' /* ink: fixed, sits on the theme-independent DAY_COLORS */ }}
          >
            Day {stop.dayNumber || 1}
          </span>

          {p.onDemote && (
            <button
              type="button"
              onClick={() => p.onDemote!(stop)}
              disabled={p.demotingStopId === stop.id}
              title="Remove from route, keep as a pin"
              className="inline-flex items-center gap-1 px-1.5 py-[3px] rounded border border-line text-paper-muted font-mono text-[9.5px] tracking-[0.16em] uppercase hover:text-accent hover:border-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span aria-hidden>↓</span>
              {p.demotingStopId === stop.id ? '…' : 'Pin'}
            </button>
          )}

          <span className="inline-flex items-center gap-1 ml-1">
            <button
              type="button"
              aria-label="Merge with previous day"
              title={
                isFirst
                  ? 'First stop — locked to Day 1'
                  : (isForced ? 'Merge into the previous day (remove the day break)' : 'Already on the earliest natural day')
              }
              disabled={isFirst || !isForced}
              onClick={() => p.onSetForceDayStart(stop.id, false)}
              className="w-[26px] h-[26px] tap-target bg-transparent border border-line-strong rounded text-paper-muted font-mono text-[11px] cursor-pointer flex items-center justify-center transition-colors hover:text-accent hover:border-accent disabled:opacity-35 disabled:cursor-not-allowed"
            >
              −
            </button>
            <button
              type="button"
              aria-label="Start a new day at this stop"
              title={
                isFirst
                  ? 'First stop — locked to Day 1'
                  : (isForced ? 'Already starts a new day' : 'Start a new day at this stop')
              }
              disabled={isFirst || isForced}
              onClick={() => p.onSetForceDayStart(stop.id, true)}
              className="w-[26px] h-[26px] tap-target bg-transparent border border-line-strong rounded text-paper-muted font-mono text-[11px] cursor-pointer flex items-center justify-center transition-colors hover:text-accent hover:border-accent disabled:opacity-35 disabled:cursor-not-allowed"
            >
              +
            </button>
          </span>
        </div>

        {/* Highlights */}
        <div className="mt-2 flex flex-wrap gap-1.5 items-center">
          {highlights.map((text) => (
            <span key={text} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-[3px] bg-paper/[0.06] border border-line rounded-full text-[11px] text-paper max-w-[200px]">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap" title={text}>{text}</span>
              <button
                type="button"
                aria-label="Remove note"
                onClick={() => p.onRemoveHighlight(stop.id, text)}
                className="bg-transparent border-0 text-paper-muted text-[13px] w-5 h-5 tap-target rounded-full p-0 flex items-center justify-center cursor-pointer hover:bg-accent hover:text-canvas transition-colors"
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            placeholder={highlights.length ? 'add another…' : 'add a note…'}
            maxLength={60}
            value={chipDraft}
            onChange={(e) => setChipDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitHighlight();
              }
            }}
            className="flex-1 min-w-[90px] bg-transparent border-0 border-b border-dotted border-line-strong text-paper font-serif italic text-[12px] py-0.5 outline-none placeholder:text-paper-muted placeholder:italic transition-colors focus:border-accent focus:border-solid"
          />
        </div>
      </div>

      {p.onFavoriteAdd && p.onFavoriteRemove && (
        <div className="absolute top-1.5 right-8">
          <FavoriteToggle
            isFavorited={!!favoriteId}
            pending={addPending || removePending}
            onAdd={() => p.onFavoriteAdd!(stop)}
            onRemove={() => favoriteId && p.onFavoriteRemove!(favoriteId)}
          />
        </div>
      )}
      <button
        type="button"
        aria-label="Remove stop"
        onClick={() => p.onRemove(stop.id)}
        className="absolute top-1.5 right-1.5 w-[30px] h-[30px] tap-target bg-transparent border-0 text-paper-muted text-[16px] rounded flex items-center justify-center cursor-pointer hover:text-accent hover:bg-accent-soft"
      >
        ×
      </button>
    </div>
  );
}
