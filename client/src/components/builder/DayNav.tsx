import { dayColor } from '../../lib/compute';
import type { DayGroup } from '../../lib/compute';

type Props = {
  groups: DayGroup[];
  /** Day currently scrolled into view in the columns track. Used to
   * highlight the active chip. Pass undefined when no day is "active"
   * (e.g. an unmounted columns track). */
  activeDay?: number;
  onJump: (day: number) => void;
};

/** Sticky chip-strip of all days, used as a breadcrumb / table-of-contents
 * for the horizontally-scrolling day columns. Click a chip to scroll its
 * column into view. The chip border picks up `dayColor` so the chip and
 * the matching map polyline carry the same tint. */
export function DayNav({ groups, activeDay, onJump }: Props) {
  if (groups.length === 0) return null;
  return (
    <nav
      aria-label="Jump to day"
      className="flex items-center gap-2 overflow-x-auto px-6 py-2 bg-surface border-b border-line scrollbar-thin"
    >
      <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-paper-muted whitespace-nowrap mr-1">
        Days
      </span>
      {groups.map((g) => {
        const color = dayColor(g.day);
        const active = activeDay === g.day;
        return (
          <button
            key={g.day}
            type="button"
            onClick={() => onJump(g.day)}
            data-testid="day-nav-chip"
            data-day={g.day}
            className={`relative inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] tracking-[0.16em] uppercase whitespace-nowrap transition-all ${
              active
                ? 'bg-canvas text-paper border'
                : 'bg-transparent text-paper-dim border border-transparent hover:text-paper hover:bg-canvas'
            }`}
            style={active ? { borderColor: color } : undefined}
          >
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span>Day {g.day}</span>
            <span className="text-paper-muted tracking-normal normal-case font-sans text-[10.5px]">
              · {g.km} km
            </span>
          </button>
        );
      })}
    </nav>
  );
}
