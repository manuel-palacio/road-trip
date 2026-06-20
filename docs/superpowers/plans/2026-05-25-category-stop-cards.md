# Unified Stop Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every stop renders the same card + marker — a category-tinted identity badge with a category emoji (or 🏙 for plain "city" stops), a day-color ring, a corner sequence-number pip, and the country flag next to the title. Fuel stops become first-class Android Auto waypoints (counted everywhere, included in the Maps deep-link URL). Delete `FuelStopChip`.

**Architecture:** A shared `StopIdentityBadge` component drives both the builder `StopRow` and the viewer `DayCard` inline row. A `stopCategory(stop)` helper resolves modern + legacy fuel stops to a single `PinCategory | undefined`. A `DEFAULT_STOP_META` constant carries the city-default visuals (🏙, neutral tint), shared by the badge and the map marker so the two surfaces stay in lockstep. `makeMarkerIcon` becomes universally category-aware — no more branch. `routableStops` (and three day-counters) no longer filter fuel.

**Tech Stack:** React 18, TypeScript, Tailwind v3, Vitest + jsdom + React Testing Library, Google Maps JS SDK for marker SVGs.

**Commit policy:** Each task ends with a `git add` + `git commit` step. **DO NOT commit automatically.** Per project convention, pause at the end of each task and give the user a numbered manual-test list. Only run the commit step once the user confirms.

---

## File Structure

**Create:**
- `client/src/components/StopIdentityBadge.tsx` — shared badge.
- `client/src/components/__tests__/StopIdentityBadge.test.tsx`
- `client/src/lib/__tests__/pin-meta.test.ts`
- `client/src/lib/__tests__/google-maps.test.ts`

**Modify:**
- `client/src/lib/pin-meta.ts` — add `stopCategory(stop)` + `DEFAULT_STOP_META`.
- `client/src/lib/maps-deep-link.ts` — `routableStops` no longer filters fuel; drop unused `isFuelStop` import.
- `client/src/lib/__tests__/maps-deep-link.test.ts` — flip four fuel-filtering tests.
- `client/src/lib/google-maps.ts` — `makeMarkerIcon` becomes universal category-aware.
- `client/src/components/builder/StopRow.tsx` — use `StopIdentityBadge`; remove dead fuel-chip-next-to-title.
- `client/src/components/builder/StopList.tsx` — drop FuelStopChip branch + counter filter.
- `client/src/components/builder/DayColumn.tsx` — drop FuelStopChip branch + counter filter.
- `client/src/components/viewer/DayCard.tsx` — drop FuelStopChip branch; use `StopIdentityBadge`; drop counter filter.
- `client/src/screens/Builder.tsx:649` — caller passes `stopCategory(stop)`.
- `client/src/screens/Viewer.tsx:232` — same.
- `client/src/screens/Share.tsx:172` — same.

**Delete:**
- `client/src/components/FuelStopChip.tsx`

---

## Task 1: `stopCategory` helper + `DEFAULT_STOP_META`

**Files:**
- Modify: `client/src/lib/pin-meta.ts`
- Create: `client/src/lib/__tests__/pin-meta.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `client/src/lib/__tests__/pin-meta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_STOP_META, stopCategory } from '../pin-meta';
import type { Stop } from '../types';

function stop(overrides: Partial<Stop> & { id: string }): Stop {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    label: overrides.label ?? overrides.id,
    lat: 0,
    lng: 0,
    type: overrides.type ?? 'waypoint',
    ...overrides,
  };
}

describe('stopCategory', () => {
  it('returns the category field when set', () => {
    expect(stopCategory(stop({ id: 'a', category: 'hotel' }))).toBe('hotel');
    expect(stopCategory(stop({ id: 'a', category: 'food' }))).toBe('food');
  });

  it('returns "fuel" for modern fuel stops (type=fuel, no category)', () => {
    expect(stopCategory(stop({ id: 'a', type: 'fuel' }))).toBe('fuel');
  });

  it('returns "fuel" for legacy fuel waypoints (type=waypoint + category=fuel)', () => {
    expect(stopCategory(stop({ id: 'a', type: 'waypoint', category: 'fuel' }))).toBe('fuel');
  });

  it('returns undefined for plain waypoints', () => {
    expect(stopCategory(stop({ id: 'a', type: 'waypoint' }))).toBeUndefined();
  });

  it('returns undefined for start / destination / overnight without category', () => {
    expect(stopCategory(stop({ id: 'a', type: 'start' }))).toBeUndefined();
    expect(stopCategory(stop({ id: 'a', type: 'destination' }))).toBeUndefined();
    expect(stopCategory(stop({ id: 'a', type: 'overnight' }))).toBeUndefined();
  });

  it('prefers an explicit category over the legacy type=fuel hint', () => {
    expect(stopCategory(stop({ id: 'a', type: 'fuel', category: 'hotel' }))).toBe('hotel');
  });
});

