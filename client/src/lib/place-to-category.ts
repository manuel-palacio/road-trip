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
