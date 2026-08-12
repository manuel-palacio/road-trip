import { describe, expect, it } from 'vitest';
import {
  DAY_COLORS,
  applyDays,
  clampMapStripHeight,
  compileFuelOverrides,
  dayColor,
  estimateFuelCost,
  estimateFuelVolume,
  formatBreakdown,
  formatCurrency,
  formatDayDate,
  formatDuration,
  formatFillUps,
  formatVolume,
  fuelBreakdownForLegs,
  fuelConfigState,
  fuelVolumeForLegs,
  groupByDay,
  isFuelStop,
  legCost,
  tripCountriesFromStops,
  tripTotals,
} from '../compute';
import type { Stop } from '../types';

function stop(overrides: Partial<Stop> & { id: string }): Stop {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    label: overrides.label ?? overrides.id,
    lat: overrides.lat ?? 0,
    lng: overrides.lng ?? 0,
    // Default to 'waypoint' so the test stop doesn't accidentally trigger
    // the prev-was-overnight day-boundary rule. Tests opt in to overnight
    // explicitly when checking that rule.
    type: overrides.type ?? 'waypoint',
    ...overrides,
  };
}

describe('dayColor', () => {
  it('returns the first color for day 1 and undefined', () => {
    expect(dayColor(1)).toBe(DAY_COLORS[0]);
    expect(dayColor(undefined)).toBe(DAY_COLORS[0]);
  });
  it('cycles past 10', () => {
    expect(dayColor(11)).toBe(DAY_COLORS[0]);
    expect(dayColor(12)).toBe(DAY_COLORS[1]);
  });
});

describe('formatDuration', () => {
  it('returns empty for zero or negative', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(-30)).toBe('');
  });
  it('shows minutes for under an hour', () => {
    expect(formatDuration(1500)).toBe('25m');
  });
  it('shows decimal hours otherwise', () => {
    expect(formatDuration(3600 * 1.5)).toBe('~1.5h');
    expect(formatDuration(3600 * 4.7)).toBe('~4.7h');
  });
});

