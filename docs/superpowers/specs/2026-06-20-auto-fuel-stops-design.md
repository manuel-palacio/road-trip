# Auto-fuel stops — design

**Status:** Draft for review
**Author:** Brainstormed with Claude
**Date:** 2026-06-20

## Problem

When a user plans a road trip, the app currently flags days whose longest single leg exceeds the configured tank range, but the user still has to manually click "+ Fuel" and pick a station through the NearbyFinder modal. Three gaps in the current experience:

1. **No cumulative fuel awareness.** The longest-leg warning is per-day and per-leg. The user can't see "you've driven 387 km since your last fill-up" — only "this single leg is 547 km."
2. **Manual suggestions can be far off-route.** Today the NearbyFinder searches at the leg midpoint with a 10 km Places radius. A station 10 km perpendicular to the route is shown the same as one on the highway.
3. **No automation.** Even when the model can prove a fuel stop is needed at a specific point, the user has to drive the search themselves.

This spec covers all three as one feature called **auto-fuel**.

## Goals

- The Builder, Viewer, and Share surfaces all display **km since last fill-up** per stop / per day.
- The manual NearbyFinder filters station suggestions to within **5 km of the route polyline** (10 km when auto-add falls back).
- An **auto-add engine** reactively inserts fuel stops at "tank running low" points, with a one-click undo. Default on, per-trip opt-out toggle.
- Existing user-added fuel stops are never touched. Auto-added stops the user has edited become user-owned and are also never touched.

## Non-goals

- Real car integration (Smartcar, OBD-II, etc.). The model assumes the tank starts full at trip start, after every overnight, and after every fuel stop. A Smartcar v2 can later replace "start full" with "start at the car's actual reading."
- User-level (global) default for the toggle. Per-trip only for v1.
- Configurable refill threshold, detour budget, or undo window. All hardcoded constants for v1; trivial to surface as sliders later.

## Foundational decisions

| Decision | Choice | Rationale |
|---|---|---|
| Refill events | Trip start, overnight stops, fuel stops | Matches real driver behaviour: overnight in town implies top-off. |
| Refill threshold | Window 70–90% of `tankRangeKm` used | Driver picks a station inside this window, optimising for rating + detour. |
| Detour cap | 5 km from polyline (auto-add); 10 km (manual NearbyFinder fallback) | Highway service + nearby-town stations pass; far-off-axis stations don't. |
| Auto-add toggle scope | Per-trip, default on | Some trips want it; some don't. Lives next to `tankRangeKm` in trip details. |
| Interaction model | Silent insert + 8 s undo toast | Matches "without the user having to do that"; undo recovers from bad picks. |
| Lifecycle | `addedByAuto` flag; engine re-evaluates on edits | User edits clear the flag → stop becomes sacred. |
| No-station fallback | Red warning chip on day card; click opens NearbyFinder with 10 km cap | Honest about failure; one-click recovery. |

## Architecture

Three new modules, one new hook, four small UI changes. Server changes are limited to adding `autoFuel` to the updatable-fields allowlist.

```
client/src/lib/fuel-timeline.ts       (new)  — pure: stops → cumulative-km + gaps
client/src/lib/route-detour.ts        (new)  — pure: station → distance from polyline
client/src/lib/auto-fuel-pick.ts      (new)  — pure-ish: gap → best-station candidate
client/src/hooks/useAutoFuel.ts       (new)  — orchestration + idempotent reconciliation
client/src/components/builder/TripDetailsModal.tsx     — add Auto-fuel checkbox
client/src/components/viewer/DayCard.tsx                — fuel-remaining badge, no-station warning
client/src/components/builder/DayColumn.tsx             — fuel-remaining badge (Builder mirror)
client/src/components/StopIdentityBadge.tsx             — small `auto` glyph for addedByAuto stops
client/src/components/Toast.tsx                         — new variant: auto-fuel-undo
routes/trips.js                                          — `autoFuel` in UPDATABLE_FIELDS + validateTripField
```

The Builder is the only orchestrator. Viewer / Share consume the same `computeFuelTimeline` for the badge but never run the engine — they're read-only surfaces.

## Section 1 — Data model + fuel timeline

### Trip fields (additive)

- `autoFuel: boolean` — default `true`. Persisted. Exposed in trip details modal.
- Existing: `tankRangeKm`, `tankSizeLitres`, `fuelConsumption` continue to power downstream math. If `tankRangeKm` is unset, fall back to `DEFAULT_TANK_RANGE_KM = 500` (already in `fuel-stops.ts`).

