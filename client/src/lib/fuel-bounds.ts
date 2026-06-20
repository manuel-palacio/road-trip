import type { FuelUnit } from './types';

export const FUEL_BOUNDS = {
  consumptionL: { min: 1, max: 100, step: 0.1 },
  consumptionMpg: { min: 5, max: 200, step: 1 },
  price: { min: 0.01, max: 99.99, step: 0.01 },
  tankSizeLitres: { min: 10, max: 300, step: 1 },
  tankRangeKm: { min: 50, max: 2000, step: 10 },
} as const;

export function validateConsumption(v: number, unit: FuelUnit): string | null {
  if (!Number.isFinite(v)) return null;
  if (unit === 'L/100km' && (v < FUEL_BOUNDS.consumptionL.min || v > FUEL_BOUNDS.consumptionL.max)) {
    return `Enter a value between ${FUEL_BOUNDS.consumptionL.min} and ${FUEL_BOUNDS.consumptionL.max} L/100km`;
  }
  if (unit === 'MPG' && (v < FUEL_BOUNDS.consumptionMpg.min || v > FUEL_BOUNDS.consumptionMpg.max)) {
    return `Enter a value between ${FUEL_BOUNDS.consumptionMpg.min} and ${FUEL_BOUNDS.consumptionMpg.max} MPG`;
  }
  return null;
}

export function validatePrice(v: number): string | null {
  if (!Number.isFinite(v)) return null;
  if (v < FUEL_BOUNDS.price.min || v > FUEL_BOUNDS.price.max) {
    return `Enter a price between ${FUEL_BOUNDS.price.min} and ${FUEL_BOUNDS.price.max}`;
  }
  return null;
}

export function validateTankSize(v: number): string | null {
  if (!Number.isFinite(v)) return null;
  if (v < FUEL_BOUNDS.tankSizeLitres.min || v > FUEL_BOUNDS.tankSizeLitres.max) {
    return `Enter a tank size between ${FUEL_BOUNDS.tankSizeLitres.min} and ${FUEL_BOUNDS.tankSizeLitres.max} L`;
  }
  return null;
}

export function validateTankRange(v: number): string | null {
  if (!Number.isFinite(v)) return null;
  if (v < FUEL_BOUNDS.tankRangeKm.min || v > FUEL_BOUNDS.tankRangeKm.max) {
    return `Enter a range between ${FUEL_BOUNDS.tankRangeKm.min} and ${FUEL_BOUNDS.tankRangeKm.max} km`;
  }
  return null;
}
