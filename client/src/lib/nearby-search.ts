import type { PinCategory } from './types';

/** Maps an app-level pin category to the Google Places `type` filter
 * the legacy PlacesService.nearbySearch accepts. `null` means "no type
 * filter" — used by the 'other' category, which falls back to a plain
 * radius search and lets results come through unconstrained.
 *
 * `landmark` and `scenic` share `tourist_attraction` for v1 — they're
 * semantically close in Google's taxonomy and splitting them would
 * surface mostly the same POIs with awkward overlap.
 *
 * Exported as a pure lookup so callers can introspect it (e.g. to
 * disable categories with no useful backing type) and tests can pin
 * the mapping without touching the component. */
export const TYPE_FOR_CATEGORY: Record<PinCategory, string | null> = {
  fuel: 'gas_station',
  food: 'restaurant',
  hotel: 'lodging',
  scenic: 'tourist_attraction',
  landmark: 'tourist_attraction',
  other: null,
};

/** Returns the Google Places `type` for the given pin category, or null
 * when the category has no useful type filter (caller should fall back
 * to keyword search or skip the type entirely). On EV trips the fuel
 * category searches charging stations instead of gas stations
 * (issue #118). */
export function placeTypeForCategory(category: PinCategory, fuelType?: string | null): string | null {
  if (category === 'fuel' && fuelType === 'ev') return 'electric_vehicle_charging_station';
  return TYPE_FOR_CATEGORY[category];
}

/** Request fragment for PlacesService.nearbySearch. EV fuel searches add a
 * keyword: `electric_vehicle_charging_station` is a NEW Places API type
 * that the legacy service silently ignores (verified — it returned plain
 * prominence results), so the keyword does the real filtering there while
 * the type keeps us correct if/when the service honours it. */
export function nearbySearchFilterFor(
  category: PinCategory,
  fuelType?: string | null,
): { type?: string; keyword?: string } {
  const type = placeTypeForCategory(category, fuelType);
  if (category === 'fuel' && fuelType === 'ev') {
    return { type: type!, keyword: 'EV charging station' };
  }
  return type ? { type } : {};
}