describe('applyDays', () => {
  it('first stop is always day 1', () => {
    const out = applyDays([stop({ id: 'a' })], 600);
    expect(out[0].dayNumber).toBe(1);
  });
  it('keeps single-day trip on day 1 under maxKm', () => {
    const stops = [
      stop({ id: 'a' }),
      stop({ id: 'b', kmFromPrevious: 250 }),
      stop({ id: 'c', kmFromPrevious: 300 }),
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 1]);
  });
  it('does NOT auto-split by km — maxKm is a warning threshold, not a hard rule', () => {
    // Day boundaries are user-driven now (overnight markers + forceDayStart).
    // A 750 km trip with no overnight stays on a single day. The Builder
    // shows a "Long day" warning chip but never moves stops around.
    const stops = [
      stop({ id: 'a' }),
      stop({ id: 'b', kmFromPrevious: 400 }),
      stop({ id: 'c', kmFromPrevious: 350 }),
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 1]);
  });
  it('overnight on previous stop forces a new day at next', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', kmFromPrevious: 100, type: 'overnight' }),
      stop({ id: 'c', kmFromPrevious: 100 }),
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 2]);
  });
  it('forceDayStart on a stop creates a boundary at it', () => {
    const stops = [
      stop({ id: 'a' }),
      stop({ id: 'b', kmFromPrevious: 100 }),
      stop({ id: 'c', kmFromPrevious: 100, forceDayStart: true }),
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 2]);
  });
  it('first stop forceDayStart is ignored (always day 1)', () => {
    const stops = [
      stop({ id: 'a', forceDayStart: true }),
      stop({ id: 'b', kmFromPrevious: 100 }),
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1]);
  });
  it('does not mutate input', () => {
    const stops = [stop({ id: 'a' }), stop({ id: 'b', kmFromPrevious: 100 })];
    const original = JSON.parse(JSON.stringify(stops));
    applyDays(stops, 600);
    expect(stops).toEqual(original);
  });
  it("fuel stops never trigger a day boundary themselves", () => {
    // Fuel stops are pit-stops along a drive. They never cause a day
    // boundary regardless of distance — only explicit overnight markers
    // or forceDayStart on a regular stop do. Stays one day end-to-end.
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'gas', type: 'fuel', kmFromPrevious: 350 }),
      stop({ id: 'b', kmFromPrevious: 150 }),
    ];
    const out = applyDays(stops, 300);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 1]);
  });
  it('Stockholm + Copenhagen (660km, maxKm=600) stays one long day', () => {
    // User-reported bug: under the old km-overflow rule, Stockholm ended up
    // alone on Day 1 with no driving. With the new "no auto-split" rule,
    // both stops stay on Day 1 — the Builder shows a "Long day" warning
    // chip but doesn't shuffle the stops around.
    const stops = [
      stop({ id: 'stockholm' }),
      stop({ id: 'copenhagen', kmFromPrevious: 660 }),
    ];
    expect(applyDays(stops, 600).map((s) => s.dayNumber)).toEqual([1, 1]);
  });
  it('inserting a fuel stop mid-leg keeps the whole trip on one day', () => {
    // Same scenario as the user's bug: Stockholm → Fuel → Copenhagen.
    // Fuel stops never trigger day boundaries; the trip stays on Day 1
    // even though the total is 660 km > 600 maxKm.
    const stops = [
      stop({ id: 'stockholm' }),
      stop({ id: 'fuel', type: 'fuel', kmFromPrevious: 300 }),
      stop({ id: 'copenhagen', kmFromPrevious: 360 }),
    ];
    expect(applyDays(stops, 600).map((s) => s.dayNumber)).toEqual([1, 1, 1]);
  });
  it('cross-day reorder: moving a stop into a different day re-computes dayNumber from flat order', () => {
    // Simulates the result of dragging "x" from end of day 1 to start of day 2.
    // Before the move:  [a, b, c (day2 starts), x (would be day2 end)]
    // After the move:   [a, b, x, c]  — x is now in day 2's flat range.
    // applyDays must reflect that purely from the new flat order; the
    // reorder() function doesn't set dayNumber explicitly, it relies on
    // applyDays to re-derive everything.
    const before = applyDays(
      [
        stop({ id: 'a' }),
        stop({ id: 'b', kmFromPrevious: 200 }),
        // c is an overnight stop — its TYPE forces the boundary at the
        // *next* stop, not at itself. The km has to stay under maxKm so
        // c doesn't trigger the km-overflow rule independently.
        stop({ id: 'c', kmFromPrevious: 100, type: 'overnight' }),
        stop({ id: 'x', kmFromPrevious: 100 }),
      ],
      600,
    );
    expect(before.map((s) => s.dayNumber)).toEqual([1, 1, 1, 2]);
    // Now move x to between b and c (still inside day 1). x's prevOvernight
    // is now false (b is a waypoint), so it stays day 1.
    const after = applyDays(
      [
        stop({ id: 'a' }),
        stop({ id: 'b', kmFromPrevious: 200 }),
        stop({ id: 'x', kmFromPrevious: 100 }),
        stop({ id: 'c', kmFromPrevious: 100, type: 'overnight' }),
      ],
      600,
    );
    expect(after.map((s) => s.dayNumber)).toEqual([1, 1, 1, 1]);
  });
});

describe('isFuelStop', () => {
  it('returns true for first-class type=fuel', () => {
    expect(isFuelStop(stop({ id: 'a', type: 'fuel' }))).toBe(true);
  });
  it('returns true for legacy waypoint + category=fuel', () => {
    expect(isFuelStop(stop({ id: 'a', type: 'waypoint', category: 'fuel' }))).toBe(true);
  });
  it('returns false for a plain waypoint', () => {
    expect(isFuelStop(stop({ id: 'a', type: 'waypoint' }))).toBe(false);
  });
  it('returns false when the destination happens to carry category=fuel', () => {
    // Defensive: a destination shouldn't be treated as a fuel pit-stop even
    // if some stale category field says 'fuel'. Only middle waypoints qualify.
    expect(isFuelStop(stop({ id: 'a', type: 'destination', category: 'fuel' }))).toBe(false);
  });
});

