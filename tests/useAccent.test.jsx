import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAccent } from '../src/hooks/useAccent';
import { setAccent } from '../src/services/themeService';

afterEach(() => {
  act(() => setAccent('blue'));
});

describe('useAccent', () => {
  it('reflects the current accent on mount', () => {
    act(() => setAccent('orange'));
    const { result } = renderHook(() => useAccent());
    expect(result.current).toBe('orange');
  });

  it('re-renders when the accent changes after mount', () => {
    act(() => setAccent('blue'));
    const { result } = renderHook(() => useAccent());
    expect(result.current).toBe('blue');
    act(() => setAccent('green'));
    expect(result.current).toBe('green');
  });
});
