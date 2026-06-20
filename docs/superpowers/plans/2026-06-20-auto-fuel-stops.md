# Auto-fuel stops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-trip "auto-fuel" that (a) shows cumulative km-since-last-fill on day cards, (b) filters station suggestions to within 5 km of the route polyline, and (c) reactively inserts fuel stops where the tank would run low, with an 8-second undo.

**Architecture:** Three new pure modules (`fuel-timeline`, `route-detour`, `auto-fuel-pick`) form the math foundation. A new hook `useAutoFuel` reactively reconciles the trip's stops against the timeline's gaps — inserting fuel stops marked `addedByAuto: true`, removing prior auto-stops that are no longer needed. UI touches: a toggle in trip details, a fuel-remaining badge on day cards (Builder + Viewer + Share), a tiny `auto` glyph on auto-added stops, a new Toast variant for undo, a no-station warning chip, and a `detourCapKm` prop on the existing NearbyFinder.

**Tech Stack:** TypeScript, React 18, Vitest, React Testing Library, Playwright, Tailwind v3, Google Maps Places API.

**Spec:** `docs/superpowers/specs/2026-06-20-auto-fuel-stops-design.md`

---

## Task 1: Type additions + server validation

**Files:**
- Modify: `client/src/lib/types.ts:43` (Stop), `client/src/lib/types.ts:99` (Trip)
- Modify: `routes/trips.js:17` (UPDATABLE_FIELDS), `routes/trips.js` (validateTripField)
- Test: none yet (covered by integration in later tasks)

- [ ] **Step 1: Add `addedByAuto` to Stop type**

Open `client/src/lib/types.ts`. Inside the `Stop` type definition (around line 65 just before the closing `}`), add:

```ts
  /** True when the auto-fuel engine inserted this stop. Cleared whenever the
   * user mutates the stop (rename, reorder, type change, highlight edit).
   * Once cleared, the engine treats the stop as user-owned and never removes
   * it. Only ever set on type='fuel' stops. */
  addedByAuto?: boolean;
```

- [ ] **Step 2: Add `autoFuel` to Trip type**

In the same file, inside the `Trip` type definition just after `tankSizeLitres?: number;` (around line 129), add:

```ts
  /** Per-trip toggle for the auto-fuel engine. When true (or undefined for
   * existing trips), the engine reactively inserts fuel stops where the tank
   * would run low. Default-on retroactively applies to trips that pre-date
   * this field. */
  autoFuel?: boolean;
```

- [ ] **Step 3: Register `autoFuel` in the server UPDATABLE_FIELDS allowlist**

Open `routes/trips.js`. Find the `UPDATABLE_FIELDS` array (line 17). Add `'autoFuel'` after `'dataVersion'`:

```js
const UPDATABLE_FIELDS = [
  'name',
  'description',
  'coverEmoji',
  'startDate',
  'maxKmPerDay',
  'stops',
  'totalKm',
  'totalDays',
  'countries',
  'fuelConsumption',
  'fuelUnit',
  'fuelPrice',
  'fuelCurrency',
  'fuelOverrides',
  'tankRangeKm',
  'tankSizeLitres',
  'dataVersion',
  'autoFuel',
];
```

- [ ] **Step 4: Add a boolean check to `validateTripField`**

In `routes/trips.js`, inside `validateTripField` (the switch added in the audit commit), add a new case before the `default`:

```js
    case 'autoFuel':
      if (typeof value !== 'boolean') return { error: 'autoFuel must be a boolean' };
      return { value };
```

- [ ] **Step 5: Verify server PUT accepts the new field**

Restart the dev server. From the browser console (logged in):

```js
const tok = (await new Promise(r => indexedDB.open('firebaseLocalStorageDb').onsuccess = (e) => {
  const all = e.target.result.transaction('firebaseLocalStorage').objectStore('firebaseLocalStorage').getAll();
  all.onsuccess = () => r(all.result.find(x => x.fbase_key?.includes('authUser'))?.value?.stsTokenManager?.accessToken);
}));
const tripId = '<your-trip-id>';
const probe = (body) => fetch('/api/trips/' + tripId, { method: 'PUT', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, err: r.status >= 400 ? (await r.json()).error : null }));
console.log(await probe({ autoFuel: true }));         // expect { status: 200, err: null }
console.log(await probe({ autoFuel: 'yes' }));        // expect { status: 400, err: 'autoFuel must be a boolean' }
```

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/types.ts routes/trips.js
git commit -m "Auto-fuel: type fields + server validation

- Stop.addedByAuto and Trip.autoFuel are additive optional fields
- routes/trips.js PUT now validates autoFuel as boolean and includes
  it in UPDATABLE_FIELDS. Existing trips have undefined autoFuel which
  the client will treat as true (backward-compatible default-on)."
```

---

## Task 2: Pure module — fuel timeline

**Files:**
- Create: `client/src/lib/fuel-timeline.ts`
- Create: `client/src/lib/__tests__/fuel-timeline.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `client/src/lib/__tests__/fuel-timeline.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeFuelTimeline } from '../fuel-timeline';
import type { Stop } from '../types';

const stop = (overrides: Partial<Stop>): Stop => ({
  id: overrides.id || Math.random().toString(),
  name: overrides.name || 'Stop',
  label: overrides.label || overrides.name || 'Stop',
  lat: overrides.lat ?? 49,
  lng: overrides.lng ?? 4,
  type: overrides.type || 'waypoint',
  ...overrides,
});

describe('computeFuelTimeline', () => {
  it('returns empty arrays for an empty trip', () => {
    const r = computeFuelTimeline([], 500);
    expect(r.cumulativeSinceLastFill).toEqual([]);
    expect(r.events).toEqual([]);
    expect(r.gaps).toEqual([]);
  });

  it('records a start event for the first stop and 0 km cumulative', () => {
    const stops = [stop({ id: 'a', type: 'start' }), stop({ id: 'b', kmFromPrevious: 100 })];
    const r = computeFuelTimeline(stops, 500);
    expect(r.events[0]).toEqual({ stopIndex: 0, kind: 'start' });
    expect(r.cumulativeSinceLastFill).toEqual([0, 100]);
  });

  it('accumulates km between refill events', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', kmFromPrevious: 150 }),
      stop({ id: 'c', kmFromPrevious: 200 }),
    ];
    const r = computeFuelTimeline(stops, 500);
    expect(r.cumulativeSinceLastFill).toEqual([0, 150, 350]);
  });

  it('resets cumulative at an overnight stop', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', type: 'overnight', kmFromPrevious: 300 }),
      stop({ id: 'c', kmFromPrevious: 200 }),
    ];
    const r = computeFuelTimeline(stops, 500);
    expect(r.cumulativeSinceLastFill).toEqual([0, 0, 200]);
    expect(r.events.map(e => e.kind)).toEqual(['start', 'overnight']);
  });

  it('resets cumulative at a fuel stop (first-class type=fuel)', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', type: 'fuel', kmFromPrevious: 300 }),
      stop({ id: 'c', kmFromPrevious: 200 }),
    ];
    const r = computeFuelTimeline(stops, 500);
    expect(r.cumulativeSinceLastFill).toEqual([0, 0, 200]);
    expect(r.events.map(e => e.kind)).toEqual(['start', 'refuel']);
  });

  it('resets cumulative at a legacy fuel waypoint (type=waypoint + category=fuel)', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', type: 'waypoint', category: 'fuel', kmFromPrevious: 300 }),
      stop({ id: 'c', kmFromPrevious: 200 }),
    ];
    const r = computeFuelTimeline(stops, 500);
    expect(r.cumulativeSinceLastFill).toEqual([0, 0, 200]);
    expect(r.events[1].kind).toBe('refuel');
  });

  it('records no gap when peak cumulative is under 90% of tank range', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', kmFromPrevious: 400 }),
      stop({ id: 'c', type: 'destination', kmFromPrevious: 40 }),
    ];
    expect(computeFuelTimeline(stops, 500).gaps).toEqual([]);
  });

  it('records a gap when peak cumulative exceeds 90% of tank range', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', kmFromPrevious: 400, routePath: [{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }] }),
      stop({ id: 'c', type: 'destination', kmFromPrevious: 100, routePath: [{ lat: 1, lng: 0 }, { lat: 2, lng: 0 }] }),
    ];
    const r = computeFuelTimeline(stops, 500);
    expect(r.gaps.length).toBe(1);
    expect(r.gaps[0].gapKm).toBe(500);
    expect(r.gaps[0].afterStopIndex).toBe(0);
    expect(r.gaps[0].beforeStopIndex).toBe(2);
    expect(r.gaps[0].legPolyline.length).toBeGreaterThan(0);
  });

  it('treats overnight as a refill — second day under range produces no gap', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', type: 'overnight', kmFromPrevious: 480 }),
      stop({ id: 'c', type: 'destination', kmFromPrevious: 480 }),
    ];
    expect(computeFuelTimeline(stops, 500).gaps).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run client/src/lib/__tests__/fuel-timeline.test.ts
```

