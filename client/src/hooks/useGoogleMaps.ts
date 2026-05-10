import { useEffect, useState } from 'react';
import { loadMapsSdk } from '../lib/google-maps';

export function useGoogleMaps(apiKey: string | null) {
  const [maps, setMaps] = useState<typeof google.maps | null>(
    typeof window !== 'undefined' && window.google?.maps ? window.google.maps : null,
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!apiKey || maps) return;
    let alive = true;
    loadMapsSdk(apiKey)
      .then((m) => { if (alive) setMaps(m); })
      .catch((e) => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [apiKey, maps]);

  return { maps, error };
}
