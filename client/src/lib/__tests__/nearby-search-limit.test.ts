import { describe, it, expect, afterEach } from 'vitest';
import limits from '../../../../lib/limits.js';

const { effectiveNearbySearchDailyLimit } = limits;

describe('effectiveNearbySearchDailyLimit', () => {
  afterEach(() => {
    delete process.env.FREE_NEARBY_SEARCH_DAILY_LIMIT;
    delete process.env.PRO_NEARBY_SEARCH_DAILY_LIMIT;
  });

  it('uses a positive per-user override above plan/env', () => {
    expect(effectiveNearbySearchDailyLimit({ nearbySearchDailyLimit: 42, plan: 'free' })).toBe(42);
  });

  it('uses PRO_NEARBY_SEARCH_DAILY_LIMIT for pro users', () => {
    process.env.PRO_NEARBY_SEARCH_DAILY_LIMIT = '500';
    expect(effectiveNearbySearchDailyLimit({ plan: 'pro' })).toBe(500);
  });

  it('uses FREE_NEARBY_SEARCH_DAILY_LIMIT for free users', () => {
    process.env.FREE_NEARBY_SEARCH_DAILY_LIMIT = '80';
    expect(effectiveNearbySearchDailyLimit({ plan: 'free' })).toBe(80);
  });

  it('falls back to defaults 150 free / 300 pro when env unset', () => {
    expect(effectiveNearbySearchDailyLimit({ plan: 'free' })).toBe(150);
    expect(effectiveNearbySearchDailyLimit({ plan: 'pro' })).toBe(300);
    expect(effectiveNearbySearchDailyLimit(null)).toBe(150);
  });
});
