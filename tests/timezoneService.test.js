import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('timezoneService', () => {
  beforeEach(() => {
    vi.resetModules();
    globalThis.localStorage = (() => {
      const store = new Map();
      return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
      };
    })();
  });

  it('defaults to America/Los_Angeles when no cache and no userId', async () => {
    const m = await import('../src/services/timezoneService.js');
    expect(m.getTimezone()).toBe('America/Los_Angeles');
  });

  it('reads from localStorage cache when present', async () => {
    localStorage.setItem('drummate_timezone', 'Asia/Tokyo');
    const m = await import('../src/services/timezoneService.js');
    expect(m.getTimezone()).toBe('Asia/Tokyo');
  });

  it('setTimezone updates module state and localStorage', async () => {
    const m = await import('../src/services/timezoneService.js');
    await m.setTimezone('Europe/London');
    expect(m.getTimezone()).toBe('Europe/London');
    expect(localStorage.getItem('drummate_timezone')).toBe('Europe/London');
  });

  it('setTimezone rejects an invalid tz and keeps prior value', async () => {
    const m = await import('../src/services/timezoneService.js');
    const before = m.getTimezone();
    await expect(m.setTimezone('Not/A_Real_Zone')).rejects.toThrow();
    expect(m.getTimezone()).toBe(before);
  });
});
