// Fuel cost calculation, shared between the Vite client (TS) and the Express
// server. Written as an ES module so Vite/Rollup can tree-shake; the server
// loads it via dynamic `import()` from its CommonJS context. Types live
// alongside in `fuel.d.ts`.

/** Estimate fuel cost for a given distance + consumption + price.
 * Returns null when any required input is missing/invalid (caller hides the chip).
 * MPG is converted to L/100km internally via 235.2146 / mpg. */
export function estimateFuelCost(km, consumption, unit, pricePerUnit) {
  if (!km || km < 0) return 0;
  if (consumption == null || !Number.isFinite(consumption) || consumption <= 0) return null;
  if (pricePerUnit == null || !Number.isFinite(pricePerUnit) || pricePerUnit <= 0) return null;
  if (unit === 'MPG') {
    const lPer100 = 235.2146 / consumption;
    const litres = (km / 100) * lPer100;
    const gallons = litres / 3.785411784;
    return gallons * pricePerUnit;
  }
  const litres = (km / 100) * consumption;
  return litres * pricePerUnit;
}

/** Compute a per-currency breakdown of fuel cost across a set of legs.
 * Each stop contributes a leg priced by its destination's countryCode:
 * if an override matches, use override's (price, currency); otherwise the
 * trip-level defaults. Returns a Map keyed by uppercase currency code. */
export function fuelBreakdownForLegs(stops, consumption, unit, defaultPrice, defaultCurrency, overrides) {
  const out = new Map();
  if (consumption == null || !Number.isFinite(consumption) || consumption <= 0) return out;
  const defCur = (defaultCurrency || 'EUR').toUpperCase();
  const safeOverrides = Array.isArray(overrides) ? overrides : [];
  for (const stop of stops) {
    const km = stop.kmFromPrevious || 0;
    if (km <= 0) continue;
    const cc = (stop.countryCode || '').toUpperCase();
    const rawOv = cc
      ? safeOverrides.find((o) => (o.countryCode || '').toUpperCase() === cc)
      : null;
    // Only honour an override when both price and currency are valid — otherwise
    // we'd display the default price under the override's currency, which is
    // semantically wrong.
    const ov = rawOv && rawOv.price > 0 && rawOv.currency ? rawOv : null;
    const price = ov ? ov.price : (defaultPrice != null ? defaultPrice : 0);
    const currency = (ov ? ov.currency : defCur).toUpperCase();
    const cost = estimateFuelCost(km, consumption, unit, price);
    if (cost == null || cost <= 0) continue;
    out.set(currency, (out.get(currency) || 0) + cost);
  }
  return out;
}

/** Format a monetary amount via Intl.NumberFormat. Locale defaults to the
 * runtime locale (browser on the client, system on the server) — pass an
 * explicit one (e.g. 'en-US') when deterministic output is required. */
export function formatCurrency(amount, currency, locale) {
  const code = (currency || 'EUR').toUpperCase();
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

/** Format a multi-currency breakdown as "€98 + £15 + 158 kr". Returns null
 * when the breakdown is empty (caller hides the chip). */
export function formatBreakdown(breakdown, locale) {
  if (breakdown.size === 0) return null;
  const parts = [];
  for (const [currency, amount] of breakdown) {
    if (amount > 0) parts.push(formatCurrency(amount, currency, locale));
  }
  return parts.length === 0 ? null : parts.join(' + ');
}
