import { describe, expect, it } from 'vitest';
import { experienceLinks, carRentalLink } from '../affiliate-links';

describe('experienceLinks', () => {
  it('returns GetYourGuide and Viator search links', () => {
    const r = experienceLinks({ name: 'Sagrada Familia' }, {});
    expect(r.map((x) => x.source)).toEqual(['getyourguide', 'viator']);
    expect(r[0].href).toContain('Sagrada%20Familia');
    expect(r[1].href).toContain('Sagrada%20Familia');
  });

  it('includes partner ids when configured', () => {
    const r = experienceLinks({ name: 'X' }, { getYourGuidePartnerId: 'ABC123', viatorPartnerId: 'XYZ789' });
    expect(r[0].href).toContain('ABC123');
    expect(r[1].href).toContain('XYZ789');
  });

  it('omits partner params when not configured (link still works)', () => {
    const r = experienceLinks({ name: 'X' }, {});
    expect(r[0].href).not.toContain('partner_id');
    expect(r[1].href).not.toContain('pid=');
  });
});

describe('carRentalLink', () => {
  it('returns a Rentalcars search URL with city and dates', () => {
    const r = carRentalLink({ city: 'Stockholm', pickupDate: '2026-07-31', dropoffDate: '2026-08-03' }, {});
    expect(r.source).toBe('rentalcars');
    expect(r.href).toContain('rentalcars.com');
    expect(r.href).toContain('Stockholm');
    expect(r.href).toContain('2026-07-31');
    expect(r.href).toContain('2026-08-03');
  });

  it('includes aid when bookingAffiliateId is set', () => {
    const r = carRentalLink({ city: 'X', pickupDate: '2026-01-01', dropoffDate: '2026-01-02' }, { bookingAffiliateId: 'AID-42' });
    expect(r.href).toContain('aid=AID-42');
  });

  it('omits aid when not configured', () => {
    const r = carRentalLink({ city: 'X', pickupDate: '2026-01-01', dropoffDate: '2026-01-02' }, {});
    expect(r.href).not.toContain('aid=');
  });
});
