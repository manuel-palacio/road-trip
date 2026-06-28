# Per-user daily Nearby Search guardrail — design

_Date: 2026-06-28_

## Problem

Google Maps API calls in this app are made **client-side** — the browser loads the Maps
SDK with the key from `GET /config` and calls Google directly (Routes in
`useRouteSegments.ts`, Places/Nearby Search in `NearbyFinder` and the auto-fuel engine).
None of it touches the Express server, so the existing per-uid rate limiter
(`middleware/rate-limit.js`) is blind to Maps usage and cannot throttle an abusive user.

**Nearby Search** is the binding cost constraint (see `docs/maps-api-cost-analysis.md`):
the smallest free bucket (5,000/month, Pro tier), the priciest SKU (~$32/1k), and the only
expensive call that fires *automatically* (the auto-fuel engine). A single misbehaving
user can consume a large share of the monthly free quota.

## Goal

Add a **cooperative metering guardrail**: the client reports each Nearby Search to the
server before making it; the server counts per user per day and refuses once a daily cap
is exceeded. This throttles a misbehaving user and bounds worst-case daily spend.

This is layer 2 of the throttling options discussed — a UX/cost guardrail, **not** a
security boundary. It is bypassable by a determined user (the Maps key is in the browser);
true enforcement would require proxying calls server-side (layer 1), which is out of scope.

## Scope

**In scope**
- Meter **Nearby Search only** (auto-fuel + `NearbyFinder`).
- **Daily** hard cap per user, env-configurable, plan-aware, admin-exempt.
- Capped-state UX at both call sites.

**Out of scope** (deliberately, to stay minimal)
- Proxying Maps calls through the server (layer 1).
- Metering Routes or Place Details (cheap and well-cached).
- A monthly ceiling.
- Any admin usage dashboard or analytics.

## Architecture

Claim-before flow — the client claims one unit of quota before calling Google:

```
client about to run a Nearby Search
  └─▶ POST /api/usage/nearby-search        (authRequired, rate-limited, ADMIN_EMAIL exempt)
        ├─ FieldValue.increment(1) on users/{uid}/usage/{YYYY-MM-DD}.nearbySearch
        ├─ used ≤ limit → 200 { used, limit }       → client proceeds with Google call
        └─ used > limit → 402 { code: 'NEARBY_SEARCH_LIMIT' } → client skips Google, shows message
```

### Server

**`lib/limits.js`** — add `effectiveNearbySearchDailyLimit(user)`, mirroring the existing
`effectiveTripLimit` resolution order:
1. `user.nearbySearchDailyLimit` (Firestore field) — per-user admin override
2. `PRO_NEARBY_SEARCH_DAILY_LIMIT` env (default **300**) if `user.plan === 'pro'`
3. `FREE_NEARBY_SEARCH_DAILY_LIMIT` env (default **150**) otherwise

Defaults rationale: typical real use is ~0.5 Nearby Searches/user/day; 150/day is ~300×
headroom for legitimate heavy building while still capping runaway abuse.

**`routes/usage.js`** — new router, `POST /api/usage/nearby-search`:
- `authRequired` (sets `req.uid`, `req.userEmail`).
- Admin exemption: if `req.userEmail` matches `ADMIN_EMAIL`, return `200` without counting
  (same exemption rule used in `middleware/rate-limit.js`).
- Counter doc: `users/{uid}/usage/{date}` where `date` is `YYYY-MM-DD` in **UTC** (computed
  server-side for determinism), field `nearbySearch`. Increment atomically with
  `FieldValue.increment(1)`; the date-as-doc-id makes the counter self-reset each day with
  no transaction and no cleanup-on-read.
- Counting mechanism: `set({ nearbySearch: FieldValue.increment(1) }, { merge: true })`,
  then read the doc back to get the new `used` count (`FieldValue.increment` does not
  return the value). If `used > effectiveNearbySearchDailyLimit(user)`, respond
  `402 { error, code: 'NEARBY_SEARCH_LIMIT' }`; otherwise `200 { used, limit }`. A small
  race under high concurrency (two requests both reading just under the cap) is acceptable
  for a guardrail — it cannot meaningfully overshoot the daily limit.
