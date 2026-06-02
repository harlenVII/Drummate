import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

describe('useTimezone', () => {
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

  it('returns the current timezone and updates when setTimezone is called', async () => {
    const tzs = await import('../src/services/timezoneService.js');
    const { useTimezone } = await import('../src/hooks/useTimezone.js');

    const { result } = renderHook(() => useTimezone());
    expect(result.current).toBe('America/Los_Angeles');

    await act(async () => {
      await tzs.setTimezone('Asia/Tokyo');
    });

    await waitFor(() => expect(result.current).toBe('Asia/Tokyo'));
  });
});
