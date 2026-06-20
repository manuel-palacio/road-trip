import { describe, expect, it } from 'vitest';
import { favoriteKey } from '../favorite-key';

describe('favoriteKey', () => {
  it('prefers placeId when present', () => {
    expect(favoriteKey({ placeId: 'abc', name: 'x', lat: 1, lng: 2 })).toBe('pid:abc');
  });
  it('falls back to name|lat|lng signature when no placeId', () => {
    expect(favoriteKey({ name: 'Reims', lat: 49.2583, lng: 4.0317 })).toBe('coord:Reims|49.2583|4.0317');
  });
  it('rounds lat/lng to 4 decimals (consistent with server dedup)', () => {
    expect(favoriteKey({ name: 'X', lat: 49.258345, lng: 4.031712 })).toBe('coord:X|49.2583|4.0317');
  });
  it('is stable across calls with the same inputs', () => {
    const a = favoriteKey({ name: 'X', lat: 1, lng: 2 });
    const b = favoriteKey({ name: 'X', lat: 1, lng: 2 });
    expect(a).toBe(b);
  });
});
