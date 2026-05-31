import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