Expected: `Error: Failed to resolve import "../fuel-timeline"`.

- [ ] **Step 3: Create the module**

Create `client/src/lib/fuel-timeline.ts`:

```ts
import { isFuelStop } from './compute';
import type { Stop } from './types';

export type FuelEvent = { stopIndex: number; kind: 'start' | 'refuel' | 'overnight' };

export type FuelGap = {
  afterStopIndex: number;
  beforeStopIndex: number;
  gapKm: number;
  legPolyline: { lat: number; lng: number }[];
};

export type FuelTimeline = {
  cumulativeSinceLastFill: number[];
  events: FuelEvent[];
  gaps: FuelGap[];
};

const REFILL_THRESHOLD = 0.9;

function isRefillEvent(stop: Stop, index: number): { isEvent: true; kind: FuelEvent['kind'] } | { isEvent: false } {
  if (index === 0) return { isEvent: true, kind: 'start' };
  if (stop.type === 'overnight') return { isEvent: true, kind: 'overnight' };
  if (isFuelStop(stop)) return { isEvent: true, kind: 'refuel' };
  return { isEvent: false };
}

/** Walk stops forward, reset cumulative km at each refill event (trip start,
 * overnight, fuel stop), record gaps where the segment between two refill
 * events would have driven > 90% of `tankRangeKm` on a single tank.
 * Pure; no allocations beyond the returned object. */
export function computeFuelTimeline(stops: readonly Stop[], tankRangeKm: number): FuelTimeline {
  const cumulativeSinceLastFill: number[] = [];
  const events: FuelEvent[] = [];
  const gaps: FuelGap[] = [];

  let cumKm = 0;
  let segPeak = 0;
  let segStartIndex = 0;
  let segPolyline: { lat: number; lng: number }[] = [];

  function closeSegment(endIndex: number) {
    if (segPeak > REFILL_THRESHOLD * tankRangeKm && segPolyline.length >= 2) {
      gaps.push({
        afterStopIndex: segStartIndex,
        beforeStopIndex: endIndex,
        gapKm: segPeak,
        legPolyline: segPolyline,
      });
    }
  }

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const ev = isRefillEvent(s, i);
    if (ev.isEvent) {
      closeSegment(i);
      events.push({ stopIndex: i, kind: ev.kind });
      cumulativeSinceLastFill.push(0);
      cumKm = 0;
      segPeak = 0;
      segStartIndex = i;
      segPolyline = [];
      continue;
    }
    const legKm = s.kmFromPrevious || 0;
    cumKm += legKm;
    cumulativeSinceLastFill.push(cumKm);
    if (cumKm > segPeak) segPeak = cumKm;
    if (s.routePath && s.routePath.length >= 2) {
      // Concatenate this leg's polyline. Skip the first vertex if the prior
      // leg ended at the same point (continuity), otherwise include all.
      const last = segPolyline.length ? segPolyline[segPolyline.length - 1] : null;
      const first = s.routePath[0];
      const start = last && Math.abs(last.lat - first.lat) < 1e-6 && Math.abs(last.lng - first.lng) < 1e-6 ? 1 : 0;
      for (let j = start; j < s.routePath.length; j++) segPolyline.push(s.routePath[j]);
    }
  }
  closeSegment(stops.length - 1);

  return { cumulativeSinceLastFill, events, gaps };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run client/src/lib/__tests__/fuel-timeline.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/fuel-timeline.ts client/src/lib/__tests__/fuel-timeline.test.ts
git commit -m "Auto-fuel: computeFuelTimeline pure module

Walks stops forward, resets cumulative km at every refill event (trip
start, overnight, fuel stop), records FuelGap entries for segments whose
peak cumulative exceeds 90% of tankRangeKm. legPolyline is concatenated
from each leg's routePath."
```

---

## Task 3: Pure module — route detour geometry

**Files:**
- Create: `client/src/lib/route-detour.ts`
- Create: `client/src/lib/__tests__/route-detour.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `client/src/lib/__tests__/route-detour.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { measureDetour, pointAtRouteKm } from '../route-detour';

const polyline = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 1 },
  { lat: 0, lng: 2 },
];

describe('measureDetour', () => {
  it('reports near-zero detour for a station on the polyline', () => {
    const r = measureDetour({ lat: 0, lng: 0.5 }, polyline);
    expect(r.detourKm).toBeLessThan(0.5);
    expect(r.segmentIdx).toBe(0);
  });

  it('reports a non-zero detour for a station perpendicular to a mid-segment', () => {
    const r = measureDetour({ lat: 0.05, lng: 0.5 }, polyline);
    expect(r.detourKm).toBeGreaterThan(1);
    expect(r.detourKm).toBeLessThan(10);
    expect(r.segmentIdx).toBe(0);
  });

  it('snaps to the start endpoint when the station projects before the polyline', () => {
    const r = measureDetour({ lat: 0, lng: -1 }, polyline);
    expect(r.routePoint).toEqual({ lat: 0, lng: 0 });
  });

  it('snaps to the end endpoint when the station projects past the polyline', () => {
    const r = measureDetour({ lat: 0, lng: 3 }, polyline);
    expect(r.routePoint).toEqual({ lat: 0, lng: 2 });
  });

  it('reports cumulative km from start to the projected point', () => {
    const r = measureDetour({ lat: 0, lng: 1.5 }, polyline);
    expect(r.routeKmFromStart).toBeGreaterThan(100);
    expect(r.routeKmFromStart).toBeLessThan(250);
  });
});

describe('pointAtRouteKm', () => {
  it('returns the first vertex when targetKm is 0', () => {
    expect(pointAtRouteKm(polyline, 0)).toEqual({ lat: 0, lng: 0 });
  });

  it('returns null when targetKm exceeds the total polyline length', () => {
    expect(pointAtRouteKm(polyline, 100000)).toBeNull();
  });

  it('interpolates a point mid-segment', () => {
    // ~111 km per degree at the equator; first segment is ~111 km
    const p = pointAtRouteKm(polyline, 55);
    expect(p).not.toBeNull();
    expect(p!.lat).toBeCloseTo(0, 4);
    expect(p!.lng).toBeGreaterThan(0.3);
    expect(p!.lng).toBeLessThan(0.7);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run client/src/lib/__tests__/route-detour.test.ts
```

Expected: `Failed to resolve import "../route-detour"`.

- [ ] **Step 3: Create the module**

Create `client/src/lib/route-detour.ts`:

```ts
type LatLng = { lat: number; lng: number };

export type DetourMeasurement = {
  detourKm: number;
  routePoint: LatLng;
  segmentIdx: number;
  routeKmFromStart: number;
};

const EARTH_KM = 6371;

function toRad(deg: number) { return (deg * Math.PI) / 180; }

function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(sa)));
}

/** Closest-point projection of `p` onto the segment `a → b` in an equirectangular
 * approximation (good enough for road-trip-scale polylines; bias is well under
 * the 5 km detour cap at temperate latitudes). Returns the projected point and
 * the parametric t in [0,1] along the segment. */
function projectOntoSegment(p: LatLng, a: LatLng, b: LatLng): { point: LatLng; t: number } {
  const ax = a.lng, ay = a.lat;
  const bx = b.lng, by = b.lat;
  const px = p.lng, py = p.lat;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: a, t: 0 };
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return { point: { lat: ay + dy * t, lng: ax + dx * t }, t };
}