**Backward compatibility**: existing trips have no `autoFuel` field. Client treats `autoFuel === undefined` as `true` (default-on applies retroactively). No migration script needed — the absence of the field is itself the default. The toggle UI shows checked for these trips; the first toggle interaction writes `autoFuel: true | false` explicitly.

### Stop field (additive)

- `addedByAuto?: boolean` — set on stops the engine inserts. Cleared whenever the user mutates the stop (type change, rename, reorder, highlight add/remove, manual replacement). Once cleared, the engine will never remove the stop.

### Pure module: `client/src/lib/fuel-timeline.ts`

```ts
export type FuelEvent = { stopIndex: number; kind: 'start' | 'refuel' | 'overnight' };
export type FuelGap = { afterStopIndex: number; beforeStopIndex: number; gapKm: number; legPolyline: { lat: number; lng: number }[] };
export type FuelTimeline = {
  cumulativeSinceLastFill: number[];  // length === stops.length
  events: FuelEvent[];
  gaps: FuelGap[];
};

export function computeFuelTimeline(
  stops: readonly Stop[],
  tankRangeKm: number,
): FuelTimeline;
```

**Algorithm** — single forward pass:

1. Walk `stops` in order. Track `cumKm` since the last refill event. A "refill segment" is the run of stops between two consecutive refill events (or between the last refill event and the trip end).
2. At every refill event (trip start, overnight, fuel stop), push event, reset `cumKm = 0`, record `cumulativeSinceLastFill[i] = 0`.
3. Otherwise, accumulate `cumKm += stops[i].kmFromPrevious`, write into the array.
4. When a refill segment closes (next refill event reached, or end of trip), inspect its peak cumulative. If peak > `0.9 × tankRangeKm`, record a `FuelGap`:
   - `afterStopIndex` / `beforeStopIndex` = indices of the segment's flanking refill events
   - `gapKm` = peak cumulative for the segment
   - `legPolyline` = the concatenation of `routePath` from each leg in the segment (used by the picker to identify the route point at the target km)
   - The first stop of the trip is always a refill event but has no inbound polyline; legPolyline starts at the first inbound leg after the refill.

**Decision boundary**: `isFuelStop()` from `compute.ts` is the canonical "is this a fuel stop". Both legacy (`type: waypoint + category: fuel`) and first-class (`type: fuel`) forms count.

## Section 2 — Detour filter + station picker

### Pure module: `client/src/lib/route-detour.ts`

```ts
export type DetourMeasurement = {
  detourKm: number;
  routePoint: { lat: number; lng: number };
  segmentIdx: number;
  routeKmFromStart: number;
};

export function measureDetour(
  station: { lat: number; lng: number },
  polyline: { lat: number; lng: number }[],
): DetourMeasurement;

export function pointAtRouteKm(
  polyline: { lat: number; lng: number }[],
  targetKm: number,
): { lat: number; lng: number } | null;
```

`measureDetour` projects the station onto each polyline segment using the perpendicular-foot formula in lat/lng, then takes the haversine distance to the closest projection. Degenerate segments (zero length) snap to the endpoint.

`pointAtRouteKm` accumulates segment haversine lengths until it crosses `targetKm`, linearly interpolating the final segment. Returns `null` when `targetKm > totalRouteKm` and the first vertex when `targetKm === 0`.

### Pure-ish module: `client/src/lib/auto-fuel-pick.ts`

```ts
export type StationCandidate = NearbyResult & { detourKm: number; routeKmFromStart: number };
export type PickError = { error: 'no-station' } | { error: 'places-failed' };

export async function pickFuelStation(opts: {
  gap: FuelGap;                  // carries legPolyline + boundary indices
  tankRangeKm: number;
  legStartRouteKm: number;       // km from trip start to the gap's first stop
  placesSearch: (location: LatLng, radiusMeters: number) => Promise<NearbyResult[]>;
  detourCapKm?: number;          // default 5
}): Promise<StationCandidate | PickError>;
```

**Algorithm**:

1. `targetKm = legStartRouteKm + 0.8 × tankRangeKm` (mid of the 70–90% window).
2. `targetPoint = pointAtRouteKm(gap.legPolyline, targetKm − legStartRouteKm)`. If null, target falls beyond the leg; clamp to the leg's endpoint.
3. `results = await placesSearch(targetPoint, 10_000)` — 10 km Places radius gives the picker enough candidates; the *real* filter is detour.
4. For each: compute `detourKm` via `measureDetour`. Drop > `detourCapKm`.
5. If zero pass: return `{ error: 'no-station' }`.
6. Rank by `score = detourKm − 0.5 × rating + 0.3 × abs(routeKmFromStart − targetKm) / tankRangeKm`. Lowest score wins.
7. Return the winner as `StationCandidate`.

