# Unified stop cards + category-aware markers

**Date:** 2026-05-25
**Status:** Design approved, plan pending

## Problem

Stops render three different ways depending on category — fuel becomes a compact `FuelStopChip` (no body, no number, no controls), categorised non-fuel stops added through `NearbyFinder` (hotel, food, scenic, landmark, other) render as full `StopRow` cards with **no visible category cue**, and plain destinations / overnights / waypoints render as cards with just a numbered circle and no category icon at all. There is no fast way to scan a day and tell *what kind of stop* each one is.

The same inconsistency lives on the map: `makeMarkerIcon` has a binary fuel / non-fuel branch. Fuel markers swap the number for a ⛽ glyph; every other stop is an identical numbered bead.

A second, lower-visibility bug: fuel stops today are filtered out of the Google Maps deep-link URL that drives Android Auto. The user intends fuel stops to be real waypoints AA navigates to — today the UI numbers them like any other stop, but the URL strips them. The two surfaces lie to each other.

## Goal

**Every stop renders the same card shape and the same map-marker shape**, with a category-tinted identity badge on the left, the sequence number as a corner pip, and the country flag next to the title. Categorised stops use their existing emoji + tint from `PIN_CATEGORY_META`. Non-categorised stops use a "city" default — 🏙 on a neutral tint — so plain destinations / overnights / waypoints / start stops all read as cities by default.

Fuel stops become real Android Auto waypoints: counted everywhere, included in the deep-link URL.

## Scope

In scope:

- A `stopCategory` helper that resolves a stop's effective category (modern `category` field + legacy `type='fuel'` fallback).
- A `DEFAULT_STOP_META` constant for the city-default visuals.
- A shared `StopIdentityBadge` component used by both the builder `StopRow` and the viewer `DayCard`. Every stop renders this badge — no fallback to a plain numbered circle.
- Delete `FuelStopChip` and its three call sites.
- `makeMarkerIcon` becomes category-aware for *every* stop (categorised + default), with a corner number pip on every marker.
- Fuel stops become first-class Android Auto waypoints: `routableStops` no longer filters them, all three day-counters include them, the Maps deep-link URL routes through them.
- Tests for the helper, the badge component, the updated marker, and the updated deep-link behaviour.

Out of scope:

- Pin teardrop markers (`makePinIcon`) — already category-aware; nothing to change.
- PDF export — no card rendering on the server.
- The viewer / share / handoff screens beyond `DayCard` (which is in scope).

## Design

### 1. `stopCategory(stop)` helper

New helper in `client/src/lib/pin-meta.ts` (alongside `PIN_CATEGORY_META`). Resolves a stop's effective category — `category` field when set, `'fuel'` for legacy `type='fuel'` stops, otherwise `undefined`.

```ts
export function stopCategory(stop: Stop): PinCategory | undefined {
  if (stop.category) return stop.category;
  if (stop.type === 'fuel') return 'fuel';
  return undefined;
}
```

### 2. `DEFAULT_STOP_META` constant

Also in `client/src/lib/pin-meta.ts`:

```ts
/** Visual treatment for stops without an explicit category — the
 *  "city" default. Destinations, overnights, waypoints, and start
 *  stops all use this unless the user pinned a specific category. */
export const DEFAULT_STOP_META = { emoji: '🏙', tint: '#9b9080' } as const;
```

Used by both `StopIdentityBadge` and `makeMarkerIcon` so the city look stays in lockstep across card and map.

Consumers resolve the meta with the same one-liner everywhere:

```ts
const meta = category ? PIN_CATEGORY_META[category] : DEFAULT_STOP_META;
```

### 3. `StopIdentityBadge` component

New shared component at `client/src/components/StopIdentityBadge.tsx`. Two size variants:

- `card` (default, ~26×26) — builder `StopRow`.
- `compact` (~22×22) — viewer `DayCard` inline rows.

Every render is the same shape:

