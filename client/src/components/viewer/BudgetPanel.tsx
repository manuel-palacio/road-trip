import { useState } from 'react';
import { convertCurrency, groupBudgetByDay, sumInHomeCurrency } from '../../lib/budget';
import type { BudgetCategory, BudgetItem, FxRates } from '../../lib/types';

const CATEGORY_ICONS: Record<BudgetCategory, string> = {
  fuel: '⛽',
  hotel: '🏨',
  food: '🍽',
  tolls: '🛣',
  activities: '🎟',
  other: '•',
};

const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  fuel: 'Fuel',
  hotel: 'Hotel',
  food: 'Food',
  tolls: 'Tolls',
  activities: 'Activities',
  other: 'Other',
};

const BUDGET_CATEGORIES: BudgetCategory[] = [
  'fuel', 'hotel', 'food', 'tolls', 'activities', 'other',
];

const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF', 'CZK', 'PLN', 'HUF'];

type AddFormState = {
  category: BudgetCategory;
  label: string;
  amount: string;
  currency: string;
  dayNumber: string;
};

type Props = {
  tripId: string;
  homeCurrency: string;
  totalDays: number;
  rates: FxRates | null;
  items: BudgetItem[];
  onAdd: (body: Omit<BudgetItem, 'id' | 'addedByUid' | 'createdAt' | 'updatedAt'>) => void;
  onDelete: (itemId: string) => void;
  addPending: boolean;
};

export function BudgetPanel({
  homeCurrency,
  totalDays,
  rates,
  items,
  onAdd,
  onDelete,
  addPending,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddFormState>({
    category: 'food',
    label: '',
    amount: '',
    currency: homeCurrency,
    dayNumber: '',
  });

  const byDay = groupBudgetByDay(items);
  const tripTotal = sumInHomeCurrency(items, homeCurrency, rates);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.label.trim() || isNaN(amount) || amount < 0) return;
    onAdd({
      category: form.category,
      label: form.label.trim(),
      amount,
      currency: form.currency,
      dayNumber: form.dayNumber ? parseInt(form.dayNumber, 10) : null,
    });
    setForm((f) => ({ ...f, label: '', amount: '', dayNumber: '' }));
    setShowForm(false);
  }

  const dayKeys = Array.from(byDay.keys()).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3">
      {/* Trip total bar */}
      <div className="flex items-center justify-between px-2 py-2.5 bg-accent-soft border border-accent rounded">
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-accent">Total</span>
        <span className="font-mono text-[13px] text-accent font-medium">
          {tripTotal > 0 ? `${tripTotal.toFixed(2)} ${homeCurrency}` : '—'}
        </span>
      </div>

      {/* Day sections */}
      {dayKeys.map((day) => {
        const dayItems = byDay.get(day) ?? [];
        const dayTotal = sumInHomeCurrency(dayItems, homeCurrency, rates);
        const label = day === 0 ? 'Trip-level' : `Day ${day}`;
        return (
          <div key={day} className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-paper-muted">
                {label}
              </span>
              {dayTotal > 0 && (
                <span className="font-mono text-[10px] text-paper-dim">
                  {dayTotal.toFixed(2)} {homeCurrency}
                </span>
              )}
            </div>
            {dayItems.map((item) => (
              <BudgetRow
                key={item.id}
                item={item}
                homeCurrency={homeCurrency}
                rates={rates}
                onDelete={() => onDelete(item.id)}
              />
            ))}
          </div>
        );
      })}

      {items.length === 0 && !showForm && (
        <p className="px-2 py-4 text-center font-serif italic text-[13px] text-paper-muted">
          No budget items yet. Add your first expense below.
        </p>
      )}

      {/* Add form */}
      {showForm ? (
        <form onSubmit={handleAdd} className="flex flex-col gap-2 p-3 border border-line rounded bg-canvas">
          <div className="flex gap-2">
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as BudgetCategory }))}
              className="flex-1 bg-canvas border border-line rounded px-2 py-1.5 font-mono text-[11px] text-paper"
            >
              {BUDGET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <select
              value={form.dayNumber}
              onChange={(e) => setForm((f) => ({ ...f, dayNumber: e.target.value }))}
              className="bg-canvas border border-line rounded px-2 py-1.5 font-mono text-[11px] text-paper"
            >
              <option value="">Trip</option>
              {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>Day {d}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="Label (e.g. Dinner in Lyon)"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            maxLength={100}
            className="bg-canvas border border-line rounded px-2 py-1.5 font-mono text-[11px] text-paper placeholder:text-paper-muted"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              min="0"
              step="0.01"
              className="flex-1 bg-canvas border border-line rounded px-2 py-1.5 font-mono text-[11px] text-paper placeholder:text-paper-muted"
            />
            <select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              className="bg-canvas border border-line rounded px-2 py-1.5 font-mono text-[11px] text-paper"
            >
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={addPending}
              className="flex-1 bg-accent text-canvas border border-accent rounded px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {addPending ? 'Adding…' : 'Add item'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="bg-transparent border border-line text-paper-dim rounded px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full border border-dashed border-line text-paper-dim rounded px-3 py-2 font-mono text-[10px] tracking-[0.18em] uppercase hover:text-paper hover:border-paper-dim transition-colors"
        >
          + Add expense
        </button>
      )}
    </div>
  );
}

function BudgetRow({
  item,
  homeCurrency,
  rates,
  onDelete,
}: {
  item: BudgetItem;
  homeCurrency: string;
  rates: FxRates | null;
  onDelete: () => void;
}) {
  const converted = convertCurrency(item.amount, item.currency, homeCurrency, rates);
  const showConverted = converted != null && item.currency !== homeCurrency;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-paper/5 group">
      <span className="text-[14px] flex-shrink-0">{CATEGORY_ICONS[item.category]}</span>
      <span className="flex-1 min-w-0 font-sans text-[12px] text-paper truncate">{item.label}</span>
      <span className="font-mono text-[11px] text-paper-dim flex-shrink-0">
        {item.amount.toFixed(2)} {item.currency}
        {showConverted && (
          <span className="text-paper-muted ml-1">≈ {converted!.toFixed(2)} {homeCurrency}</span>
        )}
      </span>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${item.label}`}
        className="text-paper-muted hover:text-accent focus-visible:text-accent w-9 h-9 -my-2 flex items-center justify-center flex-shrink-0 transition-colors text-[14px]"
      >
        ×
      </button>
    </div>
  );
}
