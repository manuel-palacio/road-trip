import { describe, expect, it } from 'vitest';
import { clearableFuelFields } from '../fuel-payload';

describe('clearableFuelFields', () => {
  it('maps valid inputs to their numeric values', () => {
    const fields = clearableFuelFields({
      fuelConsumption: 6.5,
      fuelPrice: 1.85,
      fuelOverrides: [{ countryCode: 'FR', price: 1.95, currency: 'EUR' }],
      tankRangeKm: 700,
      tankSizeLitres: 55,
    });
    expect(fields).toEqual({
      fuelConsumption: 6.5,
      fuelPrice: 1.85,
      fuelOverrides: [{ countryCode: 'FR', price: 1.95, currency: 'EUR' }],
      tankRangeKm: 700,
      tankSizeLitres: 55,
    });
  });

  it('maps blank or invalid inputs to null so the server clears them', () => {
    const fields = clearableFuelFields({
      fuelConsumption: NaN,
      fuelPrice: 0,
      fuelOverrides: [],
      tankRangeKm: 0,
      tankSizeLitres: NaN,
    });
    expect(fields).toEqual({
      fuelConsumption: null,
      fuelPrice: null,
      fuelOverrides: null,
      tankRangeKm: null,
      tankSizeLitres: null,
    });
  });

  it('survives JSON serialization — cleared fields stay in the request body', () => {
    const body = JSON.parse(JSON.stringify(clearableFuelFields({
      fuelConsumption: NaN,
      fuelPrice: NaN,
      fuelOverrides: [],
      tankRangeKm: 0,
      tankSizeLitres: NaN,
    })));
    expect(Object.keys(body).sort()).toEqual([
      'fuelConsumption', 'fuelOverrides', 'fuelPrice', 'tankRangeKm', 'tankSizeLitres',
    ]);
  });
});
