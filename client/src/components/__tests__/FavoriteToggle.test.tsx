import { describe, expect, it, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { FavoriteToggle } from '../FavoriteToggle';

describe('FavoriteToggle', () => {
  it('renders an empty star when not favorited', () => {
    const { container } = render(<FavoriteToggle isFavorited={false} onAdd={() => {}} onRemove={() => {}} />);
    expect(container.textContent).toContain('☆');
    expect(container.textContent).not.toContain('★');
  });

  it('renders a filled star when favorited', () => {
    const { container } = render(<FavoriteToggle isFavorited={true} onAdd={() => {}} onRemove={() => {}} />);
    expect(container.textContent).toContain('★');
  });

  it('calls onAdd when clicked while not favorited', () => {
    const onAdd = vi.fn();
    const { getByRole } = render(<FavoriteToggle isFavorited={false} onAdd={onAdd} onRemove={() => {}} />);
    fireEvent.click(getByRole('button'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('calls onRemove when clicked while favorited', () => {
    const onRemove = vi.fn();
    const { getByRole } = render(<FavoriteToggle isFavorited={true} onAdd={() => {}} onRemove={onRemove} />);
    fireEvent.click(getByRole('button'));
    expect(onRemove).toHaveBeenCalled();
  });

  it('button is disabled while pending', () => {
    const { getByRole } = render(<FavoriteToggle isFavorited={false} pending onAdd={() => {}} onRemove={() => {}} />);
    expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
