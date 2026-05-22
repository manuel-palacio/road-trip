import type { FuelOverride, FuelUnit, Stop } from '../client/src/lib/types';

export type FuelBreakdown = Map<string, number>;

export function estimateFuelCost(
  km: number,
  consumption: number | undefined | null,
  unit: FuelUnit | undefined,
  pricePerUnit: number | undefined | null,
): number | null;

export function fuelBreakdownForLegs(
  stops: Stop[],
  consumption: number | undefined | null,
  unit: FuelUnit | undefined,
  defaultPrice: number | undefined | null,
  defaultCurrency: string | undefined,
  overrides: FuelOverride[] | undefined,
): FuelBreakdown;

export type LegCost = { amount: number; currency: string };

export function legCost(
  stop: Stop,
  consumption: number | undefined | null,
  unit: FuelUnit | undefined,
  defaultPrice: number | undefined | null,
  defaultCurrency: string | undefined,
  overrides: FuelOverride[] | undefined,
): LegCost | null;

export function formatCurrency(
  amount: number,
  currency: string | undefined,
  locale?: string,
): string;

export function formatBreakdown(
  breakdown: FuelBreakdown,
  locale?: string,
): string | null;
