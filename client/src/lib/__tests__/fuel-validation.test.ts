import { describe, expect, it } from 'vitest';
import {
  validateFuelCurrency,
  validateFuelField,
  validateFuelOverrides,
  validateFuelUnit,
  validatePositiveNumber,
// @ts-expect-error — vitest's bundler resolution finds the .d.ts but the path
// crosses the repo root. Type safety is preserved by the declaration file.
} from '../../../../shared/fuel-validation.js';

describe('validateFuelOverrides', () => {
  it('rejects non-arrays', () => {
    expect(validateFuelOverrides('not-an-array')).toHaveProperty('error');
    expect(validateFuelOverrides({ countryCode: 'FR' })).toHaveProperty('error');
  });

  it('rejects arrays with more than 20 entries', () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => ({
      countryCode: 'FR', price: 1.5, currency: 'EUR',
    }));
    expect(validateFuelOverrides(tooMany)).toHaveProperty('error');
  });

  it('rejects entries with overlong countryCode', () => {
    const result = validateFuelOverrides([{ countryCode: 'TOOLONG', price: 1.5, currency: 'EUR' }]);
    expect(result).toHaveProperty('error');
  });

  it('rejects entries with non-positive price', () => {
    expect(validateFuelOverrides([{ countryCode: 'FR', price: -1, currency: 'EUR' }])).toHaveProperty('error');
    expect(validateFuelOverrides([{ countryCode: 'FR', price: 0, currency: 'EUR' }])).toHaveProperty('error');
    expect(validateFuelOverrides([{ countryCode: 'FR', price: NaN, currency: 'EUR' }])).toHaveProperty('error');
  });

  it('rejects entries with null currency', () => {
    const result = validateFuelOverrides([{ countryCode: 'FR', price: 1.5, currency: null }]);
    expect(result).toHaveProperty('error');
  });

  it('rejects entries with non-3-letter currency', () => {
    expect(validateFuelOverrides([{ countryCode: 'FR', price: 1.5, currency: 'EU' }])).toHaveProperty('error');
    expect(validateFuelOverrides([{ countryCode: 'FR', price: 1.5, currency: 'EUROS' }])).toHaveProperty('error');
  });

  it('normalises country + currency to uppercase', () => {
    const result = validateFuelOverrides([{ countryCode: 'fr', price: 1.85, currency: 'eur' }]);
    expect(result).toEqual({ value: [{ countryCode: 'FR', price: 1.85, currency: 'EUR' }] });
  });

  it('accepts null as an explicit clear', () => {
    expect(validateFuelOverrides(null)).toEqual({ value: null });
  });
});

describe('validatePositiveNumber', () => {
  it('accepts positive finite numbers', () => {
    expect(validatePositiveNumber('fuelConsumption', 7.5)).toEqual({ value: 7.5 });
  });
  it('rejects negative numbers', () => {
    expect(validatePositiveNumber('fuelConsumption', -5)).toHaveProperty('error');
  });
  it('rejects zero', () => {
    expect(validatePositiveNumber('fuelConsumption', 0)).toHaveProperty('error');
  });
  it('rejects NaN and Infinity', () => {
    expect(validatePositiveNumber('fuelConsumption', NaN)).toHaveProperty('error');
    expect(validatePositiveNumber('fuelConsumption', Infinity)).toHaveProperty('error');
  });
  it('rejects strings', () => {
    expect(validatePositiveNumber('fuelConsumption', '7')).toHaveProperty('error');
  });
  it('accepts null as an explicit clear', () => {
    expect(validatePositiveNumber('fuelConsumption', null)).toEqual({ value: null });
  });
});

describe('validateFuelUnit', () => {
  it('accepts L/100km and MPG', () => {
    expect(validateFuelUnit('L/100km')).toEqual({ value: 'L/100km' });
    expect(validateFuelUnit('MPG')).toEqual({ value: 'MPG' });
  });
  it('rejects any other string', () => {
    expect(validateFuelUnit('INVALID')).toHaveProperty('error');
    expect(validateFuelUnit('mpg')).toHaveProperty('error');
  });
  it('accepts null as an explicit clear', () => {
    expect(validateFuelUnit(null)).toEqual({ value: null });
  });
});

