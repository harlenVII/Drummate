import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { setFirestoreImpl } from '../src/services/backends/firestoreAccess';
import { createFakeFirestore } from './helpers/fakeFirestore';
import { db } from '../src/services/database';
import firebaseBackend from '../src/services/backends/firebaseBackend';

const UID = 'user1';
const itemsPath = `users/${UID}/practice_items`;
const logsPath = `users/${UID}/practice_logs`;

let fs;
beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  fs = createFakeFirestore();
  setFirestoreImpl(fs);
});
afterEach(() => setFirestoreImpl()); // reset to real SDK

describe('pullAll', () => {
  it('adds a new remote item locally', async () => {
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Rudiments', category: 'fundamentals', sort_order: 0 });
    await firebaseBackend.pullAll(UID);
    const local = await db.practiceItems.where('uid').equals('a').first();
    expect(local.name).toBe('Rudiments');
    expect(local.syncedOnce).toBe(true);
  });

  it('bails without deleting when snapshot is fromCache', async () => {
    await db.practiceItems.add({ uid: 'a', name: 'Local', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    fs = createFakeFirestore({ fromCache: true });
    setFirestoreImpl(fs);
    await firebaseBackend.pullAll(UID);
    expect(await db.practiceItems.where('uid').equals('a').first()).toBeTruthy();
  });

  it('deletes a locally-synced item missing from cloud (and cascades logs)', async () => {
    const id = await db.practiceItems.add({ uid: 'gone', name: 'Old', category: 'fundamentals', sortOrder: 0, syncedOnce: true });
    await db.practiceLogs.add({ itemId: id, itemUid: 'gone', date: '2026-01-01', duration: 60, uid: 'l1', loggedAt: 1, syncedOnce: true });
    await firebaseBackend.pullAll(UID); // no remote items
    expect(await db.practiceItems.where('uid').equals('gone').first()).toBeUndefined();
    expect(await db.practiceLogs.where('uid').equals('l1').first()).toBeUndefined();
  });

  it('preserves a local-only (unsynced) item when cloud is empty', async () => {
    await db.practiceItems.add({ uid: 'new', name: 'Draft', category: 'fundamentals', sortOrder: 0, syncedOnce: false });
    await firebaseBackend.pullAll(UID);
    expect(await db.practiceItems.where('uid').equals('new').first()).toBeTruthy();
  });

  it('adds a remote log resolving its parent by item_uid', async () => {
    fs.__seed(itemsPath, 'a', { uid: 'a', name: 'Rudiments', sort_order: 0 });
    fs.__seed(logsPath, 'l1', { uid: 'l1', item_uid: 'a', item_name: 'Rudiments', date: '2026-05-01', duration: 120, logged_at: 1700000000000 });
    await firebaseBackend.pullAll(UID);
    const log = await db.practiceLogs.where('uid').equals('l1').first();
    expect(log.duration).toBe(120);
    expect(log.loggedAt).toBe(1700000000000);
  });

  it('migrates a legacy remote item with no uid', async () => {
    fs.__seed(itemsPath, 'Legacy%20Name', { name: 'Legacy Name', sort_order: 0 });
    await firebaseBackend.pullAll(UID);
    const local = await db.practiceItems.where('name').equals('Legacy Name').first();
    expect(local).toBeTruthy();
    expect(local.uid).toBeTruthy();
  });
});
