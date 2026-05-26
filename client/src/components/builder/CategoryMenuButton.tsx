import { useEffect, useRef, useState } from 'react';
import { PIN_CATEGORY_META } from '../../lib/pin-meta';
import type { PinCategory } from '../../lib/types';

/** v1 menu shows only the categories with a useful Google Place type
 * AND a clear UX outcome. Landmark overlaps scenic in Google's taxonomy
 * (both back to tourist_attraction); "other" has no type filter. */
export const V1_CATEGORIES: PinCategory[] = ['fuel', 'food', 'hotel', 'scenic'];

type Props = {
  /** Categories rendered in a disabled state — clicking them is a no-op.
   * Fuel uses this when there's no within-day leg to target. Others have
   * no current disable rule (they anchor to the day's first stop). */
  disabledCategories?: PinCategory[];
  onPick: (category: PinCategory) => void;
};

/** Small `+ Find ▾` trigger that opens a menu of POI categories. Picking
 * one fires `onPick` and closes the menu. Keyboard accessible: Enter
 * opens, ArrowUp/Down navigates items, Enter selects, Escape closes.
 *
 * Replaces the per-day `+ Fuel` button (issue #72). The fuel category
 * preserves its existing semantics; food / hotel / scenic are new. */
export function CategoryMenuButton({ disabledCategories = [], onPick }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // When the menu opens, move focus to the first enabled item so
  // keyboard users can immediately navigate.
  useEffect(() => {
    if (!open) return;
    const firstEnabled = V1_CATEGORIES.findIndex((c) => !disabledCategories.includes(c));
    if (firstEnabled >= 0) itemsRef.current[firstEnabled]?.focus();
  }, [open, disabledCategories]);

  function handleItemKey(e: React.KeyboardEvent, i: number) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    // Skip past disabled items so arrow keys don't get stuck on them.
    for (let step = 1; step <= V1_CATEGORIES.length; step++) {
      const next = (i + delta * step + V1_CATEGORIES.length) % V1_CATEGORIES.length;
      if (!disabledCategories.includes(V1_CATEGORIES[next])) {
        itemsRef.current[next]?.focus();
        return;
      }
    }
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="category-menu-trigger"
        title="Find nearby places to add"
        className="inline-flex items-center gap-1 bg-transparent border border-line text-paper-dim px-1.5 py-[2px] rounded font-mono text-[9px] tracking-[0.12em] uppercase hover:text-paper hover:border-paper-dim transition-colors"
      >
        <span aria-hidden>+</span>
        <span>Find</span>
        <span aria-hidden className="text-[8px] leading-none">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Find nearby places to add"
          data-testid="category-menu-popover"
          className="absolute right-0 top-full mt-1 z-[200] bg-surface border border-line-strong rounded-md shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)] min-w-[140px] flex flex-col py-1"
        >
          {V1_CATEGORIES.map((cat, i) => {
            const meta = PIN_CATEGORY_META[cat];
            const disabled = disabledCategories.includes(cat);
            return (
              <button
                key={cat}
                ref={(el) => { itemsRef.current[i] = el; }}
                role="menuitem"
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onPick(cat);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                onKeyDown={(e) => handleItemKey(e, i)}
                data-testid="category-menu-item"
                data-category={cat}
                className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-paper hover:bg-canvas hover:text-paper transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <span aria-hidden className="text-[14px] leading-none">{meta.emoji}</span>
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
