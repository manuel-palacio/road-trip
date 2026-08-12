import type { FuelOverride, FuelUnit, Stop } from '../client/src/lib/types';

export type FuelBreakdown = Map<string, number>;

export type FuelConfigState =
  | { status: 'unconfigured' }
  | { status: 'partial'; missing: ('consumption' | 'price')[] }
  | { status: 'ready' };

export function fuelConfigState(
  consumption: number | undefined | null,
  price: number | undefined | null,
): FuelConfigState;

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
  overrides: FuelOverride[] | undefined | null,
): FuelBreakdown;

export type LegCost = { amount: number; currency: string };

export function legCost(
  stop: Stop,
  consumption: number | undefined | null,
  unit: FuelUnit | undefined,
  defaultPrice: number | undefined | null,
  defaultCurrency: string | undefined,
  overrides: FuelOverride[] | undefined | null,
): LegCost | null;

export function estimateFuelVolume(
  km: number,
  consumption: number | undefined | null,
  unit: FuelUnit | undefined,
): number | null;

export function fuelVolumeForLegs(
  stops: Stop[],
  consumption: number | undefined | null,
  unit: FuelUnit | undefined,
): number;

export function formatVolume(
  volume: number | null | undefined,
  unit: FuelUnit | undefined,
  fuelType?: string | null,
): string | null;

export function formatFillUps(
  volume: number | null | undefined,
  tankSizeLitres: number | null | undefined,
  unit: FuelUnit | undefined,
  fuelType?: string | null,
): string | null;

export function formatCurrency(
  amount: number,
  currency: string | undefined,
  locale?: string,
): string;

export function formatBreakdown(
  breakdown: FuelBreakdown,
  locale?: string,
): string | null;
