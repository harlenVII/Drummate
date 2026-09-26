import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DailyReport from '../src/components/DailyReport';
import { setTimezone } from '../src/services/timezoneService';

vi.mock('../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key) => key }),
}));

const items = [
  { id: 1, name: 'Paradiddle', category: 'fundamentals', sortOrder: 0 },
  { id: 2, name: 'Groove', category: 'songs', sortOrder: 1 },
];
// 2026-09-25 PDT: Paradiddle 21:02-21:07 and 21:40-21:45; Groove 20:00-20:30.
const logs = [
  { id: 10, itemId: 1, duration: 300, loggedAt: Date.UTC(2026, 8, 26, 4, 7), date: '2026-09-25' },
  { id: 11, itemId: 1, duration: 300, loggedAt: Date.UTC(2026, 8, 26, 4, 45), date: '2026-09-25' },
  { id: 12, itemId: 2, duration: 1800, loggedAt: Date.UTC(2026, 8, 26, 3, 30), date: '2026-09-25' },
];

function daily(reportDate, reportLogs) {
  return (
    <DailyReport
      items={items}
      allItems={items}
      reportDate={reportDate}
      reportLogs={reportLogs}
      onDateChange={vi.fn()}
      onEditTime={vi.fn()}
      onAddTime={vi.fn()}
      onMergeToYesterday={vi.fn()}
      timeUnit="minutes"
      groupByCategory={false}
    />
  );
}

beforeEach(async () => {
  await setTimezone('America/Los_Angeles');
});

describe('DailyReport sessions', () => {
  it("tapping an item card shows only that item's sessions", async () => {
    render(daily('2026-09-25', logs));
    expect(screen.queryByText('21:02 – 21:07')).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('Paradiddle'));

    expect(screen.getByText('21:02 – 21:07')).toBeInTheDocument();
    expect(screen.getByText('21:40 – 21:45')).toBeInTheDocument();
    expect(screen.queryByText('20:00 – 20:30')).not.toBeInTheDocument();
  });

  it('keeps a card open when the date changes', async () => {
    const { rerender } = render(daily('2026-09-25', logs));
    await userEvent.click(screen.getByText('Paradiddle'));

    // 18:00-18:10 PDT on 2026-09-26
    const nextDay = [{ id: 20, itemId: 1, duration: 600, loggedAt: Date.UTC(2026, 8, 27, 1, 10), date: '2026-09-26' }];
    rerender(daily('2026-09-26', nextDay));

    expect(screen.getByText('18:00 – 18:10')).toBeInTheDocument();
  });
});
