import { describe, it, expect, afterEach, vi } from 'vitest';
import { getItem, setItem } from '../src/utils/safeStorage';

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.localStorage.clear();
});

describe('safeStorage', () => {
  it('round-trips a value', () => {
    setItem('k', 'v');
    expect(getItem('k')).toBe('v');
  });

  it('returns null for a missing key', () => {
    expect(getItem('missing')).toBe(null);
  });

  it('returns null when getItem throws', () => {
    vi.spyOn(globalThis.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getItem('k')).toBe(null);
  });

  it('swallows errors when setItem throws', () => {
    vi.spyOn(globalThis.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => setItem('k', 'v')).not.toThrow();
  });
});
