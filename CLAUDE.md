# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Server (:8080) + Vite client (:5173) in parallel, both with reload. Open http://localhost:5173.
npm run dev:server   # Express only (nodemon). Use when iterating on routes/.
npm run dev:client   # Vite only. Assumes the server is already running on :8080.
npm test             # Vitest run-once. Add a file path to scope: `npm test -- compute`.
npm run build        # Production build into dist/. Also emits sw.js + manifest.webmanifest.
npm start            # Production server (node server.js) — what Cloud Run runs.
```

Single-test workflow: `npx vitest run client/src/lib/__tests__/<name>.test.ts` (or `npx vitest <name>` for substring match).

## Repository layout

This is a **single-process app** — one Express server serves both the JSON API and the React SPA build. There is **no separate frontend/backend deployment**.

```
server.js                 Express entry. Mounts routes/, serves dist/ + SPA fallback.
routes/                   Express route handlers (config, me, share, trips). Mutating routes live in trips.js.
lib/firebase.js           Firebase Admin SDK init (server-side; bypasses Firestore rules).
middleware/auth.js        authRequired — verifies Firebase ID tokens from `Authorization: Bearer <jwt>`.
firestore.rules           Deny-by-default rules. Owner + share-token + collaborator paths only.
firebase.json             Points at firestore.rules + the `road-trip-db` database.
client/src/               React app. App.tsx defines routes; routing tree below.
client/index.html         Vite entrypoint (manifest + iOS PWA meta tags live here).
vite.config.ts            Vite + vite-plugin-pwa + dev-server proxy to :8080. Vitest config also here.
dist/                     Production build output (gitignored). Served by server.js.
```

Frontend tree (`client/src/`): `screens/` = page components, `components/` = shared UI, `hooks/` = data + UI hooks, `lib/` = pure helpers (compute, types, API client, deep-link builders). Tests live in `client/src/lib/__tests__/`.

## Architecture

**Auth + access control.** Firebase Auth on the client (popup sign-in via `lib/firebase.ts`); the JWT goes in `Authorization: Bearer` on every API call. The server middleware (`middleware/auth.js`) verifies the token and sets `req.uid`. Access is gated by `ALLOWED_EMAILS` (comma-separated allowlist) — unknown emails get 403 and are signed out client-side. `ADMIN_EMAIL` only controls UI visibility; admin routes re-verify server-side.

**Trip / pin data model.** Trips live in Firestore at `trips/{tripId}` with stops embedded as an array. Pins are a subcollection at `trips/{tripId}/pins/{pinId}`. Stops have a `type` (`start | overnight | waypoint | destination`), a `dayNumber` computed from `kmFromPrevious` + `maxKmPerDay` + overnight markers (see `lib/compute.ts:applyDays`), and optional metadata (`category`, `priority`, `notes`) that carries over during pin↔stop promote/demote.

**Routing + day grouping.** Distances between stops come from Google Maps Routes API (`computeRoutes`, see `hooks/useRouteSegments.ts`). The frontend then runs `applyDays` to assign each stop a day number, and `groupByDay` to render day cards. Per-leg `routeMode` (`fastest | scenic | no-tolls | scenic-no-tolls`) gets translated into `routeModifiers` on the Routes API request.

**Public sharing.** `trip.shareToken` + `trip.isShared` enable a public read-only view at `/share/:token`. The `routes/share.js` endpoint is unauthenticated and returns a sanitized trip (owner displayName + photoURL only, no `ownerUid`/`collaborators`/`shareToken` leak). Same data powers the `/handoff/share/:token` mobile hand-off page.

**Server↔client config bridge.** Frontend env values (Firebase web config, Maps API key, admin email, Booking affiliate ID) reach the browser only through `GET /config`, which uses an **explicit allowlist** (`FIREBASE_CLIENT_KEYS` + explicit fields in the response) so server-only env vars (service accounts, Paddle keys, `ALLOWED_EMAILS`) cannot leak even if misconfigured.

**Routing tree.**
- `/` `/builder` `/builder/:tripId` `/viewer/:tripId` `/handoff/:tripId` — auth-required (`AppAuthed` wraps these).
- `/share/:token` `/handoff/share/:token` — public, gated by share token.
- The Vite dev server proxies `/api/*`, `/config`, `/health`, `/actuator` to Express on `:8080`. Hitting `:5173` directly is the dev workflow; `:8080` only serves a useful UI after `npm run build`.

**PWA (Workbox via `vite-plugin-pwa`).** App shell precached at build time; API responses (GET `/api/*` and `/config`) use `NetworkFirst` with a 4s timeout so trips render offline after first visit. Service worker is disabled in dev (`devOptions.enabled: false`) — to test offline locally, `npm run build && npx vite preview`. Google Maps tiles are not cacheable due to ToS, so the map area goes blank offline (known and intentional).

**Auto-fuel engine.** `hooks/useAutoFuel.ts` runs after every route-segment update. It walks the stop timeline, accumulates fuel consumption leg-by-leg, and reactively inserts the nearest fuel stop (Places API, filtered to ≤5 km detour via `NearbyFinder`'s `detourCapKm` + `legPolyline` props) before the tank would hit empty. Each insertion is undoable for 8 s via a toast action. Per-trip toggle in `TripDetailsModal` (default on); `addedByAuto` flag on the stop marks it for the `StopIdentityBadge`. Day cards show a fuel-remaining badge (green/amber/red).

**Favorites.** Top-level Firestore collection `favorites/{favoriteId}` with `ownerUid` (not nested under `users/`). Dedup'd by `placeId` (when present) or a `name|lat.toFixed(4)|lng.toFixed(4)` signature via `favoriteKey` helper (`client/src/lib/favorite-key.ts`); the server's `sigKey` in `routes/favorites.js` produces the same string. POST returns the existing id on a dedup hit instead of creating a duplicate. `useFavorites` hook exposes `favoriteIdForStop(stop)`, add, remove + list; `FavoriteToggle` wires the star UI used in Builder `StopRow` and Viewer `DayCard`. Browseable at the `/favorites` route.

**Plan limits.** `routes/trips.js` enforces `FREE_TRIP_LIMIT` / `PRO_TRIP_LIMIT` server-side on create; client gets a `402 TRIP_LIMIT_REACHED` and surfaces an upgrade prompt.

**Deployment.** Cloud Build watches `main` and deploys to Cloud Run on push. There is no staging environment — local dev runs against the same Firebase project as production. Trip data created on `localhost` lives in the same Firestore.

## Dev sign-in (headless / MCP browsers)

For Chrome DevTools MCP, Playwright, or any browser session that can't use the Google popup flow, set `DEV_IMPERSONATE_UID=<your-firebase-uid>` in `.env`. This activates two things:

1. **Server**: `POST /api/dev/auth/impersonate` mints a Firebase custom token for that UID.
2. **Client**: the Login page shows a "Dev sign-in (localhost)" button (`import.meta.env.DEV` gated).

The button calls the endpoint, then `signInWithCustomToken`. Everything downstream — JWT verification, allowlist, Firestore rules — runs unchanged.

The endpoint is invisible in production: `routes/dev-auth.js` exports `isDevAuthAvailable()` which returns false if any hosted-env signal is present (`K_SERVICE`, `DYNO`, `FLY_APP_NAME`, `RAILWAY_ENVIRONMENT`, `NODE_ENV=production`). `server.js` only mounts the router when that check passes AND `DEV_IMPERSONATE_UID` is set. Internal route guards (loopback IP, env var re-check) are belt-and-braces.

**Playwright MCP helpers** (`e2e/`):

- `e2e/sign-in.js` — per-session snippet. Invoke via `browser_run_code_unsafe({ filename: "e2e/sign-in.js" })` at the start of any Playwright MCP session. Fresh sign-in each time, ~1-2s.
- `e2e/playwright-auth.mjs` — one-time setup that saves storage state (cookies + localStorage + IndexedDB) to `e2e/.auth/state.json`. Requires `npm install -D playwright` once. Pass the file to `@playwright/mcp --storage-state e2e/.auth/state.json` so MCP sessions start already authenticated. The `.auth/` directory is gitignored.

## Conventions worth knowing

- **Tailwind v3** (not v4). Class names use design tokens defined in the tailwind config (`bg-canvas`, `text-paper`, `border-line`, `bg-accent`, etc.) — don't hardcode hex values when a token exists.
- **Existing slice numbering.** Recent commits use prefixes like `Slice 11: …`, `Issue #37: …`, `Issue #40 follow-up: …`. Match the pattern when committing.
- **PDF export** (`routes/trips.js`) duplicates compute logic from the frontend (`estimateFuelCost`, `fuelBreakdownForLegs`). When changing the frontend compute, update the server port in parallel.
- **Tests are Vitest + jsdom**, no React Testing Library setup beyond what's in `client/src/test/setup.ts`. Most tests are pure-function tests in `client/src/lib/__tests__/`.
