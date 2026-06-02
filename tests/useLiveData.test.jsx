import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { renderHook, waitFor, act } from '@testing-library/react';
import { db, addItem } from '../src/services/database';
import { useLiveData } from '../src/hooks/useLiveData';

beforeEach(async () => {
  await db.practiceItems.clear();
  await db.practiceLogs.clear();
  await db.notes.clear();
  await db.metronomePractices.clear();
  await db.syncQueue.clear();
  await db.goals.clear();
});

describe('useLiveData', () => {
  it('returns items added to db.practiceItems', async () => {
    const { result } = renderHook(() => useLiveData());

    // Initially empty
    await waitFor(() => {
      expect(result.current.items).toEqual([]);
    });

    // Add an item
    await act(async () => {
      await addItem('Snare Rolls', 'fundamentals');
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].name).toBe('Snare Rolls');
    });
  });

  it('is reactive: re-emits when a second item is added after mount', async () => {
    // Add one item before mounting
    await addItem('Singles', 'fundamentals');

    const { result } = renderHook(() => useLiveData());

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    // Now add a second item — liveQuery should re-emit
    await act(async () => {
      await addItem('Doubles', 'fundamentals');
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2);
      expect(result.current.items.map((i) => i.name)).toContain('Doubles');
    });
  });

  it('totals sums duration for today\'s logs and excludes trashed items', async () => {
    const itemA = await addItem('Hi-Hat', 'fundamentals');
    const itemB = await addItem('Kick', 'fundamentals');

    // Trash itemB
    await db.practiceItems.update(itemB.id, { trashed: true });

    // Add logs for both items — loggedAt: Date.now() ensures they fall in today's bucket
    await db.practiceLogs.add({
      itemId: itemA.id,
      itemUid: itemA.uid,
      date: '2026-06-02',
      duration: 300,
      uid: crypto.randomUUID(),
      loggedAt: Date.now(),
      syncedOnce: false,
    });
    await db.practiceLogs.add({
      itemId: itemA.id,
      itemUid: itemA.uid,
      date: '2026-06-02',
      duration: 200,
      uid: crypto.randomUUID(),
      loggedAt: Date.now(),
      syncedOnce: false,
    });
    await db.practiceLogs.add({
      itemId: itemB.id,
      itemUid: itemB.uid,
      date: '2026-06-02',
      duration: 999,
      uid: crypto.randomUUID(),
      loggedAt: Date.now(),
      syncedOnce: false,
    });

    const { result } = renderHook(() => useLiveData());

    await waitFor(() => {
      // itemA should have 300 + 200 = 500
      expect(result.current.totals[itemA.id]).toBe(500);
      // itemB is trashed — must not appear
      expect(result.current.totals[itemB.id]).toBeUndefined();
    });
  });

  it('returns empty arrays and objects as defaults before data loads', () => {
    const { result } = renderHook(() => useLiveData());
    // Synchronous initial state should always be the safe empty defaults
    expect(Array.isArray(result.current.items)).toBe(true);
    expect(Array.isArray(result.current.practices)).toBe(true);
    expect(Array.isArray(result.current.notes)).toBe(true);
    expect(typeof result.current.totals).toBe('object');
  });
});
