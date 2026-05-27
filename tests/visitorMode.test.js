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
