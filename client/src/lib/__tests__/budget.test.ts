import { describe, expect, it } from 'vitest';
import { convertCurrency, groupBudgetByDay, sumInHomeCurrency } from '../budget';
import type { BudgetItem, FxRates } from '../types';

const EUR_RATES: FxRates = {
  base: 'EUR',
  date: '2024-01-15',
  rates: { EUR: 1, USD: 1.08, SEK: 11.42, GBP: 0.856 },
};

function item(overrides: Partial<BudgetItem> & { id: string }): BudgetItem {
  return {
    id: overrides.id,
    category: 'food',
    label: 'Lunch',
    amount: 10,
    currency: 'EUR',
    ...overrides,
  };
}

describe('convertCurrency', () => {
  it('returns amount unchanged for same-currency conversion', () => {
    expect(convertCurrency(100, 'EUR', 'EUR', EUR_RATES)).toBe(100);
  });

  it('converts EUR to USD', () => {
    const result = convertCurrency(100, 'EUR', 'USD', EUR_RATES);
    expect(result).toBeCloseTo(108, 1);
  });

  it('converts USD to SEK', () => {
    // 100 USD → 100/1.08 EUR → * 11.42 SEK ≈ 1057.4
    const result = convertCurrency(100, 'USD', 'SEK', EUR_RATES);
    expect(result).toBeCloseTo(1057.4, 0);
  });

  it('returns null when rates is null', () => {
    expect(convertCurrency(100, 'EUR', 'USD', null)).toBeNull();
  });

  it('returns null when fromCurrency not in rates', () => {
    expect(convertCurrency(100, 'JPY', 'EUR', EUR_RATES)).toBeNull();
  });

  it('returns null when toCurrency not in rates', () => {
    expect(convertCurrency(100, 'EUR', 'JPY', EUR_RATES)).toBeNull();
  });
});

describe('sumInHomeCurrency', () => {
  it('returns 0 for empty items list', () => {
    expect(sumInHomeCurrency([], 'EUR', EUR_RATES)).toBe(0);
  });

  it('sums items already in home currency', () => {
    const items = [item({ id: '1', amount: 50 }), item({ id: '2', amount: 30 })];
    expect(sumInHomeCurrency(items, 'EUR', EUR_RATES)).toBeCloseTo(80, 5);
  });

  it('converts and sums mixed currencies', () => {
    const items = [
      item({ id: '1', amount: 100, currency: 'EUR' }),
      item({ id: '2', amount: 1000, currency: 'SEK' }),
    ];
    // 100 EUR + (1000/11.42) EUR ≈ 100 + 87.57 ≈ 187.57
    const result = sumInHomeCurrency(items, 'EUR', EUR_RATES);
    expect(result).toBeCloseTo(187.57, 0);
  });

  it('skips items with unknown currency', () => {
    const items = [
      item({ id: '1', amount: 100, currency: 'EUR' }),
      item({ id: '2', amount: 500, currency: 'JPY' }),
    ];
    expect(sumInHomeCurrency(items, 'EUR', EUR_RATES)).toBeCloseTo(100, 5);
  });

  it('returns 0 when rates is null', () => {
    const items = [item({ id: '1', amount: 100 })];
    expect(sumInHomeCurrency(items, 'EUR', null)).toBe(0);
  });
});

describe('groupBudgetByDay', () => {
  it('returns empty map for empty list', () => {
    expect(groupBudgetByDay([]).size).toBe(0);
  });

  it('groups items by dayNumber', () => {
    const items = [
      item({ id: '1', dayNumber: 1 }),
      item({ id: '2', dayNumber: 2 }),
      item({ id: '3', dayNumber: 1 }),
    ];
    const map = groupBudgetByDay(items);
    expect(map.get(1)?.length).toBe(2);
    expect(map.get(2)?.length).toBe(1);
  });

  it('puts items with no dayNumber under key 0', () => {
    const items = [
      item({ id: '1' }),
      item({ id: '2', dayNumber: null }),
    ];
    const map = groupBudgetByDay(items);
    expect(map.get(0)?.length).toBe(2);
  });
});