- Mount in `server.js` alongside the other routers.

**`middleware/rate-limit.js`** — add a limiter instance for this endpoint (per-uid, e.g.
60/min) so the meter endpoint itself cannot be spammed. Reuses the existing `makeLimiter`.

### Client

**`client/src/lib/api.ts`** — add `claimNearbySearch(): Promise<{ used: number; limit: number }>`
that POSTs the endpoint with the auth token. `handle()` already converts a `402` body into
a thrown `ApiError` carrying `code: 'NEARBY_SEARCH_LIMIT'`.

**Call site 1 — auto-fuel** (`Builder.tsx:466`, the `placesSearch` fn passed to
`useAutoFuel`): wrap the search so it `await`s `claimNearbySearch()` first.
- On `NEARBY_SEARCH_LIMIT`: return `[]` (auto-fuel treats this as "no station found") **and**
  set a session-scoped `autoFuelPaused` flag so auto-fuel stops retrying on every render,
  and show a one-time toast: *"Daily map limit reached — auto-fuel paused until tomorrow."*
- The pause flag resets on full reload (new day / new session).

**Call site 2 — NearbyFinder** (`NearbyFinder.tsx:97`): `await claimNearbySearch()` before
`service.nearbySearch`.
- On `NEARBY_SEARCH_LIMIT`: render an inline modal message *"Daily map search limit reached.
  Resets tomorrow."* instead of running the search.

### Error handling

If the claim endpoint fails for any reason **other** than `402` (network error, 500, etc.):
**fail open** — proceed with the Google call. A metering glitch must never break the core
map experience. (Acceptable because this is a guardrail, not a security control.)

## Components & responsibilities

| Unit | Responsibility | Depends on |
|------|---------------|-----------|
| `effectiveNearbySearchDailyLimit(user)` | Resolve a user's daily cap (pure) | env, `user` |
| `POST /api/usage/nearby-search` | Atomically count + gate per user/day | `lib/limits`, `lib/firebase`, `middleware/auth`, `middleware/rate-limit` |
| `api.claimNearbySearch()` | Client claim call; surfaces `402` as `ApiError` | `api.ts` `handle()` |
| `Builder.tsx` `placesSearch` wrapper | Gate auto-fuel; pause + toast on cap | `claimNearbySearch` |
| `NearbyFinder` gate | Gate manual finder; inline message on cap | `claimNearbySearch` |

## Testing (Definition of Done)

Every acceptance criterion gets an automated test.

- **Unit (Vitest)** — `effectiveNearbySearchDailyLimit`: per-user override wins; `pro` →
  `PRO_NEARBY_SEARCH_DAILY_LIMIT`; free → `FREE_NEARBY_SEARCH_DAILY_LIMIT`; env defaults
  (300 / 150) when unset. (Pure function; testable by importing `lib/limits.js`.)
- **Playwright e2e** — start the server with `FREE_NEARBY_SEARCH_DAILY_LIMIT=1`,
  dev-impersonate sign-in, trigger two Nearby Searches (e.g. open `NearbyFinder` and search
  twice): assert the **second** is blocked and the cap message renders, and that no second
  Google call is made.

## Acceptance criteria

- [ ] `POST /api/usage/nearby-search` increments a per-user, per-UTC-day counter and returns
      `200 { used, limit }` under the cap.
- [ ] The endpoint returns `402 { code: 'NEARBY_SEARCH_LIMIT' }` once the cap is exceeded.
- [ ] The counter resets at the UTC day boundary (new day → fresh count).
- [ ] `ADMIN_EMAIL` is exempt (never counted, never capped).
- [ ] Daily cap is env-configurable and plan-aware via `effectiveNearbySearchDailyLimit`
      (defaults 150 free / 300 pro).
- [ ] The meter endpoint is rate-limited per uid.
- [ ] Auto-fuel pauses for the session with a toast when the cap is hit (no retry storm).
- [ ] `NearbyFinder` shows the cap message instead of searching when the cap is hit.
- [ ] Claim-endpoint failures other than `402` fail open (search proceeds).
- [ ] Unit test covers the limit resolver; Playwright e2e covers the end-to-end cap block.
```
