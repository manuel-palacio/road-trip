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
 * to keyword search or skip the type entirely). */
export function placeTypeForCategory(category: PinCategory): string | null {
  return TYPE_FOR_CATEGORY[category];
}
