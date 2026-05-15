import { useEffect, useState } from 'react';

export type ThemePreference = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'roadtrip:theme';

function readStored(): ThemePreference {
  if (typeof localStorage === 'undefined') return 'auto';
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'auto') return v;
  return 'auto';
}

function osPrefersLight(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return osPrefersLight() ? 'light' : 'dark';
}

function applyToDom(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (resolved === 'light') html.classList.add('theme-light');
  else html.classList.remove('theme-light');
}

/** Reactive theme state. Reads `roadtrip:theme` from localStorage with
 * `auto` as the default. When `auto`, follows the OS preference and
 * updates if the OS changes. Setter persists the new pref and applies
 * the corresponding class to <html>. */
export function useTheme(): {
  pref: ThemePreference;
  resolved: ResolvedTheme;
  setPref: (next: ThemePreference) => void;
  cycle: () => void;
} {
  const [pref, setPrefState] = useState<ThemePreference>(() => readStored());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readStored()));

  useEffect(() => {
    const r = resolve(pref);
    setResolved(r);
    applyToDom(r);
    if (pref !== 'auto') return;
    // Only listen for OS changes while in auto mode.
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    function onChange() {
      const next = resolve('auto');
      setResolved(next);
      applyToDom(next);
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  function setPref(next: ThemePreference) {
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore quota */ }
    setPrefState(next);
  }

  function cycle() {
    setPref(pref === 'auto' ? 'light' : pref === 'light' ? 'dark' : 'auto');
  }

  return { pref, resolved, setPref, cycle };
}
