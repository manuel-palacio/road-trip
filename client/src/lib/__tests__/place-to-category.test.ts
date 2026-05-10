import { describe, expect, it } from 'vitest';
import { guessCategoryFromTypes, isConcretePlace } from '../place-to-category';

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

describe('isConcretePlace', () => {
  it('returns false for missing or empty types', () => {
    expect(isConcretePlace(undefined)).toBe(false);
    expect(isConcretePlace([])).toBe(false);
  });

  it('returns true for a hotel result', () => {
    expect(isConcretePlace(['lodging', 'point_of_interest', 'establishment'])).toBe(true);
  });

  it('returns true for a restaurant result', () => {
    expect(isConcretePlace(['restaurant', 'food', 'point_of_interest'])).toBe(true);
  });

  it('returns false for a city/locality (Reims)', () => {
    expect(isConcretePlace(['locality', 'political'])).toBe(false);
  });

  it('returns false for an administrative area (region/country)', () => {
    expect(isConcretePlace(['administrative_area_level_1', 'political'])).toBe(false);
    expect(isConcretePlace(['country', 'political'])).toBe(false);
  });

  it('returns false for a postal code lookup', () => {
    expect(isConcretePlace(['postal_code'])).toBe(false);
  });

  it('returns true when establishment is the only marker (generic POI)', () => {
    expect(isConcretePlace(['establishment'])).toBe(true);
  });
});
