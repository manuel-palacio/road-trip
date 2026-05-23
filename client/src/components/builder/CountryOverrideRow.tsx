import { flagEmoji } from '../../lib/flags';

export type FuelCurrencyOption = { code: string; label: string };

type Props = {
  /** ISO-3166-1 alpha-2 country code (e.g. 'SE'). Used for the flag emoji
   * and as the stable identity of the row in the override list. */
  code: string;
  /** Human-readable country name; falls back to the code itself when the
   * country isn't in the FUEL_COUNTRIES lookup. */
  name: string;
  /** Currency to use when the user starts editing this row without first
   * picking one — defaults to the country's typical currency. */
  defaultCurrency: string;
  /** Current price string (free-form input). Empty when no override exists
   * for this country yet, so the placeholder shows the global default. */
  price: string;
  /** Current currency code. Falls back to defaultCurrency when no override
   * row is stored yet for this country. */
  currency: string;
  /** True when this row will NOT be persisted (no override or zero/empty
   * price). The visual de-emphasis (issue #57 AC3) matches save behavior —
   * what the user sees dimmed is what won't be sent. */
  matchesDefault: boolean;
  /** Placeholder shown in the price input when the override is empty —
   * the trip's global default price so the user sees what they'd be
   * overriding. */
  globalPriceHint: string;
  /** All currencies the user can pick from for this row. */
  currencies: ReadonlyArray<FuelCurrencyOption>;
  onChange: (patch: { price?: string; currency?: string }) => void;
};

/** A single per-country fuel-price override row. Auto-populated from the
 * trip's visited countries (issue #57): empty rows render dimmed and
 * aren't persisted; the user only needs to edit countries whose price
 * differs from the global default. */
export function CountryOverrideRow(p: Props) {
  return (
    <div
      data-testid="country-override-row"
      data-country={p.code}
      data-matches-default={p.matchesDefault ? 'true' : 'false'}
      className={`grid grid-cols-[auto_1.2fr_1fr_1fr] gap-2 items-center transition-opacity ${p.matchesDefault ? 'opacity-60' : 'opacity-100'}`}
    >
      <span className="inline-flex items-center gap-2 min-w-0">
        <span className="text-[16px]" aria-hidden>{flagEmoji(p.code)}</span>
        <span className="font-serif italic text-[13px] text-paper-dim truncate" title={p.name}>
          {p.name}
        </span>
      </span>
      <input
        type="number"
        min={0}
        step={0.01}
        inputMode="decimal"
        placeholder={p.globalPriceHint || '—'}
        value={p.price}
        onChange={(e) => p.onChange({ price: e.target.value })}
        className="bg-transparent border-0 border-b border-line text-paper text-[13px] py-1 outline-none transition-colors focus:border-accent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-paper-muted min-w-0"
        aria-label={`Price for ${p.name}`}
      />
      <select
        value={p.currency}
        onChange={(e) => p.onChange({ currency: e.target.value })}
        className="bg-transparent border-0 border-b border-line text-paper text-[13px] py-1 outline-none cursor-pointer transition-colors focus:border-accent min-w-0"
        aria-label={`Currency for ${p.name}`}
      >
        {p.currencies.map((c) => (
          <option key={c.code} value={c.code}>{c.label}</option>
        ))}
      </select>
      {p.matchesDefault ? (
        <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-paper-muted text-right">
          default
        </span>
      ) : (
        <span className="w-7" aria-hidden />
      )}
    </div>
  );
}
