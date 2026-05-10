import { useState } from 'react';
import { signInWithGoogle } from '../lib/firebase';
import { Brand } from '../components/Brand';
import { RouteMark } from '../components/RouteMark';

const GoogleG = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
  </svg>
);

export function Login() {
  const [error, setError] = useState<string | null>(null);

  async function onSignIn() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return;
      setError(err?.message || 'Sign-in failed');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-8">
      <div className="max-w-[460px] w-full text-center">
        <h1 className="animate-rise [animation-delay:0.05s]">
          <Brand size="xl" />
        </h1>
        <p className="mt-[18px] text-[15px] text-paper-dim animate-rise [animation-delay:0.18s]">
          Build your road trip. Share the adventure.
        </p>
        <div className="mt-9 mb-8 mx-auto animate-rise [animation-delay:0.32s]">
          <RouteMark />
        </div>
        <button
          type="button"
          onClick={onSignIn}
          className="inline-flex items-center gap-3.5 px-[22px] py-[13px] bg-paper text-[#1a1a1a] rounded-md text-[14px] font-medium tracking-[0.005em] transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-[0_10px_30px_-8px_rgba(231,111,81,0.35)] active:translate-y-0 animate-rise [animation-delay:0.46s]"
        >
          <GoogleG />
          Continue with Google
        </button>
        {error && (
          <div className="mt-6 font-mono text-[11px] tracking-wide text-accent">{error}</div>
        )}
        <p className="mt-7 font-mono text-[10px] tracking-[0.22em] uppercase text-paper-muted animate-rise [animation-delay:0.6s]">
          Private beta <span className="text-accent mx-1">·</span> invite-only
        </p>
      </div>
    </div>
  );
}
