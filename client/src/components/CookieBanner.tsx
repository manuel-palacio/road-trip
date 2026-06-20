import { useEffect, useState } from 'react';

const STORAGE_KEY = 'cookie-banner-dismissed-v1';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch { /* SSR or quota — silently skip */ }
  }, []);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setVisible(false);
  }

  if (!visible) return null;
  return (
    <div className="fixed bottom-3 left-3 right-3 z-50 max-w-2xl mx-auto bg-canvas-strong border border-line rounded-lg px-4 py-3 flex items-start gap-3 shadow-lg">
      <span aria-hidden className="text-paper text-[18px]">🍪</span>
      <p className="flex-1 text-paper-dim text-[12.5px] leading-relaxed">
        We use a session cookie for sign-in and local storage for theme + layout preferences. No third-party tracking.
        See our <a href="/privacy" className="underline hover:text-accent">Privacy Policy</a>.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-paper-muted hover:text-accent px-2 py-1 border border-line rounded"
      >
        Got it
      </button>
    </div>
  );
}
