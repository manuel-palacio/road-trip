// Input validation for fuel-related fields written through PUT /api/trips/:id.
// Each function returns either { error: '<message>' } or { value: <normalised> }
// — callers should return HTTP 400 on error and assign `value` to the update.
// `null` is treated as an explicit clear (allowed); any other invalid shape
// rejects.

const FUEL_UNITS = new Set(['L/100km', 'MPG']);
const ISO_2 = /^[A-Z]{2}$/;
const ISO_3 = /^[A-Z]{3}$/;
const MAX_OVERRIDES = 20;

export function validateFuelOverrides(raw) {
  if (raw === null) return { value: null };
  if (!Array.isArray(raw)) return { error: 'fuelOverrides: must be an array' };
  if (raw.length > MAX_OVERRIDES) {
    return { error: `fuelOverrides: max ${MAX_OVERRIDES} entries` };
  }
  const value = [];
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i];
    if (!o || typeof o !== 'object') {
      return { error: `fuelOverrides[${i}]: must be an object` };
    }
    const cc = typeof o.countryCode === 'string' ? o.countryCode.toUpperCase() : '';
    if (!ISO_2.test(cc)) {
      return { error: `fuelOverrides[${i}].countryCode: must be a 2-letter ISO code` };
    }
    if (typeof o.price !== 'number' || !Number.isFinite(o.price) || o.price <= 0) {
      return { error: `fuelOverrides[${i}].price: must be a positive number` };
    }
    const cur = typeof o.currency === 'string' ? o.currency.toUpperCase() : '';
    if (!ISO_3.test(cur)) {
      return { error: `fuelOverrides[${i}].currency: must be a 3-letter ISO code` };
    }
    value.push({ countryCode: cc, price: o.price, currency: cur });
  }
  return { value };
}

export function validatePositiveNumber(field, raw) {
  if (raw === null) return { value: null };
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return { error: `${field}: must be a positive number` };
  }
  return { value: raw };
}

export function validateFuelUnit(raw) {
  if (raw === null) return { value: null };
  if (typeof raw !== 'string' || !FUEL_UNITS.has(raw)) {
    return { error: `fuelUnit: must be one of ${[...FUEL_UNITS].join(', ')}` };
  }
  return { value: raw };
}

export function validateFuelCurrency(raw) {
  if (raw === null) return { value: null };
  if (typeof raw !== 'string') return { error: 'fuelCurrency: must be a string' };
  const cur = raw.toUpperCase();
  if (!ISO_3.test(cur)) return { error: 'fuelCurrency: must be a 3-letter ISO code' };
  return { value: cur };
}

/** Dispatch table for the trip PUT route. Returns null for fields with no
 * fuel-related validator (caller passes them through unchanged); otherwise
 * returns the validation result {error|value} for the named field. */
export function validateFuelField(key, raw) {
  switch (key) {
    case 'fuelOverrides':   return validateFuelOverrides(raw);
    case 'fuelConsumption': return validatePositiveNumber('fuelConsumption', raw);
    case 'fuelPrice':       return validatePositiveNumber('fuelPrice', raw);
    case 'tankRangeKm':     return validatePositiveNumber('tankRangeKm', raw);
    case 'fuelUnit':        return validateFuelUnit(raw);
    case 'fuelCurrency':    return validateFuelCurrency(raw);
    default:                return null;
  }
}