describe('DEFAULT_STOP_META', () => {
  it('exposes the city emoji and a neutral tint', () => {
    expect(DEFAULT_STOP_META.emoji).toBe('🏙');
    expect(typeof DEFAULT_STOP_META.tint).toBe('string');
    expect(DEFAULT_STOP_META.tint.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/lib/__tests__/pin-meta.test.ts`
Expected: FAIL — `stopCategory` and `DEFAULT_STOP_META` not exported.

- [ ] **Step 3: Add the helper + constant**

Edit `client/src/lib/pin-meta.ts`. Update the existing type import to include `Stop`, and append the helper + constant after the existing exports:

```ts
import type { PinCategory, PinPriority, Stop } from './types';

// ...existing PIN_CATEGORIES / PIN_PRIORITIES / PIN_PRIORITY_META / PIN_CATEGORY_META unchanged...

/** Resolves a stop's effective category, bridging modern stops (which
 *  carry the `category` field) and legacy fuel stops (type='fuel' or
 *  type='waypoint' + category='fuel' from before issue #52). Returns
 *  `undefined` for plain stops — those get the city-default treatment. */
export function stopCategory(stop: Stop): PinCategory | undefined {
  if (stop.category) return stop.category;
  if (stop.type === 'fuel') return 'fuel';
  return undefined;
}

/** Visual treatment for stops without an explicit category — the
 *  "city" default. Destinations, overnights, waypoints, and start
 *  stops all use this unless the user pinned a specific category. */
export const DEFAULT_STOP_META = { emoji: '🏙', tint: '#9b9080' } as const;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/lib/__tests__/pin-meta.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Full lib test suite to confirm no regressions**

Run: `npx vitest run client/src/lib/__tests__/`
Expected: all green.

- [ ] **Step 6: Commit (only after user verification)**

```bash
git add client/src/lib/pin-meta.ts client/src/lib/__tests__/pin-meta.test.ts
git commit -m "Add stopCategory + DEFAULT_STOP_META for unified stop visuals"
```

---

## Task 2: `StopIdentityBadge` component

**Files:**
- Create: `client/src/components/StopIdentityBadge.tsx`
- Create: `client/src/components/__tests__/StopIdentityBadge.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `client/src/components/__tests__/StopIdentityBadge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StopIdentityBadge } from '../StopIdentityBadge';
import type { Stop } from '../../lib/types';

function stop(overrides: Partial<Stop> & { id: string }): Stop {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    label: overrides.label ?? overrides.id,
    lat: 0,
    lng: 0,
    type: overrides.type ?? 'waypoint',
    dayNumber: overrides.dayNumber ?? 1,
    ...overrides,
  };
}

describe('StopIdentityBadge', () => {
  it('plain waypoint renders the city emoji and a corner sequence-number pip', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a' })} index={2} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('🏙');
    expect(screen.getByTestId('stop-identity-badge-number')).toHaveTextContent('3');
  });

  it('destination with no category uses the city default', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', type: 'destination' })} index={0} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('🏙');
    expect(screen.getByTestId('stop-identity-badge-number')).toHaveTextContent('1');
  });

  it('hotel category renders the hotel emoji', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', category: 'hotel' })} index={2} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('🛏');
    expect(screen.getByTestId('stop-identity-badge-number')).toHaveTextContent('3');
  });

  it('fuel category renders the fuel emoji', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', category: 'fuel' })} index={4} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('⛽');
    expect(screen.getByTestId('stop-identity-badge-number')).toHaveTextContent('5');
  });

  it('legacy fuel stop (type=fuel, no category) renders the fuel emoji', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', type: 'fuel' })} index={1} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('⛽');
    expect(screen.getByTestId('stop-identity-badge-number')).toHaveTextContent('2');
  });

  it('food, scenic, landmark categories render their emoji', () => {
    const { rerender } = render(<StopIdentityBadge stop={stop({ id: 'a', category: 'food' })} index={0} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('🍴');

    rerender(<StopIdentityBadge stop={stop({ id: 'a', category: 'scenic' })} index={0} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('🌄');

    rerender(<StopIdentityBadge stop={stop({ id: 'a', category: 'landmark' })} index={0} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('📍');
  });

  it('compact variant still renders the category emoji', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', category: 'scenic' })} index={0} variant="compact" />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('🌄');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/components/__tests__/StopIdentityBadge.test.tsx`
Expected: FAIL — cannot resolve `'../StopIdentityBadge'`.

- [ ] **Step 3: Implement the component**

Create `client/src/components/StopIdentityBadge.tsx`:

```tsx
import { dayColor } from '../lib/compute';
import { DEFAULT_STOP_META, PIN_CATEGORY_META, stopCategory } from '../lib/pin-meta';
import type { Stop } from '../lib/types';

type Props = {
  stop: Stop;
  index: number;
  /** `card` is the builder StopRow size (~26px); `compact` is the viewer
   *  DayCard inline row size (~22px). */
  variant?: 'card' | 'compact';
};

export function StopIdentityBadge({ stop, index, variant = 'card' }: Props) {
  const category = stopCategory(stop);
  const meta = category ? PIN_CATEGORY_META[category] : DEFAULT_STOP_META;
  const ring = dayColor(stop.dayNumber);
  const seq = index + 1;

  const size = variant === 'compact' ? 22 : 26;
  const emojiSize = variant === 'compact' ? 13 : 15;
  const pipSize = variant === 'compact' ? 12 : 14;
  const pipFont = variant === 'compact' ? 9 : 10;

  return (
    <div
      data-testid="stop-identity-badge"
      className="relative shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        backgroundColor: meta.tint,
        border: `2px solid ${ring}`,
        boxSizing: 'border-box',
      }}
    >
      <span aria-hidden style={{ fontSize: emojiSize, lineHeight: 1 }}>{meta.emoji}</span>
      <span
        data-testid="stop-identity-badge-number"
        className="absolute font-mono font-semibold rounded-full flex items-center justify-center"
        style={{
          width: pipSize,
          height: pipSize,
          bottom: -3,
          right: -3,
          backgroundColor: ring,
          color: '#0d0e11',
          fontSize: pipFont,
          border: '1px solid #f3ecde',
          lineHeight: 1,
        }}
      >
        {seq}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/components/__tests__/StopIdentityBadge.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit (only after user verification)**

```bash
git add client/src/components/StopIdentityBadge.tsx client/src/components/__tests__/StopIdentityBadge.test.tsx
git commit -m "Add StopIdentityBadge: unified badge with city default + category variants"
```

---

## Task 3: `StopRow` uses `StopIdentityBadge`

**Files:**
- Modify: `client/src/components/builder/StopRow.tsx`

- [ ] **Step 1: Add the import**

In `client/src/components/builder/StopRow.tsx`, after the existing imports, add:

```tsx
import { StopIdentityBadge } from '../StopIdentityBadge';
```

- [ ] **Step 2: Replace the inline numbered circle**

Replace this block (lines 126-131):

```tsx
      <div
        className="w-[22px] h-[22px] font-mono text-[11px] font-semibold rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: color, color: '#0d0e11' }}
      >
        {index + 1}
      </div>
```

with:

```tsx
      <StopIdentityBadge stop={stop} index={index} variant="card" />
```

- [ ] **Step 3: Remove the dead fuel-chip-next-to-title**

In the same file, delete this block (lines 135-143):

```tsx
          {stop.category === 'fuel' && (
            <span
              aria-label="Fuel stop"
              title="Fuel stop"
              className="inline-flex items-center justify-center w-[20px] h-[20px] rounded bg-[rgba(244,211,94,0.18)] border border-[rgba(244,211,94,0.5)] text-[12px] leading-none shrink-0"
            >
              <span aria-hidden>⛽</span>
            </span>
          )}
```

The left identity badge now owns the category cue.

- [ ] **Step 4: Run tests + typecheck via build**

Run: `npm test`
Expected: all green.

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Manual visual check**

Start dev: `npm run dev`
Open http://localhost:5173. Open or create a trip with at least one **hotel** added through "+ Find ▾ → Hotel". The hotel card shows 🛏 on a sage tint with a day-color ring and a corner sequence-number pip. A plain destination shows 🏙 on a neutral tint with the same ring + corner pip. (Fuel stops still render as the compact pill at this point — that's fixed in Task 4.)

- [ ] **Step 6: Commit (only after user verification)**

```bash
git add client/src/components/builder/StopRow.tsx
git commit -m "StopRow: render unified identity badge for every stop"
```

---

## Task 4: Drop `FuelStopChip` from builder (`StopList`, `DayColumn`)

**Files:**
- Modify: `client/src/components/builder/StopList.tsx`
- Modify: `client/src/components/builder/DayColumn.tsx`

- [ ] **Step 1: Update `StopList.tsx`**

Remove the `FuelStopChip` import (line 7):

```tsx
import { FuelStopChip } from '../FuelStopChip';   // ← DELETE this line
```

Update line 62 (counter) — fuel now counts as a stop, matching the visual:

```tsx
stopCount={g.stops.filter((x) => !isFuelStop(x.stop)).length}
```

becomes:

```tsx
stopCount={g.stops.length}
```

With both the FuelStopChip branch and the counter filter gone, `isFuelStop` is no longer used in this file. Remove it from the compute import on line 2:

```tsx
import { groupByDay, isFuelStop } from '../../lib/compute';
```

becomes:

```tsx
import { groupByDay } from '../../lib/compute';
```

Replace the conditional block at lines 77-101 with the unconditional `<StopRow />`:

```tsx
{g.stops.map(({ stop, index }) => (
  <StopRow
    key={stop.id}
    stop={stop}
    index={index}
    isFirst={index === 0}
    onChangeType={p.onChangeType}
    onChangeRouteMode={p.onChangeRouteMode}
    onRemove={p.onRemove}
    onSetForceDayStart={p.onSetForceDayStart}
    onAddHighlight={p.onAddHighlight}
    onRemoveHighlight={p.onRemoveHighlight}
    onDemote={p.onDemote}
    demotingStopId={p.demotingStopId}
    onDragStart={p.onDragStart}
    onDragEnd={p.onDragEnd}
    onDragOver={p.onDragOver}
    onDragLeave={p.onDragLeave}
    onDrop={p.onDrop}
  />
))}
```

- [ ] **Step 2: Update `DayColumn.tsx`**

Remove the `FuelStopChip` import (line 8):

```tsx
import { FuelStopChip } from '../FuelStopChip';   // ← DELETE this line
```

Drop the `isFuelStop` import (line 3) — same reasoning as StopList. Change:

```tsx
import { isFuelStop } from '../../lib/compute';
```

— delete the line entirely.

Update line 54 (the AA counter):

```tsx
const aaCount = g.stops.filter((x) => !isFuelStop(x.stop)).length;
```

to:

```tsx
const aaCount = g.stops.length;
```

Locate the conditional at lines 189-190 (`isFuelStop(stop) ? <FuelStopChip ... /> : <StopRow ... />`) and collapse to render `<StopRow ... />` unconditionally. Keep all StopRow props.

- [ ] **Step 3: Run tests + typecheck**

Run: `npm test`
Expected: all green. (The maps-deep-link tests still pass — they only care about the URL contents, not the day-header counter, and we haven't touched the URL yet.)

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Manual visual check**

Reload http://localhost:5173 on a trip that contains a fuel stop. The fuel stop now renders as a full card with the ⛽ identity badge + sequence-number pip + the same controls (type, route mode, day chip, demote, day-break buttons, highlights). The compact pill is gone. The day-header "N stops" counter now includes fuel.

- [ ] **Step 5: Commit (only after user verification)**

```bash
git add client/src/components/builder/StopList.tsx client/src/components/builder/DayColumn.tsx
git commit -m "Builder: drop FuelStopChip; fuel counts as a stop in headers"
```

---

## Task 5: Drop `FuelStopChip` from viewer `DayCard` + apply badge

**Files:**
- Modify: `client/src/components/viewer/DayCard.tsx`

- [ ] **Step 1: Update imports**

In `client/src/components/viewer/DayCard.tsx`:

Delete the `FuelStopChip` import (around line 10):

```tsx
import { FuelStopChip } from '../FuelStopChip';   // ← DELETE this line
```

Drop `isFuelStop` from the compute import (line 3). Change:

```tsx
import { dayColor, formatDayDate, formatDuration, isFuelStop } from '../../lib/compute';
```

to:

```tsx
import { dayColor, formatDayDate, formatDuration } from '../../lib/compute';
```

Add the badge import alongside the other component imports:

```tsx
import { StopIdentityBadge } from '../StopIdentityBadge';
```

- [ ] **Step 2: Drop the counter filter**

Replace line 46:

```tsx
const routableCount = stopsOnly.filter((s) => !isFuelStop(s)).length;
```

with:

```tsx
const routableCount = stopsOnly.length;
```

The two-line comment above (lines 44-45) about fuel being pit-stop suggestions becomes inaccurate — replace it too. Change:

```tsx
  // Fuel stops are pit-stop suggestions, not turn points — they don't count
  // toward the Android Auto 10-stop limit and don't appear in the Maps URL.
  const routableCount = stopsOnly.filter((s) => !isFuelStop(s)).length;
```

to:

```tsx
  // Every stop on the day — including fuel — is an Android Auto waypoint
  // and counts toward the 10-stop URL limit.
  const routableCount = stopsOnly.length;
```

- [ ] **Step 3: Replace the inline circle + ternary**

Apply this exact-string edit:

Find:

```tsx
          {stopsOnly.map((stop, i) => isFuelStop(stop) ? (
            <FuelStopChip key={stop.id} stop={stop} />
          ) : (
            <div key={stop.id} className="flex items-start gap-2.5">
              <div
                className="w-[20px] h-[20px] font-mono text-[10px] font-semibold rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ backgroundColor: color, color: '#0d0e11' }}
              >
                {group.stops[i].index + 1}
              </div>
```

Replace with:

```tsx
          {stopsOnly.map((stop, i) => (
            <div key={stop.id} className="flex items-start gap-2.5">
              <div className="mt-0.5">
                <StopIdentityBadge stop={stop} index={group.stops[i].index} variant="compact" />
              </div>
```

The rest of the inline card body — label, flag, km/duration, route-mode glyph, highlight chips, accommodation links — is **untouched**. The closing tokens `))}` further down stay the same: the ternary `( ... ) : ( ... )` becomes a single arrow body `( ... )`, which still needs `))}` (one paren for the arrow body, one for the `.map(` argument, one brace for the JSX expression).

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test`
Expected: all green.

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Manual visual check**

Open the trip's viewer route (e.g. `/viewer/<tripId>`). Each stop in the expanded day shows the compact identity badge on the left: city default (🏙) for destinations / overnights, category emoji for categorised stops. The fuel pill is gone. The AA badge copy "Android Auto: Ready (N/10 stops)" now counts fuel.

- [ ] **Step 6: Commit (only after user verification)**

```bash
git add client/src/components/viewer/DayCard.tsx
git commit -m "Viewer DayCard: unified identity badge; fuel counts as AA stop"
```

---

## Task 6: Delete `FuelStopChip.tsx`

**Files:**
- Delete: `client/src/components/FuelStopChip.tsx`

- [ ] **Step 1: Confirm no remaining importers**

Run: `grep -rn "FuelStopChip" client/src/`
Expected: matches only inside `client/src/components/FuelStopChip.tsx` itself. If anything else still imports it, go back and fix the missed call site before continuing.

- [ ] **Step 2: Delete the file**

```bash
rm client/src/components/FuelStopChip.tsx
```

- [ ] **Step 3: Run tests + typecheck**

Run: `npm test`
Expected: all green.

Run: `npm run build`
Expected: success — catches any dangling import that grep missed.

- [ ] **Step 4: Re-grep to confirm zero matches**

Run: `grep -rn "FuelStopChip" client/src/`
Expected: empty output.

- [ ] **Step 5: Commit (only after user verification)**

```bash
git add client/src/components/FuelStopChip.tsx
git commit -m "Delete FuelStopChip; superseded by StopIdentityBadge"
```

---

## Task 7: Fuel stops become real Android Auto waypoints

**Files:**
- Modify: `client/src/lib/maps-deep-link.ts`
- Modify: `client/src/lib/__tests__/maps-deep-link.test.ts`

- [ ] **Step 1: Update the failing tests first (test-first)**

Edit `client/src/lib/__tests__/maps-deep-link.test.ts`:

Find this test (around lines 62-70):

```ts
  it('excludes fuel stops from the directions URL', () => {
    const stops = [s('a', 48.5, 7.7), fuel('gas', 48.7, 7.8), s('b', 49.0, 8.0)];
    const url = buildDayMapsUrl(stops);
    expect(url).toContain('origin=');
    expect(url).toContain('destination=');
    // Fuel stop is dropped — no waypoints in a 2-routable-stop URL.
    expect(url).not.toContain('waypoints=');
    expect(url).not.toContain('48.7');
  });
```

Replace with:

```ts
  it('includes fuel stops in the directions URL as waypoints', () => {
    const stops = [s('a', 48.5, 7.7), fuel('gas', 48.7, 7.8), s('b', 49.0, 8.0)];
    const url = buildDayMapsUrl(stops);
    expect(url).toContain('origin=');
    expect(url).toContain('destination=');
    expect(url).toContain('waypoints=');
    // Fuel stop is now a real waypoint — its coordinates appear in the URL.
    expect(url).toContain('48.7');
  });
```

Find this test (around lines 71-75):

```ts
  it('also excludes legacy fuel waypoints (type=waypoint + category=fuel)', () => {
    const stops = [s('a', 48.5, 7.7), legacyFuel('gas', 48.7, 7.8), s('b', 49.0, 8.0)];
    const url = buildDayMapsUrl(stops);
    expect(url).not.toContain('48.7');
  });
```

Replace with:

```ts
  it('also includes legacy fuel waypoints (type=waypoint + category=fuel)', () => {
    const stops = [s('a', 48.5, 7.7), legacyFuel('gas', 48.7, 7.8), s('b', 49.0, 8.0)];
    const url = buildDayMapsUrl(stops);
    expect(url).toContain('48.7');
  });
```

Find this test (around lines 79-82):

```ts
  it('drops first-class fuel stops', () => {
    const stops = [s('a', 0, 0), fuel('f', 0, 0), s('b', 0, 0)];
    expect(routableStops(stops).map((x) => x.id)).toEqual(['a', 'b']);
  });
```

Replace with:

```ts
  it('keeps first-class fuel stops', () => {
    const stops = [s('a', 0, 0), fuel('f', 0, 0), s('b', 0, 0)];
    expect(routableStops(stops).map((x) => x.id)).toEqual(['a', 'f', 'b']);
  });
```

Find this test (around lines 83-86):

```ts
  it('drops legacy fuel waypoints', () => {
    const stops = [s('a', 0, 0), legacyFuel('f', 0, 0), s('b', 0, 0)];
    expect(routableStops(stops).map((x) => x.id)).toEqual(['a', 'b']);
  });
```

Replace with:

```ts
  it('keeps legacy fuel waypoints', () => {
    const stops = [s('a', 0, 0), legacyFuel('f', 0, 0), s('b', 0, 0)];
    expect(routableStops(stops).map((x) => x.id)).toEqual(['a', 'f', 'b']);
  });
```

The fifth test ("keeps non-fuel waypoints even with a different category") still passes as-is.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/lib/__tests__/maps-deep-link.test.ts`
Expected: FAIL — the new assertions expect fuel coordinates in the URL, but today's `routableStops` filters them out.

- [ ] **Step 3: Update `routableStops` and drop the `isFuelStop` import**

Edit `client/src/lib/maps-deep-link.ts`:

Replace line 1:

```ts
import { isFuelStop } from './compute';
```

— delete the line entirely.

Replace the existing `routableStops` (lines 16-20):

```ts
/** Stops that count toward the Android Auto / Maps URL 10-stop limit. Fuel
 * stops are pit-stop suggestions, not turn points, so they're filtered out. */
export function routableStops(stops: readonly Stop[]): Stop[] {
  return stops.filter((s) => !isFuelStop(s));
}
```

with:

```ts
/** Stops that count toward the Android Auto / Maps URL 10-stop limit.
 *  Every stop on the day counts — fuel stops are real AA waypoints,
 *  not planner-side hints, so they go into the URL like any other stop. */
export function routableStops(stops: readonly Stop[]): Stop[] {
  return [...stops];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run client/src/lib/__tests__/maps-deep-link.test.ts`
Expected: PASS — all five `buildDayMapsUrl` tests plus all three `routableStops` tests.

- [ ] **Step 5: Full test suite + typecheck**

Run: `npm test`
Expected: all green.

Run: `npm run build`
Expected: success.

- [ ] **Step 6: Manual deep-link check**

Reload http://localhost:5173 on a day that contains a fuel stop. Click the Android Auto / Maps button in the day header (or open the trip in the viewer and use the AA button there). The Google Maps URL in the browser bar (or the destination it opens to) includes the fuel stop's coordinates as a waypoint.

- [ ] **Step 7: Commit (only after user verification)**

```bash
git add client/src/lib/maps-deep-link.ts client/src/lib/__tests__/maps-deep-link.test.ts
git commit -m "Fuel stops are real AA waypoints: deep link no longer filters them"
```

---

## Task 8: Universal category-aware `makeMarkerIcon` + caller updates

**Files:**
- Modify: `client/src/lib/google-maps.ts`
- Create: `client/src/lib/__tests__/google-maps.test.ts`
- Modify: `client/src/screens/Builder.tsx:649`
- Modify: `client/src/screens/Viewer.tsx:232`
- Modify: `client/src/screens/Share.tsx:172`

This task changes the `makeMarkerIcon` signature (`boolean` → `PinCategory | undefined`), so the function update and all three caller updates must land together.

- [ ] **Step 1: Write the failing tests**

Create `client/src/lib/__tests__/google-maps.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest';
import { makeMarkerIcon } from '../google-maps';

// Mock google.maps.Point / google.maps.Size — the marker uses them as
// plain x/y holders; the SVG payload is what we assert on.
beforeAll(() => {
  (globalThis as any).google = {
    maps: {
      Point: class { constructor(public x: number, public y: number) {} },
      Size:  class { constructor(public w: number, public h: number) {} },
    },
  };
});

function decode(icon: ReturnType<typeof makeMarkerIcon>): string {
  const raw = icon.url ?? '';
  const i = raw.indexOf(',');
  return decodeURIComponent(raw.slice(i + 1));
}

describe('makeMarkerIcon', () => {
  it('no category: SVG embeds the city emoji and the corner sequence number', () => {
    const svg = decode(makeMarkerIcon(3, '#e76f51'));
    expect(svg).toContain('🏙');
    expect(svg).toContain('>3<');
  });

  it('category=fuel: SVG embeds the fuel emoji and the corner sequence number', () => {
    const svg = decode(makeMarkerIcon(3, '#e76f51', 'fuel'));
    expect(svg).toContain('⛽');
    expect(svg).toContain('>3<');
  });

  it('category=hotel: SVG embeds the hotel emoji', () => {
    const svg = decode(makeMarkerIcon(5, '#e76f51', 'hotel'));
    expect(svg).toContain('🛏');
    expect(svg).toContain('>5<');
  });

  it('category=food: SVG embeds the food emoji', () => {
    const svg = decode(makeMarkerIcon(1, '#e76f51', 'food'));
    expect(svg).toContain('🍴');
  });

  it('category=scenic: SVG embeds the scenic emoji', () => {
    const svg = decode(makeMarkerIcon(2, '#e76f51', 'scenic'));
    expect(svg).toContain('🌄');
  });

  it('category=landmark: SVG embeds the landmark emoji', () => {
    const svg = decode(makeMarkerIcon(4, '#e76f51', 'landmark'));
    expect(svg).toContain('📍');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run client/src/lib/__tests__/google-maps.test.ts`
Expected: FAIL — today's signature is `(num, ringColor, isFuel)`, so `'hotel'` etc. won't take the categorised branch.

- [ ] **Step 3: Update `makeMarkerIcon`**

Edit `client/src/lib/google-maps.ts`. Add the imports near the top of the file (after existing imports):

```ts
import { DEFAULT_STOP_META, PIN_CATEGORY_META } from './pin-meta';
import type { PinCategory } from './types';
```

Replace the existing `makeMarkerIcon` function (lines 136-150) with:

```ts
export function makeMarkerIcon(
  num: number,
  ringColor: string = '#f3ecde',
  category?: PinCategory,
): google.maps.Icon {
  // Every marker is iconified: category-tinted inner disc + day-color ring
  // + category emoji + small day-color corner pip with the sequence number.
  // Card and map stay in lockstep via StopIdentityBadge.
  const meta = category ? PIN_CATEGORY_META[category] : DEFAULT_STOP_META;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'>` +
      `<circle cx='22' cy='22' r='15' fill='${ringColor}'/>` +
      `<circle cx='22' cy='22' r='12' fill='${meta.tint}'/>` +
      `<text x='22' y='27' text-anchor='middle' font-size='15'>${meta.emoji}</text>` +
      `<circle cx='34' cy='34' r='7.5' fill='${ringColor}' stroke='#f3ecde' stroke-width='1'/>` +
      `<text x='34' y='37.5' text-anchor='middle' font-family='ui-monospace,monospace' font-size='9' font-weight='600' fill='#0d0e11'>${num}</text>` +
    `</svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    anchor: new google.maps.Point(22, 22),
    scaledSize: new google.maps.Size(44, 44),
  };
}
```

- [ ] **Step 4: Update Builder caller**

In `client/src/screens/Builder.tsx`, add the import (alongside other `lib/` imports):

```tsx
import { stopCategory } from '../lib/pin-meta';
```

Replace line 649:

```tsx
icon: makeMarkerIcon(i + 1, dayColor(stop.dayNumber), stop.type === 'fuel' || stop.category === 'fuel'),
```

with:

```tsx
icon: makeMarkerIcon(i + 1, dayColor(stop.dayNumber), stopCategory(stop)),
```

- [ ] **Step 5: Update Viewer caller**

In `client/src/screens/Viewer.tsx`, add the import:

```tsx
import { stopCategory } from '../lib/pin-meta';
```

Replace line 232:

```tsx
icon: makeMarkerIcon(originalIndex + 1, dayColor(stop.dayNumber), stop.type === 'fuel' || stop.category === 'fuel'),
```

with:

```tsx
icon: makeMarkerIcon(originalIndex + 1, dayColor(stop.dayNumber), stopCategory(stop)),
```

- [ ] **Step 6: Update Share caller**

In `client/src/screens/Share.tsx`, add the import:

```tsx
import { stopCategory } from '../lib/pin-meta';
```

Replace line 172:

```tsx
icon: makeMarkerIcon(originalIndex + 1, dayColor(stop.dayNumber), stop.type === 'fuel' || stop.category === 'fuel'),
```

with:

```tsx
icon: makeMarkerIcon(originalIndex + 1, dayColor(stop.dayNumber), stopCategory(stop)),
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx vitest run client/src/lib/__tests__/google-maps.test.ts`
Expected: PASS, 6 tests.

Run: `npm test`
Expected: all green.

Run: `npm run build`
Expected: success.

- [ ] **Step 8: Manual map check**

Reload http://localhost:5173 and view a trip's map. Every marker now shows an icon: 🏙 for plain destinations, 🛏 for hotels, 🍴 for food, ⛽ for fuel, 🌄 for scenic, 📍 for landmarks. Each marker has a corner sequence-number pip. Outer ring stays day-colored.

- [ ] **Step 9: Commit (only after user verification)**

```bash
git add client/src/lib/google-maps.ts client/src/lib/__tests__/google-maps.test.ts client/src/screens/Builder.tsx client/src/screens/Viewer.tsx client/src/screens/Share.tsx
git commit -m "Map markers: unified category-aware icons across builder, viewer, share"
```

---

## Task 9: Final smoke + verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Confirm `FuelStopChip` is fully gone**

Run: `grep -rn "FuelStopChip" client/src/ server.js routes/ shared/ || echo OK`
Expected: `OK` (no matches anywhere).

- [ ] **Step 4: Manual smoke checklist (deliver to the user before final commit-set)**

In `npm run dev` on http://localhost:5173:

Builder:
1. Open an existing trip.
2. Plain destinations (e.g. Madrid) show 🏙 on a neutral tint with day-color ring + corner number; 🇪🇸 flag still renders next to the title.
3. Add a hotel via "+ Find ▾ → Hotel" — 🛏 on sage, full card, full controls.
4. Add a food stop via "+ Find ▾ → Food" — 🍴 on ochre.
5. Add a scenic / landmark — 🌄 / 📍 with the right tints.
6. Add a fuel stop via "+ Find ▾ → Fuel" — full card with ⛽, the day-header "N stops" counter increments, the AA badge counter (`/10`) increments.
7. Click the AA / Maps button on a day header containing a fuel stop — the Google Maps URL includes the fuel coordinates as a waypoint.

Viewer:
8. Open `/viewer/<tripId>` for the same trip. Each stop in the expanded day shows the compact identity badge. The AA copy "Android Auto: Ready (N/10 stops)" includes fuel in the count.

Map:
9. Markers on builder, viewer, and share screens all use the new iconified bead with a corner sequence-number pip.

Legacy data:
10. If a trip exists with old `type='fuel'` stops (created before issue #52), it renders correctly via `stopCategory`.

- [ ] **Step 5: No additional commit — each earlier task carries its own**

Final state on the branch is the sum of Tasks 1-8. If any earlier task was deferred (e.g. waiting on user verification), commit it now with its task-specific message.
