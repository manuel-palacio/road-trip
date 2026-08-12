import { TYPE_FOR_CATEGORY, nearbySearchFilterFor, placeTypeForCategory } from '../nearby-search';

describe('TYPE_FOR_CATEGORY (issue #71)', () => {
  it('maps fuel → gas_station (preserves the legacy FuelStopFinder behaviour)', () => {
    expect(TYPE_FOR_CATEGORY.fuel).toBe('gas_station');
  });
  it('maps food / hotel / scenic / landmark to sensible Google Place types', () => {
    expect(TYPE_FOR_CATEGORY.food).toBe('restaurant');
    expect(TYPE_FOR_CATEGORY.hotel).toBe('lodging');
    expect(TYPE_FOR_CATEGORY.scenic).toBe('tourist_attraction');
    expect(TYPE_FOR_CATEGORY.landmark).toBe('tourist_attraction');
  });
  it('returns null for "other" (no type filter)', () => {
    expect(TYPE_FOR_CATEGORY.other).toBeNull();
  });
  it('covers every PinCategory (no missing keys)', () => {
    // Lock the keyset so a future PinCategory addition is forced to
    // decide whether it deserves a Google Place type mapping.
    const keys = Object.keys(TYPE_FOR_CATEGORY).sort();
    expect(keys).toEqual(['food', 'fuel', 'hotel', 'landmark', 'other', 'scenic']);
  });
});

describe('placeTypeForCategory', () => {
  it('returns the mapped string for categories with a type', () => {
    expect(placeTypeForCategory('fuel')).toBe('gas_station');
    expect(placeTypeForCategory('food')).toBe('restaurant');
  });
  it('returns null for categories without a backing type', () => {
    expect(placeTypeForCategory('other')).toBeNull();
  });
});

describe('placeTypeForCategory — EV (issue #118)', () => {
  it('searches charging stations for fuel on EV trips, gas stations otherwise', () => {
    expect(placeTypeForCategory('fuel', 'ev')).toBe('electric_vehicle_charging_station');
    expect(placeTypeForCategory('fuel')).toBe('gas_station');
    expect(placeTypeForCategory('fuel', 'diesel')).toBe('gas_station');
    expect(placeTypeForCategory('hotel', 'ev')).toBe('lodging');
  });
});

describe('nearbySearchFilterFor — EV keyword fallback (issue #118)', () => {
  it('adds a keyword for EV fuel searches — legacy PlacesService ignores the new EV type', () => {
    expect(nearbySearchFilterFor('fuel', 'ev')).toEqual({
      type: 'electric_vehicle_charging_station',
      keyword: 'EV charging station',
    });
  });
  it('keeps plain type filters for everything else', () => {
    expect(nearbySearchFilterFor('fuel')).toEqual({ type: 'gas_station' });
    expect(nearbySearchFilterFor('hotel', 'ev')).toEqual({ type: 'lodging' });
    expect(nearbySearchFilterFor('other')).toEqual({});
  });
});
