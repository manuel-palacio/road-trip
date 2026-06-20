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

  it('filters out results beyond detourCapKm when given a legPolyline', async () => {
    // legPolyline along the equator from (0,0) to (0,5). Stations at lat 0.005
    // are ~0.5 km off-route (pass 5 km cap); station at lat 0.1 is ~11 km off (fails).
    const legPolyline = [{ lat: 0, lng: 0 }, { lat: 0, lng: 2 }, { lat: 0, lng: 5 }];
    const stations = [
      { place_id: 'NEAR_A', name: 'Near A', vicinity: '', geometry: { location: { lat: () => 0.005, lng: () => 1 } } },
      { place_id: 'NEAR_B', name: 'Near B', vicinity: '', geometry: { location: { lat: () => 0.005, lng: () => 3 } } },
      { place_id: 'FAR',    name: 'Far',    vicinity: '', geometry: { location: { lat: () => 0.1,   lng: () => 2 } } },
    ];

    const mapsWithResults = {
      places: {
        PlacesService: class {
          constructor(_: unknown) {}
          nearbySearch(_req: unknown, cb: (results: typeof stations, status: string) => void) {
            cb(stations, 'OK');
          }
        },
        PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      },
    } as unknown as typeof google.maps;

    const target: FuelSearchTarget = {
      midpoint: { lat: 0, lng: 2.5 },
      insertAtFlatIndex: 1,
      legStart: { id: 'a', name: 'A', label: 'A', lat: 0, lng: 0, type: 'start' as const },
      legEnd:   { id: 'b', name: 'B', label: 'B', lat: 0, lng: 5, type: 'destination' as const },
      legKm: 555,
    };

    render(
      <NearbyFinder
        category="fuel"
        target={target}
        maps={mapsWithResults}
        map={fakeMap}
        onSelect={() => {}}
        onClose={() => {}}
        detourCapKm={5}
        legPolyline={legPolyline}
      />,
    );

    await screen.findByText('Near A');
    await screen.findByText('Near B');
    expect(screen.queryByText('Far')).toBeNull();
  });
});
