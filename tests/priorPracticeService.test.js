import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('priorPracticeService', () => {
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

  it('returns 0 when no localStorage entry exists', async () => {
    const m = await import('../src/services/priorPracticeService.js');
    expect(m.getPriorHours()).toBe(0);
  });

  it('reads an integer from localStorage', async () => {
    localStorage.setItem('drummate_prior_hours', '500');
    const m = await import('../src/services/priorPracticeService.js');
    expect(m.getPriorHours()).toBe(500);
  });

  it('setPriorHours writes to localStorage and calls setUserSetting', async () => {
    const m = await import('../src/services/priorPracticeService.js');
    const backend = { setUserSetting: vi.fn().mockResolvedValue(undefined) };
    await m.setPriorHours(300, backend, 'user1');
    expect(localStorage.getItem('drummate_prior_hours')).toBe('300');
    expect(backend.setUserSetting).toHaveBeenCalledWith('user1', 'priorPracticeHours', 300);
  });

  it('setPriorHours floors fractional values', async () => {
    const m = await import('../src/services/priorPracticeService.js');
    const backend = { setUserSetting: vi.fn().mockResolvedValue(undefined) };
    await m.setPriorHours(99.9, backend, 'user1');
    expect(localStorage.getItem('drummate_prior_hours')).toBe('99');
    expect(backend.setUserSetting).toHaveBeenCalledWith('user1', 'priorPracticeHours', 99);
  });

  it('setPriorHours clamps negative values to 0', async () => {
    const m = await import('../src/services/priorPracticeService.js');
    const backend = { setUserSetting: vi.fn().mockResolvedValue(undefined) };
    await m.setPriorHours(-10, backend, 'user1');
    expect(localStorage.getItem('drummate_prior_hours')).toBe('0');
    expect(backend.setUserSetting).toHaveBeenCalledWith('user1', 'priorPracticeHours', 0);
  });

  it('initPriorHours adopts remote value into localStorage', async () => {
    const m = await import('../src/services/priorPracticeService.js');
    const backend = {
      getUserSettings: vi.fn().mockResolvedValue({ priorPracticeHours: 750 }),
    };
    await m.initPriorHours(backend, 'user1');
    expect(localStorage.getItem('drummate_prior_hours')).toBe('750');
    expect(m.getPriorHours()).toBe(750);
  });

  it('initPriorHours does not overwrite localStorage when remote field is absent', async () => {
    localStorage.setItem('drummate_prior_hours', '200');
    const m = await import('../src/services/priorPracticeService.js');
    const backend = {
      getUserSettings: vi.fn().mockResolvedValue({}),
    };
    await m.initPriorHours(backend, 'user1');
    expect(localStorage.getItem('drummate_prior_hours')).toBe('200');
  });

  it('initPriorHours keeps cached value when backend throws', async () => {
    localStorage.setItem('drummate_prior_hours', '100');
    const m = await import('../src/services/priorPracticeService.js');
    const backend = {
      getUserSettings: vi.fn().mockRejectedValue(new Error('network error')),
    };
    await m.initPriorHours(backend, 'user1');
    expect(localStorage.getItem('drummate_prior_hours')).toBe('100');
    expect(m.getPriorHours()).toBe(100);
  });
});