- Outer circle: 2px border = `dayColor(stop.dayNumber)`, fill = `meta.tint`.
- Centred emoji: `meta.emoji`.
- Corner pip at bottom-right: small disk (~14×14 card / ~12×12 compact), filled day-color, thin 1px cream outline for legibility against the ring, containing the sequence number (`index + 1`) in dark monospace.

There is no longer a "plain numbered circle" branch — every stop, including plain destinations, renders this shape. The day-color signal lives in the **ring** and the **corner pip**, not in the badge fill.

### 4. `StopRow` — use the badge

File: `client/src/components/builder/StopRow.tsx`

- Replace the inline 22×22 day-colored numbered circle (lines 126-131) with `<StopIdentityBadge stop={stop} index={index} variant="card" />`.
- Remove the half-wired `category === 'fuel'` chip next to the title (lines 135-143). The left badge now owns the category cue; a second copy next to the label would be noise.

### 5. Retire `FuelStopChip`

Delete `client/src/components/FuelStopChip.tsx`.

Update its three call sites to drop the `isFuelStop` branch and render the regular row for every stop:

- `client/src/components/builder/StopList.tsx` (line 77-101) — collapse to a single `<StopRow />`.
- `client/src/components/builder/DayColumn.tsx` (line 189-190) — same.
- `client/src/components/viewer/DayCard.tsx` (line 162-171) — drop the fuel branch; replace the inline 20×20 day-colored circle with `<StopIdentityBadge stop={stop} index={group.stops[i].index} variant="compact" />`. The rest of the inline card body (label, flag, km/duration, route-mode glyph, highlight chips, accommodation links) is unchanged.

Remove the `FuelStopChip` import from each file. The `isFuelStop` import becomes unused in these three files after section 6 below — drop those imports too as part of this section's edit.

### 6. Day-header / AA-badge stop count

Today the three places that count stops all subtract fuel:

- `client/src/components/builder/StopList.tsx:62` — day-header `stopCount`
- `client/src/components/builder/DayColumn.tsx:54` — AA badge `aaCount`
- `client/src/components/viewer/DayCard.tsx:46` — viewer's `routableCount`

All three drop the `!isFuelStop(...)` filter. Fuel now counts as a stop everywhere. The AA badge (`aaStatus`) and the "Android Auto: Ready (N/10 stops)" copy in the viewer automatically reflect this because they consume those counters.

Side-effect: a day with 9 destinations + 2 fuel stops is now flagged "over" by `aaStatus` — that's the honest signal, given the Maps URL hard limit, and the user can drop a stop or split the day to react. Today such a day silently fits; tomorrow the user sees the constraint up front.

### 7. `routableStops` — fuel is now routable

File: `client/src/lib/maps-deep-link.ts` (lines 16-20).

Today:

```ts
export function routableStops(stops: readonly Stop[]): Stop[] {
  return stops.filter((s) => !isFuelStop(s));
}
```

New:

```ts
/** Stops that count toward the Android Auto / Maps URL 10-stop limit.
 *  Every stop on the day counts — fuel stops are real AA waypoints,
 *  not planner-side hints, so they go into the URL like any other stop. */
export function routableStops(stops: readonly Stop[]): Stop[] {
  return [...stops];
}
```

The `isFuelStop` import at line 1 becomes unused — drop it. The abstraction stays so the AA-constraint comment stays attached to a single function.

Downstream: `buildDayMapsUrl` already calls `routableStops`, so the generated Google Maps URL automatically includes fuel-stop coordinates as waypoints once this function changes.

### 8. `makeMarkerIcon` — universal category-aware marker

File: `client/src/lib/google-maps.ts` (line 136).

Current signature:

```ts
export function makeMarkerIcon(num: number, ringColor = '#f3ecde', isFuel = false): google.maps.Icon
```

New signature:

```ts
export function makeMarkerIcon(num: number, ringColor: string, category?: PinCategory): google.maps.Icon
```

