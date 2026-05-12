import { describe, expect, it } from 'vitest';
import { accommodationLinks } from '../booking-links';
import type { Stop } from '../types';

function stop(overrides: Partial<Stop> & { id: string }): Stop {
  return {
    id: overrides.id,
    name: overrides.name ?? 'Hamburg',
    label: overrides.label ?? 'Hamburg',
    lat: overrides.lat ?? 0,
    lng: overrides.lng ?? 0,
    type: overrides.type ?? 'overnight',
    ...overrides,
  };
}

describe('accommodationLinks', () => {
  it('with startDate set, builds Booking URL with correct checkin/checkout', () => {
    const links = accommodationLinks(
      stop({ id: 's1', label: 'Hamburg', dayNumber: 1 }),
      '2026-06-03',
    );
    expect(links.hasDates).toBe(true);
    expect(links.booking).toContain('ss=Hamburg');
    expect(links.booking).toContain('checkin=2026-06-03');
    expect(links.booking).toContain('checkout=2026-06-04');
    expect(links.booking).toContain('group_adults=2');
  });

  it('checkin uses startDate + (dayNumber - 1) days', () => {
    const links = accommodationLinks(
      stop({ id: 's2', label: 'Reims', dayNumber: 3 }),
      '2026-06-03',
    );
    expect(links.booking).toContain('checkin=2026-06-05');
    expect(links.booking).toContain('checkout=2026-06-06');
  });

  it('without startDate, omits checkin/checkout (search-only fallback)', () => {
    const links = accommodationLinks(stop({ id: 's3', label: 'Hamburg' }), null);
    expect(links.hasDates).toBe(false);
    expect(links.booking).toContain('ss=Hamburg');
    expect(links.booking).not.toContain('checkin=');
    expect(links.booking).not.toContain('checkout=');
  });

  it('without startDate, Google Hotels URL has q only, no dates', () => {
    const links = accommodationLinks(stop({ id: 's4', label: 'Hamburg' }), undefined);
    expect(links.googleHotels).toContain('q=Hamburg');
    expect(links.googleHotels).not.toContain('dates=');
  });

  it('with startDate, Google Hotels URL includes dates=YYYY-MM-DD/YYYY-MM-DD', () => {
    const links = accommodationLinks(
      stop({ id: 's5', label: 'Reims', dayNumber: 2 }),
      '2026-06-03',
    );
    // The "/" is URL-encoded as %2F in the dates= parameter
    expect(links.googleHotels).toContain('dates=2026-06-04%2F2026-06-05');
  });

  it('appends aid= when an affiliate id is provided', () => {
    const links = accommodationLinks(
      stop({ id: 's6', label: 'Hamburg', dayNumber: 1 }),
      '2026-06-03',
      'aff-123',
    );
    expect(links.booking).toContain('aid=aff-123');
  });

  it('omits aid= when affiliate id is missing, empty, or null', () => {
    const a = accommodationLinks(stop({ id: 's7', label: 'Hamburg' }), '2026-06-03');
    const b = accommodationLinks(stop({ id: 's7', label: 'Hamburg' }), '2026-06-03', '');
    const c = accommodationLinks(stop({ id: 's7', label: 'Hamburg' }), '2026-06-03', null);
    expect(a.booking).not.toContain('aid=');
    expect(b.booking).not.toContain('aid=');
    expect(c.booking).not.toContain('aid=');
  });

  it('encodes special characters in the stop name (Booking ss param)', () => {
    const links = accommodationLinks(
      stop({ id: 's8', label: 'Saint-Émilion & Côte', dayNumber: 1 }),
      '2026-06-03',
    );
    // URLSearchParams encodes & as %26 and ' ' as +
    expect(links.booking).toMatch(/ss=Saint-%C3%89milion(\+|%20)%26(\+|%20)C%C3%B4te/);
  });

  it('falls back to dayNumber=1 when stop is missing dayNumber', () => {
    const links = accommodationLinks(
      stop({ id: 's9', label: 'Hamburg' }),
      '2026-06-03',
    );
    expect(links.booking).toContain('checkin=2026-06-03');
    expect(links.booking).toContain('checkout=2026-06-04');
  });

  it('returns hasDates=false for malformed startDate', () => {
    const links = accommodationLinks(stop({ id: 's10', label: 'Hamburg' }), 'not-a-date');
    expect(links.hasDates).toBe(false);
    expect(links.booking).not.toContain('checkin=');
  });
});
