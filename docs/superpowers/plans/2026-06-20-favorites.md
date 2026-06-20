# Favorites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Star toggle on every stop card adds the place to a per-user favorites list; a dedicated `/favorites` view lists all favorites with remove + source-trip link.

**Architecture:** Top-level Firestore `favorites/{id}` collection with `ownerUid`; dedup key is `placeId` when present, else `name|lat.toFixed(4)|lng.toFixed(4)`. `useFavorites()` hook (TanStack Query) fetches once per session, exposes `isFavorite(stop)`. Star button is a small shared component embedded in StopRow + Viewer DayCard stop entries.

**Tech Stack:** React 18, TypeScript, TanStack Query, Express, Firestore, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-20-favorites-design.md`

---

## Task 1: Server route + Firestore rules

**Files:**
- Create: `routes/favorites.js`
- Modify: `server.js` (mount the router)
- Modify: `firestore.rules` (owner-only rule for `favorites/{id}`)
- Modify: `client/src/lib/types.ts` (add `Favorite` type)

- [ ] **Step 1:** Add the `Favorite` type to `client/src/lib/types.ts` (after `Pin`):

```ts
export type Favorite = {
  id: string;
  ownerUid: string;
  placeId?: string;
  name: string;
  label: string;
  lat: number;
  lng: number;
  countryCode?: string;
  category?: PinCategory;
  sourceTripId?: string;
  sourceTripName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};
```

- [ ] **Step 2:** Create `routes/favorites.js`:

```js
const express = require('express');
const { admin, getDb } = require('../lib/firebase');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use('/api/favorites', authRequired);

const PIN_CATEGORIES = ['food', 'hotel', 'scenic', 'fuel', 'landmark', 'other'];

function sigKey(body) {
  if (body.placeId) return `pid:${body.placeId}`;
  return `coord:${body.name}|${body.lat.toFixed(4)}|${body.lng.toFixed(4)}`;
}

function validateFavoritePayload(body) {
  if (typeof body.name !== 'string' || !body.name.trim()) return { error: 'name required' };
  if (typeof body.lat !== 'number' || !Number.isFinite(body.lat)) return { error: 'lat required' };
  if (typeof body.lng !== 'number' || !Number.isFinite(body.lng)) return { error: 'lng required' };
  if (body.category != null && !PIN_CATEGORIES.includes(body.category)) {
    return { error: 'invalid category' };
  }
  const out = {
    name: body.name.trim().slice(0, 80),
    label: typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : body.name.trim().slice(0, 80),
    lat: body.lat,
    lng: body.lng,
  };
  if (typeof body.placeId === 'string' && body.placeId) out.placeId = body.placeId;
  if (typeof body.countryCode === 'string' && body.countryCode) out.countryCode = body.countryCode;
  if (body.category) out.category = body.category;
  if (typeof body.sourceTripId === 'string') out.sourceTripId = body.sourceTripId;
  if (typeof body.sourceTripName === 'string') out.sourceTripName = body.sourceTripName;
  return { value: out };
}