### Places cache

Module-scoped `Map<string, NearbyResult[]>` keyed by `${roundLat}|${roundLng}|gas_station` at 0.01° (~1 km) resolution. Cleared on full page reload. Mirrors the `useRouteSegments` cache pattern.

### Manual NearbyFinder integration

`NearbyFinder.tsx` accepts a new optional prop `detourCapKm?: number` (default `10`). When present, it computes `measureDetour` on each result, drops > cap, and sorts by detour ascending instead of distance-from-midpoint. Builder passes `5` for fuel category, leaves the others undefined (which falls back to today's behaviour for food/hotel/scenic).

## Section 3 — Auto-add engine

### Hook: `client/src/hooks/useAutoFuel.ts`

```ts
export function useAutoFuel(opts: {
  enabled: boolean;
  tripId: string | null;
  stops: Stop[];
  enrichedStops: Stop[];           // post-useRouteSegments — has routePath
  tankRangeKm: number;
  maps: typeof google.maps | null;
  map: google.maps.Map | null;
  onPropose: (next: Stop[], inserted: Stop[], removed: Stop[]) => void;
  onWarning: (warnings: { dayNumber: number; gapKm: number }[]) => void;
}): { running: boolean };
```

### Trigger

`useEffect` keyed on `enabled`, `tankRangeKm`, and a stable hash of `enrichedStops` (id + lat + lng + type + addedByAuto). Debounced 600 ms via `setTimeout` cleared on each rerun.

### Reconciliation pass

```
1. If !enabled or !maps or !map, return.
2. timeline = computeFuelTimeline(enrichedStops, tankRangeKm).
3. existingAuto = enrichedStops.filter(s => s.addedByAuto === true).
4. For each gap in timeline.gaps (in parallel via Promise.all):
   - candidate = await pickFuelStation({ gap, tankRangeKm, legPolyline, legStartRouteKm, placesSearch })
   - On error 'no-station': add to warnings.
   - On error 'places-failed': console.error, no warning toast.
   - On success: hits.push({ gap, candidate }).
5. desiredAutoStops = hits.map(h => buildStopFromCandidate(h.candidate)).
   Each new stop: type='fuel', addedByAuto=true, id=crypto.randomUUID(), kmFromPrevious=0
   (useRouteSegments will fill it after splice).
6. Reconcile (match by route-km proximity within 0.15 × tankRangeKm; greedy nearest-pair when multiple candidates are within range):
   - keep   = existingAuto matched to a desired → no-op
   - remove = existingAuto with no match        → splice out via removeStopById
   - insert = desired with no match             → splice in via spliceStopAt at gap.beforeStopIndex
   - On tie (two existingAuto equidistant to a desired): keep the lower-index one, remove the other.
7. If anything changed:
   - next = applyMutations(enrichedStops, remove, insert)
   - onPropose(next, inserted, removed)
8. onWarning(warnings).
```

### Idempotency invariant

Calling the engine twice with identical inputs must produce zero proposals on the second call. Enforced by:
- Step 6's "same gap = within 15% of tank range" matching.
- The Places cache returning the same candidate for the same route point.

### User-touched detection

A helper `markUserTouched(stop: Stop): Stop` clears `addedByAuto`. Called from Builder's existing setters that mutate stop content:
- `setStopType`, `setForceDayStart`, `addHighlight`, `removeHighlight`
- The drag-reorder code in `reorder()`
- Inline rename / label edit (if/when added)

Splice / remove / insert mutators leave the flag alone — those are position changes, not user mutations of the stop itself.

### Race with `useRouteSegments`

If a gap's leg lacks `routePath`, defer — don't process that gap on this run. The hash key change when `useRouteSegments` writes back will retrigger.

### Concurrency

Request counter pattern (same as `useRouteSegments`): each run claims `myReq = ++reqRef.current`; async work checks `if (cancelled || reqRef.current !== myReq) return` before any side effect.

### Builder integration

The Builder wires `onPropose` to:
1. `setState((s) => ({ ...s, stops: next }))`.
2. Push an `auto-fuel-undo` toast with payload `{ snapshot: prevStops, count: inserted.length, label: insertedFirstStation }`.

The toast's Undo button restores `stops = snapshot`. After 8 s, the toast dismisses; undo is no longer available. If a new auto-add fires while the prior toast is still alive, replace with a combined message and reset the timer, but keep the *original* snapshot — undo restores to before the first batch.

`onWarning` updates a Builder-level state `autoFuelWarnings: Record<dayNumber, gapKm>`, consumed by DayColumn for the red warning chip.

## Section 4 — UI surfaces

### 1. Trip details modal — fuel section

New checkbox below the `tankRangeKm` field:

```
☑ Auto-fuel this trip
  Insert fuel stops where the tank would run low. You can undo each addition.
```

Disabled when `tankRangeKm` is unset, with helper text "Set tank range to enable".

### 2. Day card — fuel-remaining badge

In the existing meta row (next to the AA-readiness chip), a new chip:

```
⛽ 387/500 km since fill · 77%
```

- Green (< 70%), amber (70–90%), red (> 90%) text colour.
- Source: `timeline.cumulativeSinceLastFill[lastStopOfDay]`.
- Hides when `tankRangeKm` is unset.

Renders identically in Builder DayColumn, Viewer DayCard, and Share. The Builder and Viewer use the live computation; Share uses the same function on the persisted trip data.

### 3. Stop card — `auto` glyph

A small monospace `auto` superscript inside the `StopIdentityBadge`, only when `stop.addedByAuto === true`. Tooltip: "Added automatically — drag, rename, or edit to take ownership."

Once `addedByAuto` is cleared, the glyph disappears.

### 4. Toast — undo chip

New variant in `Toast.tsx`:

- Copy: `Added fuel stop near {stationName} · Undo` (singular) or `Added {N} fuel stops · Undo` (plural).
- Visibility: 8 s. Click Undo → restore snapshot, dismiss.
- Stacking: replace + reset timer + combine count; preserve original snapshot.

### 5. Day card — no-station warning

When `autoFuelWarnings[day]` is set:

```
⚠ No station within 5 km of the route — add manually
```

Click opens NearbyFinder for that day, pre-targeted at the gap midpoint, with `detourCapKm={10}` (wider than the auto-add cap).

## Section 5 — Testing strategy + error handling

### Unit tests (Vitest)

- **`fuel-timeline.test.ts`** — empty trip, single under-range leg, single over-range leg, multi-day under-range, multi-day with mid-trip refuel resetting the cumulative, legacy fuel stops (`type: waypoint + category: fuel`) counted.
- **`route-detour.test.ts`** — station on polyline (~0 km), station perpendicular to mid-segment, station off the endpoint (snaps to endpoint), `pointAtRouteKm(>total)` → null, `pointAtRouteKm(0)` → first vertex, mid-segment interpolation.
- **`auto-fuel-pick.test.ts`** — all within cap (highest rating wins), all over cap (`error: no-station`), `placesSearch` rejects (`error: places-failed`), tie on detour broken by rating, tie on detour + rating broken by distance from target.

### Hook test (Vitest + React Testing Library)

- **`useAutoFuel.test.tsx`** with mocked `placesSearch`:
  - `enabled: false` → no proposals.
  - Stable inputs → one proposal, then idempotent.
  - User-touched auto stop (`addedByAuto: false`) is not removed.
  - Adding a long leg triggers one insert; removing it triggers one remove.
  - Concurrent runs honour the request counter.

### Playwright e2e

- **`auto-fuel.spec.ts`** — create trip with a leg > tankRangeKm → on render, a fuel stop with `auto` glyph appears + undo toast. Click Undo → stop disappears, persists undone. Toggle Auto-fuel off → existing auto-added stops stay (now plain stops); new long-leg additions don't trigger insertions.

### Error handling

| Condition | Behaviour |
|---|---|
| `tankRangeKm` unset | Badge hides; auto-add is no-op; toggle disabled with helper text. |
| `fuelConsumption` unset | Badge still shows (km math is independent); auto-add still works. |
| Places API quota / network error | `error: places-failed` → console.error, no toast (would be noisy). |
| Save failure after auto-add | Builder's existing save-error toast; auto stop stays in local state, retries on next save. |
| Undo after a save | Restore snapshot, trigger save with restored state. Two writes, same trade-off as promote/demote. |
| Maps SDK fails to load | Hook short-circuits on `maps === null`; toggle visible but disabled with "Map unavailable". |

### Not tested

- Live Places API — always stubbed.
- Google Maps SDK loader — `maps`/`map` are props.
- Toast rendering details — covered by existing Toast tests.

## Open questions

None currently. Major decisions are locked above.

## Future work

- **Smartcar v2** — replace "tank starts full" with the car's real fuel level via Smartcar OAuth. Same auto-fuel math, real starting state.
- **Per-trip refill threshold slider** — replace the hardcoded 80% target with a user setting.
- **Per-trip detour cap slider** — replace the hardcoded 5 km with a user setting.
- **Multi-station ranking UI** — when auto-add picks one, show 2 alternates one click away ("change this stop").
- **Brand preference** — let the user pin "prefer Shell / OMV / Q8 over generic" via fuel settings.
