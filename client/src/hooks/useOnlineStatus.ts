import { useEffect, useState } from 'react';

/** Tracks `navigator.onLine` and updates on the browser's online/offline
 * events. SSR-safe: defaults to `true` when navigator is not defined. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });
  useEffect(() => {
    function up() { setOnline(true); }
    function down() { setOnline(false); }
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
