import { render, screen } from '@testing-library/react';
import { NearbyFinder } from '../NearbyFinder';
import type { FuelSearchTarget } from '../../../lib/fuel-stops';
import type { Stop } from '../../../lib/types';

// Issue #71 component tests — verifies the category-driven rendering.
// We don't exercise the Places API (mock-heavy, low value) — instead
// we assert the modal heading + empty-state copy + accessible labels
// adapt to the `category` prop. The fuel-specific behaviour is locked
// in by the "fuel" test below to prevent regressions in that flow.

// google.maps is referenced in the component's type signatures, not its
// initial render path. Cast through unknown so jsdom doesn't need a
// real SDK present for these tests.
const fakeMaps = {
  places: {
    PlacesService: class { constructor(_: unknown) {} nearbySearch() {} },
    PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
  },
} as unknown as typeof google.maps;
const fakeMap = {} as google.maps.Map;

function stopOf(id: string): Stop {
  return {
    id, name: id, label: id, lat: 0, lng: 0, type: 'waypoint',
  };
}

function targetOf(): FuelSearchTarget {
  return {
    midpoint: { lat: 50, lng: 10 },
    insertAtFlatIndex: 1,
    legStart: stopOf('Stockholm'),
    legEnd: stopOf('Copenhagen'),
    legKm: 660,
  };
}

describe('NearbyFinder (issue #71)', () => {
  it('fuel: heading reads "Add a fuel stop" (preserves the legacy copy)', () => {
    render(
      <NearbyFinder
        category="fuel"
        target={targetOf()}
        maps={fakeMaps}
        map={fakeMap}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('nearby-finder-heading')).toHaveTextContent(/Add a fuel stop/i);
  });

  it('food: heading uses the category label', () => {
    render(
      <NearbyFinder
        category="food"
        target={targetOf()}
        maps={fakeMaps}
        map={fakeMap}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('nearby-finder-heading')).toHaveTextContent(/Add a food/i);
  });

  it('hotel: heading uses the category label', () => {
    render(
      <NearbyFinder
        category="hotel"
        target={targetOf()}
        maps={fakeMaps}
        map={fakeMap}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('nearby-finder-heading')).toHaveTextContent(/Add a hotel/i);
  });

  it('aria-label on the dialog also adapts to the category', () => {
    render(
      <NearbyFinder
        category="scenic"
        target={targetOf()}
        maps={fakeMaps}
        map={fakeMap}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('nearby-finder')).toHaveAttribute('aria-label', expect.stringMatching(/scenic/i));
  });

  it('data-category attribute carries the category for selector targeting', () => {
    render(
      <NearbyFinder
        category="food"
        target={targetOf()}
        maps={fakeMaps}
        map={fakeMap}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('nearby-finder')).toHaveAttribute('data-category', 'food');
  });

  it('shows a "Searching nearby…" placeholder while results are loading', () => {
    render(
      <NearbyFinder
        category="fuel"
        target={targetOf()}
        maps={fakeMaps}
        map={fakeMap}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Searching nearby/i)).toBeInTheDocument();
  });
});
