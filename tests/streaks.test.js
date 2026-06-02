import { describe, it, expect } from 'vitest';
import { computeLongestStreak, computeCurrentStreak } from '../src/utils/streaks';

describe('computeLongestStreak', () => {
  it('returns zeros for empty input', () => {
    expect(computeLongestStreak([])).toEqual({ length: 0, start: null, end: null });
  });

  it('finds the longest consecutive run with its bounds', () => {
    const days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-10', '2026-01-11'];
    expect(computeLongestStreak(days)).toEqual({
      length: 3, start: '2026-01-01', end: '2026-01-03',
    });
  });

  it('handles a single day', () => {
    expect(computeLongestStreak(['2026-02-15'])).toEqual({
      length: 1, start: '2026-02-15', end: '2026-02-15',
    });
  });

  it('handles a run that ends at the last element', () => {
    const days = ['2026-03-01', '2026-03-05', '2026-03-06', '2026-03-07'];
    expect(computeLongestStreak(days)).toEqual({
      length: 3, start: '2026-03-05', end: '2026-03-07',
    });
  });
});

describe('computeCurrentStreak', () => {
  it('counts back from today when today has practice', () => {
    const set = new Set(['2026-06-01', '2026-05-31', '2026-05-30']);
    expect(computeCurrentStreak(set, { today: '2026-06-01' })).toBe(3);
  });

  it('is 0 when today is missing and anchorOnYesterday is false (StatsReport semantics)', () => {
    const set = new Set(['2026-05-31', '2026-05-30']);
    expect(computeCurrentStreak(set, { today: '2026-06-01' })).toBe(0);
  });

  it('falls back to yesterday when anchorOnYesterday is true (YearlyReport semantics)', () => {
    const set = new Set(['2026-05-31', '2026-05-30']);
    expect(computeCurrentStreak(set, { today: '2026-06-01', anchorOnYesterday: true })).toBe(2);
  });

  it('does not count below minDate', () => {
    const set = new Set(['2026-01-01', '2025-12-31', '2025-12-30']);
    expect(computeCurrentStreak(set, { today: '2026-01-01', minDate: '2026-01-01' })).toBe(1);
  });

  it('returns 0 when neither today nor yesterday has practice', () => {
    const set = new Set(['2026-05-20']);
    expect(computeCurrentStreak(set, { today: '2026-06-01', anchorOnYesterday: true })).toBe(0);
  });
});
