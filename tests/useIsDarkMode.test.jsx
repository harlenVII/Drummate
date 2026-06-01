import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsDarkMode } from '../src/hooks/useIsDarkMode';
import { setTheme } from '../src/services/themeService';

afterEach(() => {
  act(() => setTheme('light'));
});

describe('useIsDarkMode', () => {
  it('reflects the current theme on mount', () => {
    act(() => setTheme('dark'));
    const { result } = renderHook(() => useIsDarkMode());
    expect(result.current).toBe(true);
  });

  it('re-renders when the theme changes after mount', () => {
    act(() => setTheme('light'));
    const { result } = renderHook(() => useIsDarkMode());
    expect(result.current).toBe(false);
    act(() => setTheme('dark'));
    expect(result.current).toBe(true);
    act(() => setTheme('light'));
    expect(result.current).toBe(false);
  });
});
