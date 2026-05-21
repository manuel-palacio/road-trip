import { describe, expect, it } from 'vitest';
import { defaultCurrencyForLocale } from '../locale';

describe('defaultCurrencyForLocale', () => {
  it('maps sv-SE to SEK (Nordic priority — Sweden is a heavy user base)', () => {
    expect(defaultCurrencyForLocale('sv-SE')).toBe('SEK');
  });

  it('maps en-US to USD', () => {
    expect(defaultCurrencyForLocale('en-US')).toBe('USD');
  });

  it('maps en-GB to GBP (specific tag beats the en→ language fallback)', () => {
    expect(defaultCurrencyForLocale('en-GB')).toBe('GBP');
  });

  it('falls back to EUR for unknown locales', () => {
    expect(defaultCurrencyForLocale('xx-YY')).toBe('EUR');
    expect(defaultCurrencyForLocale('zz')).toBe('EUR');
  });

  it('falls back to EUR for empty / falsy input', () => {
    expect(defaultCurrencyForLocale('')).toBe('EUR');
  });

  it('uses language-only fallback when full tag is unknown', () => {
    // sv-FI isn't in the table; should still resolve via the sv → SEK row.
    expect(defaultCurrencyForLocale('sv-FI')).toBe('SEK');
  });

  it('returns NOK for nb and nn (Norwegian variants)', () => {
    expect(defaultCurrencyForLocale('nb-NO')).toBe('NOK');
    expect(defaultCurrencyForLocale('nn-NO')).toBe('NOK');
  });

  it('returns DKK for Danish', () => {
    expect(defaultCurrencyForLocale('da-DK')).toBe('DKK');
  });

  it('returns CAD for fr-CA (specific) but not for plain fr (no fr row → EUR fallback)', () => {
    expect(defaultCurrencyForLocale('fr-CA')).toBe('CAD');
    expect(defaultCurrencyForLocale('fr-FR')).toBe('EUR');
  });
});
