import { describe, it, expect } from 'vitest';
import {
  formatInTimezone,
  getDateRangeUtc,
  noonInHomeTz,
  legacyDateToLoggedAt,
} from '../src/utils/tzDateHelpers.js';

describe('formatInTimezone', () => {
  it('formats a UTC instant as YYYY-MM-DD in PT', () => {
    // 2026-05-15 07:00 UTC = 2026-05-15 00:00 PDT (UTC-7)
    const ms = Date.UTC(2026, 4, 15, 7, 0, 0);
    expect(formatInTimezone(ms, 'America/Los_Angeles')).toBe('2026-05-15');
  });

  it('formats a UTC instant as YYYY-MM-DD in JST', () => {
    // 2026-05-15 14:00 UTC = 2026-05-15 23:00 JST (UTC+9)
    const ms = Date.UTC(2026, 4, 15, 14, 0, 0);
    expect(formatInTimezone(ms, 'Asia/Tokyo')).toBe('2026-05-15');
  });

  it('crosses calendar boundaries correctly across zones', () => {
    // 2026-05-16 02:00 UTC = 2026-05-15 19:00 PDT, but already 2026-05-16 11:00 in JST
    const ms = Date.UTC(2026, 4, 16, 2, 0, 0);
    expect(formatInTimezone(ms, 'America/Los_Angeles')).toBe('2026-05-15');
    expect(formatInTimezone(ms, 'Asia/Tokyo')).toBe('2026-05-16');
  });

  it('handles DST spring-forward in PT', () => {
    // 2026-03-08 10:00 UTC is after DST starts (02:00 -> 03:00 local)
    const ms = Date.UTC(2026, 2, 8, 10, 0, 0);
    expect(formatInTimezone(ms, 'America/Los_Angeles')).toBe('2026-03-08');
  });
});

describe('getDateRangeUtc', () => {
  it('returns the UTC window for a PT calendar date in standard time', () => {
    // 2026-01-15 in PT (UTC-8): midnight PT = 08:00 UTC; next midnight = 2026-01-16 08:00 UTC
    const r = getDateRangeUtc('2026-01-15', 'America/Los_Angeles');
    expect(r.startMs).toBe(Date.UTC(2026, 0, 15, 8, 0, 0));
    expect(r.endMsExclusive).toBe(Date.UTC(2026, 0, 16, 8, 0, 0));
  });

  it('returns the UTC window for a PT calendar date in daylight time', () => {
    // 2026-07-15 in PDT (UTC-7): midnight PDT = 07:00 UTC
    const r = getDateRangeUtc('2026-07-15', 'America/Los_Angeles');
    expect(r.startMs).toBe(Date.UTC(2026, 6, 15, 7, 0, 0));
    expect(r.endMsExclusive).toBe(Date.UTC(2026, 6, 16, 7, 0, 0));
  });

  it('returns the UTC window for a JST calendar date', () => {
    // 2026-05-15 in JST (UTC+9): midnight JST = 2026-05-14 15:00 UTC
    const r = getDateRangeUtc('2026-05-15', 'Asia/Tokyo');
    expect(r.startMs).toBe(Date.UTC(2026, 4, 14, 15, 0, 0));
    expect(r.endMsExclusive).toBe(Date.UTC(2026, 4, 15, 15, 0, 0));
  });
});

describe('noonInHomeTz', () => {
  it('returns noon PDT for a summer date', () => {
    // 2026-07-08 12:00 PDT = 2026-07-08 19:00 UTC
    expect(noonInHomeTz('2026-07-08', 'America/Los_Angeles'))
      .toBe(Date.UTC(2026, 6, 8, 19, 0, 0));
  });

  it('returns noon PST for a winter date', () => {
    // 2026-01-08 12:00 PST = 2026-01-08 20:00 UTC
    expect(noonInHomeTz('2026-01-08', 'America/Los_Angeles'))
      .toBe(Date.UTC(2026, 0, 8, 20, 0, 0));
  });
});

describe('legacyDateToLoggedAt', () => {
  it('always anchors to noon America/Los_Angeles regardless of caller tz', () => {
    expect(legacyDateToLoggedAt('2026-05-08'))
      .toBe(Date.UTC(2026, 4, 8, 19, 0, 0));
    expect(legacyDateToLoggedAt('2026-01-08'))
      .toBe(Date.UTC(2026, 0, 8, 20, 0, 0));
  });
});
