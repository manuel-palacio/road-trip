// Locale → currency mapping used to seed the fuel-currency dropdown for new
// trips so a Swedish user doesn't see EUR by default. Loaded trips with a
// stored fuelCurrency keep using that stored value — this only affects the
// initial state of fresh builders.

const LOCALE_CURRENCY: Record<string, string> = {
  // Full BCP-47 tags first (more specific than the language-only fallback).
  'en-GB': 'GBP',
  'en-US': 'USD',
  'en-AU': 'AUD',
  'en-CA': 'CAD',
  'en-IE': 'EUR',
  'en-NZ': 'NZD',
  'fr-CA': 'CAD',
  // Language-only fallbacks.
  sv: 'SEK',
  nb: 'NOK',
  nn: 'NOK',
  no: 'NOK',
  da: 'DKK',
  is: 'ISK',
  pl: 'PLN',
  cs: 'CZK',
  hu: 'HUF',
  ro: 'RON',
  ja: 'JPY',
  ko: 'KRW',
  zh: 'CNY',
  ru: 'RUB',
  tr: 'TRY',
};

/** Best-effort locale → 3-letter currency code. Falls back to EUR for any
 * locale not in the table — covers the bulk of road-trip-app target users
 * (EU + Nordics + UK + US/CA/AU) without claiming to be exhaustive. */
export function defaultCurrencyForLocale(
  locale: string = typeof navigator !== 'undefined' ? navigator.language : 'en-US',
): string {
  if (!locale) return 'EUR';
  if (LOCALE_CURRENCY[locale]) return LOCALE_CURRENCY[locale];
  const lang = locale.split('-')[0];
  return LOCALE_CURRENCY[lang] ?? 'EUR';
}
