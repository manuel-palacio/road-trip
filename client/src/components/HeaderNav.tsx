import { useEffect, useRef, useState } from 'react';

/** Header navigation that collapses into a menu on phones (issue #120).
 * The same children render inline on md+ and stacked inside the menu
 * below it — the inline copy is display:none when collapsed, so screen
 * readers only ever see one set. */
export function HeaderNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <>
      <div className="hidden md:flex items-center gap-[18px]">{children}</div>

      <div className="md:hidden relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Menu"
          data-testid="header-menu-button"
          className="w-11 h-11 flex items-center justify-center rounded border border-line text-paper-dim hover:text-paper hover:border-paper-dim transition-colors"
        >
          <span aria-hidden className="text-[16px] leading-none">{open ? '×' : '☰'}</span>
        </button>
        {open && (
          <div
            data-testid="header-menu-panel"
            className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[180px] flex flex-col items-stretch gap-2 p-3 rounded-lg border border-line-strong bg-canvas-strong shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)]"
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        )}
      </div>
    </>
  );
}
