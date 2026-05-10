import { render, screen } from '@testing-library/react';
import { Brand } from '../Brand';

describe('Brand', () => {
  it('renders the wordmark with accent on Trip', () => {
    render(<Brand />);
    expect(screen.getByText('Road')).toBeInTheDocument();
    expect(screen.getByText('Trip')).toHaveClass('text-accent');
  });
});