describe('groupByDay', () => {
  it('groups stops by dayNumber preserving original index', () => {
    const stops = [
      stop({ id: 'a', dayNumber: 1 }),
      stop({ id: 'b', dayNumber: 1, kmFromPrevious: 100 }),
      stop({ id: 'c', dayNumber: 2, kmFromPrevious: 700, durationSecondsFromPrevious: 7200 }),
    ];
    const groups = groupByDay(stops);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ day: 1, km: 100 });
    expect(groups[0].stops.map((x) => x.index)).toEqual([0, 1]);
    expect(groups[1]).toMatchObject({ day: 2, km: 700, durationSeconds: 7200 });
  });
});

describe('formatDayDate', () => {
  it('returns empty when startDate not set', () => {
    expect(formatDayDate(1, undefined)).toBe('');
    expect(formatDayDate(1, '')).toBe('');
  });
  it('formats Day 1 as the start date itself', () => {
    expect(formatDayDate(1, '2026-06-03')).toMatch(/^\w{3} · \w{3} 3$/);
  });
  it('adds days for later day numbers', () => {
    // 2026-06-03 + 4 days = 2026-06-07
    expect(formatDayDate(5, '2026-06-03')).toMatch(/^\w{3} · \w{3} 7$/);
  });
});

describe('tripTotals', () => {
  it('sums km, max day number, and durations', () => {
    const stops = [
      stop({ id: 'a', dayNumber: 1 }),
      stop({ id: 'b', dayNumber: 1, kmFromPrevious: 200, durationSecondsFromPrevious: 3600 }),
      stop({ id: 'c', dayNumber: 2, kmFromPrevious: 400, durationSecondsFromPrevious: 7200 }),
    ];
    expect(tripTotals(stops)).toEqual({ totalKm: 600, totalDays: 2, totalDurationSeconds: 10800 });
  });
  it('returns zeros for empty array', () => {
    expect(tripTotals([])).toEqual({ totalKm: 0, totalDays: 0, totalDurationSeconds: 0 });
  });
});

describe('estimateFuelCost', () => {
  it('matches the spec example: 500 km @ 7 L/100km × 1.80 €/L → 63 €', () => {
    const cost = estimateFuelCost(500, 7, 'L/100km', 1.80);
    expect(cost).toBeCloseTo(63, 5);
  });

  it('returns null when consumption is missing or non-positive', () => {
    expect(estimateFuelCost(500, undefined, 'L/100km', 1.80)).toBeNull();
    expect(estimateFuelCost(500, 0, 'L/100km', 1.80)).toBeNull();
    expect(estimateFuelCost(500, -5, 'L/100km', 1.80)).toBeNull();
  });

  it('returns null when price is missing or non-positive', () => {
    expect(estimateFuelCost(500, 7, 'L/100km', undefined)).toBeNull();
    expect(estimateFuelCost(500, 7, 'L/100km', 0)).toBeNull();
  });

  it('returns 0 for zero distance even when consumption + price are set', () => {
    expect(estimateFuelCost(0, 7, 'L/100km', 1.80)).toBe(0);
  });

  it('converts MPG units correctly', () => {
    // 33.6 MPG ≈ 7 L/100km. 500 km @ 33.6 MPG @ ($1.80 * 3.785 ≈ $6.81/gal)
    // should be close to the equivalent L/100km calculation
    const lEquiv = estimateFuelCost(500, 7, 'L/100km', 1.80);
    const mpgEquiv = estimateFuelCost(500, 33.6, 'MPG', 1.80 * 3.785411784);
    expect(mpgEquiv).toBeCloseTo(lEquiv!, 0);
  });

  it('scales linearly with distance', () => {
    const small = estimateFuelCost(100, 8, 'L/100km', 2)!;
    const big = estimateFuelCost(1000, 8, 'L/100km', 2)!;
    expect(big).toBeCloseTo(small * 10, 5);
  });
});

