import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../src/hooks/useKeyboardShortcuts';

// Only the language toggle is read from the context; the S key under test
// never touches it.
vi.mock('../src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ toggleLanguage: vi.fn() }),
}));

function setup({ activeItemId = null, focusedItemId = 1, editing = false } = {}) {
  const saveAndStop = vi.fn();
  const handleStart = vi.fn();
  renderHook(() => useKeyboardShortcuts({
    activeItemIdRef: { current: activeItemId },
    focusedItemId,
    editing,
    nav: {},
    reports: {},
    setTimeUnit: vi.fn(),
    setTheme: vi.fn(),
    setAccent: vi.fn(),
    setMetronomeAccentFirstBeat: vi.fn(),
    saveAndStop,
    handleStart,
  }));
  return { saveAndStop, handleStart };
}

const pressS = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', key: 's' }));

describe('S key', () => {
  it('starts the highlighted item when no timer is running', () => {
    const { saveAndStop, handleStart } = setup({ focusedItemId: 2 });
    pressS();
    expect(handleStart).toHaveBeenCalledWith(2);
    expect(saveAndStop).not.toHaveBeenCalled();
  });

  it('stops the running timer even when a different item is highlighted', () => {
    const { saveAndStop, handleStart } = setup({ activeItemId: 1, focusedItemId: 2 });
    pressS();
    expect(saveAndStop).toHaveBeenCalledTimes(1);
    expect(handleStart).not.toHaveBeenCalled();
  });

  it('does nothing in edit mode', () => {
    const { saveAndStop, handleStart } = setup({ editing: true });
    pressS();
    expect(handleStart).not.toHaveBeenCalled();
    expect(saveAndStop).not.toHaveBeenCalled();
  });

  it('does nothing when there is no item to start', () => {
    const { handleStart } = setup({ focusedItemId: null });
    pressS();
    expect(handleStart).not.toHaveBeenCalled();
  });
});
