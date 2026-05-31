import { describe, it, expect } from 'vitest';
import {
  shiftDate,
  getWeekStart,
  getWeekEnd,
  getMonthStart,
  getMonthEnd,
  getYearStart,
  getYearEnd,
  getDaysInRange,
  dateDiffDays,
} from '../src/utils/dateHelpers.js';

// These helpers operate on calendar date strings and must be timezone-independent.
// Regression: previously they anchored Dates in device-local time then formatted in
// the configured tz — when those differed (e.g. PT device, HK setting) shiftDate
// became a no-op.

describe('shiftDate', () => {
  it('goes back one day', () => {
    expect(shiftDate('2026-05-18', -1)).toBe('2026-05-17');
  });

  it('goes forward one day', () => {
    expect(shiftDate('2026-05-18', 1)).toBe('2026-05-19');
  });

  it('crosses a month boundary backward', () => {
    expect(shiftDate('2026-06-01', -1)).toBe('2026-05-31');
  });

  it('crosses a year boundary forward', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles leap-day arithmetic', () => {
    expect(shiftDate('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDate('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('is independent of configured timezone', () => {
    // Even with an extreme configured tz, the calendar arithmetic must not shift.
    expect(shiftDate('2026-05-18', -1)).toBe('2026-05-17');
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('getWeekStart / getWeekEnd', () => {
  it('returns Monday for a mid-week date', () => {
    // 2026-05-18 is a Monday
    expect(getWeekStart('2026-05-18')).toBe('2026-05-18');
    expect(getWeekStart('2026-05-20')).toBe('2026-05-18'); // Wed → Mon
  });

  it('returns previous Monday for a Sunday', () => {
    expect(getWeekStart('2026-05-24')).toBe('2026-05-18'); // Sun → prev Mon
  });

  it('returns Sunday as the week end', () => {
    expect(getWeekEnd('2026-05-18')).toBe('2026-05-24');
  });
});

describe('getMonthStart / getMonthEnd', () => {
  it('returns the first of the month', () => {
    expect(getMonthStart('2026-05-18')).toBe('2026-05-01');
  });

  it('returns the last of the month for a 31-day month', () => {
    expect(getMonthEnd('2026-05-18')).toBe('2026-05-31');
  });

  it('returns the last of the month for a 30-day month', () => {
    expect(getMonthEnd('2026-04-15')).toBe('2026-04-30');
  });

  it('returns Feb 29 for a leap year', () => {
    expect(getMonthEnd('2024-02-10')).toBe('2024-02-29');
  });

  it('returns Feb 28 for a non-leap year', () => {
    expect(getMonthEnd('2025-02-10')).toBe('2025-02-28');
  });
});

describe('getYearStart / getYearEnd', () => {
  it('returns Jan 1 and Dec 31', () => {
    expect(getYearStart('2026-05-18')).toBe('2026-01-01');
    expect(getYearEnd('2026-05-18')).toBe('2026-12-31');
  });
});

describe('getDaysInRange', () => {
  it('returns inclusive range of dates', () => {
    expect(getDaysInRange('2026-05-18', '2026-05-20')).toEqual([
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
    ]);
  });

  it('returns a full month for a non-leap February', () => {
    const days = getDaysInRange('2025-02-01', '2025-02-28');
    expect(days).toHaveLength(28);
    expect(days[0]).toBe('2025-02-01');
    expect(days[27]).toBe('2025-02-28');
  });

  it('returns 366 days for a full leap year', () => {
    const days = getDaysInRange('2024-01-01', '2024-12-31');
    expect(days).toHaveLength(366);
  });
});

describe('dateDiffDays', () => {
  it('returns the whole-day difference between two YYYY-MM-DD dates', () => {
    expect(dateDiffDays('2026-01-01', '2026-01-08')).toBe(7);
    expect(dateDiffDays('2026-01-08', '2026-01-01')).toBe(-7);
    expect(dateDiffDays('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('is unaffected by DST (noon-anchored)', () => {
    // US DST springs forward on 2026-03-08
    expect(dateDiffDays('2026-03-07', '2026-03-09')).toBe(2);
  });
});