export function measureDetour(station: LatLng, polyline: readonly LatLng[]): DetourMeasurement {
  if (polyline.length === 0) {
    return { detourKm: Infinity, routePoint: station, segmentIdx: -1, routeKmFromStart: 0 };
  }
  let best: DetourMeasurement = {
    detourKm: Infinity,
    routePoint: polyline[0],
    segmentIdx: 0,
    routeKmFromStart: 0,
  };
  let cumKm = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const { point, t } = projectOntoSegment(station, a, b);
    const detour = haversineKm(station, point);
    if (detour < best.detourKm) {
      const segLen = haversineKm(a, b);
      best = {
        detourKm: detour,
        routePoint: point,
        segmentIdx: i,
        routeKmFromStart: cumKm + segLen * t,
      };
    }
    cumKm += haversineKm(a, b);
  }
  return best;
}

export function pointAtRouteKm(polyline: readonly LatLng[], targetKm: number): LatLng | null {
  if (polyline.length === 0) return null;
  if (targetKm <= 0) return polyline[0];
  let cumKm = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const segLen = haversineKm(a, b);
    if (cumKm + segLen >= targetKm) {
      const t = segLen === 0 ? 0 : (targetKm - cumKm) / segLen;
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    cumKm += segLen;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run client/src/lib/__tests__/route-detour.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/route-detour.ts client/src/lib/__tests__/route-detour.test.ts
git commit -m "Auto-fuel: route-detour geometry helpers

measureDetour projects a station onto the polyline and returns the
detour distance + the snapped route point. pointAtRouteKm walks the
polyline accumulating segment lengths and interpolates the LatLng at a
target km. Pure, Vitest-tested without Maps SDK."
```

---

## Task 4: Pure module — auto-fuel station picker

**Files:**
- Create: `client/src/lib/auto-fuel-pick.ts`
- Create: `client/src/lib/__tests__/auto-fuel-pick.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `client/src/lib/__tests__/auto-fuel-pick.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pickFuelStation } from '../auto-fuel-pick';
import type { FuelGap } from '../fuel-timeline';
import type { NearbyResult } from '../../components/builder/NearbyFinder';

const polyline = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 1 },
  { lat: 0, lng: 2 },
  { lat: 0, lng: 3 },
  { lat: 0, lng: 4 },
  { lat: 0, lng: 5 },
];

const gap = (over: Partial<FuelGap> = {}): FuelGap => ({
  afterStopIndex: 0,
  beforeStopIndex: 5,
  gapKm: 600,
  legPolyline: polyline,
  ...over,
});

const station = (over: Partial<NearbyResult>): NearbyResult => ({
  placeId: over.placeId || Math.random().toString(),
  name: over.name || 'Station',
  vicinity: over.vicinity || '',
  rating: over.rating,
  lat: over.lat ?? 0,
  lng: over.lng ?? 0,
});

describe('pickFuelStation', () => {
  it('returns no-station when zero results pass the detour cap', async () => {
    const placesSearch = async () => [station({ lat: 1, lng: 2.5 })]; // ~111 km off
    const r = await pickFuelStation({ gap: gap(), tankRangeKm: 500, legStartRouteKm: 0, placesSearch, detourCapKm: 5 });
    expect(r).toEqual({ error: 'no-station' });
  });

  it('returns places-failed when placesSearch rejects', async () => {
    const placesSearch = async () => { throw new Error('quota'); };
    const r = await pickFuelStation({ gap: gap(), tankRangeKm: 500, legStartRouteKm: 0, placesSearch });
    expect(r).toEqual({ error: 'places-failed' });
  });

  it('picks the highest-rated of multiple in-cap candidates near target', async () => {
    // tankRangeKm 500 → target 0.8*500 = 400 km from gap start (~lng 3.6)
    const placesSearch = async () => [
      station({ placeId: 'A', lat: 0.005, lng: 3.6, rating: 3.0 }),
      station({ placeId: 'B', lat: 0.005, lng: 3.6, rating: 4.8 }),
      station({ placeId: 'C', lat: 0.005, lng: 3.6, rating: 4.0 }),
    ];
    const r = await pickFuelStation({ gap: gap(), tankRangeKm: 500, legStartRouteKm: 0, placesSearch, detourCapKm: 5 });
    expect('placeId' in r && r.placeId).toBe('B');
  });

  it('prefers a closer detour over a slightly higher rating', async () => {
    const placesSearch = async () => [
      station({ placeId: 'CLOSE', lat: 0.002, lng: 3.6, rating: 4.0 }),
      station({ placeId: 'FAR',   lat: 0.04,  lng: 3.6, rating: 4.4 }),
    ];
    const r = await pickFuelStation({ gap: gap(), tankRangeKm: 500, legStartRouteKm: 0, placesSearch, detourCapKm: 5 });
    expect('placeId' in r && r.placeId).toBe('CLOSE');
  });

  it('clamps target to the leg endpoint when the leg is shorter than the target km', async () => {
    // Short polyline: ~111 km total. tankRangeKm 500 → target 400 km — past the end.
    const shortPolyline = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
    const placesSearch = async (loc: { lat: number; lng: number }) => {
      // The picker should clamp to (0, 1); return a station near there.
      return [station({ placeId: 'END', lat: loc.lat, lng: loc.lng, rating: 4.0 })];
    };
    const r = await pickFuelStation({
      gap: { ...gap(), legPolyline: shortPolyline, beforeStopIndex: 1, gapKm: 600 },
      tankRangeKm: 500,
      legStartRouteKm: 0,
      placesSearch,
      detourCapKm: 5,
    });
    expect('placeId' in r && r.placeId).toBe('END');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run client/src/lib/__tests__/auto-fuel-pick.test.ts
```

Expected: `Failed to resolve import "../auto-fuel-pick"`.

- [ ] **Step 3: Create the module**

Create `client/src/lib/auto-fuel-pick.ts`:

```ts
import type { NearbyResult } from '../components/builder/NearbyFinder';
import type { FuelGap } from './fuel-timeline';
import { measureDetour, pointAtRouteKm } from './route-detour';

type LatLng = { lat: number; lng: number };

export type StationCandidate = NearbyResult & {
  detourKm: number;
  routeKmFromStart: number;
};

export type PickError = { error: 'no-station' } | { error: 'places-failed' };

export type PlacesSearchFn = (location: LatLng, radiusMeters: number) => Promise<NearbyResult[]>;

const DEFAULT_DETOUR_CAP_KM = 5;
const TARGET_FRACTION_OF_TANK = 0.8;
const PLACES_SEARCH_RADIUS_M = 10_000;

/** Pick the best gas station for an auto-fuel gap. Returns the candidate or
 * a tagged error. `placesSearch` is injected so tests and the live caller
 * can supply their own (PlacesService wrapper, mock, etc.). */
export async function pickFuelStation(opts: {
  gap: FuelGap;
  tankRangeKm: number;
  legStartRouteKm: number;
  placesSearch: PlacesSearchFn;
  detourCapKm?: number;
}): Promise<StationCandidate | PickError> {
  const detourCap = opts.detourCapKm ?? DEFAULT_DETOUR_CAP_KM;
  const targetWithinLeg = TARGET_FRACTION_OF_TANK * opts.tankRangeKm;
  const targetPoint =
    pointAtRouteKm(opts.gap.legPolyline, targetWithinLeg) ??
    opts.gap.legPolyline[opts.gap.legPolyline.length - 1];

  let raw: NearbyResult[];
  try {
    raw = await opts.placesSearch(targetPoint, PLACES_SEARCH_RADIUS_M);
  } catch {
    return { error: 'places-failed' };
  }

  const candidates: StationCandidate[] = [];
  for (const r of raw) {
    const m = measureDetour({ lat: r.lat, lng: r.lng }, opts.gap.legPolyline);
    if (m.detourKm > detourCap) continue;
    candidates.push({ ...r, detourKm: m.detourKm, routeKmFromStart: m.routeKmFromStart });
  }
  if (candidates.length === 0) return { error: 'no-station' };

  // Score: lower is better. Detour dominates; rating pulls the score down;
  // distance from the target km gently disambiguates near-ties.
  const score = (c: StationCandidate) =>
    c.detourKm
    - 0.5 * (c.rating ?? 0)
    + 0.3 * Math.abs(c.routeKmFromStart - targetWithinLeg) / opts.tankRangeKm;

  candidates.sort((a, b) => score(a) - score(b));
  return candidates[0];
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run client/src/lib/__tests__/auto-fuel-pick.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/auto-fuel-pick.ts client/src/lib/__tests__/auto-fuel-pick.test.ts
git commit -m "Auto-fuel: pickFuelStation picker

Targets 80% of tankRangeKm into the gap, runs an injected placesSearch
at that route point, filters by 5 km detour cap, ranks by detour −
0.5×rating + 0.3×abs(routeKm−target)/tankRange. Returns the winner or
a tagged error ('no-station' | 'places-failed')."
```

---

## Task 5: Hook — useAutoFuel

**Files:**
- Create: `client/src/hooks/useAutoFuel.ts`
- Create: `client/src/hooks/__tests__/useAutoFuel.test.tsx`

- [ ] **Step 1: Write the failing hook tests**

Create `client/src/hooks/__tests__/useAutoFuel.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAutoFuel } from '../useAutoFuel';
import type { Stop } from '../../lib/types';
import type { PlacesSearchFn } from '../../lib/auto-fuel-pick';

const polyline = [
  { lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 },
  { lat: 0, lng: 3 }, { lat: 0, lng: 4 }, { lat: 0, lng: 5 },
];

const stop = (over: Partial<Stop>): Stop => ({
  id: over.id || Math.random().toString(),
  name: over.name || 'S',
  label: over.label || 'S',
  lat: over.lat ?? 0,
  lng: over.lng ?? 0,
  type: over.type || 'waypoint',
  ...over,
});

function tripWithLongLeg(): Stop[] {
  return [
    stop({ id: 'a', type: 'start' }),
    stop({ id: 'b', type: 'destination', kmFromPrevious: 600, routePath: polyline }),
  ];
}

const placesSearch: PlacesSearchFn = async () => [
  { placeId: 'P1', name: 'Pumps R Us', vicinity: '', rating: 4.5, lat: 0.001, lng: 3.6 },
];

describe('useAutoFuel', () => {
  it('does not propose when enabled is false', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    renderHook(() => useAutoFuel({
      enabled: false, tripId: 't', stops: tripWithLongLeg(), enrichedStops: tripWithLongLeg(),
      tankRangeKm: 500, placesSearch, onPropose, onWarning,
    }));
    await new Promise(r => setTimeout(r, 700));
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('proposes one insertion for a single long-leg gap', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    renderHook(() => useAutoFuel({
      enabled: true, tripId: 't', stops: tripWithLongLeg(), enrichedStops: tripWithLongLeg(),
      tankRangeKm: 500, placesSearch, onPropose, onWarning,
    }));
    await act(() => new Promise(r => setTimeout(r, 800)));
    expect(onPropose).toHaveBeenCalledTimes(1);
    const [next, inserted, removed] = onPropose.mock.calls[0];
    expect(inserted.length).toBe(1);
    expect(inserted[0].type).toBe('fuel');
    expect(inserted[0].addedByAuto).toBe(true);
    expect(removed.length).toBe(0);
    expect(next.length).toBe(3);
  });

  it('is idempotent on re-render with the same stops', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    const stops = tripWithLongLeg();
    const { rerender } = renderHook(({ s }) => useAutoFuel({
      enabled: true, tripId: 't', stops: s, enrichedStops: s,
      tankRangeKm: 500, placesSearch, onPropose, onWarning,
    }), { initialProps: { s: stops } });
    await act(() => new Promise(r => setTimeout(r, 800)));
    onPropose.mockClear();

    // Pretend the parent applied the proposal; the new stops include the auto stop.
    const withAuto: Stop[] = [
      stops[0],
      { ...stop({ id: 'auto1', type: 'fuel', addedByAuto: true, kmFromPrevious: 300, routePath: polyline.slice(0, 3) }) },
      { ...stops[1], kmFromPrevious: 300, routePath: polyline.slice(2) },
    ];
    rerender({ s: withAuto });
    await act(() => new Promise(r => setTimeout(r, 800)));
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('removes an obsolete auto stop when the trip no longer has a gap', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    const withAutoNoGap: Stop[] = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'auto1', type: 'fuel', addedByAuto: true, kmFromPrevious: 100, routePath: polyline.slice(0, 2) }),
      stop({ id: 'b', type: 'destination', kmFromPrevious: 100, routePath: polyline.slice(1, 3) }),
    ];
    renderHook(() => useAutoFuel({
      enabled: true, tripId: 't', stops: withAutoNoGap, enrichedStops: withAutoNoGap,
      tankRangeKm: 500, placesSearch, onPropose, onWarning,
    }));
    await act(() => new Promise(r => setTimeout(r, 800)));
    expect(onPropose).toHaveBeenCalledTimes(1);
    const [, inserted, removed] = onPropose.mock.calls[0];
    expect(removed.map(r => r.id)).toEqual(['auto1']);
    expect(inserted.length).toBe(0);
  });

  it('does not remove a user-touched fuel stop (addedByAuto: false)', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    const userOwned: Stop[] = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'user1', type: 'fuel', addedByAuto: false, kmFromPrevious: 100, routePath: polyline.slice(0, 2) }),
      stop({ id: 'b', type: 'destination', kmFromPrevious: 100, routePath: polyline.slice(1, 3) }),
    ];
    renderHook(() => useAutoFuel({
      enabled: true, tripId: 't', stops: userOwned, enrichedStops: userOwned,
      tankRangeKm: 500, placesSearch, onPropose, onWarning,
    }));
    await act(() => new Promise(r => setTimeout(r, 800)));
    expect(onPropose).not.toHaveBeenCalled();
  });

  it('emits a warning when no station passes the detour cap', async () => {
    const onPropose = vi.fn();
    const onWarning = vi.fn();
    const noStation: PlacesSearchFn = async () => [{ placeId: 'F', name: '', vicinity: '', lat: 1, lng: 3.6 }];
    renderHook(() => useAutoFuel({
      enabled: true, tripId: 't', stops: tripWithLongLeg(), enrichedStops: tripWithLongLeg(),
      tankRangeKm: 500, placesSearch: noStation, onPropose, onWarning,
    }));
    await act(() => new Promise(r => setTimeout(r, 800)));
    expect(onWarning).toHaveBeenCalled();
    expect(onWarning.mock.calls[0][0][0].gapKm).toBeGreaterThan(450);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run client/src/hooks/__tests__/useAutoFuel.test.tsx
```

Expected: `Failed to resolve import "../useAutoFuel"`.

- [ ] **Step 3: Create the hook**

Create `client/src/hooks/useAutoFuel.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { computeFuelTimeline } from '../lib/fuel-timeline';
import { pickFuelStation, type PlacesSearchFn } from '../lib/auto-fuel-pick';
import { spliceStopAt, removeStopById } from '../lib/stop-ops';
import { isFuelStop } from '../lib/compute';
import type { Stop } from '../lib/types';

const DEBOUNCE_MS = 600;
const SAME_GAP_TOLERANCE = 0.15;

type Warning = { dayNumber: number; gapKm: number };

type Args = {
  enabled: boolean;
  tripId: string | null;
  stops: Stop[];
  enrichedStops: Stop[];
  tankRangeKm: number;
  placesSearch: PlacesSearchFn | null;
  onPropose: (next: Stop[], inserted: Stop[], removed: Stop[]) => void;
  onWarning: (warnings: Warning[]) => void;
};

function hashStops(stops: readonly Stop[]): string {
  return stops.map(s => `${s.id}|${s.lat.toFixed(5)}|${s.lng.toFixed(5)}|${s.type}|${s.addedByAuto ? 1 : 0}`).join('::');
}

function newRouteKmAt(stops: readonly Stop[], targetIdx: number): number {
  let cum = 0;
  for (let i = 1; i <= targetIdx; i++) cum += stops[i].kmFromPrevious || 0;
  return cum;
}

export function useAutoFuel(args: Args): { running: boolean } {
  const [running, setRunning] = useState(false);
  const reqRef = useRef(0);
  const hash = hashStops(args.enrichedStops);

  useEffect(() => {
    if (!args.enabled || !args.placesSearch) return;
    if (args.enrichedStops.length < 2) return;
    if (!(args.tankRangeKm > 0)) return;

    const myReq = ++reqRef.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setRunning(true);
      try {
        const timeline = computeFuelTimeline(args.enrichedStops, args.tankRangeKm);
        const existingAuto = args.enrichedStops
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => isFuelStop(s) && s.addedByAuto === true);

        const proposals = await Promise.all(
          timeline.gaps.map(async (gap) => {
            const legStartRouteKm = newRouteKmAt(args.enrichedStops, gap.afterStopIndex);
            const result = await pickFuelStation({
              gap,
              tankRangeKm: args.tankRangeKm,
              legStartRouteKm,
              placesSearch: args.placesSearch!,
            });
            if ('error' in result) {
              return { gap, error: result.error, candidate: null };
            }
            return { gap, error: null, candidate: result };
          })
        );

        if (cancelled || reqRef.current !== myReq) return;

        const warnings: Warning[] = proposals
          .filter(p => p.error === 'no-station')
          .map(p => ({ dayNumber: args.enrichedStops[p.gap.beforeStopIndex].dayNumber || 0, gapKm: p.gap.gapKm }));
        args.onWarning(warnings);

        const hits = proposals.filter(p => p.candidate !== null) as Array<{ gap: typeof proposals[number]['gap']; candidate: NonNullable<typeof proposals[number]['candidate']> }>;

        // Reconcile by route-km proximity.
        const tolerance = SAME_GAP_TOLERANCE * args.tankRangeKm;
        const matchedAutoIds = new Set<string>();
        const insertions: { gap: typeof hits[number]['gap']; candidate: typeof hits[number]['candidate'] }[] = [];
        for (const h of hits) {
          const legStartRouteKm = newRouteKmAt(args.enrichedStops, h.gap.afterStopIndex);
          const desiredRouteKm = legStartRouteKm + h.candidate.routeKmFromStart;
          const match = existingAuto.find(({ s, i }) => {
            if (matchedAutoIds.has(s.id)) return false;
            const existingRouteKm = newRouteKmAt(args.enrichedStops, i);
            return Math.abs(existingRouteKm - desiredRouteKm) <= tolerance;
          });
          if (match) {
            matchedAutoIds.add(match.s.id);
          } else {
            insertions.push(h);
          }
        }
        const removals = existingAuto
          .filter(({ s }) => !matchedAutoIds.has(s.id))
          .map(({ s }) => s);

        if (insertions.length === 0 && removals.length === 0) return;

        // Apply removals first (descending index), then insertions (sorted by
        // beforeStopIndex ascending so later splices don't shift earlier ones).
        let next = [...args.enrichedStops];
        for (const r of removals) next = removeStopById(next, r.id);

        const insertSorted = [...insertions].sort((a, b) => a.gap.beforeStopIndex - b.gap.beforeStopIndex);
        const insertedStops: Stop[] = [];
        for (const ins of insertSorted) {
          const newStop: Stop = {
            id: crypto.randomUUID(),
            name: ins.candidate.name,
            label: ins.candidate.name,
            lat: ins.candidate.lat,
            lng: ins.candidate.lng,
            type: 'fuel',
            category: 'fuel',
            addedByAuto: true,
            kmFromPrevious: 0,
            highlights: [],
          };
          // The gap's beforeStopIndex was computed against the original array;
          // re-resolve by stop id so prior removals don't shift it incorrectly.
          const targetId = args.enrichedStops[ins.gap.beforeStopIndex]?.id;
          const insertAt = targetId ? next.findIndex(s => s.id === targetId) : next.length;
          next = spliceStopAt(next, insertAt >= 0 ? insertAt : next.length, newStop);
          insertedStops.push(newStop);
        }

        if (cancelled || reqRef.current !== myReq) return;
        args.onPropose(next, insertedStops, removals);
      } finally {
        if (!cancelled && reqRef.current === myReq) setRunning(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // hash captures the meaningful identity of enrichedStops without
    // triggering on referentially-fresh-but-equal arrays
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.enabled, args.tankRangeKm, hash, args.placesSearch]);

  return { running };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run client/src/hooks/__tests__/useAutoFuel.test.tsx
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useAutoFuel.ts client/src/hooks/__tests__/useAutoFuel.test.tsx
git commit -m "Auto-fuel: useAutoFuel hook

Debounced (600ms), idempotent reconciliation: compute timeline, run
pickFuelStation for each gap, match against existing addedByAuto stops
by route-km proximity (15% of tank range). Inserts/removes only the
delta; never touches user-owned fuel stops; emits warnings when a gap
has no station within the detour cap. Request-counter cancellation
matches useRouteSegments pattern."
```

---

## Task 6: Toast — auto-fuel undo variant

**Files:**
- Modify: `client/src/components/Toast.tsx`

- [ ] **Step 1: Read the current Toast component**

```bash
sed -n '1,50p' client/src/components/Toast.tsx
```

Note the current `variant` union and `actionLabel`/`onAction` pattern (or lack of). If actions aren't supported, add them.

- [ ] **Step 2: Extend the Toast component**

Edit `client/src/components/Toast.tsx`. Add `'auto-fuel'` to the variant union and an optional action button:

```tsx
type Props = {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
  variant?: 'accent' | 'success' | 'auto-fuel';
  actionLabel?: string;
  onAction?: () => void;
};

export function Toast({ message, onDismiss, durationMs = 4500, variant = 'accent', actionLabel, onAction }: Props) {
  // … existing timer logic …
  const bg =
    variant === 'success' ? 'bg-emerald-700/90 border-emerald-400/40' :
    variant === 'auto-fuel' ? 'bg-canvas-strong border-line-strong' :
    'bg-accent/90 border-accent';
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg border ${bg} text-paper text-[13px] flex items-center gap-3`}>
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-paper underline underline-offset-2 hover:text-accent transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

(Adapt to the existing structure — match the surrounding style of the file. The exact class names above assume Tailwind tokens already in use; if a token is missing, use the closest existing one rather than adding new ones.)

- [ ] **Step 3: Verify the Toast still renders existing variants**

Run the existing tests if any cover Toast; otherwise visually verify by opening any screen that emits a success toast.

```bash
npm test
```

Expected: 320 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Toast.tsx
git commit -m "Toast: add auto-fuel variant with optional action button

Adds 'auto-fuel' to the variant union plus actionLabel/onAction props so
the auto-fuel hook can show an undo chip. Existing usages are
untouched (variant defaults to 'accent', action props are optional)."
```

---

## Task 7: StopIdentityBadge — small `auto` glyph

**Files:**
- Modify: `client/src/components/StopIdentityBadge.tsx`
- Modify: `client/src/components/__tests__/StopIdentityBadge.test.tsx`

- [ ] **Step 1: Add the failing test**

Open `client/src/components/__tests__/StopIdentityBadge.test.tsx`. Add a test block after the existing tests:

```tsx
import { render } from '@testing-library/react';
// import already exists; reuse

describe('addedByAuto glyph', () => {
  it('renders a small "auto" marker when stop.addedByAuto is true', () => {
    const stop = { id: 's', name: 'Gas', label: 'Gas', lat: 0, lng: 0, type: 'fuel' as const, addedByAuto: true };
    const { container } = render(<StopIdentityBadge stop={stop} index={1} variant="card" />);
    expect(container.textContent).toMatch(/auto/i);
  });

  it('does NOT render the "auto" marker when addedByAuto is false or absent', () => {
    const stop = { id: 's', name: 'Gas', label: 'Gas', lat: 0, lng: 0, type: 'fuel' as const };
    const { container } = render(<StopIdentityBadge stop={stop} index={1} variant="card" />);
    expect(container.textContent).not.toMatch(/auto/i);
  });
});
```

- [ ] **Step 2: Run the test to confirm failure**

```bash
npx vitest run client/src/components/__tests__/StopIdentityBadge.test.tsx
```

Expected: 2 new tests fail.

- [ ] **Step 3: Add the glyph to the component**

Open `client/src/components/StopIdentityBadge.tsx`. Inside the rendered JSX, add a tiny mono superscript when `stop.addedByAuto`:

```tsx
{stop.addedByAuto && (
  <span
    className="font-mono text-[8px] tracking-[0.12em] uppercase text-paper-muted ml-0.5"
    title="Added automatically — drag, rename, or edit to take ownership."
  >
    auto
  </span>
)}
```

Place it inside the badge's text container, immediately after the sequence number. Don't change layout for other stops.

- [ ] **Step 4: Run the tests**

```bash
npx vitest run client/src/components/__tests__/StopIdentityBadge.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/StopIdentityBadge.tsx client/src/components/__tests__/StopIdentityBadge.test.tsx
git commit -m "StopIdentityBadge: 'auto' marker for addedByAuto stops

Tiny mono superscript inside the badge when stop.addedByAuto === true,
tooltip explains user takes ownership by editing. Absent for user-added
stops and for stops the user has touched (addedByAuto cleared)."
```

---

## Task 8: NearbyFinder — detourCapKm prop

**Files:**
- Modify: `client/src/components/builder/NearbyFinder.tsx`
- Modify: `client/src/components/builder/__tests__/NearbyFinder.test.tsx`

- [ ] **Step 1: Add a failing test**

First read the top of `client/src/components/builder/__tests__/NearbyFinder.test.tsx` to copy its existing `maps` / `map` mock-builder pattern. Then add a new test block to the file:

```tsx
it('filters out results beyond detourCapKm when given a legPolyline', async () => {
  // legPolyline along the equator from (0,0) to (0,5). Stations at lat 0.005
  // are ~0.5 km off-route (pass 5 km cap); station at lat 0.1 is ~11 km off (fails).
  const legPolyline = [{ lat: 0, lng: 0 }, { lat: 0, lng: 2 }, { lat: 0, lng: 5 }];
  const stations = [
    { place_id: 'NEAR_A', name: 'Near A', vicinity: '', geometry: { location: { lat: () => 0.005, lng: () => 1 } } },
    { place_id: 'NEAR_B', name: 'Near B', vicinity: '', geometry: { location: { lat: () => 0.005, lng: () => 3 } } },
    { place_id: 'FAR',    name: 'Far',    vicinity: '', geometry: { location: { lat: () => 0.1,   lng: () => 2 } } },
  ];
  const { maps, map } = makeMapsMock(stations);  // existing helper in this file; wraps PlacesService
  const target = {
    midpoint: { lat: 0, lng: 2.5 },
    insertAtFlatIndex: 1,
    legStart: { id: 'a', name: 'A', label: 'A', lat: 0, lng: 0, type: 'start' as const },
    legEnd:   { id: 'b', name: 'B', label: 'B', lat: 0, lng: 5, type: 'destination' as const },
    legKm: 555,
  };
  const onSelect = vi.fn();
  render(<NearbyFinder category="fuel" target={target} maps={maps} map={map} onSelect={onSelect} onClose={() => {}} detourCapKm={5} legPolyline={legPolyline} />);
  await screen.findByText('Near A');
  await screen.findByText('Near B');
  expect(screen.queryByText('Far')).toBeNull();
});
```

If the file's mock-builder helper has a different name than `makeMapsMock`, substitute it — the existing tests show the exact name.

- [ ] **Step 2: Run the test to confirm failure**

```bash
npx vitest run client/src/components/builder/__tests__/NearbyFinder.test.tsx
```

- [ ] **Step 3: Add `detourCapKm` + `legPolyline` to props and filter results**

Open `client/src/components/builder/NearbyFinder.tsx`. Change Props to include:

```tsx
type Props = {
  category: PinCategory;
  target: FuelSearchTarget;
  maps: typeof google.maps;
  map: google.maps.Map;
  onSelect: (r: NearbyResult) => void;
  onClose: () => void;
  /** When set, each result's perpendicular distance to legPolyline is computed
   * via measureDetour and results beyond the cap are dropped before display. */
  detourCapKm?: number;
  legPolyline?: { lat: number; lng: number }[];
};
```

Update the `nearbySearch` callback (around line 80–96 — the `.sort(...).slice(0, 10)` chain):

```ts
import { measureDetour } from '../../lib/route-detour';

// inside the callback, after building `items`:
let filtered = items;
if (detourCapKm && legPolyline && legPolyline.length >= 2) {
  filtered = items.filter((r) => measureDetour({ lat: r.lat, lng: r.lng }, legPolyline).detourKm <= detourCapKm);
}
filtered = filtered.sort((a, b) =>
  detourCapKm && legPolyline
    ? measureDetour({ lat: a.lat, lng: a.lng }, legPolyline).detourKm
      - measureDetour({ lat: b.lat, lng: b.lng }, legPolyline).detourKm
    : haversineKm(target.midpoint, { lat: a.lat, lng: a.lng })
      - haversineKm(target.midpoint, { lat: b.lat, lng: b.lng })
).slice(0, 10);
setResults(filtered);
```

Destructure the new props in the component signature: `function NearbyFinder({ category, target, maps, map, onSelect, onClose, detourCapKm, legPolyline }: Props)`.

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run client/src/components/builder/__tests__/NearbyFinder.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/builder/NearbyFinder.tsx client/src/components/builder/__tests__/NearbyFinder.test.tsx
git commit -m "NearbyFinder: optional detourCapKm + legPolyline props

When both are present, results are filtered by perpendicular distance
to the leg polyline and sorted by detour ascending. Other categories
(food/hotel/scenic) pass nothing and keep today's distance-from-midpoint
sort."
```

---

## Task 9: TripDetailsModal — Auto-fuel toggle

**Files:**
- Modify: `client/src/components/builder/TripDetailsModal.tsx`

- [ ] **Step 1: Locate the fuel section in the modal**

```bash
grep -n "tankRangeKm\|tankSizeLitres\|Fuel" client/src/components/builder/TripDetailsModal.tsx | head -20
```

Identify the JSX block where `tankRangeKm` is rendered as an input. The toggle goes immediately below.

- [ ] **Step 2: Thread `autoFuel` through state and the JSX**

Wherever the modal builds its draft state (look for a `useState` initialized from props), add `autoFuel: trip.autoFuel ?? true`. Wherever it emits the patch to save (the prop callback like `onSave(patch)`), include `autoFuel` in the patch.

Add the checkbox JSX directly below the `tankRangeKm` input:

```tsx
<label className={`flex items-start gap-2 mt-3 ${draft.tankRangeKm ? '' : 'opacity-50 cursor-not-allowed'}`}>
  <input
    type="checkbox"
    checked={draft.autoFuel !== false}
    disabled={!draft.tankRangeKm}
    onChange={(e) => setDraft((d) => ({ ...d, autoFuel: e.target.checked }))}
    className="mt-0.5 accent-accent"
  />
  <span className="flex-1">
    <span className="text-paper text-[13px]">Auto-fuel this trip</span>
    <span className="block text-paper-muted text-[11.5px] mt-0.5">
      {draft.tankRangeKm
        ? "Insert fuel stops where the tank would run low. You can undo each addition."
        : "Set tank range to enable."}
    </span>
  </span>
</label>
```

(Adapt class names to match the surrounding rows — these are tokens already used in the file.)

- [ ] **Step 3: Verify Builder propagates the value to the trip on save**

Builder's `onSave` handler should already pass `state.autoFuel` to `updateTrip`. If not, add it. (Builder will read it from trip state once Task 11 hooks the engine.)

- [ ] **Step 4: Manually verify**

Start the dev server, open trip details, see the new checkbox. Tab off; the trip persists `autoFuel: true` (verify in the Network tab payload).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/builder/TripDetailsModal.tsx client/src/screens/Builder.tsx
git commit -m "Builder/TripDetailsModal: Auto-fuel checkbox

Lives next to tankRangeKm in trip details. Default checked; disabled
with helper text when tankRangeKm is unset. Persisted via the existing
PUT trip patch path."
```

---

## Task 10: Day-card fuel-remaining badge + no-station warning

**Files:**
- Modify: `client/src/components/viewer/DayCard.tsx`
- Modify: `client/src/components/builder/DayColumn.tsx`

- [ ] **Step 1: Define a shared FuelBadge subcomponent**

The badge is identical in Viewer and Builder. Avoid duplicating it; create `client/src/components/FuelRemainingBadge.tsx`:

```tsx
import type { FuelTimeline } from '../lib/fuel-timeline';

type Props = {
  timeline: FuelTimeline;
  lastStopIndex: number;
  tankRangeKm: number;
};

export function FuelRemainingBadge({ timeline, lastStopIndex, tankRangeKm }: Props) {
  if (!(tankRangeKm > 0)) return null;
  const km = timeline.cumulativeSinceLastFill[lastStopIndex] ?? 0;
  const pct = Math.round((km / tankRangeKm) * 100);
  const color =
    pct >= 90 ? 'text-red-400' :
    pct >= 70 ? 'text-amber-400' :
    'text-emerald-400';
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[9.5px] tracking-[0.16em] uppercase ${color}`}
      title={`${km} of ${tankRangeKm} km since last fill-up`}
    >
      <span aria-hidden>⛽</span>
      <span>{km}/{tankRangeKm} km · {pct}%</span>
    </span>
  );
}
```

- [ ] **Step 2: Wire it into Viewer DayCard**

Open `client/src/components/viewer/DayCard.tsx`. Add props:

```tsx
type Props = {
  // … existing …
  fuelTimeline?: FuelTimeline;
  tankRangeKm?: number;
  autoFuelWarningKm?: number;  // when set, show the no-station warning chip
  onOpenManualPicker?: () => void;
};
```

Inside the meta row (where AA-readiness and long-leg warnings live), add:

```tsx
{fuelTimeline && tankRangeKm && (
  <FuelRemainingBadge
    timeline={fuelTimeline}
    lastStopIndex={group.stops[group.stops.length - 1].index}
    tankRangeKm={tankRangeKm}
  />
)}
{autoFuelWarningKm != null && (
  <button
    type="button"
    onClick={onOpenManualPicker}
    className="inline-flex items-center gap-1 px-2 py-[3px] rounded font-mono text-[9.5px] tracking-[0.16em] uppercase text-red-400 hover:text-paper hover:bg-accent-soft border border-red-400/30"
    title="No fuel station found within 5 km of the route — click to widen the search."
  >
    ⚠ No station within 5 km — add manually
  </button>
)}
```

- [ ] **Step 3: Wire the same into Builder DayColumn**

Open `client/src/components/builder/DayColumn.tsx`. Mirror the same Props additions and the same two JSX blocks in the day's meta row.

- [ ] **Step 4: Add the timeline computation in the parent (Viewer screen + Builder screen)**

In `client/src/screens/Viewer.tsx`, compute the timeline once near where `dayedStops` is derived:

```tsx
import { computeFuelTimeline } from '../lib/fuel-timeline';

const fuelTimeline = useMemo(
  () => computeFuelTimeline(dayedStops, trip.tankRangeKm || 0),
  [dayedStops, trip.tankRangeKm]
);
```

Pass `fuelTimeline={fuelTimeline}` and `tankRangeKm={trip.tankRangeKm}` to each `DayCard`. (Leave `autoFuelWarningKm`/`onOpenManualPicker` undefined — Viewer is read-only.)

In `client/src/screens/Builder.tsx`, do the same: compute the timeline from `dayedStops` and `state.tankRangeKm`, pass to every `DayColumn`. `autoFuelWarningKm` will be supplied in Task 11.

Also wire the Share screen (`client/src/screens/Share.tsx` imports DayCard at line 17 and renders it at line 394 — confirmed): compute the same `fuelTimeline` from its `dayedStops` and `trip.tankRangeKm`, pass `fuelTimeline` and `tankRangeKm` to every `<DayCard>`. Leave `autoFuelWarningKm` and `onOpenManualPicker` undefined — Share is read-only.

- [ ] **Step 5: Visual smoke**

Open a trip in Viewer. Confirm the badge shows on each day, color tracks the percentage, hides when tankRangeKm is unset (test by editing trip details to remove it).

- [ ] **Step 6: Commit**

```bash
git add client/src/components/FuelRemainingBadge.tsx client/src/components/viewer/DayCard.tsx client/src/components/builder/DayColumn.tsx client/src/screens/Viewer.tsx client/src/screens/Builder.tsx client/src/screens/Share.tsx
git commit -m "Day card: fuel-remaining badge + no-station warning slot

FuelRemainingBadge subcomponent shared by Viewer DayCard, Builder
DayColumn (and Share via DayCard). Sourced from computeFuelTimeline at
the parent screen. Color: green <70%, amber 70-90%, red >=90%. Hides
when tankRangeKm is unset. No-station warning chip slot added; Builder
will populate it in Task 11."
```

---

## Task 11: Builder — wire useAutoFuel + clear addedByAuto on user mutations + warnings

**Files:**
- Modify: `client/src/screens/Builder.tsx`

- [ ] **Step 1: Add a `markUserTouched` helper at the top of the Builder component**

Inside `Builder.tsx`, near the existing setters:

```tsx
function markUserTouched(stop: Stop): Stop {
  if (!stop.addedByAuto) return stop;
  const { addedByAuto: _ignored, ...rest } = stop;
  return rest as Stop;
}
```

- [ ] **Step 2: Use `markUserTouched` in all setters that mutate stop content**

Update each of the existing setters in Builder.tsx to clear `addedByAuto` on the touched stop:

```tsx
function setStopType(id: string, type: Stop['type']) {
  setState((s) => ({ ...s, stops: s.stops.map((x) => x.id === id ? markUserTouched({ ...x, type }) : x) }));
}
function setStopRouteMode(id: string, mode: import('../lib/types').StopRouteMode) {
  setState((s) => ({ ...s, stops: s.stops.map((x) => x.id === id ? markUserTouched({ ...x, routeMode: mode }) : x) }));
}
function setForceDayStart(id: string, value: boolean) {
  setState((s) => ({ ...s, stops: s.stops.map((x) => x.id === id ? markUserTouched({ ...x, forceDayStart: value }) : x) }));
}
function addHighlight(id: string, text: string) {
  setState((s) => ({ ...s, stops: s.stops.map((x) => x.id === id
    ? markUserTouched({ ...x, highlights: [...(x.highlights || []), text].filter((v, i, a) => a.indexOf(v) === i) })
    : x) }));
}
function removeHighlight(id: string, text: string) {
  setState((s) => ({ ...s, stops: s.stops.map((x) => x.id === id
    ? markUserTouched({ ...x, highlights: (x.highlights || []).filter((h) => h !== text) })
    : x) }));
}
```

Also inside `reorder` (after computing the new stops array), apply `markUserTouched` to the moved stop:

```tsx
const moved = markUserTouched(stops[fromIdx]);
stops.splice(fromIdx, 1);
stops.splice(toIdx, 0, moved);
```

(Adapt to the exact structure of the existing `reorder` body. The key principle: any stop the user drags becomes user-owned.)

- [ ] **Step 3: Add an autoFuel warnings state**

Near the existing Builder state:

```tsx
const [autoFuelWarnings, setAutoFuelWarnings] = useState<Record<number, number>>({});
```

(Keyed by `dayNumber`, value is the gap km.)

- [ ] **Step 4: Build the placesSearch wrapper**

In Builder.tsx, near the other map-related code:

```tsx
import type { PlacesSearchFn } from '../lib/auto-fuel-pick';
import type { NearbyResult } from '../components/builder/NearbyFinder';

const placesSearch: PlacesSearchFn | null = useMemo(() => {
  if (!maps || !map) return null;
  return (location, radiusMeters) => new Promise<NearbyResult[]>((resolve) => {
    const svc = new maps.places.PlacesService(map);
    svc.nearbySearch(
      { location, radius: radiusMeters, type: 'gas_station' },
      (raw, status) => {
        if (status !== maps.places.PlacesServiceStatus.OK || !raw) return resolve([]);
        resolve(raw.filter(r => r.geometry?.location).map(r => ({
          placeId: r.place_id || '',
          name: r.name || 'Fuel stop',
          vicinity: r.vicinity || '',
          rating: typeof r.rating === 'number' ? r.rating : undefined,
          lat: r.geometry!.location!.lat(),
          lng: r.geometry!.location!.lng(),
        })));
      }
    );
  });
}, [maps, map]);
```

- [ ] **Step 5: Compute fuelTimeline and call useAutoFuel**

```tsx
import { computeFuelTimeline } from '../lib/fuel-timeline';
import { useAutoFuel } from '../hooks/useAutoFuel';

const fuelTimeline = useMemo(
  () => computeFuelTimeline(dayedStops, state.tankRangeKm || 0),
  [dayedStops, state.tankRangeKm]
);

const undoSnapshotRef = useRef<Stop[] | null>(null);
const [autoFuelToast, setAutoFuelToast] = useState<{ message: string } | null>(null);

useAutoFuel({
  enabled: state.autoFuel !== false,
  tripId: state.tripId,
  stops: state.stops,
  enrichedStops: dayedStops,
  tankRangeKm: state.tankRangeKm || 0,
  placesSearch,
  onPropose: (next, inserted, _removed) => {
    if (!undoSnapshotRef.current) undoSnapshotRef.current = state.stops;
    setState((s) => ({ ...s, stops: next }));
    const msg = inserted.length === 1
      ? `Added fuel stop near ${inserted[0].label} · Undo`
      : `Added ${inserted.length} fuel stops · Undo`;
    setAutoFuelToast({ message: msg });
  },
  onWarning: (warnings) => {
    const map: Record<number, number> = {};
    for (const w of warnings) if (w.dayNumber) map[w.dayNumber] = w.gapKm;
    setAutoFuelWarnings(map);
  },
});
```

- [ ] **Step 6: Render the auto-fuel toast**

Inside Builder's JSX (near other top-level toasts):

```tsx
{autoFuelToast && (
  <Toast
    message={autoFuelToast.message.replace(' · Undo', '')}
    variant="auto-fuel"
    durationMs={8000}
    actionLabel="Undo"
    onAction={() => {
      if (undoSnapshotRef.current) {
        setState((s) => ({ ...s, stops: undoSnapshotRef.current! }));
        undoSnapshotRef.current = null;
      }
      setAutoFuelToast(null);
    }}
    onDismiss={() => {
      undoSnapshotRef.current = null;
      setAutoFuelToast(null);
    }}
  />
)}
```

- [ ] **Step 7: Pass warning + manual-picker handler to DayColumn**

For each `<DayColumn group={g} ... />` mapping in Builder.tsx, add:

```tsx
autoFuelWarningKm={autoFuelWarnings[g.day]}
onOpenManualPicker={() => setNearbyOpen({
  category: 'fuel',
  target: findLongestLegTarget(g, dayedStops, getStopPath)!,
})}
```

Then extend Builder's `nearbyOpen` state shape (currently `{ category, target } | null` at line 278) to also carry the widen flag and the leg polyline:

```tsx
const [nearbyOpen, setNearbyOpen] = useState<
  | { category: PinCategory; target: FuelSearchTarget; widened?: boolean; legPolyline?: { lat: number; lng: number }[] }
  | null
>(null);
```

In `onOpenManualPicker` (the handler passed to DayColumn), set `widened: true` and supply the leg polyline from the matching gap (look it up in the `fuelTimeline.gaps` array by `dayNumber`):

```tsx
onOpenManualPicker={() => {
  const gap = fuelTimeline.gaps.find(g => dayedStops[g.beforeStopIndex]?.dayNumber === g.day);
  setNearbyOpen({
    category: 'fuel',
    target: findLongestLegTarget(g, dayedStops, getStopPath)!,
    widened: true,
    legPolyline: gap?.legPolyline,
  });
}}
```

And at the `<NearbyFinder>` render site (around line 1500), pass:

```tsx
detourCapKm={nearbyOpen.category === 'fuel' ? (nearbyOpen.widened ? 10 : 5) : undefined}
legPolyline={nearbyOpen.legPolyline}
```

- [ ] **Step 8: Manual smoke test**

Run `npm run dev`. Open a trip with a leg > 500 km. Within ~1 s, an auto-fuel stop appears mid-leg and a toast shows. Click Undo: stop disappears. Reload: toggle Auto-fuel off in trip details → no insertion. Drag an auto-added stop in the list: its `auto` glyph disappears (now user-owned).

- [ ] **Step 9: Commit**

```bash
git add client/src/screens/Builder.tsx
git commit -m "Builder: wire useAutoFuel + clear addedByAuto on user mutations

User-touched stops (reordered, retyped, highlighted, route-mode-flipped)
clear addedByAuto and become user-owned. useAutoFuel runs with the
trip's autoFuel toggle, dayedStops, and a wrapped PlacesService.
onPropose updates state + shows a 'auto-fuel' Toast with 8s Undo.
onWarning populates DayColumn's no-station warning chip; clicking it
opens NearbyFinder with the detour cap widened to 10 km."
```

---

## Task 12: Playwright e2e

**Files:**
- Create: `e2e/auto-fuel.spec.ts`

- [ ] **Step 1: Check the existing e2e harness**

```bash
ls e2e/ && cat e2e/sign-in.js | head -30
```

Confirm `e2e/sign-in.js` is the per-session login snippet. Find the Playwright config (likely `playwright.config.ts` or it runs via `npx playwright`).

- [ ] **Step 2: Write the e2e spec**

Create `e2e/auto-fuel.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const APP = 'http://localhost:5173';
const TRIP_ID = process.env.E2E_TRIP_ID || '';

test.describe('auto-fuel', () => {
  test.beforeEach(async ({ page }) => {
    if (!TRIP_ID) test.skip(true, 'Set E2E_TRIP_ID to a trip you own with a leg > tankRangeKm');
    await page.goto(APP);
    await page.evaluate(`(${require('fs').readFileSync(__dirname + '/sign-in.js', 'utf8')})()`);
    await page.waitForURL(/\//);
  });

  test('inserts a fuel stop, shows undo toast, restores on undo', async ({ page }) => {
    await page.goto(`${APP}/builder/${TRIP_ID}`);
    // Wait for stops to load + routes to fetch + auto-fuel debounce to fire.
    await page.waitForTimeout(2500);
    const autoBadge = page.getByText(/auto/i, { exact: false }).first();
    await expect(autoBadge).toBeVisible({ timeout: 5_000 });
    const undo = page.getByRole('button', { name: /undo/i });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(autoBadge).toHaveCount(0);
  });

  test('toggling auto-fuel off prevents new insertions', async ({ page }) => {
    await page.goto(`${APP}/builder/${TRIP_ID}`);
    await page.getByRole('button', { name: /trip details|settings/i }).click();
    await page.getByLabel(/auto-fuel/i).uncheck();
    await page.getByRole('button', { name: /save|close/i }).click();
    await page.waitForTimeout(2500);
    // Future-trigger: add a long leg. For now, just verify no NEW toast appears.
    const undo = page.getByRole('button', { name: /undo/i });
    await expect(undo).toHaveCount(0);
  });
});
```

- [ ] **Step 3: Run the spec against a local server**

```bash
# In one terminal:
npm run dev

# In another:
E2E_TRIP_ID=<your-trip-id> npx playwright test e2e/auto-fuel.spec.ts --headed
```

Expected: both tests pass (or skip if `E2E_TRIP_ID` unset).

- [ ] **Step 4: Commit**

```bash
git add e2e/auto-fuel.spec.ts
git commit -m "e2e: Playwright spec for auto-fuel happy path + toggle off

Two specs: (1) auto-fuel inserts a stop with auto badge, Undo button
restores; (2) toggling auto-fuel off prevents new insertions. Both
require E2E_TRIP_ID env var pointing at a trip owned by the dev user
with a leg exceeding tankRangeKm."
```

---

## Final checklist

- [ ] All 320 pre-existing tests still pass.
- [ ] New tests pass: 9 (fuel-timeline) + 8 (route-detour) + 5 (auto-fuel-pick) + 6 (useAutoFuel) + 2 (StopIdentityBadge addedByAuto) + 1 (NearbyFinder detour cap) = 31 new.
- [ ] `npx tsc --noEmit` shows no new errors beyond the pre-existing `google` namespace noise and test-fixture spread warnings.
- [ ] Manual smoke: open a trip with a long leg → auto fuel stop appears within ~1s → toast shows → Undo works → toggle off in trip details → no new insertion.
- [ ] Spec coverage: every section in the spec has at least one task above (Section 1 → Tasks 1+2, Section 2 → Tasks 3+4+8, Section 3 → Tasks 5+11, Section 4 → Tasks 6+7+9+10+11, Section 5 → all unit + hook + e2e tasks).