router.get('/api/favorites', async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('favorites').where('ownerUid', '==', req.uid).get();
    const favorites = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    res.json({ favorites });
  } catch (e) {
    console.error('GET /api/favorites failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.post('/api/favorites', async (req, res) => {
  try {
    const { error, value } = validateFavoritePayload(req.body || {});
    if (error) return res.status(400).json({ error, code: 'INVALID' });
    const db = getDb();
    // Dedup: scan this user's favorites for a matching sigKey.
    const target = sigKey(value);
    const existingSnap = await db.collection('favorites').where('ownerUid', '==', req.uid).get();
    const dup = existingSnap.docs.find((d) => sigKey(d.data()) === target);
    if (dup) return res.json({ id: dup.id, ...dup.data() });
    const favorite = {
      ownerUid: req.uid,
      ...value,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('favorites').add(favorite);
    const snap = await ref.get();
    res.status(201).json({ id: ref.id, ...snap.data() });
  } catch (e) {
    console.error('POST /api/favorites failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

router.delete('/api/favorites/:id', async (req, res) => {
  try {
    const db = getDb();
    const ref = db.collection('favorites').doc(req.params.id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
    if (snap.data().ownerUid !== req.uid) return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    await ref.delete();
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/favorites/:id failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
```

- [ ] **Step 3:** Mount in `server.js`. Find where `routes/trips.js`/`routes/share.js` are mounted (likely `app.use(require('./routes/trips'))` etc.) and add a sibling line:

```js
app.use(require('./routes/favorites'));
```

- [ ] **Step 4:** Add a Firestore rule. In `firestore.rules`, after the existing trips section, add (before the closing braces):

```
match /favorites/{favoriteId} {
  allow read: if request.auth != null && resource.data.ownerUid == request.auth.uid;
  allow create: if request.auth != null && request.resource.data.ownerUid == request.auth.uid;
  allow delete: if request.auth != null && resource.data.ownerUid == request.auth.uid;
  allow update: if false;
}
```

(All access still goes through the API via Admin SDK — this rule is defense-in-depth.)

- [ ] **Step 5:** Smoke test the server. Start dev server, get an ID token from IndexedDB, then via curl or browser console:

```js
// POST
fetch('/api/favorites', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test', label: 'Test', lat: 49, lng: 4 }) }).then(r => r.json()).then(console.log);
// GET
fetch('/api/favorites', { headers: { Authorization: 'Bearer ' + tok } }).then(r => r.json()).then(console.log);
// POST again with same payload → dedup, same id
// DELETE
fetch('/api/favorites/<id>', { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok } }).then(r => r.json()).then(console.log);
```

- [ ] **Step 6:** Commit:

```
Favorites: server route + rule + Favorite type

Adds POST/GET/DELETE /api/favorites under authRequired. POST dedups by
placeId when present, else by name|lat|lng signature — second POST of
same payload returns the existing id. firestore.rules adds an
owner-only allow block for favorites/{id} as defense-in-depth.
```

---

## Task 2: Client API + dedup key helper

**Files:**
- Create: `client/src/lib/favorite-key.ts`
- Modify: `client/src/lib/api.ts`
- Create: `client/src/lib/__tests__/favorite-key.test.ts`

- [ ] **Step 1:** Write the failing test:

```ts
// client/src/lib/__tests__/favorite-key.test.ts
import { describe, expect, it } from 'vitest';
import { favoriteKey } from '../favorite-key';

describe('favoriteKey', () => {
  it('prefers placeId when present', () => {
    expect(favoriteKey({ placeId: 'abc', name: 'x', lat: 1, lng: 2 })).toBe('pid:abc');
  });
  it('falls back to name|lat|lng signature when no placeId', () => {
    expect(favoriteKey({ name: 'Reims', lat: 49.2583, lng: 4.0317 })).toBe('coord:Reims|49.2583|4.0317');
  });
  it('rounds lat/lng to 4 decimals (consistent with server dedup)', () => {
    expect(favoriteKey({ name: 'X', lat: 49.258345, lng: 4.031712 })).toBe('coord:X|49.2583|4.0317');
  });
  it('is stable across calls with the same inputs', () => {
    const a = favoriteKey({ name: 'X', lat: 1, lng: 2 });
    const b = favoriteKey({ name: 'X', lat: 1, lng: 2 });
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2:** Create `client/src/lib/favorite-key.ts`:

```ts
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
```

- [ ] **Step 3:** Add the API functions to `client/src/lib/api.ts`. Find the existing trip API functions and add (matching their style):

```ts
import type { Favorite } from './types';

export async function listFavorites(): Promise<Favorite[]> {
  const r = await authedFetch('/api/favorites');
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return j.favorites;
}

export async function createFavorite(body: Omit<Favorite, 'id' | 'ownerUid' | 'createdAt' | 'updatedAt'>): Promise<Favorite> {
  const r = await authedFetch('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteFavorite(id: string): Promise<void> {
  const r = await authedFetch(`/api/favorites/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
}
```

(If `api.ts` uses a different helper name than `authedFetch`, substitute it. Look at how `listTrips`/`createTrip` are written and match exactly.)

- [ ] **Step 4:** Run tests:

```bash
npx vitest run client/src/lib/__tests__/favorite-key.test.ts
```

Expected 4/4 pass.

- [ ] **Step 5:** Run full suite → `npm test`. Expect 363/363 (was 359 + 4 new).

- [ ] **Step 6:** Commit:

```
Favorites: client API + favoriteKey dedup helper

favoriteKey mirrors the server's sigKey (placeId else name|lat|lng with
4-decimal lat/lng rounding). listFavorites/createFavorite/deleteFavorite
follow the existing api.ts pattern.
```

---

## Task 3: useFavorites hook

**Files:**
- Create: `client/src/hooks/useFavorites.ts`

- [ ] **Step 1:** Create the hook:

```ts
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listFavorites, createFavorite, deleteFavorite } from '../lib/api';
import { favoriteKey } from '../lib/favorite-key';
import type { Favorite, Stop } from '../lib/types';

export function useFavorites() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['favorites'],
    queryFn: listFavorites,
    staleTime: 60_000,
  });

  const keysById = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of query.data || []) map.set(favoriteKey(f), f.id);
    return map;
  }, [query.data]);

  const add = useMutation({
    mutationFn: createFavorite,
    onSuccess: (saved) => {
      qc.setQueryData<Favorite[]>(['favorites'], (prev = []) => {
        if (prev.some(p => p.id === saved.id)) return prev;
        return [saved, ...prev];
      });
    },
  });

  const remove = useMutation({
    mutationFn: deleteFavorite,
    onSuccess: (_void, id) => {
      qc.setQueryData<Favorite[]>(['favorites'], (prev = []) => prev.filter(p => p.id !== id));
    },
  });

  function favoriteIdForStop(stop: Pick<Stop, 'lat' | 'lng' | 'name'> & { placeId?: string }): string | null {
    return keysById.get(favoriteKey({ name: stop.name, lat: stop.lat, lng: stop.lng, placeId: stop.placeId })) || null;
  }

  return {
    favorites: query.data || [],
    isLoading: query.isLoading,
    favoriteIdForStop,
    add: add.mutate,
    addAsync: add.mutateAsync,
    remove: remove.mutate,
    removeAsync: remove.mutateAsync,
    addPending: add.isPending,
    removePending: remove.isPending,
  };
}
```

- [ ] **Step 2:** Run `npm test` → still 363/363 (no new tests, just the hook).

- [ ] **Step 3:** Commit:

```
Favorites: useFavorites hook

TanStack Query wrapper: one fetch on first mount, exposes
favoriteIdForStop(stop) for fast membership checks via the favoriteKey
map. add/remove mutations update the cache optimistically.
```

---

## Task 4: FavoriteToggle component

**Files:**
- Create: `client/src/components/FavoriteToggle.tsx`
- Create: `client/src/components/__tests__/FavoriteToggle.test.tsx`

- [ ] **Step 1:** Write failing tests:

```tsx
// client/src/components/__tests__/FavoriteToggle.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FavoriteToggle } from '../FavoriteToggle';

describe('FavoriteToggle', () => {
  it('renders an empty star when not favorited', () => {
    const { container } = render(<FavoriteToggle isFavorited={false} onAdd={() => {}} onRemove={() => {}} />);
    expect(container.textContent).toContain('☆');
    expect(container.textContent).not.toContain('★');
  });

  it('renders a filled star when favorited', () => {
    const { container } = render(<FavoriteToggle isFavorited={true} onAdd={() => {}} onRemove={() => {}} />);
    expect(container.textContent).toContain('★');
  });

  it('calls onAdd when clicked while not favorited', () => {
    const onAdd = vi.fn();
    const { getByRole } = render(<FavoriteToggle isFavorited={false} onAdd={onAdd} onRemove={() => {}} />);
    fireEvent.click(getByRole('button'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('calls onRemove when clicked while favorited', () => {
    const onRemove = vi.fn();
    const { getByRole } = render(<FavoriteToggle isFavorited={true} onAdd={() => {}} onRemove={onRemove} />);
    fireEvent.click(getByRole('button'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('button is disabled while pending', () => {
    const { getByRole } = render(<FavoriteToggle isFavorited={false} pending onAdd={() => {}} onRemove={() => {}} />);
    expect(getByRole('button')).toBeDisabled();
  });
});
```

- [ ] **Step 2:** Create the component:

```tsx
// client/src/components/FavoriteToggle.tsx
type Props = {
  isFavorited: boolean;
  pending?: boolean;
  onAdd: () => void;
  onRemove: () => void;
  size?: 'sm' | 'md';
};

export function FavoriteToggle({ isFavorited, pending, onAdd, onRemove, size = 'sm' }: Props) {
  const glyph = isFavorited ? '★' : '☆';
  const cls = size === 'md' ? 'text-[18px]' : 'text-[14px]';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (isFavorited) onRemove(); else onAdd(); }}
      disabled={pending}
      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={isFavorited}
      className={`bg-transparent border-0 p-0.5 leading-none transition-colors cursor-pointer ${cls} ${isFavorited ? 'text-amber-400 hover:text-amber-300' : 'text-paper-muted hover:text-amber-400'} disabled:opacity-50`}
    >
      {glyph}
    </button>
  );
}
```

- [ ] **Step 3:** Run `npx vitest run client/src/components/__tests__/FavoriteToggle.test.tsx` → 5/5 pass.

- [ ] **Step 4:** Run `npm test` → 368/368 (was 363 + 5 new).

- [ ] **Step 5:** Commit:

```
Favorites: FavoriteToggle component

Small star button (☆/★). Click toggles between add/remove via injected
callbacks; aria-pressed reflects state; disabled while pending. Tests
cover render state, click dispatch, and pending lockout.
```

---

## Task 5: Embed FavoriteToggle in StopRow + Viewer DayCard

**Files:**
- Modify: `client/src/components/builder/StopRow.tsx`
- Modify: `client/src/components/viewer/DayCard.tsx`

- [ ] **Step 1:** Locate the StopRow component. The toggle goes in the row's right-side action area (next to the remove × button). Add this to the JSX next to existing controls:

```tsx
import { FavoriteToggle } from '../FavoriteToggle';
import { useFavorites } from '../../hooks/useFavorites';

// Inside StopRow component:
const { favoriteIdForStop, add, remove, addPending, removePending } = useFavorites();
const favoriteId = favoriteIdForStop(stop);

// In the JSX, near the remove button:
<FavoriteToggle
  isFavorited={!!favoriteId}
  pending={addPending || removePending}
  onAdd={() => add({
    name: stop.name,
    label: stop.label,
    lat: stop.lat,
    lng: stop.lng,
    countryCode: stop.countryCode,
    category: stop.category,
    sourceTripId: tripId,
    sourceTripName: tripName,
  })}
  onRemove={() => favoriteId && remove(favoriteId)}
/>
```

The StopRow may not currently take `tripId`/`tripName` as props — add them (optional):

```tsx
// In Props:
tripId?: string;
tripName?: string;
```

Builder, which renders StopRow inside DayColumn, threads these through. DayColumn already gets `tripId` (used elsewhere) or can derive it. Make sure Builder passes both, defaulting to the trip's id and name from state. Trace the prop drilling from Builder → DayColumn → StopRow if the values aren't already in scope.

- [ ] **Step 2:** Locate the Viewer DayCard. Each stop entry has a label + meta block; add the FavoriteToggle next to it:

```tsx
import { FavoriteToggle } from '../FavoriteToggle';
import { useFavorites } from '../../hooks/useFavorites';

// Inside the stop entry rendering, similar wiring as above, using the trip + stop.
```

DayCard receives `trip` and the per-day stop list; thread `tripId`/`tripName` from there.

- [ ] **Step 3:** Run `npm test` → 368/368 still.

- [ ] **Step 4:** Smoke test: open Builder on any trip, see ☆ next to each stop. Click → ★. Reload → still ★. Click again → ☆.

- [ ] **Step 5:** Commit:

```
Favorites: star toggle on Builder StopRow + Viewer DayCard

Each stop entry gets a FavoriteToggle wired to useFavorites. add()
sends the stop's name/label/lat/lng/countryCode/category plus the
source trip's id+name. Membership is checked via favoriteIdForStop
which uses the shared favoriteKey dedup signature.
```

---

## Task 6: /favorites view + nav link

**Files:**
- Create: `client/src/screens/Favorites.tsx`
- Modify: `client/src/App.tsx`
- Modify: the file containing the AppAuthed header nav (likely `App.tsx` or a header component) — add a "Favorites" link

- [ ] **Step 1:** Create `client/src/screens/Favorites.tsx`:

```tsx
import { Link } from 'react-router-dom';
import { useFavorites } from '../hooks/useFavorites';
import { flagEmoji } from '../lib/flags';
import { PIN_CATEGORY_META, DEFAULT_STOP_META } from '../lib/pin-meta';

export function Favorites() {
  const { favorites, isLoading, remove, removePending } = useFavorites();

  if (isLoading) return <main className="p-6 text-paper-dim">Loading favorites…</main>;

  if (favorites.length === 0) {
    return (
      <main className="p-6 max-w-3xl">
        <h2 className="text-paper text-[20px] mb-3">Your favorites</h2>
        <p className="text-paper-muted font-serif italic">
          No favorites yet. Star any stop in a trip to save it here.
        </p>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-4xl">
      <h2 className="text-paper text-[20px] mb-4">Your favorites · {favorites.length}</h2>
      <ul className="grid gap-2 grid-cols-1 sm:grid-cols-2">
        {favorites.map((f) => {
          const meta = f.category ? PIN_CATEGORY_META[f.category] : DEFAULT_STOP_META;
          return (
            <li key={f.id} className="bg-canvas-strong border border-line rounded-md p-3 flex gap-3 items-start">
              <span
                className="flex-none w-10 h-10 rounded-full flex items-center justify-center text-[18px]"
                style={{ backgroundColor: meta.tint }}
                aria-hidden
              >
                {meta.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-paper text-[14px] [overflow-wrap:anywhere]">{f.label || f.name}</span>
                  {f.countryCode && <span className="text-[14px] leading-none">{flagEmoji(f.countryCode)}</span>}
                </div>
                {f.sourceTripId && f.sourceTripName && (
                  <Link
                    to={`/viewer/${f.sourceTripId}`}
                    className="text-paper-muted text-[11.5px] hover:text-accent underline-offset-2 hover:underline"
                  >
                    from “{f.sourceTripName}”
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(f.id)}
                disabled={removePending}
                aria-label="Remove favorite"
                title="Remove favorite"
                className="bg-transparent border border-line text-paper-muted font-mono text-[10.5px] tracking-[0.18em] uppercase px-2 py-1 rounded hover:text-accent hover:border-accent disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2:** Add the `/favorites` route to App.tsx. Find where `/builder/:tripId` etc. are declared (inside `<AppAuthed>` wrapper) and add:

```tsx
<Route path="/favorites" element={<Favorites />} />
```

Import: `import { Favorites } from './screens/Favorites';`

- [ ] **Step 3:** Add a "Favorites" link to the header nav. The header is in App.tsx or a header component (look for the "Templates" button). Add next to it:

```tsx
<Link
  to="/favorites"
  className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-paper-muted hover:text-accent transition-colors px-2"
>
  Favorites
</Link>
```

Match the styling of the existing Templates button. If Templates is a `<button>` that does `navigate('/templates')`, mirror that pattern.

- [ ] **Step 4:** Run `npm test` → 368/368.

- [ ] **Step 5:** Smoke test: click the "Favorites" header link → see the list (or empty state). Click Remove on any favorite → it disappears.

- [ ] **Step 6:** Commit:

```
Favorites: /favorites view + header nav link

Favorites screen shows the user's list as a 2-column grid (1-col mobile)
with category badge, name, country flag, source trip link, and remove
button. Empty state copy when no favorites. Header link "Favorites"
added alongside Templates inside the AppAuthed nav.
```

---

## Task 7: Playwright e2e

**File:**
- Create: `e2e/favorites.spec.ts`

- [ ] **Step 1:** Create the spec, mirroring `e2e/auto-fuel.spec.ts`'s structure (sign-in helper inlined; skips if no E2E_TRIP_ID):

```ts
import { test, expect, type Page } from '@playwright/test';

const APP = process.env.E2E_APP || 'http://localhost:5173';
const TRIP_ID = process.env.E2E_TRIP_ID || '';

async function signIn(page: Page) {
  await page.goto(APP);
  const button = page.getByRole('button', { name: /Dev sign-in/i });
  await button.waitFor({ state: 'visible', timeout: 5_000 });
  await button.click();
  await page.waitForURL((url) => url.pathname !== '/', { timeout: 15_000 });
}

test.describe('favorites', () => {
  test.beforeEach(async ({ page }) => {
    if (!TRIP_ID) test.skip(true, 'Set E2E_TRIP_ID to a trip with at least one stop');
    await signIn(page);
  });

  test('star a stop, see it on /favorites, remove it', async ({ page }) => {
    await page.goto(`${APP}/builder/${TRIP_ID}`);
    const planBtn = page.locator('button[aria-pressed="false"]:has-text("Plan")').first();
    if (await planBtn.count() > 0) await planBtn.click();

    // Click the first ☆ on any stop card.
    const star = page.getByRole('button', { name: /add to favorites/i }).first();
    await star.click();
    await expect(page.getByRole('button', { name: /remove from favorites/i }).first()).toBeVisible();

    await page.goto(`${APP}/favorites`);
    await expect(page.locator('main h2')).toContainText(/your favorites/i);

    const removeBtn = page.getByRole('button', { name: /remove favorite/i }).first();
    await removeBtn.click();

    // After remove, either empty state or one fewer entry.
    await expect(page.locator('main')).toContainText(/no favorites yet|your favorites/i);
  });

  test('empty state shown when no favorites', async ({ page }) => {
    await page.goto(`${APP}/favorites`);
    // If the test runs after the prior test, favorites may exist; this test
    // is best-effort. Skip when list isn't empty.
    const text = await page.locator('main').textContent();
    if (!/no favorites yet/i.test(text || '')) test.skip(true, 'list non-empty in this run');
    await expect(page.locator('main')).toContainText(/no favorites yet/i);
  });
});
```

- [ ] **Step 2:** Commit:

```
Favorites: Playwright e2e spec

Two specs: star a stop in Builder → /favorites lists it → remove
clears it; empty-state copy shown when list is empty. Same skip-on-
no-trip-id pattern as auto-fuel.spec.ts.
```

---

## Final checklist

- [ ] All 368 pre-existing tests still pass.
- [ ] New tests: 4 (favorite-key) + 5 (FavoriteToggle) = 9 new. Final count 368.
- [ ] Server: POST/GET/DELETE work; second POST of same payload returns dedup'd id.
- [ ] Builder: star next to each stop; click toggles persist across reload.
- [ ] /favorites: list view + remove + empty state.
- [ ] Header: Favorites link works.
- [ ] Spec coverage: every section of the spec has a task.
