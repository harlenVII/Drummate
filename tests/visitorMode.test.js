import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db, wipeAllLocalData, addItem, addLog } from '../src/services/database';

describe('wipeAllLocalData', () => {
  beforeEach(async () => {
    await db.practiceItems.clear();
    await db.practiceLogs.clear();
    await db.notes.clear();
    await db.metronomePractices.clear();
    await db.syncQueue.clear();
  });

  it('clears all data tables', async () => {
    const item = await addItem('Test Item', 'fundamentals');
    await addLog(item.id, 600);
    await db.notes.add({ uid: 'n1', itemUid: item.uid, date: '2026-05-27', body: 'note' });
    await db.metronomePractices.add({ uid: 'mp1', sortOrder: 0, name: 'practice' });
    await db.syncQueue.add({ action: 'push_item', collection: 'items', payload: {}, localId: 1 });

    expect(await db.practiceItems.count()).toBe(1);
    expect(await db.practiceLogs.count()).toBe(1);
    expect(await db.notes.count()).toBe(1);
    expect(await db.metronomePractices.count()).toBe(1);
    expect(await db.syncQueue.count()).toBe(1);

    await wipeAllLocalData();

    expect(await db.practiceItems.count()).toBe(0);
    expect(await db.practiceLogs.count()).toBe(0);
    expect(await db.notes.count()).toBe(0);
    expect(await db.metronomePractices.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });
});

import { vi } from 'vitest';
import { setPriorHours, getPriorHours } from '../src/services/priorPracticeService';

describe('setPriorHours with null userId', () => {
  beforeEach(() => {
    // Mock localStorage for this test suite
    const store = {};
    global.localStorage = {
      getItem: (key) => store[key] || null,
      setItem: (key, value) => {
        store[key] = String(value);
      },
      removeItem: (key) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((key) => {
          delete store[key];
        });
      },
    };
    global.localStorage.clear();
  });

  it('writes localStorage without calling backend when userId is null', async () => {
    let backendCalled = false;
    const fakeBackend = {
      setUserSetting: async () => {
        backendCalled = true;
      },
    };

    await setPriorHours(5, fakeBackend, null);

    expect(getPriorHours()).toBe(5);
    expect(backendCalled).toBe(false);
  });

  it('still calls backend when userId is provided', async () => {
    let receivedUserId = null;
    const fakeBackend = {
      setUserSetting: async (uid) => {
        receivedUserId = uid;
      },
    };

    await setPriorHours(3, fakeBackend, 'user-123');

    expect(getPriorHours()).toBe(3);
    expect(receivedUserId).toBe('user-123');
  });
});
