import { describe, expect, it } from 'vitest';
import { extractCountryCode, flagEmoji } from '../flags';

describe('flagEmoji', () => {
  it('returns empty for missing or invalid input', () => {
    expect(flagEmoji(null)).toBe('');
    expect(flagEmoji(undefined)).toBe('');
    expect(flagEmoji('')).toBe('');
    expect(flagEmoji('X')).toBe('');
    expect(flagEmoji('XYZ')).toBe('');
  });
  it('converts ISO 3166-1 alpha-2 codes to flag emoji', () => {
    expect(flagEmoji('FR')).toBe('🇫🇷');
    expect(flagEmoji('us')).toBe('🇺🇸');
    expect(flagEmoji('SE')).toBe('🇸🇪');
  });
});

describe('extractCountryCode', () => {
  it('returns empty when components missing or has no country', () => {
    expect(extractCountryCode(undefined)).toBe('');
    expect(extractCountryCode([])).toBe('');
    expect(
      extractCountryCode([
        { long_name: 'Paris', short_name: 'Paris', types: ['locality'] },
      ] as any),
    ).toBe('');
  });
  it('returns the short_name of the country component', () => {
    const components = [
      { long_name: 'Paris', short_name: 'Paris', types: ['locality'] },
      { long_name: 'France', short_name: 'FR', types: ['country', 'political'] },
    ] as any;
    expect(extractCountryCode(components)).toBe('FR');
  });
});
