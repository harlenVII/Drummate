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
});
