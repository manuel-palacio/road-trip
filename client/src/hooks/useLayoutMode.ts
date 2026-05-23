import { useEffect, useState } from 'react';

export type LayoutMode = 'plan' | 'map';

const STORAGE_KEY = 'roadtrip:builderLayout';

function readStored(): LayoutMode | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'plan' || v === 'map' ? v : null;
}

/** Reactive builder layout-mode state. Persisted in localStorage so the
 * user's choice survives reloads. When no stored value exists yet, the
 * caller can pass a one-time default (typically derived from the trip's
 * day count: short trips look better in Map mode, longer ones in Plan).
 *
 * The default is applied ONCE per mount — once the user touches the
 * toggle, their choice sticks regardless of trip size. */
export function useLayoutMode(initialDefault: LayoutMode = 'map'): {
  mode: LayoutMode;
  setMode: (next: LayoutMode) => void;
  toggle: () => void;
} {
  const [mode, setModeState] = useState<LayoutMode>(() => readStored() ?? initialDefault);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore quota */ }
  }, [mode]);

  function setMode(next: LayoutMode) { setModeState(next); }
  function toggle() { setModeState((m) => (m === 'plan' ? 'map' : 'plan')); }

  return { mode, setMode, toggle };
}