describe('fuelBreakdownForLegs', () => {
  it('returns empty map when consumption is missing', () => {
    const stops = [stop({ id: 'a' }), stop({ id: 'b', kmFromPrevious: 100, countryCode: 'FR' })];
    const b = fuelBreakdownForLegs(stops, undefined, 'L/100km', 1.80, 'EUR', undefined);
    expect(b.size).toBe(0);
  });

  it('sums all legs into the default currency when no overrides match', () => {
    // 100 km @ 8 L/100km × €2 = €16; 200 km same = €32. Total €48.
    const stops = [
      stop({ id: 'a' }),
      stop({ id: 'b', kmFromPrevious: 100, countryCode: 'FR' }),
      stop({ id: 'c', kmFromPrevious: 200, countryCode: 'BE' }),
    ];
    const b = fuelBreakdownForLegs(stops, 8, 'L/100km', 2, 'EUR', []);
    expect(b.size).toBe(1);
    expect(b.get('EUR')).toBeCloseTo(48, 5);
  });

  it('routes a leg to override price + currency when destination country matches', () => {
    // FR leg uses EUR default (€1.80, 100km @ 7L/100km = €12.60)
    // SE leg uses SEK override (kr18, 200km @ 7L/100km = 252 kr)
    const stops = [
      stop({ id: 'a' }),
      stop({ id: 'b', kmFromPrevious: 100, countryCode: 'FR' }),
      stop({ id: 'c', kmFromPrevious: 200, countryCode: 'SE' }),
    ];
    const b = fuelBreakdownForLegs(stops, 7, 'L/100km', 1.80, 'EUR', [
      { countryCode: 'SE', price: 18, currency: 'SEK' },
    ]);
    expect(b.size).toBe(2);
    expect(b.get('EUR')).toBeCloseTo(12.60, 5);
    expect(b.get('SEK')).toBeCloseTo(252, 5);
  });

  it('country lookup is case-insensitive on the country code', () => {
    const stops = [
      stop({ id: 'a' }),
      stop({ id: 'b', kmFromPrevious: 100, countryCode: 'se' }), // lowercase on stop
    ];
    const b = fuelBreakdownForLegs(stops, 7, 'L/100km', 1.80, 'EUR', [
      { countryCode: 'SE', price: 18, currency: 'SEK' },
    ]);
    expect(b.get('SEK')).toBeCloseTo(7 * 18, 5); // 100km @ 7L/100km × 18 = 126
  });

  it('falls back to default when an override has zero or negative price', () => {
    const stops = [
      stop({ id: 'a' }),
      stop({ id: 'b', kmFromPrevious: 100, countryCode: 'SE' }),
    ];
    const b = fuelBreakdownForLegs(stops, 7, 'L/100km', 1.80, 'EUR', [
      { countryCode: 'SE', price: 0, currency: 'SEK' },
    ]);
    expect(b.size).toBe(1);
    expect(b.get('EUR')).toBeCloseTo(7 * 1.80, 5);
  });

  it('skips legs with zero or missing kmFromPrevious', () => {
    const stops = [
      stop({ id: 'a' }), // no kmFromPrevious — skipped
      stop({ id: 'b', kmFromPrevious: 0, countryCode: 'FR' }), // zero — skipped
      stop({ id: 'c', kmFromPrevious: 100, countryCode: 'FR' }),
    ];
    const b = fuelBreakdownForLegs(stops, 7, 'L/100km', 1.80, 'EUR', []);
    expect(b.get('EUR')).toBeCloseTo(7 * 1.80, 5);
  });
});

describe('estimateFuelVolume', () => {
  it('returns null when consumption is missing', () => {
    expect(estimateFuelVolume(500, undefined, 'L/100km')).toBeNull();
    expect(estimateFuelVolume(500, 0, 'L/100km')).toBeNull();
    expect(estimateFuelVolume(500, -1, 'L/100km')).toBeNull();
  });

  it('returns 0 for zero distance', () => {
    expect(estimateFuelVolume(0, 7, 'L/100km')).toBe(0);
  });

  it('returns litres for L/100km units', () => {
    // 500 km × 7 L/100km = 35 L
    expect(estimateFuelVolume(500, 7, 'L/100km')).toBeCloseTo(35, 5);
  });

  it('returns US gallons for MPG units', () => {
    // 500 km at 33.6 MPG ≈ 7 L/100km × 500 km / 100 = 35L → 35 / 3.785411784 ≈ 9.247 gal
    expect(estimateFuelVolume(500, 33.6, 'MPG')).toBeCloseTo(35 / 3.785411784, 2);
  });

  it('scales linearly with distance', () => {
    const small = estimateFuelVolume(100, 8, 'L/100km')!;
    const big = estimateFuelVolume(1000, 8, 'L/100km')!;
    expect(big / small).toBeCloseTo(10, 5);
  });
});

