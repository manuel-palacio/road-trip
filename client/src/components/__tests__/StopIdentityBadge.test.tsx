import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StopIdentityBadge } from '../StopIdentityBadge';
import type { Stop } from '../../lib/types';

function stop(overrides: Partial<Stop> & { id: string }): Stop {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    label: overrides.label ?? overrides.id,
    lat: 0,
    lng: 0,
    type: overrides.type ?? 'waypoint',
    dayNumber: overrides.dayNumber ?? 1,
    ...overrides,
  };
}

describe('StopIdentityBadge', () => {
  it('plain waypoint renders the city emoji and a corner sequence-number pip', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a' })} index={2} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('🏙');
    expect(screen.getByTestId('stop-identity-badge-number')).toHaveTextContent('3');
  });

  it('destination with no category uses the city default', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', type: 'destination' })} index={0} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('🏙');
    expect(screen.getByTestId('stop-identity-badge-number')).toHaveTextContent('1');
  });

  it('hotel category renders the hotel emoji', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', category: 'hotel' })} index={2} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('🛏');
    expect(screen.getByTestId('stop-identity-badge-number')).toHaveTextContent('3');
  });

  it('fuel category renders the fuel emoji', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', category: 'fuel' })} index={4} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('⛽');
    expect(screen.getByTestId('stop-identity-badge-number')).toHaveTextContent('5');
  });

  it('legacy fuel stop (type=fuel, no category) renders the fuel emoji', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', type: 'fuel' })} index={1} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('⛽');
    expect(screen.getByTestId('stop-identity-badge-number')).toHaveTextContent('2');
  });

  it('food category renders the food emoji', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', category: 'food' })} index={0} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('🍴');
  });

  it('scenic category renders the scenic emoji', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', category: 'scenic' })} index={0} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('🌄');
  });

  it('landmark category renders the landmark emoji', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', category: 'landmark' })} index={0} />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('📍');
  });

  it('compact variant still renders the category emoji', () => {
    render(<StopIdentityBadge stop={stop({ id: 'a', category: 'scenic' })} index={0} variant="compact" />);
    expect(screen.getByTestId('stop-identity-badge')).toHaveTextContent('🌄');
  });
});
