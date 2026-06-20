import { useState } from 'react';
import { signInWithGoogle, signInAsDev } from '../lib/firebase';
import { Brand } from '../components/Brand';

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
  </svg>
);

const FEATURES = [
  {
    glyph: '📍',
    label: 'Pins for places that matter',
    body: 'Drop food, hotel, scenic, fuel, and landmark pins anywhere on the map. Annotate, edit, navigate.',
  },
  {
    glyph: '🗓',
    label: 'Days that sort themselves',
    body: 'Set a daily kilometre budget — your stops split into days on their own. No spreadsheets.',
  },
  {
    glyph: '🚗',
    label: 'Android Auto, considered',
    body: 'We track the ten-stop-per-day limit so the dashboard never drops half your route on the way.',
  },
  {
    glyph: '⛽',
    label: 'Fuel stops, handled',
    body: "Tank running low? Fuel stops insert themselves before you run dry. Undo any addition. Each day card shows what's left in the tank.",
  },
  {
    glyph: '★',
    label: 'Favorites across trips',
    body: 'Star any stop in the builder or viewer. Find everything starred — across all your trips — at /favorites.',
  },
  {
    glyph: '✦',
    label: 'Highlights, not itineraries',
    body: 'A few words per stop. The vibe and the must-sees, not a minute-by-minute timetable.',
  },
  {
    glyph: '↹',
    label: 'Drag to reorder',
    body: 'Move stops around with one hand. Distance, duration, and day numbers recompute live.',
  },
  {
    glyph: '↗',
    label: 'One tap to Google Maps',
    body: 'Open any single day directly in Google Maps. Hand-off to the car just works.',
  },
];

export function Login() {
  const [error, setError] = useState<string | null>(null);

  async function onSignIn() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setError((err as { message?: string })?.message || 'Sign-in failed');
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-8 py-16">
      {/* Hero */}
      <div className="max-w-[480px] w-full text-center pt-12">
        <h1 className="animate-rise [animation-delay:0.05s]">
          <Brand size="xl" />
        </h1>
        <p className="mt-5 font-serif italic text-[19px] leading-[1.4] text-paper-dim animate-rise [animation-delay:0.18s]">
          Plot the route. Pin the moments.<br />
          Share the adventure.
        </p>

        <div className="my-9 flex items-center justify-center gap-3 animate-rise [animation-delay:0.32s]" aria-hidden>
          <span className="block h-px w-20 bg-gradient-to-r from-transparent to-paper-muted/40" />
          <span className="relative w-2 h-2">
            <span className="absolute inset-0 rounded-full bg-accent" />
            <span className="absolute -inset-1.5 rounded-full border border-accent/40" />
          </span>
          <span className="block h-px w-20 bg-gradient-to-l from-transparent to-paper-muted/40" />
        </div>

        <button
          type="button"
          onClick={onSignIn}
          className="inline-flex items-center gap-3.5 px-[22px] py-[13px] bg-paper text-canvas rounded-md text-[14px] font-medium tracking-[0.005em] transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-[0_10px_30px_-8px_rgba(231,111,81,0.35)] active:translate-y-0 animate-rise [animation-delay:0.46s]"
        >
          <GoogleG />
          Continue with Google
        </button>
        {import.meta.env.DEV && (
          <div className="mt-4 animate-rise [animation-delay:0.52s]">
            <button
              type="button"
              onClick={async () => {
                setError(null);
                try {
                  await signInAsDev();
                } catch (err: unknown) {
                  setError((err as { message?: string })?.message || 'Dev sign-in failed');
                }
              }}
              title="Localhost-only impersonation. Requires DEV_IMPERSONATE_UID in server .env."
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-transparent border border-dashed border-line-strong text-paper-dim rounded-md font-mono text-[10px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim transition-colors"
            >
              <span aria-hidden>🔧</span>
              Dev sign-in (localhost)
            </button>
          </div>
        )}
        {error && (
          <div className="mt-6 font-mono text-[11px] tracking-wide text-accent">{error}</div>
        )}
        <p className="mt-7 font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted animate-rise [animation-delay:0.6s]">
          Private beta <span className="text-accent mx-1">·</span> invite-only
        </p>
      </div>

      {/* Features */}
      <section className="mt-24 w-full max-w-[1040px] animate-rise [animation-delay:0.78s]">
        <div className="text-center mb-12">
          <span className="font-mono text-[10px] tracking-[0.28em] uppercase text-paper-muted">
            What's in the box
          </span>
          <h2 className="mt-3 font-serif italic font-normal text-[clamp(28px,4vw,40px)] tracking-tight leading-[1.1] text-paper">
            A road-trip planner that thinks in days.
          </h2>
        </div>

        <ul className="grid gap-x-10 gap-y-12 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.label} className="flex flex-col items-start text-left">
              <span
                className="w-10 h-10 rounded-full bg-canvas border border-line-strong flex items-center justify-center text-[18px] mb-4 shadow-[inset_0_1px_0_rgba(243,236,222,0.04)]"
                aria-hidden
              >
                {f.glyph}
              </span>
              <h3 className="font-serif italic text-[18px] leading-[1.25] text-paper">
                {f.label}
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.55] text-paper-dim">
                {f.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Footer atmosphere */}
      <div className="mt-20 pb-2 flex items-center gap-3 font-mono text-[9.5px] tracking-[0.3em] uppercase text-paper-muted/70">
        <span className="block h-px w-12 bg-paper-muted/30" />
        <span>Built for long roads</span>
        <span className="block h-px w-12 bg-paper-muted/30" />
      </div>
    </div>
  );
}
