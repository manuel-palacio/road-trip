import type { PinCategory } from './types';

// Google Places types ranked from most-specific → most-generic. First match wins.
const TYPE_TO_CATEGORY: ReadonlyArray<readonly [string, PinCategory]> = [
  ['lodging', 'hotel'],
  ['gas_station', 'fuel'],
  ['restaurant', 'food'],
  ['cafe', 'food'],
  ['bakery', 'food'],
  ['meal_takeaway', 'food'],
  ['meal_delivery', 'food'],
  ['food', 'food'],
  ['bar', 'food'],
  ['natural_feature', 'scenic'],
  ['park', 'scenic'],
  ['campground', 'scenic'],
  ['rv_park', 'scenic'],
  ['tourist_attraction', 'landmark'],
  ['museum', 'landmark'],
  ['church', 'landmark'],
  ['hindu_temple', 'landmark'],
  ['mosque', 'landmark'],
  ['synagogue', 'landmark'],
  ['city_hall', 'landmark'],
  ['point_of_interest', 'landmark'],
];

export function guessCategoryFromTypes(types: readonly string[] | undefined): PinCategory {
  if (!types || types.length === 0) return 'other';
  for (const [type, category] of TYPE_TO_CATEGORY) {
    if (types.includes(type)) return category;
  }
  return 'other';
}

// Concrete-place markers from Google Places — when present, the result is
// a specific POI (a hotel, restaurant, attraction) rather than a city/area.
const CONCRETE_PLACE_TYPES = new Set([
  'lodging',
  'restaurant',
  'cafe',
  'bakery',
  'meal_takeaway',
  'meal_delivery',
  'food',
  'bar',
  'gas_station',
  'tourist_attraction',
  'museum',
  'church',
  'hindu_temple',
  'mosque',
  'synagogue',
  'point_of_interest',
  'natural_feature',
  'park',
  'campground',
  'rv_park',
  'establishment',
]);

/**
 * True when a Google Places result represents a concrete POI (Hilton Reims,
 * Eiffel Tower, BP gas station) as opposed to an administrative area
 * (Reims, Île-de-France, France). Used to dispatch the Builder's search:
 * concrete places open the pin modal; areas add as a route stop.
 */
export function isConcretePlace(types: readonly string[] | undefined): boolean {
  if (!types || types.length === 0) return false;
  return types.some((t) => CONCRETE_PLACE_TYPES.has(t));
}
