import type { FuelOverride } from './types';

type FuelInputs = {
  fuelConsumption: number;
  fuelPrice: number;
  fuelOverrides: FuelOverride[];
  tankRangeKm: number;
  tankSizeLitres: number;
};

/** Map the Builder's parsed fuel inputs to a save payload. Blank/invalid
 * inputs become explicit `null` — `undefined` would be dropped by
 * JSON.stringify and the server would keep the old value instead of
 * clearing it. */
export function clearableFuelFields(inputs: FuelInputs) {
  return {
    fuelConsumption: positiveOrNull(inputs.fuelConsumption),
    fuelPrice: positiveOrNull(inputs.fuelPrice),
    fuelOverrides: inputs.fuelOverrides.length > 0 ? inputs.fuelOverrides : null,
    tankRangeKm: positiveOrNull(inputs.tankRangeKm),
    tankSizeLitres: positiveOrNull(inputs.tankSizeLitres),
  };
}

function positiveOrNull(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}
