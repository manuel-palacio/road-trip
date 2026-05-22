import { describe, expect, it } from 'vitest';
import { localityFromAddressComponents } from '../google-maps';

describe('localityFromAddressComponents', () => {
  it('returns null for undefined / empty input', () => {
    expect(localityFromAddressComponents(undefined)).toBeNull();
    expect(localityFromAddressComponents([])).toBeNull();
  });

  it('picks the locality short_name when present', () => {
    const components = [
      { types: ['route'], long_name: 'Autoroute A48', short_name: 'A48' },
      { types: ['locality', 'political'], long_name: 'Grenoble', short_name: 'Grenoble' },
      { types: ['country', 'political'], long_name: 'France', short_name: 'FR' },
    ];
    expect(localityFromAddressComponents(components)).toBe('Grenoble');
  });

  it('falls back to postal_town when no locality is present (UK case)', () => {
    const components = [
      { types: ['route'], long_name: 'High Street', short_name: 'High Street' },
      { types: ['postal_town'], long_name: 'Oxford', short_name: 'Oxford' },
      { types: ['country', 'political'], long_name: 'United Kingdom', short_name: 'GB' },
    ];
    expect(localityFromAddressComponents(components)).toBe('Oxford');
  });

  it('falls back to admin areas when neither locality nor postal_town is present', () => {
    const components = [
      { types: ['administrative_area_level_2', 'political'], long_name: 'Isère', short_name: 'Isère' },
      { types: ['country'], long_name: 'France', short_name: 'FR' },
    ];
    expect(localityFromAddressComponents(components)).toBe('Isère');
  });

  it('prefers locality over postal_town when both are present', () => {
    const components = [
      { types: ['postal_town'], long_name: 'London', short_name: 'London' },
      { types: ['locality', 'political'], long_name: 'Westminster', short_name: 'Westminster' },
    ];
    expect(localityFromAddressComponents(components)).toBe('Westminster');
  });

  it('uses long_name when short_name is missing', () => {
    const components = [
      { types: ['locality'], long_name: 'Some Town' },
    ];
    expect(localityFromAddressComponents(components)).toBe('Some Town');
  });

  it('returns null when no matching component type exists', () => {
    const components = [
      { types: ['route'], long_name: 'Rue de la Paix', short_name: 'Rue de la Paix' },
      { types: ['country'], long_name: 'France', short_name: 'FR' },
    ];
    expect(localityFromAddressComponents(components)).toBeNull();
  });
});