describe('fuelVolumeForLegs', () => {
  it('sums leg volumes', () => {
    const stops = [
      stop({ id: 'a' }),
      stop({ id: 'b', kmFromPrevious: 200 }),
      stop({ id: 'c', kmFromPrevious: 300 }),
    ];
    // 500 km × 7 L/100 = 35 L
    expect(fuelVolumeForLegs(stops, 7, 'L/100km')).toBeCloseTo(35, 5);
  });

  it('returns 0 when consumption is not configured', () => {
    const stops = [stop({ id: 'a' }), stop({ id: 'b', kmFromPrevious: 200 })];
    expect(fuelVolumeForLegs(stops, undefined, 'L/100km')).toBe(0);
    expect(fuelVolumeForLegs(stops, 0, 'L/100km')).toBe(0);
  });
});

describe('formatVolume', () => {
  it('formats litres for L/100km with no decimals', () => {
    expect(formatVolume(35.4, 'L/100km')).toBe('35L');
    expect(formatVolume(35.6, 'L/100km')).toBe('36L');
  });

  it('formats gallons for MPG', () => {
    expect(formatVolume(9.2, 'MPG')).toBe('9 gal');
    expect(formatVolume(15.8, 'MPG')).toBe('16 gal');
  });

  it('returns null for non-positive volumes', () => {
    expect(formatVolume(0, 'L/100km')).toBeNull();
    expect(formatVolume(-1, 'L/100km')).toBeNull();
    expect(formatVolume(null, 'L/100km')).toBeNull();
    expect(formatVolume(undefined, 'L/100km')).toBeNull();
  });
});

describe('formatFillUps', () => {
  it('returns null when tank size is not configured', () => {
    expect(formatFillUps(100, undefined, 'L/100km')).toBeNull();
    expect(formatFillUps(100, 0, 'L/100km')).toBeNull();
    expect(formatFillUps(100, null, 'L/100km')).toBeNull();
  });

  it('returns null when volume is missing', () => {
    expect(formatFillUps(null, 60, 'L/100km')).toBeNull();
    expect(formatFillUps(0, 60, 'L/100km')).toBeNull();
  });

  it("rounds up — even 1 L over a tank counts as 2 fill-ups", () => {
    expect(formatFillUps(61, 60, 'L/100km')).toBe('approx. 2 fill-ups');
    expect(formatFillUps(60, 60, 'L/100km')).toBe('approx. 1 fill-up');
    expect(formatFillUps(180, 60, 'L/100km')).toBe('approx. 3 fill-ups');
  });

  it('singular vs plural', () => {
    expect(formatFillUps(30, 60, 'L/100km')).toBe('approx. 1 fill-up');
    expect(formatFillUps(120, 60, 'L/100km')).toBe('approx. 2 fill-ups');
  });

  it('MPG users: tankSizeLitres converts to gallons before the math', () => {
    // Tank 60 L ≈ 15.85 US gal. 30 gal of consumption → ceil(30/15.85) = 2 fill-ups.
    expect(formatFillUps(30, 60, 'MPG')).toBe('approx. 2 fill-ups');
  });
});

