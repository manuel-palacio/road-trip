import { useInstallPrompt } from '../hooks/useInstallPrompt';

/** Button that fires the browser's PWA install dialog when supported.
 * Renders nothing when the browser hasn't surfaced a `beforeinstallprompt`
 * event yet (already installed, Safari, etc.). */
export function InstallAppButton({ className }: { className?: string } = {}) {
  const { available, promote } = useInstallPrompt();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => { void promote(); }}
      aria-label="Install Road Trip app"
      title="Install as an app on this device"
      className={
        className ||
        'inline-flex items-center gap-1.5 bg-transparent border border-line text-paper-dim px-2.5 py-[7px] rounded font-mono text-[9.5px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim transition-colors'
      }
    >
      <span aria-hidden>⤓</span>
      Install app
    </button>
  );
}
