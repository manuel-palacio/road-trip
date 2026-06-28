# Nearby Search daily guardrail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Throttle a misbehaving user's Google Nearby Search usage via a per-user, per-day cooperative metering gate.

**Architecture:** Before either Nearby Search call site fires, the client "claims" one unit from `POST /api/usage/nearby-search`. The server atomically increments a per-user, per-UTC-day Firestore counter and returns `402 NEARBY_SEARCH_LIMIT` once the daily cap is exceeded. The client skips the Google call and surfaces a cap message. Server-side enforcement reuses the existing `effectiveTripLimit` / `402` / rate-limit patterns.

**Tech Stack:** Express + firebase-admin (modular) server; React + TypeScript client; Vitest unit tests; Playwright spec (per repo convention: written against `@playwright/test`, verified live via Playwright MCP).

## Global Constraints

- firebase-admin v14 modular API only — import `FieldValue` from `firebase-admin/firestore`; never `admin.firestore.*` directly in new server files (the `admin` shim in `lib/firebase.js` is for legacy call sites).
- Per-user rate limiting requires `authRequired` to run BEFORE the limiter (the limiter keys on `req.uid`). Mirror `routes/trips.js`: `router.use('/api/usage', authRequired)` then `limits.usageWrite` as route middleware.
- `ADMIN_EMAIL` (lowercased) is exempt from counting and capping, matching `middleware/rate-limit.js`.
- Cap defaults: free **150**/day, pro **300**/day. Env-configurable: `FREE_NEARBY_SEARCH_DAILY_LIMIT`, `PRO_NEARBY_SEARCH_DAILY_LIMIT`.
- Day boundary is **UTC** (`new Date().toISOString().slice(0,10)`).
- Metering failures other than `402` **fail open** — the Google call proceeds.
- Tests live in `client/src/lib/__tests__/`; Vitest config root is `client`.

---

## File Structure

- `lib/limits.js` — add `effectiveNearbySearchDailyLimit(user)` next to `effectiveTripLimit`.
- `middleware/rate-limit.js` — add `usageWrite` limiter instance.
- `routes/usage.js` (new) — the `POST /api/usage/nearby-search` endpoint.
- `server.js` — mount the usage router.
- `client/src/lib/api.ts` — add `claimNearbySearch()`.
- `client/src/components/builder/NearbyFinder.tsx` — gate the manual finder + cap message.
- `client/src/screens/Builder.tsx` — gate the auto-fuel `placesSearch` + pause flag + toast.
- `client/src/lib/__tests__/nearby-search-limit.test.ts` (new) — unit test for the resolver.
- `e2e/nearby-search-guardrail.spec.ts` (new) — Playwright spec (repo convention).

---

### Task 1: Server limit resolver

**Files:**
- Modify: `lib/limits.js`
- Test: `client/src/lib/__tests__/nearby-search-limit.test.ts`

**Interfaces:**
- Produces: `effectiveNearbySearchDailyLimit(user: { plan?: string; nearbySearchDailyLimit?: number }): number`

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/__tests__/nearby-search-limit.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import limits from '../../../../lib/limits.js';

const { effectiveNearbySearchDailyLimit } = limits;

