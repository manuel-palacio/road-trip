import { describe, expect, it } from 'vitest';
import {
  collectTripFields,
  CREATE_TRIP_EXTRA_FIELDS,
  UPDATABLE_TRIP_FIELDS,
} from '../../../../shared/trip-payload.js';

describe('collectTripFields', () => {
  it('keeps fuel, tank and autoFuel fields sent on trip create', () => {
    const body = {
      fuelConsumption: 6.5,
      fuelUnit: 'L/100km',
      fuelPrice: 1.85,
      fuelCurrency: 'EUR',
      fuelOverrides: [{ countryCode: 'FR', price: 1.95, currency: 'EUR' }],
      tankRangeKm: 700,
      tankSizeLitres: 55,
      autoFuel: false,
      dataVersion: 3,
      totalKm: 1234,
      totalDays: 4,
      countries: ['FR', 'ES'],
    };
    const result = collectTripFields(body, CREATE_TRIP_EXTRA_FIELDS);
    expect(result.error).toBeUndefined();
    expect(result.value).toEqual(body);
  });

  it('ignores keys outside the requested field list', () => {
    const result = collectTripFields(
      { ownerUid: 'attacker', shareToken: 'x', fuelPrice: 1.5 },
      CREATE_TRIP_EXTRA_FIELDS,
    );
    expect(result.value).toEqual({ fuelPrice: 1.5 });
  });

  it('does not allow templateVisibility on create', () => {
    expect(CREATE_TRIP_EXTRA_FIELDS).not.toContain('templateVisibility');
  });

  it('rejects invalid fuel values instead of persisting them', () => {
    const result = collectTripFields({ fuelPrice: -1 }, CREATE_TRIP_EXTRA_FIELDS);
    expect(result.error).toMatch(/fuelPrice/);
  });

  it('passes null through as an explicit clear', () => {
    const result = collectTripFields({ fuelPrice: null, fuelOverrides: null }, UPDATABLE_TRIP_FIELDS);
    expect(result.value).toEqual({ fuelPrice: null, fuelOverrides: null });
  });

  it('validates non-fuel trip fields for updates', () => {
    expect(collectTripFields({ name: '   ' }, UPDATABLE_TRIP_FIELDS).error).toMatch(/name/);
    expect(collectTripFields({ maxKmPerDay: -5 }, UPDATABLE_TRIP_FIELDS).error).toMatch(/maxKmPerDay/);
    expect(collectTripFields({ stops: 'nope' }, UPDATABLE_TRIP_FIELDS).error).toMatch(/stops/);
    expect(collectTripFields({ name: '  Alps  ' }, UPDATABLE_TRIP_FIELDS).value).toEqual({ name: 'Alps' });
  });
});

describe('schedule fields (issue #114)', () => {
  it('accepts driveStartTime and maxDriveMinutesPerDay on create and update', () => {
    const body = { driveStartTime: '08:30', maxDriveMinutesPerDay: 420 };
    expect(collectTripFields(body, CREATE_TRIP_EXTRA_FIELDS).value).toEqual(body);
    expect(collectTripFields(body, UPDATABLE_TRIP_FIELDS).value).toEqual(body);
  });

  it('accepts null as an explicit clear for both schedule fields', () => {
    const body = { driveStartTime: null, maxDriveMinutesPerDay: null };
    expect(collectTripFields(body, UPDATABLE_TRIP_FIELDS).value).toEqual(body);
  });

  it('rejects malformed drive start times and non-positive budgets', () => {
    expect(collectTripFields({ driveStartTime: '25:00' }, UPDATABLE_TRIP_FIELDS).error).toMatch(/driveStartTime/);
    expect(collectTripFields({ driveStartTime: 'morning' }, UPDATABLE_TRIP_FIELDS).error).toMatch(/driveStartTime/);
    expect(collectTripFields({ maxDriveMinutesPerDay: 0 }, UPDATABLE_TRIP_FIELDS).error).toMatch(/maxDriveMinutesPerDay/);
  });
});
