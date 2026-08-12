import { useCallback, useEffect, useRef, useState } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Modal focus management (issue #123): moves focus into the dialog on
 * open, keeps Tab inside it, closes on Escape, and returns focus to the
 * element that opened it. Attach the returned callback ref to the dialog
 * element.
 *
 * It's a callback ref rather than an object ref so the trap also works
 * for modals rendered conditionally by a parent that stays mounted (the
 * Builder's trip-details modal) — the effect keys off the element
 * appearing, not off the hook's own mount.
 *
 * `onClose` is held in a ref so callers don't need to memoise it. */
export function useFocusTrap<T extends HTMLElement>(onClose?: () => void) {
  const [container, setContainer] = useState<T | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!container) return;
    const el: T = container;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Prefer the first real control; fall back to the container itself so
    // focus never stays behind the dialog.
    const first = focusables()[0];
    if (first) first.focus();
    else {
      el.setAttribute('tabindex', '-1');
      el.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstItem || !el.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [container]);

  return useCallback((node: T | null) => setContainer(node), []);
}
