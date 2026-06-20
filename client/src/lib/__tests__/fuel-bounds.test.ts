import { describe, expect, it } from 'vitest';
import { validateConsumption, validatePrice, validateTankSize, validateTankRange } from '../fuel-bounds';

describe('validateConsumption', () => {
  it('accepts valid L/100km', () => {
    expect(validateConsumption(7.5, 'L/100km')).toBeNull();
  });
  it('rejects out-of-range L/100km', () => {
    expect(validateConsumption(9999, 'L/100km')).toMatch(/between/i);
    expect(validateConsumption(0, 'L/100km')).toMatch(/between/i);
  });
  it('accepts valid MPG', () => {
    expect(validateConsumption(35, 'MPG')).toBeNull();
  });
  it('rejects out-of-range MPG', () => {
    expect(validateConsumption(300, 'MPG')).toMatch(/between/i);
    expect(validateConsumption(1, 'MPG')).toMatch(/between/i);
  });
  it('allows NaN (treated as empty)', () => {
    expect(validateConsumption(NaN, 'L/100km')).toBeNull();
  });
});

describe('validatePrice', () => {
  it('accepts valid prices', () => {
    expect(validatePrice(1.49)).toBeNull();
    expect(validatePrice(0.01)).toBeNull();
    expect(validatePrice(99.99)).toBeNull();
  });
  it('rejects 0 and above 99.99', () => {
    expect(validatePrice(0)).toMatch(/between/i);
    expect(validatePrice(100)).toMatch(/between/i);
  });
});

describe('validateTankSize', () => {
  it('accepts 50 L', () => { expect(validateTankSize(50)).toBeNull(); });
  it('rejects 5 L', () => { expect(validateTankSize(5)).toMatch(/between/i); });
  it('rejects 500 L', () => { expect(validateTankSize(500)).toMatch(/between/i); });
});

describe('validateTankRange', () => {
  it('accepts 500 km', () => { expect(validateTankRange(500)).toBeNull(); });
  it('rejects 20 km', () => { expect(validateTankRange(20)).toMatch(/between/i); });
  it('rejects 3000 km', () => { expect(validateTankRange(3000)).toMatch(/between/i); });
});
