type LikeFavorite = {
  placeId?: string;
  name: string;
  lat: number;
  lng: number;
};

/** Deterministic dedup key for a favorite candidate. Mirrors the server's
 * sigKey() in routes/favorites.js — same inputs must produce the same key
 * on both sides. */
export function favoriteKey(f: LikeFavorite): string {
  if (f.placeId) return `pid:${f.placeId}`;
  return `coord:${f.name}|${f.lat.toFixed(4)}|${f.lng.toFixed(4)}`;
}
