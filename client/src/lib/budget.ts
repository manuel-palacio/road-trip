import type { BudgetItem, FxRates } from './types';

/** Convert an amount from `fromCurrency` to `toCurrency` using FX rates
 * where the base currency is `rates.base`. Returns null when either currency
 * is absent from the rate table or when rates is null. */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: FxRates | null,
): number | null {
  if (!rates) return null;
  if (fromCurrency === toCurrency) return amount;
  const fromRate = rates.rates[fromCurrency];
  const toRate = rates.rates[toCurrency];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}

/** Sum budget items, converting each to homeCurrency. Items in currencies
 * missing from `rates` are excluded from the sum. */
export function sumInHomeCurrency(
  items: readonly BudgetItem[],
  homeCurrency: string,
  rates: FxRates | null,
): number {
  let total = 0;
  for (const item of items) {
    const converted = convertCurrency(item.amount, item.currency, homeCurrency, rates);
    if (converted != null) total += converted;
  }
  return total;
}

/** Group items by day. Items with no dayNumber sit under key 0 (trip-level). */
export function groupBudgetByDay(items: readonly BudgetItem[]): Map<number, BudgetItem[]> {
  const map = new Map<number, BudgetItem[]>();
  for (const item of items) {
    const key = item.dayNumber ?? 0;
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}