Behaviour (single path, no branches):

- Resolve `meta = category ? PIN_CATEGORY_META[category] : DEFAULT_STOP_META`.
- 44×44 SVG: outer ring = `ringColor` (day color), inner fill = `meta.tint`, centred emoji = `meta.emoji` at ~15px, plus a small day-colored corner disk (~r=7.5 at (34, 34)) with a 1px cream stroke containing the sequence number in 9px monospace.

Three callers pass `stopCategory(stop)` directly:

- `client/src/screens/Builder.tsx:649`
- `client/src/screens/Viewer.tsx:232`
- `client/src/screens/Share.tsx:172`

When `stopCategory(stop)` returns `undefined`, the marker uses the city default — same as the card. Card and map stay in lockstep.

## Testing

### Unit tests

New `client/src/lib/__tests__/pin-meta.test.ts`:

- `stopCategory` with `category='hotel'` → `'hotel'`
- `stopCategory` with `type='fuel'` (modern, no category) → `'fuel'`
- `stopCategory` with `type='waypoint'` + `category='fuel'` (legacy) → `'fuel'`
- `stopCategory` with `type='waypoint'`, no category → `undefined`
- `stopCategory` with `type='destination'`, no category → `undefined`
- `stopCategory` with `category='fuel' on a type='waypoint'` → `'fuel'` (legacy)
- An explicit category overrides the legacy `type='fuel'` hint (`type='fuel', category='hotel'` → `'hotel'`)

New `client/src/lib/__tests__/google-maps.test.ts`:

- No category: SVG contains the sequence number AND the 🏙 emoji (city default).
- `category='fuel'`: SVG contains ⛽ + sequence number in corner pip.
- `category='hotel'`: SVG contains 🛏 + sequence number.
- `category='food'`: SVG contains 🍴.
- Existing fuel marker tests (if any) flip accordingly.

`client/src/lib/__tests__/maps-deep-link.test.ts` — flip the four tests that today verify fuel-filtering:

- "excludes fuel stops from the directions URL" → **includes** fuel coordinates in the waypoints.
- "also excludes legacy fuel waypoints" → **also includes** legacy fuel waypoints.
- "drops first-class fuel stops" → **keeps** them.
- "drops legacy fuel waypoints" → **keeps** them.

Existing `isFuelStop` tests in `compute.test.ts` stay green — the helper itself isn't removed; only the filter call sites change.

### Component tests

New `client/src/components/__tests__/StopIdentityBadge.test.tsx`:

- Plain waypoint (no category) → city emoji 🏙 in the badge, sequence-number pip with the correct value.
- Hotel category → 🛏 in the badge, pip carries the index+1.
- Fuel category → ⛽ in the badge.
- Legacy fuel (`type='fuel'`, no category) → ⛽ in the badge.
- Food category → 🍴.
- `compact` variant still renders the category emoji.

### Manual smoke

After all tasks, in `npm run dev`:

- Plain destination "Madrid" → 🏙 badge on neutral tint, day-color ring, corner pip with the day's sequence number; 🇪🇸 flag still renders next to the title.
- Add a hotel via NearbyFinder → 🛏 on sage tint; map marker matches.
- Add a fuel stop via NearbyFinder → full card now (not the compact pill); ⛽ badge; the day-header "N stops" counter increases by 1; the AA badge counter (`/10`) increases by 1.
- Open the Maps deep link from the day header — the URL contains the fuel stop's lat/lng as a waypoint.
- Legacy trip data (`type='fuel'` stops created before issue #52) renders correctly via the `stopCategory` fallback.
- Viewer screen renders the same identity badges in the compact size.

## Definition of done

- All in-scope sections implemented.
- New + flipped unit tests pass.
- Full `npm test` green.
- `npm run build` succeeds (catches TS errors from removed imports / signature change).
- `FuelStopChip.tsx` deleted; no remaining imports.
- Manual smoke checklist above completed before commits land.
