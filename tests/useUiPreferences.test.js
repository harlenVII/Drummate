import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useUiPreferences } from '../src/hooks/useUiPreferences';

describe('useUiPreferences', () => {
  beforeEach(() => localStorage.clear());

  it('defaults: minutes, grouped, not compact', () => {
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.timeUnit).toBe('minutes');
    expect(result.current.groupByCategory).toBe(true);
    expect(result.current.compactMode).toBe(false);
  });

  it('persists timeUnit to localStorage', () => {
    const { result } = renderHook(() => useUiPreferences());
    act(() => result.current.setTimeUnit('hours'));
    expect(localStorage.getItem('drummate_time_unit')).toBe('hours');
  });

  it('hydrates groupByCategory=false from storage', () => {
    localStorage.setItem('drummate_group_by_category', 'false');
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.groupByCategory).toBe(false);
  });
});

describe('useUiPreferences accent', () => {
  it('defaults to blue and round-trips a change', () => {
    localStorage.clear();
    const { result } = renderHook(() => useUiPreferences());
    expect(result.current.accent).toBe('blue');
    act(() => result.current.setAccent('orange'));
    expect(result.current.accent).toBe('orange');
    expect(localStorage.getItem('drummate_accent')).toBe('orange');
  });

  it('does not disturb the theme axis', () => {
    const { result } = renderHook(() => useUiPreferences());
    act(() => result.current.setTheme('dark'));
    act(() => result.current.setAccent('green'));
    expect(result.current.theme).toBe('dark');
    expect(result.current.accent).toBe('green');
  });
});
