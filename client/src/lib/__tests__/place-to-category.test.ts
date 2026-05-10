import { describe, expect, it } from 'vitest';
import { guessCategoryFromTypes } from '../place-to-category';

describe('guessCategoryFromTypes', () => {
  it('returns "other" for missing or empty types', () => {
    expect(guessCategoryFromTypes(undefined)).toBe('other');
    expect(guessCategoryFromTypes([])).toBe('other');
  });

  it('maps lodging → hotel', () => {
    expect(guessCategoryFromTypes(['lodging', 'point_of_interest'])).toBe('hotel');
  });

  it('maps gas_station → fuel', () => {
    expect(guessCategoryFromTypes(['gas_station', 'establishment'])).toBe('fuel');
  });

  it('maps restaurant/cafe → food', () => {
    expect(guessCategoryFromTypes(['restaurant'])).toBe('food');
    expect(guessCategoryFromTypes(['cafe', 'food', 'point_of_interest'])).toBe('food');
  });

  it('maps natural_feature/park → scenic', () => {
    expect(guessCategoryFromTypes(['natural_feature'])).toBe('scenic');
    expect(guessCategoryFromTypes(['park'])).toBe('scenic');
  });

  it('maps tourist_attraction/museum → landmark', () => {
    expect(guessCategoryFromTypes(['tourist_attraction'])).toBe('landmark');
    expect(guessCategoryFromTypes(['museum', 'point_of_interest'])).toBe('landmark');
  });

  it('prefers most specific category when multiple match', () => {
    // lodging beats point_of_interest (which would map to landmark)
    expect(guessCategoryFromTypes(['lodging', 'point_of_interest'])).toBe('hotel');
    // restaurant beats point_of_interest
    expect(guessCategoryFromTypes(['restaurant', 'point_of_interest'])).toBe('food');
  });

  it('falls back to "other" for unknown types', () => {
    expect(guessCategoryFromTypes(['atm', 'finance'])).toBe('other');
  });
});
