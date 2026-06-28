# Google Maps API cost analysis

_Last updated: 2026-06-28. Pricing reflects Google Maps Platform's March 2025 model
(per-SKU monthly free tiers, replacing the old $200 credit). Confirm live numbers in
the Cloud Console billing report — rates and SKU↔tier mappings change._

## TL;DR

- **Free tiers are per-SKU and independent** — each API draws from its own monthly
  bucket (Essentials 10,000 / Pro 5,000 / Enterprise 1,000 free calls per SKU per month).
- The architecture is already cost-conscious: per-leg route caching + persisted-path
  seeding mean reopening a saved trip is effectively **free** on the Routes API.
- **Binding constraint: Nearby Search** — smallest free bucket (5,000, Pro tier) *and*
  priciest SKU (~$32/1k), and it's the only expensive call that fires *automatically*
  (the auto-fuel engine).
- Under moderate assumptions, real costs start at roughly **300–400 monthly active
  users**, then rise on a gentle slope (~$500–700/mo at ~1,000 MAU).

## Which APIs we call

| API (SKU) | Tier | Free / month | Price after | Where |
|-----------|------|-------------|-------------|-------|
| Dynamic Maps (map load) | Essentials | 10,000 | ~$7 / 1k | `screens/Builder.tsx:717`, `Viewer.tsx:255`, `Share.tsx:142` (`new maps.Map`) |
| Routes – Compute Routes | Essentials | 10,000 | ~$5 / 1k | `hooks/useRouteSegments.ts:142` |
| Place Details | Essentials | 10,000 | ~$5 / 1k | `lib/google-maps.ts:312` (locality), `components/viewer/PinMapLayer.tsx:136` (POI click), Autocomplete `getPlace` |
| Autocomplete (per session) | Essentials | 10,000 | ~$10 / 1k | `screens/Builder.tsx:734` (search box widget) |
| Nearby Search | Pro | 5,000 | ~$32 / 1k | `components/builder/NearbyFinder.tsx:97`, `screens/Builder.tsx:468`, auto-fuel via `lib/auto-fuel-pick.ts:43` |

No Geocoding, Distance Matrix, Street View, or Static Maps calls. The maps SDK script
itself loads once per browser tab (cached in `lib/google-maps.ts:loadMapsSdk`); billing
is on each `new maps.Map(...)` instantiation, not the script load.

> ⚠️ The Places calls use the **legacy** `google.maps.places.PlacesService` /
> `Autocomplete`, which Google is deprecating. Verify the exact legacy SKU rates/buckets
> in the console.

## What fires when the map loads (Builder / Viewer / Share mount)

| API | Calls per load | Notes |
|-----|---------------|-------|
| Maps JavaScript API | **1 Map Load** | One per screen mount. Changing the Builder layout re-creates the map (`Builder.tsx:711`) → an extra load. |
| Routes API | **usually 0** | `seedCacheFromPersistedPaths` (`useRouteSegments.ts:72`) reuses each stop's persisted `routePath`, validated by `pathMatchesEndpoints`. Only legs whose path is missing or stale get fetched. |
| Places | **0** (typically) | Except: auto-fuel runs after the route settles; an unfilled fuel gap on a saved trip can fire 1 Nearby Search on load. |

## What fires when a stop is added to the route

**1. Routes API — only the changed legs, never the whole route** (cache keyed
`from::to::mode`, `useRouteSegments.ts:117-122`):

- Append at end → **1** call (`prev → new`)
- Insert mid-route between A and C → **2** calls (`A→new`, `new→C`); old `A→C` stays cached
- Flip a leg's `routeMode` → **1** call (mode is part of the key)
- Re-add a just-removed stop in the same position → **0** (cache hit for the tab session)

**2. Autocomplete + Place Details** — if added via the search box: typing bills
Autocomplete (per session), selecting returns Place Details fields → 1 session per stop.

**3. The auto-fuel cascade** (the one to watch):

```
Add stop ──▶ Routes (new legs) ──▶ auto-fuel sees gap ──▶ Places Nearby Search
                                                              │
                          inserted fuel stop ──▶ Routes (2 more legs) ◀──┘
```

## Cost model — users until first charge

Assumes one active user/month builds ~3 trips × ~8 stops with some edit churn. **These
numbers swing hugely with real behavior — replace them with telemetry once you have
traffic.**

| SKU | ~Calls / user / mo | Free ÷ usage = users until first charge |
|-----|-----|-----|
| Nearby Search | ~15 | 5,000 ÷ 15 ≈ **~330** |
| Routes | ~30 | 10,000 ÷ 30 ≈ **~330** |
| Autocomplete | ~24 | 10,000 ÷ 24 ≈ ~415 |
| Place Details | ~24 | 10,000 ÷ 24 ≈ ~415 |
| Map loads | ~12 | 10,000 ÷ 12 ≈ ~830 |

It's a slope, not a cliff. At **~1,000 MAU** on the same profile: Nearby Search ~$320,
Autocomplete ~$140, Place Details ~$70, map loads ~$14 → **~$500–700/month**.

## Biggest cost lever

**Auto-fuel's Nearby Search.** It's the only expensive call that fires without the user
asking. Throttling it, caching fuel-station results per region, or making it opt-in would
push the free-tier ceiling out substantially — plausibly doubling the user count served
for free.

## Sources

- [Up to 10,000 monthly free calls per product](https://mapsplatform.google.com/resources/blog/start-building-today-with-up-to-10-000-monthly-free-calls-per-product/)
- [Google Maps Platform March 2025 changes](https://developers.google.com/maps/billing-and-pricing/march-2025)
- [Core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing)