describe('effectiveNearbySearchDailyLimit', () => {
  afterEach(() => {
    delete process.env.FREE_NEARBY_SEARCH_DAILY_LIMIT;
    delete process.env.PRO_NEARBY_SEARCH_DAILY_LIMIT;
  });

  it('uses a positive per-user override above plan/env', () => {
    expect(effectiveNearbySearchDailyLimit({ nearbySearchDailyLimit: 42, plan: 'free' })).toBe(42);
  });

  it('uses PRO_NEARBY_SEARCH_DAILY_LIMIT for pro users', () => {
    process.env.PRO_NEARBY_SEARCH_DAILY_LIMIT = '500';
    expect(effectiveNearbySearchDailyLimit({ plan: 'pro' })).toBe(500);
  });

  it('uses FREE_NEARBY_SEARCH_DAILY_LIMIT for free users', () => {
    process.env.FREE_NEARBY_SEARCH_DAILY_LIMIT = '80';
    expect(effectiveNearbySearchDailyLimit({ plan: 'free' })).toBe(80);
  });

  it('falls back to defaults 150 free / 300 pro when env unset', () => {
    expect(effectiveNearbySearchDailyLimit({ plan: 'free' })).toBe(150);
    expect(effectiveNearbySearchDailyLimit({ plan: 'pro' })).toBe(300);
    expect(effectiveNearbySearchDailyLimit(null)).toBe(150);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run nearby-search-limit`
Expected: FAIL — `effectiveNearbySearchDailyLimit is not a function`.

- [ ] **Step 3: Implement the resolver**

In `lib/limits.js`, add the function and export it (mirrors `effectiveTripLimit`):

```js
function effectiveNearbySearchDailyLimit(user) {
  if (user && typeof user.nearbySearchDailyLimit === 'number' && user.nearbySearchDailyLimit > 0) {
    return user.nearbySearchDailyLimit;
  }
  const plan = user && user.plan === 'pro' ? 'pro' : 'free';
  return plan === 'pro'
    ? parseInt(process.env.PRO_NEARBY_SEARCH_DAILY_LIMIT || '300', 10)
    : parseInt(process.env.FREE_NEARBY_SEARCH_DAILY_LIMIT || '150', 10);
}

module.exports = { effectiveTripLimit, effectiveNearbySearchDailyLimit };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run nearby-search-limit`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/limits.js client/src/lib/__tests__/nearby-search-limit.test.ts
git commit -m "Add effectiveNearbySearchDailyLimit resolver + tests"
```

---

### Task 2: Usage metering endpoint

**Files:**
- Modify: `middleware/rate-limit.js`
- Create: `routes/usage.js`
- Modify: `server.js:51` (mount after the fx router)

**Interfaces:**
- Consumes: `effectiveNearbySearchDailyLimit` (Task 1), `getDb` (`lib/firebase`), `authRequired` (`middleware/auth`), `limits.usageWrite`.
- Produces: `POST /api/usage/nearby-search` → `200 { used, limit }` or `402 { error, code: 'NEARBY_SEARCH_LIMIT', used, limit }`.

- [ ] **Step 1: Add the rate-limit instance**

In `middleware/rate-limit.js`, add to the exported object:

```js
  usageWrite: makeLimiter({ windowMs: 60 * 1000, max: 120, label: 'usage-write' }),
```

- [ ] **Step 2: Create the endpoint**

Create `routes/usage.js`:

```js
const express = require('express');
const { FieldValue } = require('firebase-admin/firestore');
const { getDb } = require('../lib/firebase');
const { authRequired } = require('../middleware/auth');
const limits = require('../middleware/rate-limit');
const { effectiveNearbySearchDailyLimit } = require('../lib/limits');

const router = express.Router();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();

function utcDateKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

router.use('/api/usage', authRequired);

router.post('/api/usage/nearby-search', limits.usageWrite, async (req, res) => {
  try {
    if (ADMIN_EMAIL && (req.userEmail || '').toLowerCase() === ADMIN_EMAIL) {
      return res.json({ used: 0, limit: -1 });
    }
    const db = getDb();
    const userRef = db.collection('users').doc(req.uid);
    const usageRef = userRef.collection('usage').doc(utcDateKey());
    await usageRef.set({ nearbySearch: FieldValue.increment(1) }, { merge: true });
    const used = (await usageRef.get()).data()?.nearbySearch || 0;
    const userSnap = await userRef.get();
    const limit = effectiveNearbySearchDailyLimit(userSnap.data() || {});
    if (used > limit) {
      return res.status(402).json({
        error: 'Daily map search limit reached. Resets tomorrow.',
        code: 'NEARBY_SEARCH_LIMIT',
        used,
        limit,
      });
    }
    res.json({ used, limit });
  } catch (e) {
    console.error('POST /api/usage/nearby-search failed:', e);
    res.status(500).json({ error: 'Internal error', code: 'INTERNAL' });
  }
});

module.exports = router;
```

- [ ] **Step 3: Mount the router**

In `server.js`, after line 51 (`app.use(require('./routes/fx'));`):

```js
app.use(require('./routes/usage'));
```

- [ ] **Step 4: Boot smoke test**

Run (kills any stale listener, boots, confirms it binds clean):

```bash
lsof -ti :8080 | xargs kill -9 2>/dev/null; sleep 1
PORT=8080 node server.js > /tmp/usage-boot.log 2>&1 &
sleep 4; curl -s http://localhost:8080/health; echo
grep -c "Error\|is not a function" /tmp/usage-boot.log
lsof -ti :8080 | xargs kill -9 2>/dev/null
```

Expected: `{"status":"ok"}` and `0` errors. (Full endpoint behavior is proved by the e2e in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add middleware/rate-limit.js routes/usage.js server.js
git commit -m "Add POST /api/usage/nearby-search metering endpoint"
```

---

### Task 3: Client claim helper

**Files:**
- Modify: `client/src/lib/api.ts`

**Interfaces:**
- Consumes: `withToken`, `handle`, `ApiError` (already in `api.ts`).
- Produces: `claimNearbySearch(): Promise<{ used: number; limit: number }>` — resolves on allow; throws `ApiError` with `.code === 'NEARBY_SEARCH_LIMIT'` on cap.

- [ ] **Step 1: Add the helper**

In `client/src/lib/api.ts`, add (after `getMe`):

```ts
export async function claimNearbySearch(): Promise<{ used: number; limit: number }> {
  return handle<{ used: number; limit: number }>(
    await fetch('/api/usage/nearby-search', await withToken({ method: 'POST' })),
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: build succeeds (no TS errors).

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/api.ts
git commit -m "Add claimNearbySearch API client helper"
```

---

### Task 4: Gate NearbyFinder + cap message + e2e spec

**Files:**
- Modify: `client/src/components/builder/NearbyFinder.tsx:91-99`
- Create: `e2e/nearby-search-guardrail.spec.ts`

**Interfaces:**
- Consumes: `claimNearbySearch` (Task 3). Reuses the existing `error`/`setError` state already rendered in NearbyFinder.

- [ ] **Step 1: Gate the search effect**

In `NearbyFinder.tsx`, import the helper at the top with the other imports:

```ts
import { claimNearbySearch } from '../../lib/api';
```

Then change the search effect body (currently starting `const service = new maps.places.PlacesService(map);` at line ~91) to claim first. Wrap the existing service/nearbySearch logic so it only runs after a successful claim:

```ts
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        await claimNearbySearch();
      } catch (err) {
        if ((err as { code?: string }).code === 'NEARBY_SEARCH_LIMIT') {
          if (!cancelled) {
            setResults([]);
            setError('Daily map search limit reached. Resets tomorrow.');
          }
          return;
        }
        // Fail open on any other error — proceed with the search.
      }
      if (cancelled) return;
      const service = new maps.places.PlacesService(map);
      const request: google.maps.places.PlaceSearchRequest = {
        location: target.midpoint,
        radius: SEARCH_RADIUS_M,
        ...(placeType ? { type: placeType } : {}),
      };
      service.nearbySearch(request, (raw, status) => {
        // ... existing callback body unchanged ...
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Keep the existing `nearbySearch` callback body exactly as-is; only the claim wrapper and the `cancelled` guard are added.

- [ ] **Step 2: Write the Playwright spec (repo convention)**

Create `e2e/nearby-search-guardrail.spec.ts`:

```ts
// Nearby Search daily-guardrail E2E spec.
//
// Requires Playwright test runner (`npm install -D @playwright/test`) and a
// dev server on :5173 with DEV_IMPERSONATE_UID set AND
// FREE_NEARBY_SEARCH_DAILY_LIMIT=1 so the second search trips the cap.
// Set E2E_TRIP_ID to a trip you own with at least one day to search around.
//
// The limit resolver is unit-tested in
// client/src/lib/__tests__/nearby-search-limit.test.ts. This spec covers the
// wired browser behavior. Status: written but un-runnable until
// @playwright/test is installed; equivalent live verification performed via
// Playwright MCP during implementation.

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

test.describe('nearby-search guardrail', () => {
  test.beforeEach(async ({ page }) => {
    if (!TRIP_ID) test.skip(true, 'Set E2E_TRIP_ID');
    await signIn(page);
  });

  test('second NearbyFinder search is blocked with the cap message', async ({ page }) => {
    await page.goto(`${APP}/builder/${TRIP_ID}`);

    // Open NearbyFinder for a day, let the first search run (allowed at limit=1).
    await page.getByRole('button', { name: /Find nearby/i }).first().click();
    await expect(page.locator('[data-testid="nearby-result"]').first())
      .toBeVisible({ timeout: 8_000 });
    await page.keyboard.press('Escape');

    // Open it again — the claim now exceeds the daily cap of 1.
    await page.getByRole('button', { name: /Find nearby/i }).first().click();
    await expect(page.getByText('Daily map search limit reached. Resets tomorrow.'))
      .toBeVisible({ timeout: 8_000 });
  });
});
```

> Note: align the `Find nearby` button name and `data-testid` with the actual NearbyFinder trigger markup when wiring; adjust selectors if they differ.

- [ ] **Step 3: Live verification via Playwright MCP**

Start the dev server with the cap forced to 1:

```bash
FREE_NEARBY_SEARCH_DAILY_LIMIT=1 npm run dev
```

Then via Playwright MCP: run `e2e/sign-in.js`, open a trip in the Builder, open NearbyFinder once (results appear), close, open again → confirm the message **"Daily map search limit reached. Resets tomorrow."** renders and no second Places call is made (check the network panel). Record the result.

- [ ] **Step 4: Run unit tests + build**

Run: `npm test && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/builder/NearbyFinder.tsx e2e/nearby-search-guardrail.spec.ts
git commit -m "Gate NearbyFinder behind Nearby Search daily cap"
```

---

### Task 5: Gate auto-fuel + pause + toast

**Files:**
- Modify: `client/src/screens/Builder.tsx:464-485` (the `placesSearch` memo) and `:229` (add pause state)

**Interfaces:**
- Consumes: `claimNearbySearch` (Task 3), existing `setAutoFuelToast` (`Builder.tsx:229`).

- [ ] **Step 1: Add a session pause ref**

In `Builder.tsx`, near the other refs, add:

```ts
  const autoFuelPausedRef = useRef(false);
```

Import `claimNearbySearch` alongside the other `api` imports.

- [ ] **Step 2: Gate the placesSearch memo**

Replace the `placesSearch` memo body (line ~464) so it claims before searching, returns `[]` on cap, and pauses + toasts once:

```ts
  const placesSearch: PlacesSearchFn | null = useMemo(() => {
    if (!maps || !map) return null;
    return async (location, radiusMeters) => {
      if (autoFuelPausedRef.current) return [];
      try {
        await claimNearbySearch();
      } catch (err) {
        if ((err as { code?: string }).code === 'NEARBY_SEARCH_LIMIT') {
          if (!autoFuelPausedRef.current) {
            autoFuelPausedRef.current = true;
            setAutoFuelToast({ message: 'Daily map limit reached — auto-fuel paused until tomorrow.' });
          }
          return [];
        }
        // Fail open on any other error — proceed with the search.
      }
      return new Promise<import('../components/builder/NearbyFinder').NearbyResult[]>((resolve) => {
        const svc = new maps.places.PlacesService(map);
        svc.nearbySearch(
          { location, radius: radiusMeters, type: 'gas_station' },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (raw: any, status: any) => {
            if (status !== maps.places.PlacesServiceStatus.OK || !raw) return resolve([]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            resolve(raw.filter((r: any) => r.geometry?.location).map((r: any) => ({
              placeId: r.place_id || '',
              name: r.name || 'Fuel stop',
              vicinity: r.vicinity || '',
              rating: typeof r.rating === 'number' ? r.rating : undefined,
              lat: r.geometry!.location!.lat(),
              lng: r.geometry!.location!.lng(),
            })));
          },
        );
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps, map]);
```

(The `PlacesSearchFn` type already allows an async function returning a `Promise`; no signature change.)

- [ ] **Step 3: Live verification via Playwright MCP**

With `FREE_NEARBY_SEARCH_DAILY_LIMIT=1 npm run dev` and a trip that has a fuel gap: load the Builder, let auto-fuel fire once, confirm that after the cap is hit the toast **"Daily map limit reached — auto-fuel paused until tomorrow."** appears and the stop count stops changing (no retry storm). Record the result.

- [ ] **Step 4: Run unit tests + build**

Run: `npm test && npm run build`
Expected: all green (418+ unit tests pass; `useAutoFuel.test.tsx` still green since the injected `placesSearch` mock is unaffected).

- [ ] **Step 5: Commit**

```bash
git add client/src/screens/Builder.tsx
git commit -m "Gate auto-fuel behind Nearby Search daily cap with pause + toast"
```

---

## Optional follow-up (not required)

- Add `FREE_NEARBY_SEARCH_DAILY_LIMIT` / `PRO_NEARBY_SEARCH_DAILY_LIMIT` to `.env.example` if present, with the 150/300 defaults documented.
- Surface remaining quota in `/api/me` for a future "you're near your limit" nudge.

## Self-Review

- **Spec coverage:** endpoint increment/200 (Task 2) ✓; 402 cap (Task 2) ✓; UTC reset via date-keyed doc (Task 2) ✓; admin exempt (Task 2) ✓; env-configurable plan-aware limit (Task 1) ✓; meter rate-limited (Task 2) ✓; auto-fuel pause+toast (Task 5) ✓; NearbyFinder message (Task 4) ✓; fail-open (Tasks 4 & 5) ✓; unit test (Task 1) + e2e (Task 4) ✓.
- **Placeholders:** none — all steps carry concrete code/commands.
- **Type consistency:** `claimNearbySearch(): Promise<{ used, limit }>` defined in Task 3 and consumed unchanged in Tasks 4 & 5; `code: 'NEARBY_SEARCH_LIMIT'` identical across server (Task 2) and client checks (Tasks 4 & 5).
