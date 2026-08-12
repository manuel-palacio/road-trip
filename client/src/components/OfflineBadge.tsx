import { useOnlineStatus } from '../hooks/useOnlineStatus';

/** Small fixed badge in the top-right of the viewport when the browser
 * is offline. Returns null while online so it stays out of the way. */
export function OfflineBadge() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-3 right-3 z-50 inline-flex items-center gap-1.5 bg-danger-soft border border-danger/50 text-danger px-2.5 py-1 rounded-full font-mono text-[9.5px] tracking-[0.18em] uppercase backdrop-blur"
    >
      <span aria-hidden className="block w-1.5 h-1.5 rounded-full bg-danger" />
      Offline
    </div>
  );
}
