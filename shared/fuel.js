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

/** US gallons per litre — used for MPG conversions. */
const LITRES_PER_GALLON = 3.785411784;

/** Classify the trip's fuel configuration as one of three states so the UI
 * can distinguish "user hasn't set anything" (silent) from "user set one
 * thing but forgot the other" (nudge them to finish). Returns:
 *   { status: 'unconfigured' }                              — neither set
 *   { status: 'partial', missing: ['consumption'|'price'] } — one missing
 *   { status: 'ready' }                                     — both set
 *
 * Pure: takes the same numeric inputs estimateFuelCost would, no side
 * effects, safe to call on every render. */
export function fuelConfigState(consumption, price) {
  const hasC = consumption != null && Number.isFinite(consumption) && consumption > 0;
  const hasP = price != null && Number.isFinite(price) && price > 0;
  if (!hasC && !hasP) return { status: 'unconfigured' };
  if (hasC && hasP) return { status: 'ready' };
  const missing = [];
  if (!hasC) missing.push('consumption');
  if (!hasP) missing.push('price');
  return { status: 'partial', missing };
}

/** Estimate fuel volume consumed for a leg. Returns litres for L/100km
 * units, US gallons for MPG units. Null when km is 0 or consumption is
 * not configured. Mirrors estimateFuelCost without the price step. */
export function estimateFuelVolume(km, consumption, unit) {
  if (!km || km < 0) return 0;
  if (consumption == null || !Number.isFinite(consumption) || consumption <= 0) return null;
  if (unit === 'MPG') {
    const lPer100 = 235.2146 / consumption;
    const litres = (km / 100) * lPer100;
    return litres / LITRES_PER_GALLON;
  }
  return (km / 100) * consumption;
}

/** Sum of estimated fuel volume across all legs in `stops`. Unit-agnostic:
 * returns litres for L/100km and US gallons for MPG. Returns 0 when
 * consumption isn't configured. */
export function fuelVolumeForLegs(stops, consumption, unit) {
  let total = 0;
  for (const stop of stops) {
    const v = estimateFuelVolume(stop.kmFromPrevious || 0, consumption, unit);
    if (v == null || v <= 0) continue;
    total += v;
  }
  return total;
}

/** Format a volume amount for display. Litres render as `138L`, gallons as
 * `36 gal`. Caller decides which unit context to pass. */
export function formatVolume(volume, unit) {
  if (volume == null || !Number.isFinite(volume) || volume <= 0) return null;
  const rounded = Math.round(volume);
  return unit === 'MPG' ? `${rounded} gal` : `${rounded}L`;
}

/** "approx. N fill-ups" string. `tankSizeLitres` is the canonical storage
 * unit (litres) so we convert to gallons for MPG callers. Returns null
 * when tank size isn't set or the math doesn't yield at least 1 fill-up. */
export function formatFillUps(volume, tankSizeLitres, unit) {
  if (!volume || volume <= 0) return null;
  if (!tankSizeLitres || !Number.isFinite(tankSizeLitres) || tankSizeLitres <= 0) return null;
  const tankInUnit = unit === 'MPG' ? tankSizeLitres / LITRES_PER_GALLON : tankSizeLitres;
  const fillUps = Math.ceil(volume / tankInUnit);
  if (fillUps < 1) return null;
  return `approx. ${fillUps} fill-up${fillUps === 1 ? '' : 's'}`;
}

/** Resolve the (price, currency) that should apply to a leg ending at `stop`.
 * Returns the matching fuelOverride when one exists and is complete, otherwise
 * the trip-level defaults. Shared by per-leg and per-trip cost calculations. */
function resolveLegPrice(stop, defaultPrice, defaultCurrency, overrides) {
  const cc = (stop.countryCode || '').toUpperCase();
  const safeOverrides = Array.isArray(overrides) ? overrides : [];
  const rawOv = cc
    ? safeOverrides.find((o) => (o.countryCode || '').toUpperCase() === cc)
    : null;
  // Only honour an override when both price and currency are valid — otherwise
  // we'd display the default price under the override's currency, which is
  // semantically wrong.
  const ov = rawOv && rawOv.price > 0 && rawOv.currency ? rawOv : null;
  return {
    price: ov ? ov.price : (defaultPrice != null ? defaultPrice : 0),
    currency: (ov ? ov.currency : (defaultCurrency || 'EUR')).toUpperCase(),
  };
}

/** Fuel cost for a single leg (defined by `stop.kmFromPrevious` and the
 * override that matches `stop.countryCode`). Returns null when km is 0 or
 * the consumption/price config isn't usable. Used by the map's per-leg
 * cost chips and as the inner loop of fuelBreakdownForLegs. */
export function legCost(stop, consumption, unit, defaultPrice, defaultCurrency, overrides) {
  const km = stop.kmFromPrevious || 0;
  if (km <= 0) return null;
  if (consumption == null || !Number.isFinite(consumption) || consumption <= 0) return null;
  const { price, currency } = resolveLegPrice(stop, defaultPrice, defaultCurrency, overrides);
  const amount = estimateFuelCost(km, consumption, unit, price);
  if (amount == null || amount <= 0) return null;
  return { amount, currency };
}

/** Compute a per-currency breakdown of fuel cost across a set of legs.
 * Each stop contributes a leg priced by its destination's countryCode:
 * if an override matches, use override's (price, currency); otherwise the
 * trip-level defaults. Returns a Map keyed by uppercase currency code. */
export function fuelBreakdownForLegs(stops, consumption, unit, defaultPrice, defaultCurrency, overrides) {
  const out = new Map();
  for (const stop of stops) {
    const cost = legCost(stop, consumption, unit, defaultPrice, defaultCurrency, overrides);
    if (!cost) continue;
    out.set(cost.currency, (out.get(cost.currency) || 0) + cost.amount);
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
