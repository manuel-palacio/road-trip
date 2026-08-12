// Field collection + validation for trip create/update bodies. Shared by
// POST /api/trips and PUT /api/trips/:id so both accept the same field set —
// create previously dropped fuel/tank/autoFuel silently.
import { validateFuelField } from './fuel-validation.js';

export const UPDATABLE_TRIP_FIELDS = [
  'name',
  'description',
  'coverEmoji',
  'startDate',
  'maxKmPerDay',
  'stops',
  'totalKm',
  'totalDays',
  'countries',
  'fuelConsumption',
  'fuelUnit',
  'fuelPrice',
  'fuelCurrency',
  'fuelOverrides',
  'tankRangeKm',
  'tankSizeLitres',
  'dataVersion',
  'autoFuel',
  'templateVisibility',
];

// On create the base fields (name, stops, …) go through default-coercion in
// the route instead, and templateVisibility must only be set via the
// template publish flow.
export const CREATE_TRIP_EXTRA_FIELDS = [
  'totalKm',
  'totalDays',
  'countries',
  'fuelConsumption',
  'fuelUnit',
  'fuelPrice',
  'fuelCurrency',
  'fuelOverrides',
  'tankRangeKm',
  'tankSizeLitres',
  'dataVersion',
  'autoFuel',
];

// Type checks for the non-fuel updatable fields — PUT must not persist
// shapes that POST would have rejected (fuel fields go through
// validateFuelField instead). Returns { value } or { error }, or null for
// keys it doesn't cover.
export function validateTripField(key, value) {
  switch (key) {
    case 'name':
      if (typeof value !== 'string' || !value.trim()) return { error: 'name must be a non-empty string' };
      return { value: value.trim() };
    case 'description':
    case 'coverEmoji':
      if (typeof value !== 'string') return { error: `${key} must be a string` };
      return { value };
    case 'startDate':
      if (value !== null && typeof value !== 'string') return { error: 'startDate must be a string or null' };
      return { value };
    case 'maxKmPerDay':
      if (typeof value !== 'number' || !(value > 0)) return { error: 'maxKmPerDay must be a positive number' };
      return { value };
    case 'totalKm':
    case 'totalDays':
    case 'dataVersion':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return { error: `${key} must be a non-negative number` };
      return { value };
    case 'stops':
    case 'countries':
      if (!Array.isArray(value)) return { error: `${key} must be an array` };
      return { value };
    case 'autoFuel':
      if (typeof value !== 'boolean') return { error: 'autoFuel must be a boolean' };
      return { value };
    case 'templateVisibility':
      if (value !== 'public' && value !== 'unlisted') return { error: 'templateVisibility must be public or unlisted' };
      return { value };
    default:
      return null;
  }
}

/** Collect the subset of `body` named in `fields`, validating each value.
 * Returns { value: {…} } or { error: '<message>' }. */
export function collectTripFields(body, fields) {
  const value = {};
  for (const key of fields) {
    if (!(key in body)) continue;
    const result = validateFuelField(key, body[key]) || validateTripField(key, body[key]);
    if (result && result.error) return { error: result.error };
    value[key] = result ? result.value : body[key];
  }
  return { value };
}
