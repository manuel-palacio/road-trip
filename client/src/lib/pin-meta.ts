import type { PinCategory, PinPriority, Stop } from './types';

export const PIN_CATEGORIES: PinCategory[] = ['food', 'hotel', 'scenic', 'fuel', 'landmark', 'other'];

export const PIN_PRIORITIES: PinPriority[] = ['must', 'want', 'maybe'];

export const PIN_PRIORITY_META: Record<PinPriority, { label: string; hint: string }> = {
  must:  { label: 'Must',  hint: 'Reason for the trip' },
  want:  { label: 'Want',  hint: 'Plan to visit' },
  maybe: { label: 'Maybe', hint: 'If time allows' },
};

export const PIN_CATEGORY_META: Record<PinCategory, { emoji: string; label: string; tint: string }> = {
  food:     { emoji: '🍴', label: 'Food',     tint: '#d4a44a' },
  hotel:    { emoji: '🛏', label: 'Hotel',    tint: '#7a9a72' },
  scenic:   { emoji: '🌄', label: 'Scenic',   tint: '#6f8fb3' },
  fuel:     { emoji: '⛽', label: 'Fuel',     tint: '#b3686f' },
  landmark: { emoji: '📍', label: 'Landmark', tint: '#c08552' },
  other:    { emoji: '◯', label: 'Other',    tint: '#9b9080' },
};

/** Resolves a stop's effective category, bridging modern stops (which
 *  carry the `category` field) and legacy fuel stops (type='fuel' or
 *  type='waypoint' + category='fuel' from before issue #52). Returns
 *  `undefined` for plain stops — those get the city-default treatment. */
export function stopCategory(stop: Stop): PinCategory | undefined {
  if (stop.category) return stop.category;
  if (stop.type === 'fuel') return 'fuel';
  return undefined;
}

/** Visual treatment for stops without an explicit category — the
 *  "city" default. Destinations, overnights, waypoints, and start
 *  stops all use this unless the user pinned a specific category. */
export const DEFAULT_STOP_META = { emoji: '🏙', tint: '#9b9080' } as const;