describe('fuelConfigState', () => {
  it("returns 'unconfigured' when neither consumption nor price is set", () => {
    expect(fuelConfigState(undefined, undefined)).toEqual({ status: 'unconfigured' });
    expect(fuelConfigState(null, null)).toEqual({ status: 'unconfigured' });
    expect(fuelConfigState(0, 0)).toEqual({ status: 'unconfigured' });
    expect(fuelConfigState(NaN, NaN)).toEqual({ status: 'unconfigured' });
    expect(fuelConfigState(-1, -1)).toEqual({ status: 'unconfigured' });
  });
  it("returns 'ready' when both consumption and price are positive finite", () => {
    expect(fuelConfigState(7, 1.85)).toEqual({ status: 'ready' });
    expect(fuelConfigState(7.5, 2)).toEqual({ status: 'ready' });
  });
  it("returns 'partial' with missing=['price'] when only consumption is set", () => {
    expect(fuelConfigState(7, undefined)).toEqual({ status: 'partial', missing: ['price'] });
    expect(fuelConfigState(7, 0)).toEqual({ status: 'partial', missing: ['price'] });
    expect(fuelConfigState(7, null)).toEqual({ status: 'partial', missing: ['price'] });
  });
  it("returns 'partial' with missing=['consumption'] when only price is set", () => {
    expect(fuelConfigState(undefined, 1.85)).toEqual({ status: 'partial', missing: ['consumption'] });
    expect(fuelConfigState(0, 1.85)).toEqual({ status: 'partial', missing: ['consumption'] });
    expect(fuelConfigState(null, 1.85)).toEqual({ status: 'partial', missing: ['consumption'] });
  });
  it('rejects non-finite numbers (Infinity, NaN) as not set', () => {
    expect(fuelConfigState(Infinity, 1.85)).toEqual({ status: 'partial', missing: ['consumption'] });
    expect(fuelConfigState(7, Infinity)).toEqual({ status: 'partial', missing: ['price'] });
  });
});

describe('clampMapStripHeight', () => {
  it('clamps below the min', () => {
    expect(clampMapStripHeight(50, 900)).toBe(200);
    expect(clampMapStripHeight(0, 900)).toBe(200);
  });
  it('clamps above the max (70% of viewport)', () => {
    // 70% of 900 = 630
    expect(clampMapStripHeight(800, 900)).toBe(630);
  });
  it('respects custom min and maxRatio options', () => {
    expect(clampMapStripHeight(100, 900, { min: 150 })).toBe(150);
    // 50% of 900 = 450
    expect(clampMapStripHeight(800, 900, { maxRatio: 0.5 })).toBe(450);
  });
  it('passes through values within the bounds', () => {
    expect(clampMapStripHeight(400, 900)).toBe(400);
  });
  it('returns the min for non-finite inputs (defensive)', () => {
    expect(clampMapStripHeight(NaN, 900)).toBe(200);
    expect(clampMapStripHeight(Infinity, 900)).toBe(200);
  });
});

describe('tripCountriesFromStops', () => {
  it('returns an empty list when no stops carry a countryCode', () => {
    expect(tripCountriesFromStops([])).toEqual([]);
    expect(tripCountriesFromStops([stop({ id: 'a' })])).toEqual([]);
    expect(tripCountriesFromStops([stop({ id: 'a', countryCode: '' })])).toEqual([]);
  });
  it('returns each distinct country in visit order', () => {
    const stops = [
      stop({ id: 'a', countryCode: 'SE' }),
      stop({ id: 'b', countryCode: 'DK' }),
      stop({ id: 'c', countryCode: 'DE' }),
    ];
    expect(tripCountriesFromStops(stops)).toEqual(['SE', 'DK', 'DE']);
  });
  it('de-duplicates repeated countries (e.g. cross-border-back trips)', () => {
    // Stockholm → Copenhagen → Malmö (SE again) → Hamburg. SE should only
    // appear once even though it bookends a Danish stop.
    const stops = [
      stop({ id: 'a', countryCode: 'SE' }),
      stop({ id: 'b', countryCode: 'DK' }),
      stop({ id: 'c', countryCode: 'SE' }),
      stop({ id: 'd', countryCode: 'DE' }),
    ];
    expect(tripCountriesFromStops(stops)).toEqual(['SE', 'DK', 'DE']);
  });
  it('normalises country codes to uppercase', () => {
    const stops = [
      stop({ id: 'a', countryCode: 'se' }),
      stop({ id: 'b', countryCode: 'Dk' }),
    ];
    expect(tripCountriesFromStops(stops)).toEqual(['SE', 'DK']);
  });
  it('AC6: list changes when stops are added/removed (pure derivation)', () => {
    // Issue #57 AC6: works when trip.countries[] changes after stops are
    // added/removed. Since this fn derives from stops on every call, the
    // output reflects the current list immediately.
    const beforeAdd = [stop({ id: 'a', countryCode: 'SE' })];
    expect(tripCountriesFromStops(beforeAdd)).toEqual(['SE']);
    const afterAdd = [...beforeAdd, stop({ id: 'b', countryCode: 'DE' })];
    expect(tripCountriesFromStops(afterAdd)).toEqual(['SE', 'DE']);
    const afterRemove = afterAdd.filter((s) => s.id !== 'a');
    expect(tripCountriesFromStops(afterRemove)).toEqual(['DE']);
  });
});

