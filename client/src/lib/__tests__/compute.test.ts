import { describe, expect, it } from 'vitest';
import {
  DAY_COLORS,
  applyDays,
  dayColor,
  estimateFuelCost,
  formatBreakdown,
  formatCurrency,
  formatDayDate,
  formatDuration,
  fuelBreakdownForLegs,
  groupByDay,
  isFuelStop,
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
  it('auto-splits to a new day when cumulative km exceeds maxKm', () => {
    const stops = [
      stop({ id: 'a' }),
      stop({ id: 'b', kmFromPrevious: 400 }),
      stop({ id: 'c', kmFromPrevious: 350 }), // 750 > 600 → day 2
    ];
    const out = applyDays(stops, 600);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 2]);
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
  it("fuel stops don't trigger a day boundary, even when they cross maxKm", () => {
    // Without the fuel-exemption, gas at 350 km would tip dayKm past 300 and
    // push the fuel stop to day 2. Fuel stops are pit-stops: they must stay
    // on the current day so the day boundary lands at the next regular stop.
    const stops = [
      stop({ id: 'a', type: 'start' }),
      stop({ id: 'gas', type: 'fuel', kmFromPrevious: 350 }),
      stop({ id: 'b', kmFromPrevious: 150 }),
    ];
    const out = applyDays(stops, 300);
    expect(out.map((s) => s.dayNumber)).toEqual([1, 1, 2]);
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
