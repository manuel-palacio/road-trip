# Favorites — design

**Status:** Draft (auto-designed; user requested no questions)
**Date:** 2026-06-20
**Issue:** https://github.com/manuel-palacio/road-trip/issues/80

## Problem

Today every trip's stops live in isolation. A hotel found while planning Trip A has to be re-searched for Trip B. Users want a per-user list of favorited places, reachable from a dedicated view, so good finds become reusable.

## Goals

- Star toggle on every stop card (Builder + Viewer). Click → adds; click again → removes.
- Per-user `/favorites` view listing all favorites with name, locality, country flag, category, source trip link, remove button, and empty state.
- Header nav link "Favorites" alongside "Templates".
- Server-mediated: same auth + allowlist gates as the rest of the API.

## Non-goals

- Sharing favorites between users.
- "Add to trip" action from the favorites view (next iteration).
- Pin-style favorites (only routed stops for v1; pins can come later).
- Real-time sync between two open Builder tabs.

## Design decisions (made without questions, per user instruction)

| Decision | Choice | Rationale |
|---|---|---|
| Storage | Top-level `favorites/{favoriteId}` collection with `ownerUid` field | Scales independently of trips, owner-queryable, mirrors the `trips/` model. |
| Dedup | `placeId` when present, else `name|lat.toFixed(4)|lng.toFixed(4)` signature | Real Google places dedup cleanly; manually-added stops fall back to coord+name. |
| Toggle UX | A small star (☆/★) glyph on each stop card; optimistic update | Familiar; no modal. |
| List view | Card grid like Dashboard, sorted by `createdAt` desc | Reuses Dashboard's visual language. |
| Header nav | "Favorites" link added to AppAuthed's nav alongside Templates | Discoverable. |
| Membership lookup | `useFavorites()` fetches once, stores Set of dedup keys, exposes `isFavorite(stop)` | One round-trip per session. |

## Data model

### New: `favorites/{favoriteId}`

```ts
type Favorite = {
  id: string;                 // Firestore doc id
  ownerUid: string;
  placeId?: string;           // Google place_id when known
  name: string;
  label: string;
  lat: number;
  lng: number;
  countryCode?: string;
  category?: PinCategory;     // 'food' | 'hotel' | 'scenic' | 'fuel' | 'landmark' | 'other'
  sourceTripId?: string;      // first trip where this was favorited
  sourceTripName?: string;    // snapshot for display (no live join)
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
```

`sourceTripName` is a denormalized snapshot — if the user renames the trip later, the favorite still shows the old name. That's fine; the favorite is a record of "I liked this place during the trip called X".

## API

`routes/favorites.js` (new):

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/favorites` | — | `{ favorites: Favorite[] }` |
| POST | `/api/favorites` | `{ placeId?, name, label, lat, lng, countryCode?, category?, sourceTripId?, sourceTripName? }` | `201 { id, ...favorite }` — or `200 { id, ...existing }` if dedup hit |
| DELETE | `/api/favorites/:id` | — | `{ ok: true }` |

All gated by `authRequired`. POST writes use a dedup transaction: check `favorites where ownerUid == req.uid and (placeId == X or sigKey == Y)` → return existing if found, else create.

Validation:
- `name` non-empty string (≤ 80 chars trimmed)
- `lat`/`lng` finite numbers
- `category` if present must be in `PIN_CATEGORIES`
- `placeId`/`sourceTripId`/`sourceTripName`/`countryCode` strings or absent

## Files

| File | Action |
|---|---|
| `routes/favorites.js` | Create |
| `server.js` | Mount the new router |
| `firestore.rules` | Add `favorites/{id}` rule: owner-only read/write |
| `client/src/lib/types.ts` | Add `Favorite` type |
| `client/src/lib/favorite-key.ts` | Create — dedup key generator (placeId or sig hash) |
| `client/src/lib/api.ts` | Add `listFavorites`, `createFavorite`, `deleteFavorite` |
| `client/src/hooks/useFavorites.ts` | Create — TanStack Query hook |
| `client/src/screens/Favorites.tsx` | Create — list view |
| `client/src/components/FavoriteToggle.tsx` | Create — star button |
| `client/src/components/builder/StopRow.tsx` | Embed `FavoriteToggle` |
| `client/src/components/viewer/DayCard.tsx` | Embed `FavoriteToggle` for each stop |
| `client/src/App.tsx` | Add `/favorites` route (inside AppAuthed) |
| `client/src/components/Brand.tsx` or header nav | Add "Favorites" link |

## Tests

**Server (Vitest, integration shape — same as existing routes):**
- POST creates a favorite; second POST with same placeId returns the same id (dedup).
- POST without placeId dedups by lat+lng+name signature.
- DELETE removes own favorite, returns 404 for someone else's.
- GET returns only the requester's favorites.

**Client unit (Vitest):**
- `favorite-key.ts`: stable signature for same inputs; different sig for different inputs.
- `FavoriteToggle.tsx`: renders empty star when not favorited, filled when favorited, calls add/remove on click.
- `useFavorites.ts`: `isFavorite(stop)` returns true after add, false after remove.

**E2E (Playwright spec, runs when @playwright/test installed):**
- Star a stop → reload Builder → star stays filled.
- Visit `/favorites` → see the favorite listed → click remove → it disappears.
- Empty state shown when no favorites.

## Open questions

None — design locked by author per user instruction.