describe('compileFuelOverrides (issue #57 AC4 — empty/zero rows not saved)', () => {
  it('returns numeric-priced rows only', () => {
    const out = compileFuelOverrides([
      { countryCode: 'SE', price: '2.15', currency: 'SEK' },
      { countryCode: 'DE', price: '1.72', currency: 'EUR' },
    ]);
    expect(out).toEqual([
      { countryCode: 'SE', price: 2.15, currency: 'SEK' },
      { countryCode: 'DE', price: 1.72, currency: 'EUR' },
    ]);
  });
  it("drops empty-price rows (the 'matches default' state)", () => {
    const out = compileFuelOverrides([
      { countryCode: 'SE', price: '', currency: 'SEK' },
      { countryCode: 'DE', price: '1.72', currency: 'EUR' },
    ]);
    expect(out).toEqual([{ countryCode: 'DE', price: 1.72, currency: 'EUR' }]);
  });
  it('drops zero-priced rows (redundant when matching default)', () => {
    const out = compileFuelOverrides([
      { countryCode: 'SE', price: '0', currency: 'SEK' },
      { countryCode: 'DE', price: '0.00', currency: 'EUR' },
    ]);
    expect(out).toEqual([]);
  });
  it('drops negative or NaN prices', () => {
    const out = compileFuelOverrides([
      { countryCode: 'SE', price: '-1', currency: 'SEK' },
      { countryCode: 'DE', price: 'abc', currency: 'EUR' },
    ]);
    expect(out).toEqual([]);
  });
  it('drops rows missing currency', () => {
    const out = compileFuelOverrides([
      { countryCode: 'SE', price: '2.15', currency: '' },
    ]);
    expect(out).toEqual([]);
  });
  it('drops rows missing countryCode', () => {
    const out = compileFuelOverrides([
      { countryCode: '', price: '2.15', currency: 'EUR' },
    ]);
    expect(out).toEqual([]);
  });
  it('mixed input: valid rows pass, invalid rows filtered, order preserved', () => {
    const out = compileFuelOverrides([
      { countryCode: 'SE', price: '2.15', currency: 'SEK' },  // keep
      { countryCode: 'DK', price: '', currency: 'DKK' },        // drop (empty)
      { countryCode: 'DE', price: '1.72', currency: 'EUR' },  // keep
      { countryCode: '', price: '1', currency: 'EUR' },         // drop (no code)
      { countryCode: 'AT', price: '0', currency: 'EUR' },       // drop (zero)
      { countryCode: 'IT', price: '1.91', currency: 'EUR' },  // keep
    ]);
    expect(out).toEqual([
      { countryCode: 'SE', price: 2.15, currency: 'SEK' },
      { countryCode: 'DE', price: 1.72, currency: 'EUR' },
      { countryCode: 'IT', price: 1.91, currency: 'EUR' },
    ]);
  });
});

