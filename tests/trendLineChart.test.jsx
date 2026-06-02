import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrendLineChart from '../src/components/TrendLineChart';

vi.mock('../src/hooks/useIsDarkMode', () => ({
  useIsDarkMode: () => false,
}));

const basePoints = [
  { key: 'mon', value: 1800, xLabel: 'Mon', highlight: true },
  { key: 'tue', value: 0, xLabel: 'Tue' },
];

describe('TrendLineChart', () => {
  it('renders the title', () => {
    render(<TrendLineChart title="Daily Trend" points={basePoints} timeUnit="minutes" />);
    expect(screen.getByText('Daily Trend')).toBeInTheDocument();
  });

  it('renders a value label for every point including zero', () => {
    render(<TrendLineChart title="t" points={basePoints} timeUnit="minutes" />);
    expect(screen.getByText('30')).toBeInTheDocument(); // 1800s -> 30 min
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders an x-axis label for every point', () => {
    render(<TrendLineChart title="t" points={basePoints} timeUnit="minutes" />);
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Tue')).toBeInTheDocument();
  });

  it('calls a point onClick when clicked', () => {
    const onClick = vi.fn();
    const points = [{ key: 'mon', value: 1800, xLabel: 'Mon', onClick }];
    render(<TrendLineChart title="t" points={points} timeUnit="minutes" />);
    fireEvent.click(screen.getByText('Mon'));
    expect(onClick).toHaveBeenCalled();
  });

  it('returns null for empty points', () => {
    const { container } = render(<TrendLineChart title="t" points={[]} timeUnit="minutes" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders without error for a single point', () => {
    render(<TrendLineChart title="Single" points={[{ key: 'a', value: 3600, xLabel: 'Mon' }]} timeUnit="minutes" />);
    expect(screen.getByText('Single')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument(); // 3600s -> 60 min
  });

  it('renders zero labels when all values are zero', () => {
    const points = [
      { key: 'a', value: 0, xLabel: 'Mon' },
      { key: 'b', value: 0, xLabel: 'Tue' },
    ];
    render(<TrendLineChart title="t" points={points} timeUnit="minutes" />);
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBe(2);
  });

  it('does not render a value label for future points but still renders the x-axis label', () => {
    const points = [
      { key: 'past', value: 1800, xLabel: 'Mon' },
      { key: 'future', value: 0, xLabel: 'Tue', future: true },
    ];
    render(<TrendLineChart title="t" points={points} timeUnit="minutes" />);
    expect(screen.getByText('30')).toBeInTheDocument();   // past point has label
    expect(screen.queryByText('0')).not.toBeInTheDocument(); // future "0" suppressed
    expect(screen.getByText('Tue')).toBeInTheDocument();  // x-label still shows
  });

  it('does not fire onClick for future points', () => {
    const onClick = vi.fn();
    const points = [{ key: 'f', value: 0, xLabel: 'Tue', future: true, onClick }];
    render(<TrendLineChart title="t" points={points} timeUnit="minutes" />);
    fireEvent.click(screen.getByText('Tue'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
