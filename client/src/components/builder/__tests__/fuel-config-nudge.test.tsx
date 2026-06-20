import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DayHeader } from '../DayHeader';
import { DayColumn } from '../DayColumn';
import type { DayGroup } from '../../../lib/compute';
import type { Stop } from '../../../lib/types';

function withQueryClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// Issue #59 component tests — verifies the UI side of the nudge-chip ACs.
// The data-layer side (fuelConfigState classification) is covered by the
// unit tests in compute.test.ts. Here we exercise the rendering rules.

function dayGroup(): DayGroup {
  return {
    day: 1,
    km: 200,
    durationSeconds: 7200,
    stops: [{
      stop: { id: 'a', name: 'A', label: 'A', lat: 0, lng: 0, type: 'start' } as Stop,
      index: 0,
    }],
  };
}

function dayHeaderProps(overrides: Partial<React.ComponentProps<typeof DayHeader>> = {}) {
  return {
    day: 1,
    stopCount: 2,
    km: 200,
    durationSeconds: 7200,
    startDate: null,
    isFirst: true,
    ...overrides,
  };
}

function dayColumnProps(overrides: Partial<React.ComponentProps<typeof DayColumn>> = {}) {
  return {
    group: dayGroup(),
    startDate: null,
    totalStops: 1,
    isFirstDay: true,
    onChangeType: () => {},
    onRemove: () => {},
    onSetForceDayStart: () => {},
    onAddHighlight: () => {},
    onRemoveHighlight: () => {},
    onDragStart: () => {},
    onDragEnd: () => {},
    onDragOver: () => {},
    onDragLeave: () => {},
    onDrop: () => {},
    ...overrides,
  };
}

describe('DayHeader fuel-config nudge (issue #59)', () => {
  it('AC4: renders NOTHING when fuel is unconfigured (no nudge, no cost)', () => {
    render(<DayHeader {...dayHeaderProps({ fuelCost: null, fuelConfigPartial: false })} />);
    expect(screen.queryByTestId('fuel-config-nudge')).not.toBeInTheDocument();
  });
  it('AC2: renders the nudge chip when fuelConfigPartial=true and no fuelCost', () => {
    render(<DayHeader {...dayHeaderProps({ fuelCost: null, fuelConfigPartial: true })} />);
    const nudge = screen.getByTestId('fuel-config-nudge');
    expect(nudge).toBeInTheDocument();
    expect(nudge).toHaveTextContent(/Set fuel/i);
  });
  it('AC3: clicking the nudge invokes onConfigureFuel', () => {
    const onConfigure = vi.fn();
    render(
      <DayHeader
        {...dayHeaderProps({ fuelCost: null, fuelConfigPartial: true, onConfigureFuel: onConfigure })}
      />,
    );
    fireEvent.click(screen.getByTestId('fuel-config-nudge'));
    expect(onConfigure).toHaveBeenCalledTimes(1);
  });
  it('AC5: when ready (fuelCost present), shows cost text and HIDES the nudge', () => {
    render(<DayHeader {...dayHeaderProps({ fuelCost: '€124', fuelConfigPartial: false })} />);
    expect(screen.getByText('€124')).toBeInTheDocument();
    expect(screen.queryByTestId('fuel-config-nudge')).not.toBeInTheDocument();
  });
  it('cost wins over nudge if both happen to be set (defensive)', () => {
    // Builder normally won't pass both, but if it does the cost is the
    // truthful state — partial would have produced a null cost.
    render(<DayHeader {...dayHeaderProps({ fuelCost: '€124', fuelConfigPartial: true })} />);
    expect(screen.getByText('€124')).toBeInTheDocument();
    expect(screen.queryByTestId('fuel-config-nudge')).not.toBeInTheDocument();
  });
});

describe('DayHeader long-day warning (auto-split removal follow-up)', () => {
  it('shows "Long day" chip when km > maxKmPerDay', () => {
    render(<DayHeader {...dayHeaderProps({ km: 660, maxKmPerDay: 600 })} />);
    expect(screen.getByText(/Long day/i)).toBeInTheDocument();
    expect(screen.getByText(/660 km over 600 limit/i)).toBeInTheDocument();
  });
  it('hides the chip when km <= maxKmPerDay', () => {
    render(<DayHeader {...dayHeaderProps({ km: 500, maxKmPerDay: 600 })} />);
    expect(screen.queryByText(/Long day/i)).not.toBeInTheDocument();
  });
  it('falls back to 800km threshold when maxKmPerDay is unset', () => {
    render(<DayHeader {...dayHeaderProps({ km: 850, maxKmPerDay: undefined })} />);
    expect(screen.getByText(/Long day/i)).toBeInTheDocument();
    expect(screen.getByText(/850 km over 800 limit/i)).toBeInTheDocument();
  });
});

describe('DayColumn fuel-config nudge (issue #59)', () => {
  it('AC4: no nudge when unconfigured', () => {
    render(withQueryClient(<DayColumn {...dayColumnProps({ fuelCost: null, fuelConfigPartial: false })} />));
    expect(screen.queryByTestId('fuel-config-nudge')).not.toBeInTheDocument();
  });
  it('AC2: nudge visible when partial + no cost', () => {
    render(withQueryClient(<DayColumn {...dayColumnProps({ fuelCost: null, fuelConfigPartial: true })} />));
    expect(screen.getByTestId('fuel-config-nudge')).toBeInTheDocument();
  });
  it('AC3: nudge click fires the callback', () => {
    const onConfigure = vi.fn();
    render(
      withQueryClient(
        <DayColumn
          {...dayColumnProps({ fuelCost: null, fuelConfigPartial: true, onConfigureFuel: onConfigure })}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId('fuel-config-nudge'));
    expect(onConfigure).toHaveBeenCalledTimes(1);
  });
  it('AC5: ready state shows cost, no nudge', () => {
    render(withQueryClient(<DayColumn {...dayColumnProps({ fuelCost: '€124', fuelConfigPartial: false })} />));
    expect(screen.getByText('€124')).toBeInTheDocument();
    expect(screen.queryByTestId('fuel-config-nudge')).not.toBeInTheDocument();
  });
});
