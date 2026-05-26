import { render, screen, fireEvent } from '@testing-library/react';
import { CategoryMenuButton, V1_CATEGORIES } from '../CategoryMenuButton';

// Issue #72 component tests.
// The data-layer side (TYPE_FOR_CATEGORY lookup) is covered by
// nearby-search.test.ts. Here we lock the trigger + menu + keyboard
// behavior so the wiring is regression-checked.

describe('CategoryMenuButton (issue #72)', () => {
  it('AC1: renders a trigger button (replaces the legacy + Fuel button)', () => {
    render(<CategoryMenuButton onPick={() => {}} />);
    expect(screen.getByTestId('category-menu-trigger')).toBeInTheDocument();
  });

  it('clicking the trigger opens the menu popover', () => {
    render(<CategoryMenuButton onPick={() => {}} />);
    expect(screen.queryByTestId('category-menu-popover')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('category-menu-trigger'));
    expect(screen.getByTestId('category-menu-popover')).toBeInTheDocument();
  });

  it('AC2: menu lists the v1 category set (fuel, food, hotel, scenic)', () => {
    render(<CategoryMenuButton onPick={() => {}} />);
    fireEvent.click(screen.getByTestId('category-menu-trigger'));
    const items = screen.getAllByTestId('category-menu-item');
    expect(items).toHaveLength(4);
    const categories = items.map((b) => b.getAttribute('data-category'));
    expect(categories).toEqual(['fuel', 'food', 'hotel', 'scenic']);
    // Lock the V1 set itself so accidentally adding 'landmark' / 'other'
    // forces a deliberate decision.
    expect(V1_CATEGORIES).toEqual(['fuel', 'food', 'hotel', 'scenic']);
  });

  it('AC3: clicking an item fires onPick with the category and closes the menu', () => {
    const onPick = vi.fn();
    render(<CategoryMenuButton onPick={onPick} />);
    fireEvent.click(screen.getByTestId('category-menu-trigger'));
    const foodItem = screen.getAllByTestId('category-menu-item').find((el) => el.getAttribute('data-category') === 'food')!;
    fireEvent.click(foodItem);
    expect(onPick).toHaveBeenCalledWith('food');
    expect(screen.queryByTestId('category-menu-popover')).not.toBeInTheDocument();
  });

  it('AC4: fuel entry rendered as disabled when in disabledCategories', () => {
    render(<CategoryMenuButton disabledCategories={['fuel']} onPick={() => {}} />);
    fireEvent.click(screen.getByTestId('category-menu-trigger'));
    const items = screen.getAllByTestId('category-menu-item');
    const fuel = items.find((b) => b.getAttribute('data-category') === 'fuel') as HTMLButtonElement;
    const food = items.find((b) => b.getAttribute('data-category') === 'food') as HTMLButtonElement;
    expect(fuel).toBeDisabled();
    expect(food).not.toBeDisabled();
  });

  it('clicking a disabled item is a no-op (does not call onPick or close)', () => {
    const onPick = vi.fn();
    render(<CategoryMenuButton disabledCategories={['fuel']} onPick={onPick} />);
    fireEvent.click(screen.getByTestId('category-menu-trigger'));
    const fuel = screen.getAllByTestId('category-menu-item').find((b) => b.getAttribute('data-category') === 'fuel') as HTMLButtonElement;
    // jsdom's fireEvent.click on a disabled button is a no-op for onClick
    // — assert the handler stays silent + menu stays open.
    fireEvent.click(fuel);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByTestId('category-menu-popover')).toBeInTheDocument();
  });

  it('AC6: Escape key closes the menu', () => {
    render(<CategoryMenuButton onPick={() => {}} />);
    fireEvent.click(screen.getByTestId('category-menu-trigger'));
    expect(screen.getByTestId('category-menu-popover')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('category-menu-popover')).not.toBeInTheDocument();
  });

  it('AC6: ArrowDown on a menu item moves focus to the next item', () => {
    render(<CategoryMenuButton onPick={() => {}} />);
    fireEvent.click(screen.getByTestId('category-menu-trigger'));
    const items = screen.getAllByTestId('category-menu-item');
    // First item should already have focus from the open effect.
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
  });

  it('AC6: ArrowDown skips disabled items so focus never lands on them', () => {
    // food is disabled — pressing ArrowDown from fuel should skip past
    // food and land on hotel.
    render(<CategoryMenuButton disabledCategories={['food']} onPick={() => {}} />);
    fireEvent.click(screen.getByTestId('category-menu-trigger'));
    const items = screen.getAllByTestId('category-menu-item');
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    const hotel = items.find((b) => b.getAttribute('data-category') === 'hotel');
    expect(hotel).toHaveFocus();
  });
});
