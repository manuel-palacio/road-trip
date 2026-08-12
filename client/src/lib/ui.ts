/** Shared control styles (issue #124). These class strings were retyped
 * in a dozen places and had drifted — four different paddings and three
 * different disabled treatments for what is visually one button. Import
 * from here instead of copying. */

export const ACCENT_BTN =
  'inline-flex items-center justify-center gap-2 bg-accent text-canvas border-0 rounded px-4 py-[9px] ' +
  'font-mono text-[10px] tracking-[0.18em] uppercase font-medium cursor-pointer ' +
  'transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-accent-lift ' +
  'active:translate-y-0 disabled:bg-surface-2 disabled:text-paper-muted disabled:cursor-not-allowed ' +
  'disabled:shadow-none disabled:transform-none';

export const SECONDARY_BTN =
  'inline-flex items-center justify-center gap-1.5 bg-transparent border border-line-strong text-paper-dim ' +
  'rounded px-3 py-[7px] font-mono text-[10px] tracking-[0.18em] uppercase cursor-pointer ' +
  'transition-colors hover:border-paper-dim hover:text-paper ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

/** Quiet bordered control used for icon-sized affordances. */
export const GHOST_BTN =
  'inline-flex items-center justify-center bg-transparent border border-line text-paper-dim rounded ' +
  'transition-colors hover:border-paper-dim hover:text-paper disabled:opacity-50 disabled:cursor-not-allowed';
