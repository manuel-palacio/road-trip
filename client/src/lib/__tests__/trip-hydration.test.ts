import { describe, expect, it } from 'vitest';
import { shouldHydrateTrip } from '../trip-hydration';

describe('shouldHydrateTrip', () => {
  it('hydrates the first time a trip loads', () => {
    expect(shouldHydrateTrip(null, { id: 't1' })).toBe(true);
  });

  it('does not re-hydrate the same trip — a refetch or post-save cache write must not clobber local edits', () => {
    expect(shouldHydrateTrip('t1', { id: 't1' })).toBe(false);
  });

  it('hydrates again when navigating to a different trip', () => {
    expect(shouldHydrateTrip('t1', { id: 't2' })).toBe(true);
  });

  it('never hydrates without loaded trip data', () => {
    expect(shouldHydrateTrip(null, undefined)).toBe(false);
    expect(shouldHydrateTrip('t1', undefined)).toBe(false);
  });
});