describe('validateFuelField (PUT dispatcher)', () => {
  it('returns null for non-fuel keys (caller passes them through)', () => {
    expect(validateFuelField('name', 'some name')).toBeNull();
    expect(validateFuelField('startDate', '2026-06-01')).toBeNull();
    expect(validateFuelField('stops', [])).toBeNull();
  });

  it('routes fuelConsumption to validatePositiveNumber', () => {
    expect(validateFuelField('fuelConsumption', -5)).toHaveProperty('error');
    expect(validateFuelField('fuelConsumption', 7)).toEqual({ value: 7 });
  });

  it('routes fuelPrice to validatePositiveNumber', () => {
    expect(validateFuelField('fuelPrice', 0)).toHaveProperty('error');
    expect(validateFuelField('fuelPrice', 1.85)).toEqual({ value: 1.85 });
  });

  it('routes tankRangeKm to validatePositiveNumber', () => {
    expect(validateFuelField('tankRangeKm', -100)).toHaveProperty('error');
    expect(validateFuelField('tankRangeKm', 500)).toEqual({ value: 500 });
  });

  it('routes fuelUnit to validateFuelUnit', () => {
    expect(validateFuelField('fuelUnit', 'INVALID')).toHaveProperty('error');
    expect(validateFuelField('fuelUnit', 'L/100km')).toEqual({ value: 'L/100km' });
  });

  it('routes fuelCurrency to validateFuelCurrency', () => {
    expect(validateFuelField('fuelCurrency', 'EUROS')).toHaveProperty('error');
    expect(validateFuelField('fuelCurrency', 'eur')).toEqual({ value: 'EUR' });
  });

  it('routes fuelOverrides to validateFuelOverrides (rejects malformed)', () => {
    const malformed = [{ countryCode: 'TOOLONG', price: -1, currency: null }];
    expect(validateFuelField('fuelOverrides', malformed)).toHaveProperty('error');
  });

  it('routes fuelOverrides to validateFuelOverrides (normalises valid)', () => {
    expect(
      validateFuelField('fuelOverrides', [
        { countryCode: 'fr', price: 1.85, currency: 'eur' },
      ]),
    ).toEqual({ value: [{ countryCode: 'FR', price: 1.85, currency: 'EUR' }] });
  });
});

describe('validateFuelCurrency', () => {
  it('accepts 3-letter codes (case-insensitive, normalised to uppercase)', () => {
    expect(validateFuelCurrency('eur')).toEqual({ value: 'EUR' });
    expect(validateFuelCurrency('USD')).toEqual({ value: 'USD' });
  });
  it('rejects 2-letter or 4-letter strings', () => {
    expect(validateFuelCurrency('EU')).toHaveProperty('error');
    expect(validateFuelCurrency('EUROS')).toHaveProperty('error');
  });
  it('rejects non-strings', () => {
    expect(validateFuelCurrency(123)).toHaveProperty('error');
    expect(validateFuelCurrency({})).toHaveProperty('error');
  });
  it('accepts null as an explicit clear', () => {
    expect(validateFuelCurrency(null)).toEqual({ value: null });
  });
});

describe('validateFuelField — fuelType (issue #118)', () => {
  it('accepts the vehicle kinds and null as a clear', () => {
    expect(validateFuelField('fuelType', 'gasoline')).toEqual({ value: 'gasoline' });
    expect(validateFuelField('fuelType', 'diesel')).toEqual({ value: 'diesel' });
    expect(validateFuelField('fuelType', 'ev')).toEqual({ value: 'ev' });
    expect(validateFuelField('fuelType', null)).toEqual({ value: null });
  });
  it('rejects unknown kinds', () => {
    expect(validateFuelField('fuelType', 'rocket')).toHaveProperty('error');
    expect(validateFuelField('fuelType', 7)).toHaveProperty('error');
  });
});
