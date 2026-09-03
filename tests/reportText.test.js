import { describe, it, expect } from 'vitest';
import { buildReportText, formatReportDate } from '../src/utils/reportText';

// t() mock: returns the key so assertions read as the untranslated label
const t = (key) => key;

const items = [
  { id: 1, name: 'Singles', category: 'fundamentals' },
  { id: 2, name: 'Song A', category: 'songs' },
  { id: 3, name: 'Legacy', category: undefined }, // pre-category item
];

const build = (overrides = {}) =>
  buildReportText({
    logs: [],
    startDate: '2026-09-02',
    endDate: '2026-09-02',
    items,
    t,
    timeUnit: 'minutes',
    ...overrides,
  });

describe('buildReportText', () => {
  it('groups into fundamentals/songs sections when groupByCategory is true', () => {
    const text = build({
      logs: [
        { itemId: 1, duration: 600 },
        { itemId: 2, duration: 1200 },
      ],
      groupByCategory: true,
    });

    expect(text).toBe(
      [
        'date: 2026/09/02',
        'total: 30 minutes',
        '',
        'categories.fundamentals:',
        'Singles: 10 minutes',
        '',
        'categories.songs:',
        'Song A: 20 minutes',
      ].join('\n')
    );
  });

  it('emits a flat list sorted by duration desc when groupByCategory is false', () => {
    const text = build({
      logs: [
        { itemId: 1, duration: 600 },
        { itemId: 2, duration: 1200 },
      ],
      groupByCategory: false,
    });

    expect(text).toBe(
      [
        'date: 2026/09/02',
        'total: 30 minutes',
        '',
        'Song A: 20 minutes',
        'Singles: 10 minutes',
      ].join('\n')
    );
  });

  it('defaults to grouped output when groupByCategory is omitted', () => {
    const text = build({ logs: [{ itemId: 1, duration: 600 }] });
    expect(text).toContain('categories.fundamentals:');
  });

  it('treats items without a category as fundamentals', () => {
    const text = build({ logs: [{ itemId: 3, duration: 300 }], groupByCategory: true });

    expect(text).toContain('categories.fundamentals:');
    expect(text).toContain('Legacy: 5 minutes');
    expect(text).not.toContain('categories.songs:');
  });

  it('sums multiple logs for the same item', () => {
    const text = build({
      logs: [
        { itemId: 1, duration: 600 },
        { itemId: 1, duration: 300 },
      ],
    });
    expect(text).toContain('Singles: 15 minutes');
    expect(text).toContain('total: 15 minutes');
  });

  it('drops logs whose itemId is not in items, and excludes them from the total', () => {
    const text = build({
      logs: [
        { itemId: 1, duration: 600 },
        { itemId: 99, duration: 9000 }, // trashed / unknown item
      ],
    });

    expect(text).not.toContain('9000');
    expect(text).toContain('total: 10 minutes');
  });

  it('drops zero-duration entries', () => {
    const text = build({
      logs: [
        { itemId: 1, duration: 600 },
        { itemId: 2, duration: 0 },
      ],
    });
    expect(text).not.toContain('Song A');
  });

  it('renders a single date when start equals end', () => {
    expect(build({ logs: [] })).toContain('date: 2026/09/02');
  });

  it('renders a date range when start differs from end', () => {
    const text = build({ startDate: '2026-09-01', endDate: '2026-09-30', logs: [] });
    expect(text).toContain('date: 2026/09/01 – 2026/09/30');
  });

  it('respects the hours time unit', () => {
    const text = build({ logs: [{ itemId: 1, duration: 3600 }], timeUnit: 'hours' });
    expect(text).toContain('Singles: 1.0 hours');
    expect(text).toContain('total: 1.0 hours');
  });
});

describe('formatReportDate', () => {
  it('renders YYYY-MM-DD as YYYY/MM/DD', () => {
    expect(formatReportDate('2026-09-02')).toBe('2026/09/02');
  });
});
