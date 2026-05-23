import { render, screen, fireEvent } from '@testing-library/react';
import { CountryOverrideRow, placeholderPriceFor } from '../CountryOverrideRow';

// Issue #57 — component tests for the auto-populated per-country
// override row. The data-layer side (tripCountriesFromStops + compiled
// overrides) is covered in compute.test.ts. Here we lock the rendering
// rules: pre-fill defaults, dim when no override, fire callback on edit.

const CURRENCIES = [
  { code: 'EUR', label: 'EUR €' },
  { code: 'SEK', label: 'SEK kr' },
  { code: 'GBP', label: 'GBP £' },
];

function baseProps(overrides: Partial<React.ComponentProps<typeof CountryOverrideRow>> = {}) {
  return {
    code: 'SE',
    name: 'Sweden',
    defaultCurrency: 'SEK',
    price: '',
    currency: 'SEK',
    matchesDefault: true,
    globalPrice: '1.85',
    globalCurrency: 'SEK',
    currencies: CURRENCIES,
    onChange: () => {},
    ...overrides,
  };
}

describe('CountryOverrideRow (issue #57)', () => {
  it('AC2: renders the flag + country name + defaults (price empty, currency set)', () => {
    render(<CountryOverrideRow {...baseProps()} />);
    expect(screen.getByText('Sweden')).toBeInTheDocument();
    const priceInput = screen.getByLabelText('Price for Sweden') as HTMLInputElement;
    // Empty value — pre-filled "default" semantics via empty input + placeholder
    expect(priceInput.value).toBe('');
    // Placeholder shows the global price because this row's currency
    // matches the global currency (SEK === SEK).
    expect(priceInput.placeholder).toBe('1.85');
    const currencySelect = screen.getByLabelText('Currency for Sweden') as HTMLSelectElement;
    expect(currencySelect.value).toBe('SEK');
  });
  it('placeholder suppressed when row currency differs from global (DE row, SEK global)', () => {
    // User-reported bug: setting SE=20 SEK then adding a DE stop made the
    // DE row appear to "auto-populate to 20 EUR" because the placeholder
    // shows the global NUMBER without currency, next to an EUR dropdown.
    render(
      <CountryOverrideRow
        {...baseProps({
          code: 'DE', name: 'Germany',
          currency: 'EUR', defaultCurrency: 'EUR',
          globalPrice: '20', globalCurrency: 'SEK',
        })}
      />,
    );
    const priceInput = screen.getByLabelText('Price for Germany') as HTMLInputElement;
    expect(priceInput.placeholder).toBe('—');
  });
  it('placeholder is "—" when no global price configured', () => {
    render(
      <CountryOverrideRow
        {...baseProps({ globalPrice: '', globalCurrency: 'EUR', currency: 'EUR' })}
      />,
    );
    const priceInput = screen.getByLabelText(/Price for/i) as HTMLInputElement;
    expect(priceInput.placeholder).toBe('—');
  });
  it('AC3: dims (opacity-60) when matchesDefault=true', () => {
    const { container } = render(<CountryOverrideRow {...baseProps({ matchesDefault: true })} />);
    const row = container.querySelector('[data-testid="country-override-row"]') as HTMLElement;
    expect(row.className).toContain('opacity-60');
    expect(row).toHaveAttribute('data-matches-default', 'true');
    // "default" label appears in the trailing slot
    expect(screen.getByText('default')).toBeInTheDocument();
  });
  it('AC3: full opacity when matchesDefault=false (user-set custom price)', () => {
    const { container } = render(
      <CountryOverrideRow {...baseProps({ matchesDefault: false, price: '2.15' })} />,
    );
    const row = container.querySelector('[data-testid="country-override-row"]') as HTMLElement;
    expect(row.className).toContain('opacity-100');
    expect(row).toHaveAttribute('data-matches-default', 'false');
    // No "default" label when custom
    expect(screen.queryByText('default')).not.toBeInTheDocument();
  });
  it('editing the price input fires onChange with the new price', () => {
    const onChange = vi.fn();
    render(<CountryOverrideRow {...baseProps({ onChange })} />);
    fireEvent.change(screen.getByLabelText('Price for Sweden'), { target: { value: '2.15' } });
    expect(onChange).toHaveBeenCalledWith({ price: '2.15' });
  });
  it('changing the currency select fires onChange with the new currency', () => {
    const onChange = vi.fn();
    render(<CountryOverrideRow {...baseProps({ onChange })} />);
    fireEvent.change(screen.getByLabelText('Currency for Sweden'), { target: { value: 'EUR' } });
    expect(onChange).toHaveBeenCalledWith({ currency: 'EUR' });
  });
  it('data-country attribute carries the ISO code for selector targeting', () => {
    const { container } = render(<CountryOverrideRow {...baseProps({ code: 'DE', name: 'Germany' })} />);
    const row = container.querySelector('[data-testid="country-override-row"]') as HTMLElement;
    expect(row).toHaveAttribute('data-country', 'DE');
  });
});

describe('placeholderPriceFor (pure)', () => {
  it('returns global price when row currency matches global', () => {
    expect(placeholderPriceFor('SEK', '20', 'SEK')).toBe('20');
    expect(placeholderPriceFor('EUR', '1.85', 'EUR')).toBe('1.85');
  });
  it('returns empty string when currencies differ', () => {
    expect(placeholderPriceFor('EUR', '20', 'SEK')).toBe('');
    expect(placeholderPriceFor('DKK', '20', 'SEK')).toBe('');
  });
  it('returns empty string when global price is empty/missing', () => {
    expect(placeholderPriceFor('SEK', '', 'SEK')).toBe('');
    expect(placeholderPriceFor('EUR', '', 'EUR')).toBe('');
  });
  it('compares currencies case-insensitively', () => {
    expect(placeholderPriceFor('eur', '1.85', 'EUR')).toBe('1.85');
    expect(placeholderPriceFor('SEK', '20', 'sek')).toBe('20');
  });
  it('treats missing/empty currency strings as non-matching', () => {
    expect(placeholderPriceFor('', '20', 'EUR')).toBe('');
    expect(placeholderPriceFor('EUR', '20', '')).toBe('');
  });
});
