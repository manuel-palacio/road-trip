import { describe, expect, it } from 'vitest';
import { fuelRemaining } from '../fuel-remaining';

describe('fuelRemaining', () => {
  it('reports what is left, not what was burned', () => {
    expect(fuelRemaining(100, 500)).toEqual({ remainingKm: 400, percent: 80, level: 'ok' });
  });

  it('never exceeds 100% or drops below 0 — a full tank reads 100, an overrun reads 0', () => {
    expect(fuelRemaining(0, 500)).toMatchObject({ remainingKm: 500, percent: 100 });
    // The case that produced "980/500 km · 196%" in the UI.
    expect(fuelRemaining(980, 500)).toEqual({ remainingKm: 0, percent: 0, level: 'empty' });
  });

  it('warns as the tank drains and flags empty at the threshold', () => {
    expect(fuelRemaining(350, 500).level).toBe('low');
    expect(fuelRemaining(460, 500).level).toBe('empty');
    expect(fuelRemaining(50, 500).level).toBe('ok');
  });

  it('returns null when there is no tank range to measure against', () => {
    expect(fuelRemaining(100, 0)).toBeNull();
    expect(fuelRemaining(100, undefined)).toBeNull();
  });
});
