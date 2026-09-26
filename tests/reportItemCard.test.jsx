import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReportItemCard from '../src/components/ReportItemCard';

vi.mock('../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key) => key }),
}));

describe('ReportItemCard', () => {
  it('renders name, duration label, and percentage for a nonzero entry', () => {
    render(
      <ReportItemCard
        entry={{ id: 1, name: 'Paradiddle', duration: 1800 }}
        grandTotal={3600}
        timeUnit="minutes"
        compactMode={false}
      />,
    );
    expect(screen.getByText('Paradiddle')).toBeInTheDocument();
    expect(screen.getByText('(50%)')).toBeInTheDocument();
    expect(screen.getByText(/30/)).toBeInTheDocument(); // 1800s -> 30 min
  });

  it('shows 0 and no percentage for a zero entry when dimZero is set', () => {
    render(
      <ReportItemCard
        entry={{ id: 2, name: 'Empty', duration: 0 }}
        grandTotal={3600}
        timeUnit="minutes"
        compactMode={false}
        dimZero
      />,
    );
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.queryByText(/\(\d+%\)/)).not.toBeInTheDocument();
  });

  it('calls onEditTime with entry data when editMode is true and card is clicked', async () => {
    const onEditTime = vi.fn();
    const { container } = render(
      <ReportItemCard
        entry={{ id: 1, name: 'Paradiddle', duration: 1800 }}
        grandTotal={3600}
        timeUnit="minutes"
        compactMode={false}
        editMode
        onEditTime={onEditTime}
      />,
    );
    await userEvent.click(container.firstChild);
    expect(onEditTime).toHaveBeenCalledWith(1, 'Paradiddle', 1800);
  });
});

describe('ReportItemCard session list', () => {
  const tz = 'America/Los_Angeles';
  // 21:02-21:07 PDT on 2026-09-25, plus an old negative adjustment.
  const sessions = [
    { id: 10, kind: 'session', startMs: Date.UTC(2026, 8, 26, 4, 2), endMs: Date.UTC(2026, 8, 26, 4, 7), duration: 300 },
    { id: 11, kind: 'adjustment', startMs: null, endMs: null, duration: -180 },
  ];
  const baseProps = { entry: { id: 1, name: 'Paradiddle', duration: 1800 }, grandTotal: 3600, timeUnit: 'minutes', compactMode: false };

  it('asks to toggle its session list when tapped outside edit mode', async () => {
    const onToggleExpand = vi.fn();
    const { container } = render(
      <ReportItemCard {...baseProps} sessions={sessions} expanded={false} onToggleExpand={onToggleExpand} tz={tz} />,
    );
    expect(screen.queryByText('21:02 – 21:07')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(container.firstChild);
    expect(onToggleExpand).toHaveBeenCalledWith(1);
  });

  it('lists sessions as 24-hour ranges and adjustments by name when expanded', () => {
    const { container } = render(
      <ReportItemCard {...baseProps} sessions={sessions} expanded onToggleExpand={vi.fn()} tz={tz} />,
    );
    expect(container.firstChild).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('21:02 – 21:07')).toBeInTheDocument();
    expect(screen.getByText('5 minutes')).toBeInTheDocument();
    expect(screen.getByText('sessionAdjustment')).toBeInTheDocument();
    expect(screen.getByText('-3 minutes')).toBeInTheDocument();
  });

  it('in edit mode a tap opens the editor instead of toggling, and an open list stays visible', async () => {
    const onEditTime = vi.fn();
    const onToggleExpand = vi.fn();
    const { container } = render(
      <ReportItemCard {...baseProps} editMode onEditTime={onEditTime}
        sessions={sessions} expanded onToggleExpand={onToggleExpand} tz={tz} />,
    );
    await userEvent.click(container.firstChild);
    expect(onEditTime).toHaveBeenCalledWith(1, 'Paradiddle', 1800);
    expect(onToggleExpand).not.toHaveBeenCalled();
    expect(screen.getByText('21:02 – 21:07')).toBeInTheDocument();
    expect(container.firstChild).not.toHaveAttribute('aria-expanded');
  });

  it('shows a session that crossed midnight as a plain time range', () => {
    // 23:50 PDT on 2026-09-25 to 00:20 on 2026-09-26
    const crossing = [{ id: 12, kind: 'session', startMs: Date.UTC(2026, 8, 26, 6, 50), endMs: Date.UTC(2026, 8, 26, 7, 20), duration: 1800 }];
    render(<ReportItemCard {...baseProps} sessions={crossing} expanded onToggleExpand={vi.fn()} tz={tz} />);
    expect(screen.getByText('23:50 – 00:20')).toBeInTheDocument();
  });

  it('has no toggle affordance without sessions', () => {
    const { container } = render(<ReportItemCard {...baseProps} />);
    expect(container.firstChild).not.toHaveAttribute('role');
    expect(container.firstChild).not.toHaveAttribute('aria-expanded');
  });
});
