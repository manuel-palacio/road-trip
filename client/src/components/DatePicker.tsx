import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

type Props = {
  /** YYYY-MM-DD or '' when unset. The component is intentionally string-
   * shaped (not Date) so it round-trips with the trip's startDate field
   * without timezone surprises. */
  value: string;
  onChange: (next: string) => void;
  /** Optional placeholder text shown in the trigger when value is empty. */
  placeholder?: string;
  /** Accessible label for screen readers; the trigger doesn't carry
   * visible text other than the formatted date. */
  label?: string;
};

/** Parse a 'YYYY-MM-DD' string into a local-date midnight. Returns null
 * for empty/invalid input. Uses local-date parts (not new Date(str))
 * because Date constructor parsing of ISO date-only strings can shift
 * by a day in non-UTC timezones. */
function parseLocalDate(value: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Format a local Date back to the 'YYYY-MM-DD' string the rest of the
 * app uses. Symmetric counterpart to parseLocalDate; also avoids ISO
 * timezone shifts. */
function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Styled date picker matching the editorial paper-canvas theme.
 * Built on react-day-picker for accessibility + keyboard support;
 * a small click-outside listener closes the popover. */
export function DatePicker(p: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const selected = parseLocalDate(p.value);
  const displayText = selected
    ? selected.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : (p.placeholder || 'Pick a date');

  // Position the portal'd popover under the trigger. Recomputed each
  // time the popover opens; the popover stays in viewport coordinates
  // (position: fixed) so it doesn't get clipped by ancestor scroll
  // containers (e.g. the trip-details modal's overflow-y-auto body).
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPopoverPos({ top: r.bottom + 4, left: r.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const popover = open && popoverPos ? (
    <div
      ref={popoverRef}
      data-testid="date-picker-popover"
      style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left }}
      className="z-[500] bg-surface border border-line-strong rounded-lg shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)] p-2"
    >
      <DayPicker
        mode="single"
        selected={selected ?? undefined}
        // Open to the selected date's month, not today, so the user
        // sees their previous pick without paging through months.
        defaultMonth={selected ?? new Date()}
        onSelect={(date) => {
          if (date) {
            p.onChange(formatLocalDate(date));
            setOpen(false);
          } else {
            p.onChange('');
          }
        }}
        weekStartsOn={1}
        showOutsideDays
        classNames={{
          today: 'rdp-today text-accent font-semibold',
          selected: 'rdp-selected bg-accent text-canvas rounded',
          chevron: 'fill-paper',
          caption_label: 'font-serif italic text-paper text-[14px]',
          weekday: 'font-mono text-[9.5px] tracking-[0.12em] uppercase text-paper-muted',
        }}
      />
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={p.label || 'Pick a date'}
        aria-expanded={open}
        data-testid="date-picker-trigger"
        className="w-full text-left bg-transparent border-0 border-b border-line text-paper text-[14px] py-1 outline-none transition-colors focus:border-accent hover:border-paper-dim cursor-pointer"
      >
        {selected ? (
          <span className="font-serif italic">{displayText}</span>
        ) : (
          <span className="text-paper-muted">{displayText}</span>
        )}
      </button>
      {popover && createPortal(popover, document.body)}
    </>
  );
}
