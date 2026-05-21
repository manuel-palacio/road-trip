import type { FuelOverride } from '../client/src/lib/types';

export type ValidationResult<T> = { error: string } | { value: T };

export function validateFuelOverrides(raw: unknown): ValidationResult<FuelOverride[] | null>;
export function validatePositiveNumber(field: string, raw: unknown): ValidationResult<number | null>;
export function validateFuelUnit(raw: unknown): ValidationResult<'L/100km' | 'MPG' | null>;
export function validateFuelCurrency(raw: unknown): ValidationResult<string | null>;
export function validateFuelField(
  key: string,
  raw: unknown,
): ValidationResult<unknown> | null;
