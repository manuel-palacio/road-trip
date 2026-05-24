import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from '../DatePicker';

describe('DatePicker', () => {
  it('renders the placeholder text when value is empty', () => {
    render(<DatePicker value="" onChange={() => {}} placeholder="Pick a date" />);
    expect(screen.getByTestId('date-picker-trigger')).toHaveTextContent('Pick a date');
  });

  it('renders the formatted local date when value is set', () => {
    render(<DatePicker value="2026-06-15" onChange={() => {}} />);
    const trigger = screen.getByTestId('date-picker-trigger');
    // Locale formatting varies by host, so just assert key parts.
    expect(trigger.textContent).toMatch(/Jun/i);
    expect(trigger.textContent).toMatch(/15/);
    expect(trigger.textContent).toMatch(/2026/);
  });

  it('does NOT shift a date by a day across timezones (uses local date parts)', () => {
    // Naive `new Date('2026-06-15')` interprets the ISO string as UTC
    // midnight, which renders as June 14 in negative-offset timezones.
    // Our parseLocalDate splits on the dashes and uses local-date parts,
    // sidestepping that bug. The displayed day must always be 15.
    render(<DatePicker value="2026-06-15" onChange={() => {}} />);
    expect(screen.getByTestId('date-picker-trigger').textContent).toMatch(/\b15\b/);
  });

  it('clicking the trigger opens the popover with the calendar', () => {
    render(<DatePicker value="2026-06-15" onChange={() => {}} />);
    expect(screen.queryByTestId('date-picker-popover')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('date-picker-trigger'));
    expect(screen.getByTestId('date-picker-popover')).toBeInTheDocument();
  });

  it('clicking a day fires onChange with a YYYY-MM-DD string and closes the popover', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-06-15" onChange={onChange} />);
    fireEvent.click(screen.getByTestId('date-picker-trigger'));
    // defaultMonth navigates the visible grid to the selected date's
    // month, so June 20 should be on screen. react-day-picker labels
    // each day cell with a localised ordinal name like "Saturday, June
    // 20th, 2026".
    const day20 = screen.getByRole('button', { name: /June 20th, 2026/i });
    fireEvent.click(day20);
    expect(onChange).toHaveBeenCalledWith('2026-06-20');
    expect(screen.queryByTestId('date-picker-popover')).not.toBeInTheDocument();
  });

  it('Escape key closes the popover', () => {
    render(<DatePicker value="" onChange={() => {}} />);
    fireEvent.click(screen.getByTestId('date-picker-trigger'));
    expect(screen.getByTestId('date-picker-popover')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('date-picker-popover')).not.toBeInTheDocument();
  });

  it('ignores malformed value strings (renders placeholder)', () => {
    render(<DatePicker value="not-a-date" onChange={() => {}} placeholder="Pick a date" />);
    expect(screen.getByTestId('date-picker-trigger')).toHaveTextContent('Pick a date');
  });
});
