import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/audio/metronomeEngine', () => ({
  MetronomeEngine: class { destroy() {} },
}));
vi.mock('nosleep.js', () => ({ default: class { enable() {} disable() {} } }));

import { useMetronomeState } from '../src/hooks/useMetronomeState';

describe('useMetronomeState', () => {
  beforeEach(() => localStorage.clear());

  it('defaults bpm to 120 and time signature to [4,4]', () => {
    const { result } = renderHook(() => useMetronomeState());
    expect(result.current.bpm).toBe(120);
    expect(result.current.timeSignature).toEqual([4, 4]);
  });

  it('clamps out-of-range stored bpm to 120', () => {
    localStorage.setItem('drummate_metronome_bpm', '9999');
    const { result } = renderHook(() => useMetronomeState());
    expect(result.current.bpm).toBe(120);
  });

  it('rejects malformed stored time signature', () => {
    localStorage.setItem('drummate_metronome_time_signature', 'not-json');
    const { result } = renderHook(() => useMetronomeState());
    expect(result.current.timeSignature).toEqual([4, 4]);
  });
});
