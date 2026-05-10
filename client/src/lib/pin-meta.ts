import type { PinCategory } from './types';

export const PIN_CATEGORIES: PinCategory[] = ['food', 'hotel', 'scenic', 'fuel', 'landmark', 'other'];

export const PIN_CATEGORY_META: Record<PinCategory, { emoji: string; label: string; tint: string }> = {
  food:     { emoji: '🍴', label: 'Food',     tint: '#d4a44a' },
  hotel:    { emoji: '🛏', label: 'Hotel',    tint: '#7a9a72' },
  scenic:   { emoji: '🌄', label: 'Scenic',   tint: '#6f8fb3' },
  fuel:     { emoji: '⛽', label: 'Fuel',     tint: '#b3686f' },
  landmark: { emoji: '📍', label: 'Landmark', tint: '#c08552' },
  other:    { emoji: '◯', label: 'Other',    tint: '#9b9080' },
};
