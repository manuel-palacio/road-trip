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
  it('exposes the city emoji and the neutral tint', () => {
    expect(DEFAULT_STOP_META.emoji).toBe('🏙');
    expect(DEFAULT_STOP_META.tint).toBe('#9b9080');
  });
});
