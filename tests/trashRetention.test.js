import { describe, it, expect } from 'vitest';
import { daysUntilPurge } from '../src/utils/dateHelpers';
import { TRASH_RETENTION_DAYS } from '../src/constants/trash';

const DAY = 1000 * 60 * 60 * 24;

describe('daysUntilPurge', () => {
  it('returns the full retention window for an item trashed just now', () => {
    const now = Date.now();
    expect(daysUntilPurge(new Date(now).toISOString(), now)).toBe(TRASH_RETENTION_DAYS);
  });

  it('counts down as time passes', () => {
    const now = Date.now();
    const trashedAt = new Date(now - 10 * DAY).toISOString();
    expect(daysUntilPurge(trashedAt, now)).toBe(TRASH_RETENTION_DAYS - 10);
  });

  it('never goes below zero past the window', () => {
    const now = Date.now();
    const trashedAt = new Date(now - 100 * DAY).toISOString();
    expect(daysUntilPurge(trashedAt, now)).toBe(0);
  });

  it('returns 0 when trashedAt is missing', () => {
    expect(daysUntilPurge(null, Date.now())).toBe(0);
    expect(daysUntilPurge(undefined, Date.now())).toBe(0);
  });

  it('defaults now to the current time when omitted', () => {
    const trashedAt = new Date(Date.now() - 5 * DAY).toISOString();
    // Allow either 25 (exactly) given rounding within the same ms window
    expect(daysUntilPurge(trashedAt)).toBe(TRASH_RETENTION_DAYS - 5);
  });
});