describe('legCost', () => {
  it('returns null for legs with 0 km', () => {
    const s = stop({ id: 'a', kmFromPrevious: 0 });
    expect(legCost(s, 7, 'L/100km', 1.80, 'EUR', [])).toBeNull();
  });

  it('returns null when consumption is not configured', () => {
    const s = stop({ id: 'a', kmFromPrevious: 200 });
    expect(legCost(s, undefined, 'L/100km', 1.80, 'EUR', [])).toBeNull();
    expect(legCost(s, 0, 'L/100km', 1.80, 'EUR', [])).toBeNull();
  });

  it('returns null when price is not configured', () => {
    const s = stop({ id: 'a', kmFromPrevious: 200 });
    expect(legCost(s, 7, 'L/100km', undefined, 'EUR', [])).toBeNull();
  });

  it('returns amount + default currency when no override matches', () => {
    const s = stop({ id: 'a', countryCode: 'FR', kmFromPrevious: 100 });
    const result = legCost(s, 7, 'L/100km', 1.80, 'EUR', []);
    expect(result?.currency).toBe('EUR');
    expect(result?.amount).toBeCloseTo(12.6, 1); // 100km * 7L/100 = 7L * 1.80 = 12.60
  });

  it('routes leg to override price + currency when destination country matches', () => {
    const s = stop({ id: 'a', countryCode: 'GB', kmFromPrevious: 100 });
    const result = legCost(s, 7, 'L/100km', 1.80, 'EUR', [
      { countryCode: 'GB', price: 1.50, currency: 'GBP' },
    ]);
    expect(result?.currency).toBe('GBP');
    expect(result?.amount).toBeCloseTo(10.5, 1); // 100km * 7L/100 = 7L * 1.50 = 10.50
  });

  it('falls back to default when override has zero price', () => {
    const s = stop({ id: 'a', countryCode: 'GB', kmFromPrevious: 100 });
    const result = legCost(s, 7, 'L/100km', 1.80, 'EUR', [
      { countryCode: 'GB', price: 0, currency: 'GBP' },
    ]);
    expect(result?.currency).toBe('EUR');
  });
});

describe('formatBreakdown', () => {
  it('returns null for empty breakdown', () => {
    expect(formatBreakdown(new Map())).toBeNull();
  });

  it('formats a single-currency breakdown like formatCurrency', () => {
    const out = formatBreakdown(new Map([['EUR', 63]]));
    expect(out).toMatch(/63/);
    expect(out).toMatch(/€|EUR/);
  });

  it('joins multi-currency entries with " + " in insertion order', () => {
    const out = formatBreakdown(new Map([['EUR', 100], ['SEK', 500]]));
    expect(out).toMatch(/.+ \+ .+/);
    // EUR entry comes first (insertion order)
    const parts = (out || '').split(' + ');
    expect(parts[0]).toMatch(/€|EUR/);
    expect(parts[1]).toMatch(/SEK|kr/);
  });
});

describe('formatCurrency', () => {
  it('formats EUR amounts with a currency symbol', () => {
    const s = formatCurrency(63, 'EUR');
    expect(s).toMatch(/63/);
    expect(s).toMatch(/€|EUR/);
  });

  it('falls back to "<amount> <CODE>" for invalid currency codes', () => {
    const s = formatCurrency(63, 'NOT-A-CURRENCY');
    expect(s).toContain('63');
  });

  it('defaults to EUR when currency is undefined', () => {
    const s = formatCurrency(50, undefined);
    expect(s).toMatch(/€|EUR/);
  });

  it('drops decimal digits for amounts >= 100', () => {
    const s = formatCurrency(150.42, 'EUR');
    expect(s).not.toMatch(/\.4/);
  });
});

describe('applyDays — multi-night stays (issue #114)', () => {
  it('an overnight stop with nights:3 consumes 3 day numbers', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', kmFromPrevious: 100, type: 'overnight', nights: 3 }),
      stop({ id: 'c', kmFromPrevious: 100 }),
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 4]);
  });
  it('nights defaults to 1 — existing trips are unchanged', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', kmFromPrevious: 100, type: 'overnight' }),
      stop({ id: 'c', kmFromPrevious: 100 }),
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 2]);
  });
  it('nights is ignored on non-overnight stops', () => {
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'b', kmFromPrevious: 100, nights: 5 }),
      stop({ id: 'c', kmFromPrevious: 100 }),
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 1]);
  });
});

describe('EV formatting (issue #118)', () => {
  it('formats volume as kWh for EV trips', () => {
    expect(formatVolume(52.4, 'L/100km', 'ev')).toBe('52 kWh');
    expect(formatVolume(52.4, 'L/100km')).toBe('52L');
  });
  it('counts charges instead of fill-ups for EV trips', () => {
    expect(formatFillUps(100, 60, 'L/100km', 'ev')).toBe('approx. 2 charges');
    expect(formatFillUps(50, 60, 'L/100km', 'ev')).toBe('approx. 1 charge');
    expect(formatFillUps(100, 60, 'L/100km')).toBe('approx. 2 fill-ups');
  });
});
