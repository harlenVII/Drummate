import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { renderHook, act, waitFor } from '@testing-library/react';
import { db, addItem } from '../src/services/database';
import { usePracticeTimer } from '../src/hooks/usePracticeTimer';

// The timer hook depends on auth + backend contexts; those are genuinely
// external (Firebase / session state). The behavior under test is the
// localStorage <-> Dexie crash-recovery path, so we stub the contexts and
// keep the real (fake-indexeddb) database.
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock('../src/contexts/BackendContext', () => ({
  useBackend: () => ({ pushLog: vi.fn() }),
}));

const PENDING_KEY = 'drummate_pending_log';

function makeMetronome() {
  return {
    bpm: 120,
    timeSignature: { beats: 4, noteValue: 4 },
    subdivision: 'quarter',
    soundType: 'click',
    setBpm: vi.fn(),
    setTimeSignature: vi.fn(),
    setSubdivision: vi.fn(),
    setSoundType: vi.fn(),
    isPlaying: false,
    setIsPlaying: vi.fn(),
    engineRef: { current: null },
  };
}

beforeEach(async () => {
  localStorage.removeItem(PENDING_KEY);
  await db.practiceItems.clear();
  await db.practiceLogs.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Recovery on mount: a pending log left by a previous page-kill is replayed
// ---------------------------------------------------------------------------
describe('crash recovery on mount', () => {
  it('replays a pending log (new loggedAt format) into Dexie and clears the key', async () => {
    const item = await addItem('Singles', 'fundamentals');
    const loggedAt = Date.parse('2026-05-01T19:00:00Z');
    localStorage.setItem(PENDING_KEY, JSON.stringify({ itemId: item.id, duration: 150, loggedAt }));

    renderHook(() => usePracticeTimer({ metronome: makeMetronome() }));

    await waitFor(async () => {
      expect(await db.practiceLogs.count()).toBe(1);
    });
    const log = await db.practiceLogs.toCollection().first();
    expect(log.itemId).toBe(item.id);
    expect(log.duration).toBe(150);
    expect(log.loggedAt).toBe(loggedAt);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('converts a legacy `date`-only pending log to a noon loggedAt', async () => {
    const item = await addItem('Doubles', 'fundamentals');
    localStorage.setItem(PENDING_KEY, JSON.stringify({ itemId: item.id, duration: 60, date: '2026-05-01' }));

    renderHook(() => usePracticeTimer({ metronome: makeMetronome() }));

    await waitFor(async () => {
      expect(await db.practiceLogs.count()).toBe(1);
    });
    const log = await db.practiceLogs.toCollection().first();
    expect(log.loggedAt).toBe(Date.parse('2026-05-01T12:00:00'));
  });

  it('ignores a zero-duration pending log but still clears the key', async () => {
    const item = await addItem('Flam', 'fundamentals');
    localStorage.setItem(PENDING_KEY, JSON.stringify({ itemId: item.id, duration: 0 }));

    renderHook(() => usePracticeTimer({ metronome: makeMetronome() }));

    // give the mount effect a tick to run
    await act(async () => { await Promise.resolve(); });
    expect(await db.practiceLogs.count()).toBe(0);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('swallows malformed pending JSON without throwing and clears the key', async () => {
    localStorage.setItem(PENDING_KEY, '{not valid json');

    expect(() =>
      renderHook(() => usePracticeTimer({ metronome: makeMetronome() })),
    ).not.toThrow();

    await act(async () => { await Promise.resolve(); });
    expect(await db.practiceLogs.count()).toBe(0);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Auto-save on page close: an in-flight session is persisted to localStorage
// ---------------------------------------------------------------------------
describe('auto-save on pagehide', () => {
  it('writes the elapsed session to localStorage when the page is hidden', async () => {
    // Control the clock via Date.now (not fake timers, which would freeze
    // fake-indexeddb's internal promises and hang the Dexie read in handleStart).
    let now = Date.parse('2026-06-02T12:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const item = await addItem('Snare', 'fundamentals');

    const { result, unmount } = renderHook(() => usePracticeTimer({ metronome: makeMetronome() }));

    await act(async () => {
      await result.current.handleStart(item.id);
    });

    // 5 seconds elapse, then the page is hidden (iOS Safari kill path)
    now += 5000;
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    const pending = JSON.parse(localStorage.getItem(PENDING_KEY));
    expect(pending.itemId).toBe(item.id);
    expect(pending.duration).toBe(5);
    expect(pending.loggedAt).toBe(now);

    unmount();
  });

  it('does not write a pending log when no session is active', async () => {
    renderHook(() => usePracticeTimer({ metronome: makeMetronome() }));

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });
});
