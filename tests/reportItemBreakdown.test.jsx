import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReportItemBreakdown from '../src/components/ReportItemBreakdown';

vi.mock('../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key) => key }),
}));

const fundamentals = [{ id: 1, name: 'Singles', duration: 900, category: 'fundamentals' }];
const songs = [{ id: 2, name: 'Song A', duration: 1200, category: 'songs' }];
const breakdown = [...fundamentals, ...songs];
const renderCard = (entry) => <div key={entry.id} data-testid="card">{entry.name}</div>;

describe('ReportItemBreakdown', () => {
  it('renders category headers and a card per entry when grouping', () => {
    render(
      <ReportItemBreakdown
        groupByCategory
        fundamentals={fundamentals}
        songs={songs}
        breakdown={breakdown}
        timeUnit="minutes"
        renderCard={renderCard}
      />,
    );
    expect(screen.getByText('categories.fundamentals')).toBeInTheDocument();
    expect(screen.getByText('categories.songs')).toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(2);
  });

  it('renders a flat list with no category headers when not grouping', () => {
    render(
      <ReportItemBreakdown
        groupByCategory={false}
        fundamentals={fundamentals}
        songs={songs}
        breakdown={breakdown}
        timeUnit="minutes"
        renderCard={renderCard}
      />,
    );
    expect(screen.queryByText('categories.fundamentals')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('card')).toHaveLength(2);
  });

  it('omits an empty category section', () => {
    render(
      <ReportItemBreakdown
        groupByCategory
        fundamentals={fundamentals}
        songs={[]}
        breakdown={fundamentals}
        timeUnit="minutes"
        renderCard={renderCard}
      />,
    );
    expect(screen.getByText('categories.fundamentals')).toBeInTheDocument();
    expect(screen.queryByText('categories.songs')).not.toBeInTheDocument();
  });
});
